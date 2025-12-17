// src/services/CrackGenerationService.js
import {
  ASTEROID_CRACK_THRESHOLDS,
  ASTEROID_CRACK_GRAPH_RULES,
} from '../data/constants/physics.js';
import { ASTEROID_CRACK_PROFILES } from '../data/enemies/asteroid-configs.js';
import { clamp } from '../utils/mathHelpers.js';

/**
 * CrackGenerationService
 *
 * Provides stateless utilities for generating procedural crack patterns used
 * by asteroids and other destructible entities. The service exposes helper
 * geometry operations alongside the main {@link generateCrackLayers} method
 * which mirrors the original asteroid implementation while accepting a plain
 * context object. All methods are static to keep the service side-effect free
 * and easy to reuse across different systems.
 */
class CrackGenerationService {
  /**
   * Creates a deterministic pseudo-random number generator from a 32-bit seed.
   *
   * @param {number} seed - Seed value for the generator.
   * @returns {() => number} Function returning numbers in the range [0, 1).
   */
  static createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Calculates the 2D cross product of two vectors.
   *
   * @param {number} ax
   * @param {number} ay
   * @param {number} bx
   * @param {number} by
   * @returns {number}
   */
  static calculateCross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  /**
   * Finds the closest intersection distance between a ray and polygon edges.
   *
   * @param {Array} polygonEdges - Cached polygon edges with precomputed deltas.
   * @param {number} startX - Ray origin X coordinate.
   * @param {number} startY - Ray origin Y coordinate.
   * @param {number} dirX - Ray direction vector X component.
   * @param {number} dirY - Ray direction vector Y component.
   * @returns {number} Distance to the closest intersection or 0 if none.
   */
  static intersectRayWithEdges(polygonEdges, startX, startY, dirX, dirY) {
    if (!Array.isArray(polygonEdges) || polygonEdges.length === 0) {
      return 0;
    }

    const epsilon = 1e-6;
    let closest = Infinity;

    for (let i = 0; i < polygonEdges.length; i += 1) {
      const edge = polygonEdges[i];
      const ax = edge.ax - startX;
      const ay = edge.ay - startY;
      const bx = edge.bx - startX;
      const by = edge.by - startY;
      const segDirX = bx - ax;
      const segDirY = by - ay;

      const denom = this.calculateCross(dirX, dirY, segDirX, segDirY);
      if (Math.abs(denom) < epsilon) {
        continue;
      }

      const t = this.calculateCross(ax, ay, segDirX, segDirY) / denom;
      const u = this.calculateCross(ax, ay, dirX, dirY) / denom;

      if (t >= 0 && u >= 0 && u <= 1) {
        if (t < closest) {
          closest = t;
        }
      }
    }

    return Number.isFinite(closest) && closest !== Infinity ? closest : 0;
  }

  /**
   * Measures the distance a ray can travel safely inside the polygon.
   *
   * @param {Array} polygonEdges
   * @param {number} startX
   * @param {number} startY
   * @param {number} angle
   * @param {number} margin
   * @returns {number}
   */
  static measureRayDistance(polygonEdges, startX, startY, angle, margin = 0) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const distance = this.intersectRayWithEdges(
      polygonEdges,
      startX,
      startY,
      dirX,
      dirY
    );
    if (!Number.isFinite(distance) || distance <= 0) {
      return 0;
    }
    return Math.max(0, distance - margin);
  }

  /**
   * Computes the minimum radius from the center to the polygon surface.
   *
   * @param {Array} polygonEdges
   * @param {number} radius
   * @param {Array} vertices
   * @returns {number}
   */
  static computeMinSurfaceRadius(polygonEdges, radius, vertices) {
    if (!Array.isArray(polygonEdges) || polygonEdges.length === 0) {
      return radius ?? 0;
    }

    const samples = Math.max(12, (vertices?.length || 0) * 3);
    let minDistance = Infinity;

    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const distance = this.intersectRayWithEdges(
        polygonEdges,
        0,
        0,
        Math.cos(angle),
        Math.sin(angle)
      );

      if (distance > 0 && distance < minDistance) {
        minDistance = distance;
      }
    }

    if (minDistance === Infinity) {
      return radius ?? 0;
    }

    return Math.max(0, minDistance);
  }

  /**
   * Generates deterministic crack layers for a destructible entity.
   *
   * @param {Object} context - Geometry and identity information.
   * @param {Array} context.vertices - Polygon vertices relative to center.
   * @param {Array} context.polygonEdges - Cached polygon edge data.
   * @param {number} context.radius - Base radius of the shape.
   * @param {number} context.minSurfaceRadius - Minimum radius to surface.
   * @param {number} context.crackSeed - Seed for deterministic randomness.
   * @param {string} context.crackProfileKey - Profile identifier.
   * @param {string} [context.id] - Entity identifier for debugging.
   * @param {number} [context.generation] - Fragment generation depth.
   * @param {() => number} [context.rng] - Optional seeded RNG to reuse.
   * @param {number} [context.randomSeed] - Optional override for RNG seeding.
   * @param {Object} [crackProfile] - Optional crack profile override.
   * @returns {{layers: Array, segments: Array, segmentLookup: Object}}
   */
  static generateCrackLayers(context, crackProfile = null) {
    const thresholds = ASTEROID_CRACK_THRESHOLDS || [];
    if (!thresholds.length) {
      return { layers: [], segments: [], segmentLookup: {} };
    }

    const vertices = Array.isArray(context?.vertices) ? context.vertices : [];
    if (!Array.isArray(vertices) || vertices.length < 3) {
      return { layers: [], segments: [], segmentLookup: {} };
    }

    const crackProfileKey = context?.crackProfileKey ?? 'default';
    const radius = Number.isFinite(context?.radius) ? context.radius : 0;
    const minSurfaceRadius = Number.isFinite(context?.minSurfaceRadius)
      ? context.minSurfaceRadius
      : radius;
    const polygonEdges = Array.isArray(context?.polygonEdges)
      ? context.polygonEdges
      : [];
    const crackSeed = Number.isFinite(context?.crackSeed)
      ? context.crackSeed
      : 0;

    const providedRandom =
      typeof context?.rng === 'function'
        ? context.rng
        : typeof context?.seededRandom === 'function'
          ? context.seededRandom
          : null;

    const baseSeed = Number.isFinite(context?.randomSeed)
      ? context.randomSeed
      : crackSeed ^ 0x9e3779;

    const profile =
      crackProfile ||
      ASTEROID_CRACK_PROFILES?.[crackProfileKey] ||
      ASTEROID_CRACK_PROFILES.default;

    const baseGraphRules = ASTEROID_CRACK_GRAPH_RULES || {};
    const profileGraphRules = profile?.graphRules || {};

    const graphRules = {
      continuationBias:
        profileGraphRules.continuationBias ??
        baseGraphRules.continuationBias ??
        0.82,
      newRootChance:
        profileGraphRules.newRootChance ?? baseGraphRules.newRootChance ?? 0.2,
      childPenalty:
        profileGraphRules.childPenalty ?? baseGraphRules.childPenalty ?? 0.45,
      branchParentPenalty:
        profileGraphRules.branchParentPenalty ??
        baseGraphRules.branchParentPenalty ??
        0.5,
      microParentPenalty:
        profileGraphRules.microParentPenalty ??
        baseGraphRules.microParentPenalty ??
        0.35,
      minSegmentLengthRatio: Math.max(
        0.04,
        profileGraphRules.minSegmentLengthRatio ??
          baseGraphRules.minSegmentLengthRatio ??
          0.12
      ),
      surfaceMargin:
        profileGraphRules.surfaceMargin ?? baseGraphRules.surfaceMargin ?? 0.65,
      branchAnchorJitter:
        profileGraphRules.branchAnchorJitter ??
        baseGraphRules.branchAnchorJitter ??
        0.15,
      microAnchorJitter:
        profileGraphRules.microAnchorJitter ??
        baseGraphRules.microAnchorJitter ??
        0.22,
      continuationJitter:
        profileGraphRules.continuationJitter ??
        baseGraphRules.continuationJitter ??
        0.5,
    };

    const seededRandom = providedRandom || this.createSeededRandom(baseSeed);
    const baseRotation = seededRandom() * Math.PI * 2;
    const rotationJitter = profile?.rotationJitter ?? 0.3;

    const sampleRange = (range, fallback) => {
      if (Array.isArray(range) && range.length === 2) {
        const [min, max] = range;
        const low = Number.isFinite(min) ? min : fallback ?? 0;
        const high = Number.isFinite(max) ? max : low;
        if (high <= low) {
          return low;
        }
        return low + (high - low) * seededRandom();
      }
      if (Number.isFinite(range)) {
        return range;
      }
      return fallback ?? 0;
    };

    const stageTemplates = thresholds.map(
      (_, index) =>
        profile?.layers?.[index] ??
        profile?.layers?.[profile.layers.length - 1] ??
        {}
    );

    const layers = [];
    const segments = [];
    const segmentLookup = {};

    const segmentPrefix = `${crackProfileKey}-${crackSeed.toString(16)}`;
    let nextSegmentIndex = 0;

    const trunkRecords = [];
    const minSegmentLength = Math.max(
      1.2,
      radius * graphRules.minSegmentLengthRatio
    );
    const uniformRadius = Math.max(
      0,
      (minSurfaceRadius || radius) - graphRules.surfaceMargin * 1.1
    );

    const countMainSegments = (list) =>
      list.filter(
        (segment) =>
          segment && (segment.type === 'trunk' || segment.type === 'extension')
      ).length;

    for (
      let stageIndex = 0;
      stageIndex < stageTemplates.length;
      stageIndex += 1
    ) {
      const stageNumber = stageIndex + 1;
      const template = stageTemplates[stageIndex] || {};

      const widthRange = template.lineWidthRange ||
        profile?.lineWidthRange || [0.8, 1.25];
      const angularJitter = template.angularJitter ?? 0.25;
      const mainCountTarget = Math.max(
        1,
        Math.round(
          template.mainRays ?? (stageIndex === 0 ? 3 : trunkRecords.length || 3)
        )
      );
      const startRadiusRange = template.startRadiusRange ||
        profile?.startRadiusRange || [0.2, 0.32];
      const mainLengthRange = template.mainLengthRange || [0.5, 0.7];

      const stageRotation =
        baseRotation + (seededRandom() - 0.5) * 2 * rotationJitter;

      const stageSegments = [];

      const getWidth = (scale = 1) => {
        const sampled = sampleRange(widthRange, 1);
        const numeric = Number.isFinite(sampled) ? sampled : 1;
        return Math.max(0.35, numeric * scale);
      };

      const spawnSegment = ({
        type,
        start,
        end,
        width,
        angle,
        parentId = null,
        rootId = null,
      }) => {
        if (!start || !end) {
          return null;
        }

        const length = Math.hypot(end.x - start.x, end.y - start.y);
        if (!Number.isFinite(length) || length < minSegmentLength * 0.5) {
          return null;
        }

        const segmentId = `${segmentPrefix}-${stageNumber}-${(nextSegmentIndex += 1)}`;
        const parentSegment = parentId ? segmentLookup[parentId] : null;
        const resolvedRoot =
          rootId ?? parentSegment?.rootId ?? parentId ?? null;

        const segment = {
          id: segmentId,
          stage: stageNumber,
          type,
          parentId: parentId ?? null,
          rootId: resolvedRoot ?? segmentId,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          width,
          length,
          angle,
          children: 0,
        };

        stageSegments.push(segment);
        segments.push(segment);
        segmentLookup[segment.id] = segment;

        if (segment.parentId && segmentLookup[segment.parentId]) {
          const parent = segmentLookup[segment.parentId];
          parent.children = (parent.children || 0) + 1;
        }

        if (!segment.rootId) {
          segment.rootId = segment.id;
        }

        return segment;
      };

      const measureSurface = (sx, sy, angle) =>
        this.measureRayDistance(
          polygonEdges,
          sx,
          sy,
          angle,
          graphRules.surfaceMargin
        );

      const createRootSegment = () => {
        const baseAngle =
          stageRotation +
          (trunkRecords.length / Math.max(1, mainCountTarget)) * Math.PI * 2;
        const angle = baseAngle + (seededRandom() - 0.5) * 2 * angularJitter;

        let maxReach = measureSurface(0, 0, angle);
        if (maxReach <= minSegmentLength * 1.1) {
          return false;
        }

        const maxStart = Math.max(0, maxReach - minSegmentLength * 0.6);
        if (maxStart <= 0) {
          return false;
        }

        let startRadius = clamp(
          maxReach * sampleRange(startRadiusRange, 0.24),
          0,
          maxStart
        );
        const minStart = Math.min(maxStart, minSegmentLength * 0.25);
        if (startRadius < minStart) {
          startRadius = minStart;
        }

        let desiredEnd =
          startRadius + maxReach * sampleRange(mainLengthRange, 0.6);
        desiredEnd = Math.min(desiredEnd, maxReach);
        let length = desiredEnd - startRadius;
        if (length < minSegmentLength) {
          length = Math.min(maxReach - startRadius, minSegmentLength);
        }

        const startPoint = {
          x: Math.cos(angle) * startRadius,
          y: Math.sin(angle) * startRadius,
        };
        const endPoint = {
          x: Math.cos(angle) * (startRadius + length),
          y: Math.sin(angle) * (startRadius + length),
        };

        const segment = spawnSegment({
          type: 'trunk',
          start: startPoint,
          end: endPoint,
          width: getWidth(),
          angle,
        });

        if (segment) {
          segment.continuation = 0;
          trunkRecords.push({
            id: segment.id,
            segment,
            exhausted: false,
            maxReach,
            angle,
            stage: stageNumber,
            continuation: 0,
          });
        }

        return segment;
      };

      const extendTrunk = (trunk) => {
        if (!trunk || !trunk.segment) {
          return null;
        }

        const lastSegment = trunk.segment;
        const baseAngle =
          lastSegment.angle ??
          Math.atan2(
            lastSegment.y2 - lastSegment.y1,
            lastSegment.x2 - lastSegment.x1
          );

        const continuationCount = trunk.continuation || 0;
        let angle =
          baseAngle +
          (seededRandom() - 0.5) * 2 * graphRules.continuationJitter;
        if (continuationCount === 0 && seededRandom() < 0.4) {
          angle = baseAngle;
        }

        const maxReach = measureSurface(lastSegment.x2, lastSegment.y2, angle);
        if (maxReach <= minSegmentLength * 0.6) {
          trunk.exhausted = true;
          return null;
        }

        const desiredLength = Math.min(
          trunk.maxReach,
          lastSegment.length * (0.7 + seededRandom() * 0.5)
        );
        let length = clamp(desiredLength, minSegmentLength * 0.7, maxReach);
        if (length < minSegmentLength * 0.6) {
          trunk.exhausted = true;
          return null;
        }

        const endPoint = {
          x: lastSegment.x2 + Math.cos(angle) * length,
          y: lastSegment.y2 + Math.sin(angle) * length,
        };

        const segment = spawnSegment({
          type: 'extension',
          start: { x: lastSegment.x2, y: lastSegment.y2 },
          end: endPoint,
          width: getWidth(0.9),
          angle,
          parentId: lastSegment.id,
          rootId: lastSegment.rootId,
        });

        if (segment) {
          trunk.segment = segment;
          trunk.continuation = continuationCount + 1;
          trunk.angle = angle;
          trunk.stage = stageNumber;
          segment.continuation = trunk.continuation;
        } else {
          trunk.exhausted = true;
        }

        return segment;
      };

      const selectBranchParent = (isMicro = false) => {
        const candidates = stageSegments.filter((segment) => {
          if (!segment) {
            return false;
          }
          if (segment.type === 'ring') {
            return false;
          }
          if (isMicro && segment.type === 'micro') {
            return false;
          }
          return segment.length > minSegmentLength * (isMicro ? 0.5 : 0.8);
        });

        if (!candidates.length) {
          return null;
        }

        const weights = candidates.map((segment) => {
          const baseWeight = segment.length;
          const childCount = segment.children || 0;
          const penalty = isMicro
            ? graphRules.microParentPenalty
            : graphRules.branchParentPenalty;
          const continuationFactor = 1 / (1 + (segment.continuation || 0));
          return Math.max(
            0.01,
            baseWeight * continuationFactor * Math.pow(penalty, childCount)
          );
        });

        let totalWeight = 0;
        for (let i = 0; i < weights.length; i += 1) {
          totalWeight += weights[i];
        }

        if (totalWeight <= 0) {
          return null;
        }

        let pick = seededRandom() * totalWeight;
        for (let i = 0; i < candidates.length; i += 1) {
          pick -= weights[i];
          if (pick <= 0) {
            return candidates[i];
          }
        }

        return candidates[candidates.length - 1];
      };

      const createBranchSegment = (config, isMicro = false) => {
        if (!config) {
          return null;
        }

        const parent = selectBranchParent(isMicro);

        if (!parent) {
          return null;
        }

        const baseAngle =
          parent.angle ??
          Math.atan2(parent.y2 - parent.y1, parent.x2 - parent.x1);
        const spread = config.spread ?? (isMicro ? 0.45 : 0.32);
        const offset = (seededRandom() - 0.5) * 2 * spread;

        let anchorT = config.offsetFromStart ?? (isMicro ? 0.6 : 0.4);
        const anchorJitter = isMicro
          ? graphRules.microAnchorJitter
          : graphRules.branchAnchorJitter;
        anchorT += (seededRandom() - 0.5) * 2 * anchorJitter;
        anchorT = clamp(anchorT, 0.08, 0.92);

        const startPoint = {
          x: parent.x1 + (parent.x2 - parent.x1) * anchorT,
          y: parent.y1 + (parent.y2 - parent.y1) * anchorT,
        };

        const angle = baseAngle + offset;
        const maxReach = measureSurface(startPoint.x, startPoint.y, angle);
        if (maxReach <= minSegmentLength * (isMicro ? 0.4 : 0.6)) {
          return null;
        }

        const lengthFactor = config.lengthMultiplier ?? (isMicro ? 0.28 : 0.5);
        const desiredLength =
          parent.length * lengthFactor * (0.7 + seededRandom() * 0.5);
        const minLength = minSegmentLength * (isMicro ? 0.55 : 0.8);
        const maxLength = Math.max(
          minSegmentLength * (isMicro ? 0.9 : 1.1),
          maxReach
        );
        let length = clamp(desiredLength, minLength, maxLength);
        length = Math.min(length, maxReach);
        if (length < minSegmentLength * (isMicro ? 0.45 : 0.7)) {
          return null;
        }

        const endPoint = {
          x: startPoint.x + Math.cos(angle) * length,
          y: startPoint.y + Math.sin(angle) * length,
        };

        return spawnSegment({
          type: isMicro ? 'micro' : 'branch',
          start: startPoint,
          end: endPoint,
          width: getWidth(isMicro ? 0.6 : 0.72),
          angle,
          parentId: parent.id,
          rootId: parent.rootId,
        });
      };

      if (stageIndex === 0) {
        let attempts = 0;
        while (
          countMainSegments(stageSegments) < mainCountTarget &&
          attempts < mainCountTarget * 4
        ) {
          attempts += 1;
          createRootSegment();
        }
      } else {
        for (let i = 0; i < trunkRecords.length; i += 1) {
          extendTrunk(trunkRecords[i]);
        }

        let producedMain = countMainSegments(stageSegments);
        let guard = 0;

        while (producedMain < mainCountTarget && guard < mainCountTarget * 4) {
          guard += 1;
          const viableTrunks = trunkRecords.filter((trunk) => !trunk.exhausted);
          const preferContinuation =
            viableTrunks.length > 0 &&
            seededRandom() < (graphRules.continuationBias ?? 0.82);

          if (preferContinuation) {
            const trunk =
              viableTrunks[Math.floor(seededRandom() * viableTrunks.length)];
            const segment = extendTrunk(trunk);
            if (segment) {
              producedMain = countMainSegments(stageSegments);
              continue;
            }
          }

          if (seededRandom() < (graphRules.newRootChance ?? 0.2)) {
            createRootSegment();
          } else if (trunkRecords.length) {
            const trunk =
              trunkRecords[Math.floor(seededRandom() * trunkRecords.length)];
            trunk.exhausted = false;
            extendTrunk(trunk);
          }

          producedMain = countMainSegments(stageSegments);
        }
      }

      const branchConfig = template.branch || null;
      const branchCount = Math.max(0, Math.round(branchConfig?.count ?? 0));

      if (branchCount > 0) {
        let created = 0;
        let attempts = 0;
        while (created < branchCount && attempts < branchCount * 5) {
          attempts += 1;
          if (createBranchSegment(branchConfig, false)) {
            created += 1;
          }
        }
      }

      const microConfig = template.micro || null;
      const microCount = Math.max(0, Math.round(microConfig?.count ?? 0));

      if (microCount > 0) {
        let created = 0;
        let attempts = 0;
        while (created < microCount && attempts < microCount * 5) {
          attempts += 1;
          if (createBranchSegment(microConfig, true)) {
            created += 1;
          }
        }
      }

      const ringConfig = template.ring || null;
      if (ringConfig?.segments) {
        const ringSegmentsCount = Math.max(0, Math.round(ringConfig.segments));
        if (ringSegmentsCount > 0 && uniformRadius > minSegmentLength) {
          const ringRadius = clamp(
            uniformRadius * sampleRange(ringConfig.radiusRange, 0.55),
            minSegmentLength,
            uniformRadius
          );
          const arcStep = (Math.PI * 2) / ringSegmentsCount;
          const ringWidth = Number.isFinite(ringConfig.width)
            ? Math.max(0.35, ringConfig.width)
            : getWidth(0.85);

          for (let r = 0; r < ringSegmentsCount; r += 1) {
            const arcAngle = stageRotation + r * arcStep;
            const nextAngle = arcAngle + arcStep * 0.7;
            const startPoint = {
              x: Math.cos(arcAngle) * ringRadius,
              y: Math.sin(arcAngle) * ringRadius,
            };
            const endPoint = {
              x: Math.cos(nextAngle) * ringRadius,
              y: Math.sin(nextAngle) * ringRadius,
            };
            const angle = Math.atan2(
              endPoint.y - startPoint.y,
              endPoint.x - startPoint.x
            );

            spawnSegment({
              type: 'ring',
              start: startPoint,
              end: endPoint,
              width: ringWidth,
              angle,
            });
          }
        }
      }

      const burstConfig = template.burst || {};
      const stageEntry = {
        id: template.id || `${profile.key}-stage-${stageNumber}`,
        intensity: template.intensity ?? stageNumber,
        burst: {
          cracks: burstConfig.cracks ?? Math.max(stageSegments.length, 4),
          sparks:
            burstConfig.sparks ??
            Math.ceil(Math.max(stageSegments.length, 1) / 3),
          shards:
            burstConfig.shards ??
            Math.max(0, Math.floor(stageSegments.length / 4)),
        },
      };

      stageEntry.segments = stageSegments;
      stageEntry.lines = stageSegments;
      stageEntry.segmentIds = stageSegments.map((segment) => segment.id);

      layers.push(stageEntry);
    }

    return { layers, segments, segmentLookup };
  }
}

export default CrackGenerationService;
