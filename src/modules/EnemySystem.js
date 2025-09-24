// src/modules/EnemySystem.js
import * as CONSTANTS from '../core/GameConstants.js';

// === CLASSE ASTEROID (MOVIDA DO APP.JS) ===
class Asteroid {
  constructor(system, config = {}) {
    this.system = system;
    this.id = Date.now() + Math.random();
    this.size = config.size || 'small';
    this.variant = config.variant || 'common';
    this.wave = config.wave || 1;
    this.spawnedBy = config.spawnedBy ?? null;
    this.generation = config.generation ?? 0;

    this.radius = CONSTANTS.ASTEROID_SIZES[this.size] || 12;
    this.variantConfig =
      CONSTANTS.ASTEROID_VARIANTS[this.variant] ||
      CONSTANTS.ASTEROID_VARIANTS.common;

    this.crackProfileKey =
      this.variantConfig?.crackProfile || this.variant || 'default';
    this.fragmentProfileKey =
      this.variantConfig?.fragmentProfile || this.variant || 'default';
    this.crackProfile =
      CONSTANTS.ASTEROID_CRACK_PROFILES[this.crackProfileKey] ||
      CONSTANTS.ASTEROID_CRACK_PROFILES.default;
    this.fragmentProfile =
      CONSTANTS.ASTEROID_FRAGMENT_RULES[this.fragmentProfileKey] ||
      CONSTANTS.ASTEROID_FRAGMENT_RULES.default;

    this.behavior = this.variantConfig?.behavior || null;

    const baseMass = this.radius * this.radius * 0.05;
    this.mass = baseMass * (this.variantConfig?.massMultiplier ?? 1);

    const baseSpeed = CONSTANTS.ASTEROID_SPEEDS[this.size] || 40;
    const randomSpeed = baseSpeed * (0.8 + Math.random() * 0.4);
    const speedMultiplier = this.variantConfig?.speedMultiplier ?? 1;
    const finalSpeed = randomSpeed * speedMultiplier;

    this.x = config.x ?? 0;
    this.y = config.y ?? 0;

    if (Number.isFinite(config.vx) || Number.isFinite(config.vy)) {
      this.vx = (config.vx ?? 0) * speedMultiplier;
      this.vy = (config.vy ?? 0) * speedMultiplier;

      if (this.vx === 0 && this.vy === 0) {
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * finalSpeed;
        this.vy = Math.sin(angle) * finalSpeed;
      }
    } else {
      const angle = config.angle ?? Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * finalSpeed;
      this.vy = Math.sin(angle) * finalSpeed;
    }

    this.rotation = config.rotation ?? Math.random() * Math.PI * 2;
    this.rotationSpeed =
      (config.rotationSpeed ?? (Math.random() - 0.5) * 1.5) *
      (this.variantConfig?.rotationMultiplier ?? 1);

    const baseHealth =
      CONSTANTS.ASTEROID_BASE_HEALTH[this.size] ??
      CONSTANTS.ASTEROID_BASE_HEALTH.small ??
      10;
    const waveMultiplier = this.computeWaveHealthMultiplier(this.wave);
    const variantHP = this.variantConfig?.hpMultiplier ?? 1;

    this.maxHealth = Math.max(
      1,
      Math.round(baseHealth * waveMultiplier * variantHP)
    );
    this.health = this.maxHealth;

    this.lastDamageTime = 0;
    this.shieldHitCooldown = 0;
    this.destroyed = false;

    this.crackSeed = Math.floor(Math.random() * 1_000_000);
    this.crackStage = 0;

    this.vertices = this.generateVertices();
    this.rebuildPolygonCache();

    const crackData = this.generateCrackLayers();
    this.crackLayers = crackData.layers;

    this.variantState = this.initializeVariantState();
    this.visualState = this.initializeVisualState();
  }

  computeWaveHealthMultiplier(wave) {
    const scaling = CONSTANTS.ASTEROID_HEALTH_SCALING || {};
    const perWave = scaling.perWave ?? 0;
    const maxMultiplier = scaling.maxMultiplier ?? 1;
    const waveIndex = Math.max(0, (wave || 1) - 1);
    const multiplier = 1 + perWave * waveIndex;
    return Math.min(multiplier, maxMultiplier);
  }

  initializeVariantState() {
    if (!this.behavior) {
      return {};
    }

    if (this.behavior.type === 'volatile') {
      return {
        fuseTimer: this.behavior.fuseTime ?? 0,
        armed: false,
        exploded: false,
      };
    }

    if (this.behavior.type === 'parasite') {
      return {
        attackCooldown: 0,
      };
    }

    return {};
  }

  initializeVisualState() {
    const visual = this.variantConfig?.visual;
    if (!visual) {
      return {};
    }

    const state = {};

    if (visual.pulse) {
      state.glowTime = Math.random() * Math.PI * 2;
    }

    if (this.behavior?.type === 'volatile' && visual.trail) {
      const baseInterval = visual.trail.interval ?? 0.05;
      state.trailCooldown = Math.random() * baseInterval;
    }

    return state;
  }

  createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  generateVertices() {
    const vertices = [];
    const seededRandom = this.createSeededRandom(this.crackSeed ^ 0x45f1);
    const numVertices = 7 + Math.floor(seededRandom() * 4);

    for (let i = 0; i < numVertices; i += 1) {
      const angle = (i / numVertices) * Math.PI * 2;
      const radiusVariation = 0.78 + seededRandom() * 0.42;
      const radius = this.radius * radiusVariation;
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }

    return vertices;
  }

  rebuildPolygonCache() {
    if (!Array.isArray(this.vertices) || this.vertices.length < 3) {
      this.polygonEdges = [];
      this.minSurfaceRadius = this.radius;
      return;
    }

    const edges = [];
    for (let i = 0; i < this.vertices.length; i += 1) {
      const current = this.vertices[i];
      const next = this.vertices[(i + 1) % this.vertices.length];
      edges.push({
        ax: current.x,
        ay: current.y,
        bx: next.x,
        by: next.y,
        dx: next.x - current.x,
        dy: next.y - current.y,
      });
    }

    this.polygonEdges = edges;
    this.minSurfaceRadius = this.computeMinSurfaceRadius();
  }

  calculateCross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  intersectRayWithEdges(startX, startY, dirX, dirY) {
    if (!Array.isArray(this.polygonEdges) || this.polygonEdges.length === 0) {
      return 0;
    }

    const epsilon = 1e-6;
    let closest = Infinity;

    for (let i = 0; i < this.polygonEdges.length; i += 1) {
      const edge = this.polygonEdges[i];
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

    if (closest === Infinity) {
      return 0;
    }

    return closest;
  }

  measureRayDistance(startX, startY, angle, margin = 0.6) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const distance = this.intersectRayWithEdges(startX, startY, dirX, dirY);
    if (distance <= 0) {
      return 0;
    }

    const safeMargin = Math.max(0, margin);
    const safeDistance = distance - safeMargin;
    return safeDistance > 0 ? safeDistance : 0;
  }

  computeMinSurfaceRadius() {
    if (!Array.isArray(this.polygonEdges) || this.polygonEdges.length === 0) {
      return this.radius;
    }

    const samples = Math.max(12, (this.vertices?.length || 0) * 3);
    let minDistance = Infinity;

    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const distance = this.intersectRayWithEdges(
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
      return this.radius;
    }

    return Math.max(0, minDistance);
  }

  generateCrackLayers() {
    const thresholds = CONSTANTS.ASTEROID_CRACK_THRESHOLDS || [];
    if (!thresholds.length) {
      return { layers: [], segments: [], segmentLookup: {} };
    }

    if (!Array.isArray(this.vertices) || this.vertices.length < 3) {
      return { layers: [], segments: [], segmentLookup: {} };
    }

    const profile =
      this.crackProfile ||
      CONSTANTS.ASTEROID_CRACK_PROFILES?.[this.crackProfileKey] ||
      CONSTANTS.ASTEROID_CRACK_PROFILES.default;

    const baseGraphRules = CONSTANTS.ASTEROID_CRACK_GRAPH_RULES || {};
    const profileGraphRules = profile?.graphRules || {};

    const graphRules = {
      continuationBias:
        profileGraphRules.continuationBias ??
        baseGraphRules.continuationBias ??
        0.82,
      newRootChance:
        profileGraphRules.newRootChance ??
        baseGraphRules.newRootChance ??
        0.2,
      childPenalty:
        profileGraphRules.childPenalty ??
        baseGraphRules.childPenalty ??
        0.45,
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
        profileGraphRules.surfaceMargin ??
        baseGraphRules.surfaceMargin ??
        0.65,
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

    const seededRandom = this.createSeededRandom(this.crackSeed ^ 0x9e3779);
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

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const stageTemplates = thresholds.map(
      (_, index) =>
        profile?.layers?.[index] ??
        profile?.layers?.[profile.layers.length - 1] ??
        {}
    );

    const layers = [];
    const segments = [];
    const segmentLookup = {};

    const segmentPrefix = `${this.crackProfileKey}-${this.crackSeed.toString(16)}`;
    let nextSegmentIndex = 0;

    const trunkRecords = [];
    const minSegmentLength = Math.max(
      1.2,
      this.radius * graphRules.minSegmentLengthRatio
    );
    const uniformRadius = Math.max(
      0,
      (this.minSurfaceRadius || this.radius) - graphRules.surfaceMargin * 1.1
    );

    const countMainSegments = (list) =>
      list.filter(
        (segment) =>
          segment &&
          (segment.type === 'trunk' || segment.type === 'extension')
      ).length;

    for (let stageIndex = 0; stageIndex < stageTemplates.length; stageIndex += 1) {
      const stageNumber = stageIndex + 1;
      const template = stageTemplates[stageIndex] || {};

      const widthRange =
        template.lineWidthRange ||
        profile?.lineWidthRange ||
        [0.8, 1.25];
      const angularJitter = template.angularJitter ?? 0.25;
      const mainCountTarget = Math.max(
        1,
        Math.round(
          template.mainRays ??
            (stageIndex === 0 ? 3 : trunkRecords.length || 3)
        )
      );
      const startRadiusRange =
        template.startRadiusRange ||
        profile?.startRadiusRange ||
        [0.2, 0.32];
      const mainLengthRange = template.mainLengthRange || [0.5, 0.7];

      const stageRotation =
        baseRotation +
        (seededRandom() - 0.5) * 2 * rotationJitter;

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
        this.measureRayDistance(sx, sy, angle, graphRules.surfaceMargin);

      const createRootSegment = () => {
        const baseAngle =
          stageRotation +
          (trunkRecords.length / Math.max(1, mainCountTarget)) *
            Math.PI *
            2;
        const angle =
          baseAngle +
          (seededRandom() - 0.5) * 2 * angularJitter;

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
        if (length < minSegmentLength * 0.6) {
          return false;
        }

        const startPoint = {
          x: Math.cos(angle) * startRadius,
          y: Math.sin(angle) * startRadius,
        };
        const endPoint = {
          x: startPoint.x + Math.cos(angle) * length,
          y: startPoint.y + Math.sin(angle) * length,
        };

        const segment = spawnSegment({
          type: 'trunk',
          start: startPoint,
          end: endPoint,
          width: getWidth(1),
          angle,
        });

        if (!segment) {
          return false;
        }

        const trunk = {
          id: `trunk-${trunkRecords.length}`,
          angle,
          endPoint: { x: segment.x2, y: segment.y2 },
          lastSegmentId: segment.id,
          rootSegmentId: segment.rootId,
          exhausted: false,
        };
        trunkRecords.push(trunk);
        return true;
      };

      const extendTrunk = (trunk) => {
        if (!trunk) {
          return null;
        }

        const angle =
          trunk.angle +
          (seededRandom() - 0.5) *
            2 *
            angularJitter *
            (graphRules.continuationJitter ?? 0.5);

        const maxReach = measureSurface(trunk.endPoint.x, trunk.endPoint.y, angle);
        if (maxReach <= minSegmentLength * 0.6) {
          trunk.exhausted = true;
          return null;
        }

        let length =
          maxReach * sampleRange(mainLengthRange, 0.55);
        length = clamp(
          length,
          minSegmentLength * 0.8,
          Math.max(minSegmentLength, maxReach)
        );
        length = Math.min(length, maxReach);
        if (length < minSegmentLength * 0.6) {
          trunk.exhausted = true;
          return null;
        }

        const startPoint = { x: trunk.endPoint.x, y: trunk.endPoint.y };
        const endPoint = {
          x: startPoint.x + Math.cos(angle) * length,
          y: startPoint.y + Math.sin(angle) * length,
        };

        const segment = spawnSegment({
          type: 'extension',
          start: startPoint,
          end: endPoint,
          width: getWidth(0.95),
          angle,
          parentId: trunk.lastSegmentId,
          rootId: trunk.rootSegmentId,
        });

        if (!segment) {
          trunk.exhausted = true;
          return null;
        }

        trunk.endPoint = { x: segment.x2, y: segment.y2 };
        trunk.lastSegmentId = segment.id;
        trunk.angle = angle;
        trunk.exhausted = false;
        return segment;
      };

      const selectParent = (options = {}) => {
        const includeBranches = options.includeBranches !== false;
        const includeMicro = options.includeMicro === true;
        const candidates = segments.filter((segment) => {
          if (!segment) return false;
          if (segment.stage > stageNumber) return false;
          if (segment.type === 'micro' && !includeMicro) return false;
          if (segment.type === 'branch' && !includeBranches) return false;
          return true;
        });

        if (!candidates.length) {
          return null;
        }

        const weights = [];
        let totalWeight = 0;

        for (let i = 0; i < candidates.length; i += 1) {
          const candidate = candidates[i];
          let weight = candidate.length || 1;
          if (candidate.type === 'branch') {
            weight *= 1 - graphRules.branchParentPenalty;
          } else if (candidate.type === 'micro') {
            weight *= 1 - graphRules.microParentPenalty;
          } else {
            weight *= 1 + graphRules.continuationBias * 0.15;
          }

          const childCount = candidate.children || 0;
          const penalty =
            1 / (1 + childCount * (graphRules.childPenalty ?? 0.45));
          weight *= Math.max(0.1, penalty);

          totalWeight += weight;
          weights.push(weight);
        }

        if (totalWeight <= 0) {
          return candidates[0];
        }

        const pick = seededRandom() * totalWeight;
        let accumulator = 0;
        for (let i = 0; i < candidates.length; i += 1) {
          accumulator += weights[i];
          if (pick <= accumulator) {
            return candidates[i];
          }
        }

        return candidates[candidates.length - 1];
      };

      const createBranchSegment = (config = {}, isMicro = false) => {
        const parent = selectParent({
          includeBranches: true,
          includeMicro: false,
        });

        if (!parent) {
          return null;
        }

        const baseAngle = parent.angle ?? Math.atan2(
          parent.y2 - parent.y1,
          parent.x2 - parent.x1
        );
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

        const lengthFactor =
          config.lengthMultiplier ?? (isMicro ? 0.28 : 0.5);
        const desiredLength =
          parent.length *
          lengthFactor *
          (0.7 + seededRandom() * 0.5);
        const minLength = minSegmentLength * (isMicro ? 0.55 : 0.8);
        const maxLength = Math.max(minSegmentLength * (isMicro ? 0.9 : 1.1), maxReach);
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

        while (
          producedMain < mainCountTarget &&
          guard < mainCountTarget * 4
        ) {
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
        while (
          created < branchCount &&
          attempts < branchCount * 5
        ) {
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
        while (
          created < microCount &&
          attempts < microCount * 5
        ) {
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
          cracks:
            burstConfig.cracks ?? Math.max(stageSegments.length, 4),
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

  updateVisualState(deltaTime) {
    if (!this.variantConfig?.visual) {
      return;
    }

    if (!this.visualState) {
      this.visualState = {};
    }

    const pulse = this.variantConfig.visual.pulse;
    if (pulse) {
      if (typeof this.visualState.glowTime !== 'number') {
        this.visualState.glowTime = Math.random() * Math.PI * 2;
      }

      const speed = Math.max(0, pulse.speed ?? 1);
      if (speed > 0) {
        const angularSpeed = speed * Math.PI * 2;
        this.visualState.glowTime += deltaTime * angularSpeed;

        if (this.visualState.glowTime > Math.PI * 512) {
          this.visualState.glowTime -= Math.PI * 512;
        }
      }
    }
  }

  update(deltaTime) {
    if (this.destroyed) {
      return;
    }

    this.updateVisualState(deltaTime);

    if (this.behavior?.type === 'parasite') {
      this.updateParasiteBehavior(deltaTime);
    }

    if (this.behavior?.type === 'volatile') {
      this.updateVolatileBehavior(deltaTime);
    }

    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.rotation += this.rotationSpeed * deltaTime;

    const margin = this.radius;
    if (this.x < -margin) this.x = CONSTANTS.GAME_WIDTH + margin;
    if (this.x > CONSTANTS.GAME_WIDTH + margin) this.x = -margin;
    if (this.y < -margin) this.y = CONSTANTS.GAME_HEIGHT + margin;
    if (this.y > CONSTANTS.GAME_HEIGHT + margin) this.y = -margin;

    if (this.lastDamageTime > 0) {
      this.lastDamageTime = Math.max(0, this.lastDamageTime - deltaTime);
    }

    if (this.shieldHitCooldown > 0) {
      this.shieldHitCooldown = Math.max(0, this.shieldHitCooldown - deltaTime);
    }
  }

  updateVolatileBehavior(deltaTime) {
    if (!this.variantState) {
      this.variantState = {};
    }

    if (typeof this.variantState.fuseTimer !== 'number') {
      return;
    }

    this.variantState.fuseTimer -= deltaTime;

    if (!this.variantState.exploded) {
      this.maybeEmitVolatileTrail(deltaTime);
    }

    if (
      !this.variantState.armed &&
      typeof this.behavior?.armTime === 'number' &&
      this.variantState.fuseTimer <= this.behavior.armTime
    ) {
      this.variantState.armed = true;
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('asteroid-volatile-armed', {
          asteroid: this,
          position: { x: this.x, y: this.y },
        });
      }
    }

    if (this.variantState.fuseTimer <= 0 && !this.variantState.exploded) {
      this.variantState.exploded = true;
      if (
        this.system &&
        typeof this.system.handleVolatileTimeout === 'function'
      ) {
        this.system.handleVolatileTimeout(this);
      }
    }
  }

  getVolatileFuseProgress() {
    if (this.behavior?.type !== 'volatile') {
      return 0;
    }

    const fuseTime = this.behavior?.fuseTime ?? 0;
    if (!Number.isFinite(fuseTime) || fuseTime <= 0) {
      return 1;
    }

    const remaining = Number.isFinite(this.variantState?.fuseTimer)
      ? Math.max(0, this.variantState.fuseTimer)
      : fuseTime;
    const normalized = 1 - remaining / fuseTime;
    return Math.max(0, Math.min(1, normalized));
  }

  maybeEmitVolatileTrail(deltaTime) {
    if (this.behavior?.type !== 'volatile') {
      return;
    }

    if (this.variantState?.exploded) {
      return;
    }

    const visual = this.variantConfig?.visual;
    const trail = visual?.trail;
    if (!trail) {
      return;
    }

    if (!this.visualState) {
      this.visualState = {};
    }

    if (typeof this.visualState.trailCooldown !== 'number') {
      this.visualState.trailCooldown = 0;
    }

    const fuseProgress = this.getVolatileFuseProgress();
    const baseInterval = trail.interval ?? 0.05;
    const minInterval = Math.max(0.005, trail.minimumInterval ?? baseInterval);
    const acceleration = Math.max(0, trail.accelerationFactor ?? 0);
    const desiredInterval = Math.max(
      minInterval,
      baseInterval * (1 - acceleration * fuseProgress)
    );

    this.visualState.trailCooldown -= deltaTime;
    const bursts = Math.min(
      3,
      Math.max(1, Math.ceil(deltaTime / desiredInterval))
    );
    let emitted = 0;

    while (this.visualState.trailCooldown <= 0 && emitted < bursts) {
      this.visualState.trailCooldown += desiredInterval;
      emitted += 1;

      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('asteroid-volatile-trail', {
          asteroidId: this.id,
          position: { x: this.x, y: this.y },
          velocity: { x: this.vx, y: this.vy },
          config: trail,
          armed: !!this.variantState?.armed,
          fuseProgress,
          intensity: Math.min(
            1,
            0.35 + fuseProgress * 0.55 + (this.variantState?.armed ? 0.2 : 0)
          ),
        });
      }
    }
  }

  updateParasiteBehavior(deltaTime) {
    const behavior = this.behavior;
    if (!behavior) return;

    const player =
      this.system && typeof this.system.getCachedPlayer === 'function'
        ? this.system.getCachedPlayer()
        : null;

    if (!player || !player.position) {
      return;
    }

    const dx = player.position.x - this.x;
    const dy = player.position.y - this.y;
    const distance = Math.hypot(dx, dy) || 0.0001;
    const dirX = dx / distance;
    const dirY = dy / distance;

    const acceleration = behavior.acceleration ?? 0;
    this.vx += dirX * acceleration * deltaTime;
    this.vy += dirY * acceleration * deltaTime;

    const maxSpeed = behavior.maxSpeed ?? Infinity;
    const currentSpeed = Math.hypot(this.vx, this.vy);
    if (currentSpeed > maxSpeed) {
      const scale = maxSpeed / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }

    const minDistance = behavior.minDistance ?? 0;
    if (distance < minDistance) {
      const repelStrength = (minDistance - distance) / Math.max(minDistance, 1);
      this.vx -= dirX * acceleration * repelStrength * deltaTime * 1.2;
      this.vy -= dirY * acceleration * repelStrength * deltaTime * 1.2;
    }

    if (!this.variantState) {
      this.variantState = { attackCooldown: 0 };
    }

    this.variantState.attackCooldown = Math.max(
      0,
      (this.variantState.attackCooldown || 0) - deltaTime
    );

    const playerRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : CONSTANTS.SHIP_SIZE;
    const attackRange =
      (behavior.minDistance ?? 0) + this.radius + playerRadius + 6;

    if (
      distance <= attackRange &&
      this.variantState.attackCooldown === 0 &&
      this.system &&
      typeof this.system.applyDirectDamageToPlayer === 'function'
    ) {
      const damage = behavior.contactDamage ?? 20;
      const result = this.system.applyDirectDamageToPlayer(damage, {
        cause: 'parasite',
        position: { x: this.x, y: this.y },
      });

      if (result?.applied) {
        this.variantState.attackCooldown = behavior.cooldown ?? 1.2;
      }
    }
  }

  updateCrackStage() {
    const thresholds = CONSTANTS.ASTEROID_CRACK_THRESHOLDS || [];
    if (!thresholds.length || this.maxHealth <= 0) {
      return;
    }

    const ratio = this.health / this.maxHealth;
    let newStage = 0;

    for (let i = 0; i < thresholds.length; i += 1) {
      if (ratio <= thresholds[i]) {
        newStage = i + 1;
      }
    }

    if (newStage !== this.crackStage) {
      this.crackStage = newStage;
      if (typeof gameEvents !== 'undefined') {
        const layer = this.crackLayers[this.crackStage - 1] || null;
        const segmentList = Array.isArray(layer?.segments)
          ? layer.segments.map((segment) => {
              if (!segment) {
                return null;
              }

              const startX = Number.isFinite(segment.x1)
                ? segment.x1
                : Number.isFinite(segment.start?.x)
                  ? segment.start.x
                  : 0;
              const startY = Number.isFinite(segment.y1)
                ? segment.y1
                : Number.isFinite(segment.start?.y)
                  ? segment.start.y
                  : 0;
              const endX = Number.isFinite(segment.x2)
                ? segment.x2
                : Number.isFinite(segment.end?.x)
                  ? segment.end.x
                  : 0;
              const endY = Number.isFinite(segment.y2)
                ? segment.y2
                : Number.isFinite(segment.end?.y)
                  ? segment.end.y
                  : 0;
              const length = Number.isFinite(segment.length)
                ? segment.length
                : Math.hypot(endX - startX, endY - startY);

              return {
                id: segment.id || null,
                parentId: segment.parentId ?? null,
                rootId: segment.rootId ?? null,
                stage: segment.stage ?? this.crackStage,
                type: segment.type || 'line',
                width: Number.isFinite(segment.width)
                  ? segment.width
                  : 1,
                length,
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
              };
            })
          : [];

        const seenSegmentKeys = new Set();
        const sanitizedSegments = [];

        segmentList.forEach((segment) => {
          if (!segment) {
            return;
          }

          const startX = Number.isFinite(segment.start?.x)
            ? segment.start.x
            : 0;
          const startY = Number.isFinite(segment.start?.y)
            ? segment.start.y
            : 0;
          const endX = Number.isFinite(segment.end?.x) ? segment.end.x : 0;
          const endY = Number.isFinite(segment.end?.y) ? segment.end.y : 0;
          const type = segment.type || 'line';
          const key = [
            segment.id ?? 'no-id',
            startX.toFixed(4),
            startY.toFixed(4),
            endX.toFixed(4),
            endY.toFixed(4),
            type,
          ].join(':');

          if (seenSegmentKeys.has(key)) {
            return;
          }

          seenSegmentKeys.add(key);
          sanitizedSegments.push(segment);
        });

        const sanitizedSegmentIds = [];
        const seenSegmentIds = new Set();

        sanitizedSegments.forEach((segment) => {
          if (!segment?.id) {
            return;
          }

          if (seenSegmentIds.has(segment.id)) {
            return;
          }

          seenSegmentIds.add(segment.id);
          sanitizedSegmentIds.push(segment.id);
        });

        if (layer) {
          layer.segmentIds = sanitizedSegmentIds;
        }

        gameEvents.emit('asteroid-crack-stage-changed', {
          asteroidId: this.id,
          layerId: layer?.id ?? null,
          profile: this.crackProfileKey,
          stage: this.crackStage,
          intensity: layer?.intensity ?? this.crackStage,
          burst: layer?.burst ?? null,
          ratio,
          variant: this.variant,
          size: this.size,
          position: { x: this.x, y: this.y },
          radius: this.radius,
          velocity: { x: this.vx, y: this.vy },
          rotation: this.rotation,
          segmentIds: sanitizedSegmentIds,
          segments: sanitizedSegments,
        });
      }
    }
  }

  takeDamage(damage) {
    if (this.destroyed) {
      return false;
    }

    const appliedDamage = Math.max(0, damage);
    if (appliedDamage <= 0) {
      return false;
    }

    this.health = Math.max(0, this.health - appliedDamage);
    this.lastDamageTime = 0.12;
    this.updateCrackStage();
    return this.health <= 0;
  }

  getVariantColors() {
    const fallback = {
      fill:
        { large: '#8B4513', medium: '#A0522D', small: '#CD853F' }[this.size] ||
        '#8B4513',
      stroke: '#654321',
      cracks: 'rgba(255, 255, 255, 0.45)',
    };

    const colors = this.variantConfig?.colors;
    if (!colors) {
      return fallback;
    }

    return {
      fill: colors.fill || fallback.fill,
      stroke: colors.stroke || fallback.stroke,
      cracks: colors.cracks || fallback.cracks,
      glow: colors.glow,
      innerGlow: colors.innerGlow,
      pulse: colors.pulse,
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const colors = this.getVariantColors();
    const isFlashing = this.lastDamageTime > 0;
    const visual = this.variantConfig?.visual || {};
    const isVolatile = this.behavior?.type === 'volatile';
    const fuseProgress = isVolatile ? this.getVolatileFuseProgress() : 0;
    const pulseConfig = visual.pulse;
    const glowConfig = visual.glow || {};

    let basePulse = 0;
    let fillStyle = colors.fill;
    const strokeStyle = colors.stroke;

    if (!isFlashing) {
      if (pulseConfig) {
        if (!this.visualState) {
          this.visualState = {};
        }

        if (typeof this.visualState.glowTime !== 'number') {
          this.visualState.glowTime = Math.random() * Math.PI * 2;
        }

        basePulse = (Math.sin(this.visualState.glowTime) + 1) / 2;
        const dynamicFactor = basePulse * (pulseConfig.amount ?? 0);
        const fuseFactor = isVolatile
          ? fuseProgress * (pulseConfig.fuseBoost ?? 0)
          : 0;
        const armedFactor =
          isVolatile && this.variantState?.armed
            ? pulseConfig.armedBoost ?? 0
            : 0;
        const pulseMix = Math.min(1, dynamicFactor + fuseFactor + armedFactor);

        const pulseColor =
          pulseConfig.color || colors.pulse || colors.glow || colors.innerGlow;
        if (pulseColor) {
          fillStyle = this.mixColor(fillStyle, pulseColor, pulseMix);
        }
      } else if (isVolatile && colors.pulse) {
        basePulse = fuseProgress;
        const pulseMix = Math.min(1, fuseProgress * 0.8);
        fillStyle = this.mixColor(fillStyle, colors.pulse, pulseMix);
      }
    }

    if (isFlashing) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#FFFFFF';
    } else {
      ctx.fillStyle = fillStyle;
      ctx.strokeStyle = strokeStyle;

      if (colors.glow || colors.innerGlow) {
        const baseGlowColor = colors.glow || colors.innerGlow;
        const shadowBlurBase = Number.isFinite(glowConfig.baseBlur)
          ? glowConfig.baseBlur
          : 12;
        const blurPulse = Number.isFinite(glowConfig.pulseBlur)
          ? glowConfig.pulseBlur
          : 0;
        const blurFuse =
          isVolatile && Number.isFinite(glowConfig.fuseBlur)
            ? glowConfig.fuseBlur * fuseProgress
            : 0;
        const blurArmed =
          isVolatile &&
          this.variantState?.armed &&
          Number.isFinite(glowConfig.armedBlur)
            ? glowConfig.armedBlur
            : 0;
        ctx.shadowBlur =
          shadowBlurBase + blurPulse * basePulse + blurFuse + blurArmed;

        if (Number.isFinite(glowConfig.baseAlpha)) {
          const baseAlpha = glowConfig.baseAlpha ?? 0.6;
          const pulseAlpha = glowConfig.pulseAlpha ?? 0;
          const fuseAlpha =
            isVolatile && Number.isFinite(glowConfig.fuseAlpha)
              ? glowConfig.fuseAlpha * fuseProgress
              : 0;
          const armedAlpha =
            isVolatile &&
            this.variantState?.armed &&
            Number.isFinite(glowConfig.armedAlpha)
              ? glowConfig.armedAlpha
              : 0;

          const totalAlpha = Math.min(
            1,
            baseAlpha + pulseAlpha * basePulse + fuseAlpha + armedAlpha
          );
          ctx.shadowColor = this.withAlpha(baseGlowColor, totalAlpha);
        } else {
          ctx.shadowColor = baseGlowColor;
        }
      }
    }

    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < this.vertices.length; i += 1) {
      const vertex = this.vertices[i];
      if (i === 0) {
        ctx.moveTo(vertex.x, vertex.y);
      } else {
        ctx.lineTo(vertex.x, vertex.y);
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!isFlashing && colors.innerGlow) {
      const gradient = ctx.createRadialGradient(
        0,
        0,
        Math.max(2, this.radius * 0.2),
        0,
        0,
        this.radius * 1.1
      );

      const armedBonus = isVolatile && this.variantState?.armed ? 0.25 : 0;
      const innerIntensity = Math.min(
        1,
        0.35 + basePulse * 0.35 + fuseProgress * 0.6 + armedBonus
      );

      gradient.addColorStop(
        0,
        this.withAlpha(colors.innerGlow, innerIntensity)
      );
      gradient.addColorStop(
        0.7,
        this.withAlpha(colors.innerGlow, innerIntensity * 0.4)
      );
      gradient.addColorStop(1, this.withAlpha(colors.innerGlow, 0));

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    if (this.crackStage > 0 && !isFlashing) {
      ctx.strokeStyle = colors.cracks || 'rgba(255, 255, 255, 0.45)';

      for (let stage = 0; stage < this.crackStage; stage += 1) {
        const layer = this.crackLayers[stage];
        if (!layer) continue;

        const segments = Array.isArray(layer?.segments)
          ? layer.segments
          : Array.isArray(layer?.lines)
            ? layer.lines
            : [];
        segments.forEach((line) => {
          const width = Math.max(
            0.45,
            Number.isFinite(line?.width) ? line.width : 1.2
          );
          ctx.beginPath();
          ctx.moveTo(line.x1, line.y1);
          ctx.lineTo(line.x2, line.y2);
          ctx.lineWidth = width;
          ctx.stroke();
        });
      }
    }

    ctx.restore();
  }

  parseColor(color) {
    if (typeof color !== 'string') {
      return { r: 255, g: 255, b: 255 };
    }

    if (color.startsWith('#')) {
      let hex = color.slice(1);
      if (hex.length === 3) {
        hex = hex
          .split('')
          .map((c) => c + c)
          .join('');
      }
      if (hex.length === 6) {
        const bigint = Number.parseInt(hex, 16);
        return {
          r: (bigint >> 16) & 255,
          g: (bigint >> 8) & 255,
          b: bigint & 255,
        };
      }
    }

    const rgbaMatch = color.match(/rgba?\s*\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbaMatch) {
      return {
        r: Number.parseInt(rgbaMatch[1], 10) || 255,
        g: Number.parseInt(rgbaMatch[2], 10) || 255,
        b: Number.parseInt(rgbaMatch[3], 10) || 255,
      };
    }

    return { r: 255, g: 255, b: 255 };
  }

  withAlpha(color, alpha) {
    const parsed = this.parseColor(color);
    const clamped = Math.max(0, Math.min(1, alpha));
    return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clamped})`;
  }

  mixColor(baseColor, overlayColor, factor) {
    if (factor <= 0) return baseColor;
    if (factor >= 1) return overlayColor;

    const base = this.parseColor(baseColor);
    const overlay = this.parseColor(overlayColor);

    const mix = (component) =>
      Math.round(
        base[component] + (overlay[component] - base[component]) * factor
      );

    return `rgb(${mix('r')}, ${mix('g')}, ${mix('b')})`;
  }

  generateFragments() {
    if (this.size === 'small') {
      return [];
    }

    const newSize = this.size === 'large' ? 'medium' : 'small';
    const rules =
      this.fragmentProfile ||
      CONSTANTS.ASTEROID_FRAGMENT_RULES?.[this.fragmentProfileKey] ||
      CONSTANTS.ASTEROID_FRAGMENT_RULES.default;

    const currentGeneration = this.generation ?? 0;
    const maxGeneration = rules?.maxGeneration;
    if (Number.isFinite(maxGeneration) && currentGeneration + 1 > maxGeneration) {
      return [];
    }

    const countRange =
      rules?.countBySize?.[this.size] ||
      rules?.countBySize?.default ||
      [2, 3];

    const seededRandom = this.createSeededRandom(this.crackSeed ^ 0x5e17);

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

    const resolveCount = (range) => {
      if (Array.isArray(range) && range.length === 2) {
        const min = Math.floor(Number.isFinite(range[0]) ? range[0] : 0);
        const max = Math.floor(Number.isFinite(range[1]) ? range[1] : min);
        if (max <= min) {
          return Math.max(0, min);
        }
        return min + Math.floor(seededRandom() * (max - min + 1));
      }
      const numeric = Number(range);
      if (!Number.isFinite(numeric)) {
        return 0;
      }
      return Math.max(0, Math.round(numeric));
    };

    let fragmentCount = resolveCount(countRange);
    if (fragmentCount <= 0) {
      fragmentCount = 1;
    }

    const fragments = [];
    const baseSpeed = CONSTANTS.ASTEROID_SPEEDS[newSize] || 40;
    const speedRange =
      rules?.speedMultiplierBySize?.[this.size] ||
      rules?.speedMultiplierBySize?.default ||
      [0.85, 1.2];
    const inheritVelocity = rules?.inheritVelocity ?? 0.4;
    const angleJitter = rules?.angleJitter ?? Math.PI / 6;
    const radialRange = rules?.radialDistanceRange || [0.45, 0.9];
    const offsetJitter = rules?.radialOffsetJitter ?? 0.2;

    const parentVx = Number.isFinite(this.vx) ? this.vx : 0;
    const parentVy = Number.isFinite(this.vy) ? this.vy : 0;
    const angleOffset = seededRandom() * Math.PI * 2;

    for (let i = 0; i < fragmentCount; i += 1) {
      const baseAngle =
        angleOffset + (i / Math.max(1, fragmentCount)) * Math.PI * 2;
      const travelAngle =
        baseAngle + (seededRandom() - 0.5) * 2 * angleJitter;
      const spawnAngle =
        travelAngle + (seededRandom() - 0.5) * 2 * offsetJitter;
      const distance =
        this.radius *
        sampleRange(radialRange, 0.6);
      const speedMultiplier = sampleRange(speedRange, 1);
      const vx =
        Math.cos(travelAngle) * baseSpeed * speedMultiplier +
        parentVx * inheritVelocity;
      const vy =
        Math.sin(travelAngle) * baseSpeed * speedMultiplier +
        parentVy * inheritVelocity;

      fragments.push({
        x: this.x + Math.cos(spawnAngle) * distance,
        y: this.y + Math.sin(spawnAngle) * distance,
        vx,
        vy,
        size: newSize,
        wave: this.wave,
        spawnedBy: this.id,
        generation: currentGeneration + 1,
      });
    }

    return fragments;
  }
}

// === SISTEMA DE INIMIGOS ===
class EnemySystem {
  constructor() {
    this.asteroids = [];
    this.spawnTimer = 0;
    this.spawnDelay = 1.0;
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = false;
    this.lastWaveBroadcast = null;
    this.cachedPlayer = null;
    this.cachedWorld = null;
    this.cachedProgression = null;
    this.activeAsteroidCache = [];
    this.activeAsteroidCacheDirty = true;

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('enemies', this);
    }

    this.setupEventListeners();
    this.resolveCachedServices(true);

    this.emitWaveStateUpdate(true);

    console.log('[EnemySystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;

    gameEvents.on('shield-shockwave', (data) => {
      this.handleShockwave(data);
    });

    gameEvents.on('player-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('progression-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('world-reset', () => {
      this.resolveCachedServices(true);
    });
  }

  resolveCachedServices(force = false) {
    if (typeof gameServices === 'undefined') {
      return;
    }

    if (force || !this.cachedPlayer) {
      if (typeof gameServices.has === 'function' && gameServices.has('player')) {
        this.cachedPlayer = gameServices.get('player');
      } else {
        this.cachedPlayer = null;
      }
    }

    if (force || !this.cachedWorld) {
      if (typeof gameServices.has === 'function' && gameServices.has('world')) {
        this.cachedWorld = gameServices.get('world');
      } else {
        this.cachedWorld = null;
      }
    }

    if (force || !this.cachedProgression) {
      if (
        typeof gameServices.has === 'function' &&
        gameServices.has('progression')
      ) {
        this.cachedProgression = gameServices.get('progression');
      } else {
        this.cachedProgression = null;
      }
    }
  }

  getCachedPlayer() {
    if (!this.cachedPlayer) {
      this.resolveCachedServices();
    }
    return this.cachedPlayer;
  }

  getCachedWorld() {
    if (!this.cachedWorld) {
      this.resolveCachedServices();
    }
    return this.cachedWorld;
  }

  getCachedProgression() {
    if (!this.cachedProgression) {
      this.resolveCachedServices();
    }
    return this.cachedProgression;
  }

  invalidateActiveAsteroidCache() {
    this.activeAsteroidCacheDirty = true;
  }

  rebuildActiveAsteroidCache() {
    if (!this.activeAsteroidCacheDirty) {
      return;
    }

    if (!Array.isArray(this.activeAsteroidCache)) {
      this.activeAsteroidCache = [];
    }

    this.activeAsteroidCache.length = 0;

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const asteroid = this.asteroids[i];
      if (asteroid && !asteroid.destroyed) {
        this.activeAsteroidCache.push(asteroid);
      }
    }

    this.activeAsteroidCacheDirty = false;
  }

  forEachActiveAsteroid(callback) {
    if (typeof callback !== 'function') {
      return;
    }

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const asteroid = this.asteroids[i];
      if (asteroid && !asteroid.destroyed) {
        callback(asteroid);
      }
    }
  }

  createInitialWaveState() {
    return {
      current: 1,
      totalAsteroids: CONSTANTS.ASTEROIDS_PER_WAVE_BASE,
      asteroidsSpawned: 0,
      asteroidsKilled: 0,
      isActive: true,
      breakTimer: 0,
      completedWaves: 0,
      timeRemaining: CONSTANTS.WAVE_DURATION,
      spawnTimer: 0,
      spawnDelay: 1.0,
      initialSpawnDone: false,
    };
  }

  createInitialSessionStats() {
    return {
      totalKills: 0,
      timeElapsed: 0,
    };
  }

  emitWaveStateUpdate(force = false) {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    const wave = this.waveState
      ? {
          current: this.waveState.current,
          totalAsteroids: this.waveState.totalAsteroids,
          asteroidsKilled: this.waveState.asteroidsKilled,
          isActive: Boolean(this.waveState.isActive),
          breakTimer: Math.max(0, this.waveState.breakTimer),
          completedWaves: this.waveState.completedWaves,
          timeRemaining: Math.max(0, this.waveState.timeRemaining),
        }
      : null;

    const session = this.sessionStats
      ? {
          totalKills: this.sessionStats.totalKills,
          timeElapsed: this.sessionStats.timeElapsed,
        }
      : null;

    const snapshot = {
      current: wave?.current ?? 0,
      totalAsteroids: wave?.totalAsteroids ?? 0,
      asteroidsKilled: wave?.asteroidsKilled ?? 0,
      isActive: wave?.isActive ?? false,
      timeRemainingSeconds: wave?.isActive
        ? Math.max(0, Math.ceil(wave?.timeRemaining ?? 0))
        : 0,
      breakTimerSeconds: !wave?.isActive
        ? Math.max(0, Math.ceil(wave?.breakTimer ?? 0))
        : 0,
      completedWaves: wave?.completedWaves ?? 0,
      totalKills: session?.totalKills ?? 0,
      sessionTimeSeconds: session
        ? Math.max(0, Math.floor(session.timeElapsed ?? 0))
        : 0,
    };

    if (!force && this.lastWaveBroadcast) {
      const prev = this.lastWaveBroadcast;
      const unchanged =
        prev.current === snapshot.current &&
        prev.totalAsteroids === snapshot.totalAsteroids &&
        prev.asteroidsKilled === snapshot.asteroidsKilled &&
        prev.isActive === snapshot.isActive &&
        prev.timeRemainingSeconds === snapshot.timeRemainingSeconds &&
        prev.breakTimerSeconds === snapshot.breakTimerSeconds &&
        prev.completedWaves === snapshot.completedWaves &&
        prev.totalKills === snapshot.totalKills &&
        prev.sessionTimeSeconds === snapshot.sessionTimeSeconds;

      if (unchanged) {
        return;
      }
    }

    this.lastWaveBroadcast = snapshot;

    gameEvents.emit('wave-state-updated', {
      wave,
      session,
    });
  }

  // === UPDATE PRINCIPAL ===
  update(deltaTime) {
    if (!this.sessionActive) {
      return;
    }

    this.resolveCachedServices();

    this.sessionStats.timeElapsed += deltaTime;

    this.updateAsteroids(deltaTime);
    this.updateWaveLogic(deltaTime);
    this.cleanupDestroyed();

    this.emitWaveStateUpdate();
  }

  updateWaveLogic(deltaTime) {
    const wave = this.waveState;

    if (!wave) return;

    if (wave.isActive) {
      wave.timeRemaining = Math.max(0, wave.timeRemaining - deltaTime);
      this.handleSpawning(deltaTime);

      const allAsteroidsKilled =
        wave.asteroidsKilled >= wave.totalAsteroids &&
        this.getAsteroidCount() === 0;

      if (wave.timeRemaining <= 0 || allAsteroidsKilled) {
        this.completeCurrentWave();
      }
    } else if (wave.breakTimer > 0) {
      wave.breakTimer = Math.max(0, wave.breakTimer - deltaTime);

      if (wave.breakTimer === 0) {
        this.startNextWave();
      }
    }
  }

  // === GERENCIAMENTO DE ASTEROIDES ===
  updateAsteroids(deltaTime) {
    this.asteroids.forEach((asteroid) => {
      if (!asteroid.destroyed) {
        asteroid.update(deltaTime);
      }
    });

    // Física de colisão entre asteroides
    this.handleAsteroidCollisions();
  }

  handleAsteroidCollisions() {
    for (let i = 0; i < this.asteroids.length - 1; i++) {
      const a1 = this.asteroids[i];
      if (a1.destroyed) continue;

      for (let j = i + 1; j < this.asteroids.length; j++) {
        const a2 = this.asteroids[j];
        if (a2.destroyed) continue;

        this.checkAsteroidCollision(a1, a2);
      }
    }
  }

  checkAsteroidCollision(a1, a2) {
    const dx = a2.x - a1.x;
    const dy = a2.y - a1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = a1.radius + a2.radius;

    if (distance < minDistance && distance > 0) {
      const nx = dx / distance;
      const ny = dy / distance;

      // Correção de penetração
      const overlap = minDistance - distance;
      const percent = 0.5;
      a1.x -= nx * overlap * percent;
      a1.y -= ny * overlap * percent;
      a2.x += nx * overlap * percent;
      a2.y += ny * overlap * percent;

      // Impulso elástico com massa
      const rvx = a2.vx - a1.vx;
      const rvy = a2.vy - a1.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0) {
        const e = CONSTANTS.COLLISION_BOUNCE;
        const invMass1 = 1 / a1.mass;
        const invMass2 = 1 / a2.mass;
        const j = (-(1 + e) * velAlongNormal) / (invMass1 + invMass2);

        const jx = j * nx;
        const jy = j * ny;

        a1.vx -= jx * invMass1;
        a1.vy -= jy * invMass1;
        a2.vx += jx * invMass2;
        a2.vy += jy * invMass2;
      }

      // Rotação adicional
      a1.rotationSpeed += (Math.random() - 0.5) * 1.5;
      a2.rotationSpeed += (Math.random() - 0.5) * 1.5;
    }
  }

  // === SISTEMA DE SPAWNING ===
  handleSpawning(deltaTime) {
    const wave = this.waveState;
    if (!wave || !wave.isActive) {
      return;
    }

    this.spawnTimer -= deltaTime;

    if (this.shouldSpawn() && this.spawnTimer <= 0) {
      this.spawnAsteroid();
      this.spawnTimer = wave.spawnDelay * (0.5 + Math.random() * 0.5);
    }
  }

  shouldSpawn() {
    const wave = this.waveState;
    if (!wave || !wave.isActive) {
      return false;
    }

    return (
      wave.asteroidsSpawned < wave.totalAsteroids &&
      this.getAsteroidCount() < CONSTANTS.MAX_ASTEROIDS_ON_SCREEN
    );
  }

  spawnAsteroid() {
    if (!this.sessionActive) return null;

    const side = Math.floor(Math.random() * 4);
    let x;
    let y;
    const margin = 80;

    switch (side) {
      case 0:
        x = Math.random() * CONSTANTS.GAME_WIDTH;
        y = -margin;
        break;
      case 1:
        x = CONSTANTS.GAME_WIDTH + margin;
        y = Math.random() * CONSTANTS.GAME_HEIGHT;
        break;
      case 2:
        x = Math.random() * CONSTANTS.GAME_WIDTH;
        y = CONSTANTS.GAME_HEIGHT + margin;
        break;
      default:
        x = -margin;
        y = Math.random() * CONSTANTS.GAME_HEIGHT;
        break;
    }

    let size;
    const rand = Math.random();
    if (rand < 0.5) size = 'large';
    else if (rand < 0.8) size = 'medium';
    else size = 'small';

    const waveNumber = this.waveState?.current || 1;
    const variant = this.decideVariant(size, {
      wave: waveNumber,
      spawnType: 'spawn',
    });

    const asteroid = new Asteroid(this, {
      x,
      y,
      size,
      variant,
      wave: waveNumber,
    });

    this.asteroids.push(asteroid);
    this.invalidateActiveAsteroidCache();

    if (this.waveState && this.waveState.isActive) {
      this.waveState.asteroidsSpawned += 1;
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('enemy-spawned', {
        enemy: asteroid,
        type: 'asteroid',
        size,
        variant,
        wave: waveNumber,
        maxHealth: asteroid.maxHealth,
        position: { x, y },
      });
    }

    return asteroid;
  }

  applyDamage(asteroid, damage, options = {}) {
    if (!asteroid || typeof asteroid.takeDamage !== 'function') {
      return { killed: false, remainingHealth: 0, fragments: [] };
    }

    if (asteroid.destroyed) {
      return { killed: false, remainingHealth: 0, fragments: [] };
    }

    const killed = asteroid.takeDamage(damage);
    const remainingHealth = Math.max(0, asteroid.health);

    if (killed) {
      const fragments = this.destroyAsteroid(asteroid, {
        cause: options.cause || 'damage',
        createFragments: options.createFragments !== false,
        triggerExplosion: options.triggerExplosion,
      });
      return { killed: true, remainingHealth: 0, fragments };
    }

    return { killed: false, remainingHealth, fragments: [] };
  }

  // === GERENCIAMENTO DE DESTRUIÇÃO ===
  destroyAsteroid(asteroid, options = {}) {
    if (!asteroid || asteroid.destroyed) return [];

    const waveNumber = this.waveState?.current || asteroid.wave || 1;
    const createFragments = options.createFragments !== false;

    asteroid.destroyed = true;
    this.invalidateActiveAsteroidCache();

    const fragmentDescriptors = createFragments
      ? asteroid.generateFragments()
      : [];
    const fragments = [];

    if (fragmentDescriptors.length > 0) {
      const fragmentVariants = this.assignVariantsToFragments(
        fragmentDescriptors,
        asteroid,
        waveNumber
      );

      fragmentDescriptors.forEach((descriptor, index) => {
        const fragment = new Asteroid(this, {
          ...descriptor,
          variant: fragmentVariants[index],
          wave: descriptor.wave || waveNumber,
        });
        this.asteroids.push(fragment);
        fragments.push(fragment);
      });

      if (this.waveState && this.waveState.isActive) {
        this.waveState.totalAsteroids += fragments.length;
        this.waveState.asteroidsSpawned += fragments.length;
      }
    }

    if (this.waveState) {
      this.waveState.asteroidsKilled += 1;
    }

    this.sessionStats.totalKills += 1;

    const shouldExplode =
      options.triggerExplosion === true ||
      (options.triggerExplosion !== false && this.isVolatileVariant(asteroid));

    if (shouldExplode) {
      this.triggerVolatileExplosion(asteroid, options.cause || 'destroyed');
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('enemy-destroyed', {
        enemy: asteroid,
        fragments,
        position: { x: asteroid.x, y: asteroid.y },
        size: asteroid.size,
        variant: asteroid.variant,
        maxHealth: asteroid.maxHealth,
        cause: options.cause || 'destroyed',
        wave: waveNumber,
        spawnedBy: asteroid.spawnedBy,
      });
    }

    this.emitWaveStateUpdate();

    if (this.waveState && this.waveState.isActive) {
      const allAsteroidsKilled =
        this.waveState.asteroidsKilled >= this.waveState.totalAsteroids &&
        this.getAsteroidCount() === 0;

      if (allAsteroidsKilled && this.waveState.timeRemaining > 0) {
        this.completeCurrentWave();
      }
    }

    return fragments;
  }

  decideVariant(size, context = {}) {
    if (context.forcedVariant) {
      return context.forcedVariant;
    }

    const chanceConfig = CONSTANTS.ASTEROID_VARIANT_CHANCES || {};
    const variantConfig = CONSTANTS.ASTEROID_VARIANTS || {};
    const info = chanceConfig[size];

    if (!info) {
      return 'common';
    }

    const wave = context.wave ?? this.waveState?.current ?? 1;
    let chance = info.baseChance ?? 0;
    chance += this.computeVariantWaveBonus(wave);
    chance = Math.min(Math.max(chance, 0), 1);

    const distribution = { ...(info.distribution || {}) };

    Object.keys(distribution).forEach((key) => {
      const variant = variantConfig[key];
      const allowedSizes = variant?.allowedSizes;
      const minWave = variant?.availability?.minWave;

      const sizeAllowed =
        !Array.isArray(allowedSizes) || allowedSizes.includes(size);
      const waveAllowed = typeof minWave !== 'number' || wave >= minWave;
      const disallowed =
        Array.isArray(context.disallowedVariants) &&
        context.disallowedVariants.includes(key);

      if (!variant || !sizeAllowed || !waveAllowed || disallowed) {
        delete distribution[key];
      }
    });

    const availableKeys = Object.keys(distribution);
    if (!availableKeys.length || Math.random() > chance) {
      return 'common';
    }

    const totalWeight = availableKeys.reduce(
      (sum, key) => sum + (distribution[key] ?? 0),
      0
    );

    if (totalWeight <= 0) {
      return 'common';
    }

    let roll = Math.random() * totalWeight;
    for (let i = 0; i < availableKeys.length; i += 1) {
      const key = availableKeys[i];
      roll -= distribution[key];
      if (roll <= 0) {
        return key;
      }
    }

    return availableKeys[availableKeys.length - 1] || 'common';
  }

  computeVariantWaveBonus(wave) {
    const config = CONSTANTS.ASTEROID_VARIANT_CHANCES?.waveBonus;
    if (!config) return 0;

    const startWave = config.startWave ?? Infinity;
    if (wave < startWave) {
      return 0;
    }

    const increment = config.increment ?? 0;
    const maxBonus = config.maxBonus ?? 0;
    const extraWaves = Math.max(0, wave - startWave + 1);
    return Math.min(maxBonus, extraWaves * increment);
  }

  assignVariantsToFragments(fragments, parent, wave) {
    if (!Array.isArray(fragments) || fragments.length === 0) {
      return [];
    }

    const variants = new Array(fragments.length).fill('common');

    if (parent?.size === 'large') {
      const denseChance = Math.min(1, 0.3 + this.computeVariantWaveBonus(wave));
      if (Math.random() < denseChance) {
        const denseIndex = Math.floor(Math.random() * fragments.length);
        variants[denseIndex] = 'denseCore';
      }
    }

    for (let i = 0; i < fragments.length; i += 1) {
      if (variants[i] !== 'common') {
        continue;
      }

      const fragment = fragments[i];
      const disallowed = [];

      if (parent?.size === 'large' && variants.includes('denseCore')) {
        disallowed.push('denseCore');
      }

      variants[i] = this.decideVariant(fragment.size, {
        wave,
        spawnType: 'fragment',
        parent,
        disallowedVariants: disallowed,
      });
    }

    return variants;
  }

  isVolatileVariant(asteroid) {
    if (!asteroid) return false;
    const variant =
      CONSTANTS.ASTEROID_VARIANTS?.[asteroid.variant] ||
      CONSTANTS.ASTEROID_VARIANTS?.common;
    return variant?.behavior?.type === 'volatile';
  }

  triggerVolatileExplosion(asteroid, cause = 'destroyed') {
    if (!asteroid) return;

    const variant =
      CONSTANTS.ASTEROID_VARIANTS?.[asteroid.variant] ||
      CONSTANTS.ASTEROID_VARIANTS?.common;
    const explosion = variant?.behavior?.explosion;

    if (!explosion) {
      return;
    }

    const radius = explosion.radius ?? 0;
    const damage = explosion.damage ?? 0;
    if (radius <= 0 || damage <= 0) {
      return;
    }

    const radiusSq = radius * radius;

    this.asteroids.forEach((target) => {
      if (!target || target === asteroid || target.destroyed) {
        return;
      }

      const dx = target.x - asteroid.x;
      const dy = target.y - asteroid.y;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq <= radiusSq) {
        this.applyDamage(target, damage, {
          cause: 'volatile-explosion',
          sourceId: asteroid.id,
        });
      }
    });

    let shouldDamagePlayer = false;

    const player = this.getCachedPlayer();
    const playerPos = player?.position;

    if (
      player &&
      playerPos &&
      Number.isFinite(playerPos.x) &&
      Number.isFinite(playerPos.y)
    ) {
      const playerDx = playerPos.x - asteroid.x;
      const playerDy = playerPos.y - asteroid.y;
      const playerDistanceSq = playerDx * playerDx + playerDy * playerDy;

      shouldDamagePlayer = playerDistanceSq <= radiusSq;
    }

    if (shouldDamagePlayer) {
      this.applyDirectDamageToPlayer(damage, {
        cause: 'volatile-explosion',
        position: { x: asteroid.x, y: asteroid.y },
        radius,
      });
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('asteroid-volatile-exploded', {
        asteroid,
        position: { x: asteroid.x, y: asteroid.y },
        radius,
        damage,
        cause,
      });
    }
  }

  handleVolatileTimeout(asteroid) {
    if (!asteroid || asteroid.destroyed) {
      return;
    }

    this.destroyAsteroid(asteroid, {
      createFragments: false,
      cause: 'self-destruct',
      triggerExplosion: true,
    });
  }

  applyDirectDamageToPlayer(amount, context = {}) {
    const player = this.getCachedPlayer();
    if (!player || typeof player.takeDamage !== 'function') {
      return { applied: false };
    }

    const hasBlastRadius =
      context &&
      context.position &&
      Number.isFinite(context.position.x) &&
      Number.isFinite(context.position.y) &&
      Number.isFinite(context.radius) &&
      context.radius > 0;

    if (hasBlastRadius) {
      let playerPosition = null;

      if (
        player.position &&
        Number.isFinite(player.position.x) &&
        Number.isFinite(player.position.y)
      ) {
        playerPosition = player.position;
      } else if (typeof player.getPosition === 'function') {
        const fetchedPosition = player.getPosition();
        if (
          fetchedPosition &&
          Number.isFinite(fetchedPosition.x) &&
          Number.isFinite(fetchedPosition.y)
        ) {
          playerPosition = fetchedPosition;
        }
      }

      if (playerPosition) {
        const rawHullRadius =
          typeof player.getHullBoundingRadius === 'function'
            ? player.getHullBoundingRadius()
            : CONSTANTS.SHIP_SIZE;
        const hullRadius = Number.isFinite(rawHullRadius)
          ? Math.max(0, rawHullRadius)
          : CONSTANTS.SHIP_SIZE;

        const dx = playerPosition.x - context.position.x;
        const dy = playerPosition.y - context.position.y;
        const distance = Math.hypot(dx, dy);

        if (distance > context.radius + hullRadius) {
          return { applied: false };
        }
      }
    }

    if (
      Number.isFinite(player.invulnerableTimer) &&
      player.invulnerableTimer > 0
    ) {
      return { applied: false };
    }

    const remaining = player.takeDamage(amount);
    if (typeof remaining !== 'number') {
      return { applied: false, absorbed: true };
    }

    if (typeof player.setInvulnerableTimer === 'function') {
      player.setInvulnerableTimer(0.5);
    } else {
      player.invulnerableTimer = 0.5;
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-took-damage', {
        damage: amount,
        remaining,
        max: player.maxHealth,
        position: { ...player.position },
        cause: context.cause || 'enemy',
      });
    }

    if (remaining <= 0) {
      const world = this.getCachedWorld();
      if (world && typeof world.handlePlayerDeath === 'function') {
        if (world.playerAlive !== false) {
          world.handlePlayerDeath();
        }
      }
    }

    return { applied: true, remaining };
  }

  cleanupDestroyed() {
    const countBefore = this.asteroids.length;
    this.asteroids = this.asteroids.filter((asteroid) => !asteroid.destroyed);
    this.invalidateActiveAsteroidCache();

    if (this.asteroids.length !== countBefore) {
      // Debug
      // console.log(`[EnemySystem] Cleaned up ${countBefore - this.asteroids.length} asteroids`);
    }
  }

  // === GETTERS PÚBLICOS ===
  getAsteroids() {
    this.rebuildActiveAsteroidCache();
    return this.activeAsteroidCache;
  }

  getAllAsteroids() {
    return [...this.asteroids];
  }

  getAsteroidCount() {
    this.rebuildActiveAsteroidCache();
    return this.activeAsteroidCache.length;
  }

  render(ctx) {
    if (!ctx) return;

    this.asteroids.forEach((asteroid) => {
      if (!asteroid.destroyed && typeof asteroid.draw === 'function') {
        asteroid.draw(ctx);
      }
    });
  }

  // === INTERFACE PARA OUTROS SISTEMAS ===
  spawnInitialAsteroids(count = 4) {
    if (!this.waveState) return;

    const remaining = Math.max(
      0,
      this.waveState.totalAsteroids - this.waveState.asteroidsSpawned
    );

    const spawnCount = Math.min(count, remaining);

    for (let i = 0; i < spawnCount; i++) {
      this.spawnAsteroid();
    }

    this.waveState.initialSpawnDone = true;
    console.log(`[EnemySystem] Spawned ${spawnCount} initial asteroids`);
  }

  // === RESET E CLEANUP ===
  reset() {
    this.asteroids = [];
    this.invalidateActiveAsteroidCache();
    this.spawnTimer = 0;
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = true;
    this.lastWaveBroadcast = null;

    this.resolveCachedServices(true);

    this.spawnInitialAsteroids(4);
    this.emitWaveStateUpdate(true);
    console.log('[EnemySystem] Reset');
  }

  destroy() {
    this.asteroids = [];
    this.sessionActive = false;
    this.cachedPlayer = null;
    this.cachedWorld = null;
    this.cachedProgression = null;
    this.activeAsteroidCache = [];
    this.activeAsteroidCacheDirty = true;
    console.log('[EnemySystem] Destroyed');
  }

  stop() {
    this.sessionActive = false;
  }

  completeCurrentWave() {
    if (!this.waveState) return;

    const wave = this.waveState;
    if (!wave.isActive) return;

    wave.isActive = false;
    wave.breakTimer = CONSTANTS.WAVE_BREAK_TIME;
    wave.completedWaves += 1;
    wave.spawnTimer = 0;
    wave.initialSpawnDone = false;

    this.grantWaveRewards();

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('wave-completed', {
        wave: wave.current,
        completedWaves: wave.completedWaves,
        breakTimer: wave.breakTimer,
      });
    }

    this.emitWaveStateUpdate(true);
  }

  startNextWave() {
    if (!this.waveState) return;

    const wave = this.waveState;
    wave.current += 1;
    wave.totalAsteroids = Math.floor(
      CONSTANTS.ASTEROIDS_PER_WAVE_BASE *
        Math.pow(CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER, wave.current - 1)
    );
    wave.totalAsteroids = Math.min(wave.totalAsteroids, 25);
    wave.asteroidsSpawned = 0;
    wave.asteroidsKilled = 0;
    wave.isActive = true;
    wave.timeRemaining = CONSTANTS.WAVE_DURATION;
    wave.spawnTimer = 1.0;
    wave.spawnDelay = Math.max(0.8, 2.0 - wave.current * 0.1);
    wave.initialSpawnDone = false;

    this.spawnInitialAsteroids(4);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('wave-started', {
        wave: wave.current,
        totalAsteroids: wave.totalAsteroids,
      });
    }

    this.emitWaveStateUpdate(true);
  }

  grantWaveRewards() {
    const progression = this.getCachedProgression();
    const player = this.getCachedPlayer();

    if (!progression || !player) return;

    const orbCount = 4 + Math.floor(this.waveState.current / 2);

    for (let i = 0; i < orbCount; i++) {
      const angle = (i / orbCount) * Math.PI * 2;
      const distance = 100;
      progression.createXPOrb(
        player.position.x + Math.cos(angle) * distance,
        player.position.y + Math.sin(angle) * distance,
        20 + this.waveState.current * 5
      );
    }
  }

  getWaveState() {
    if (!this.waveState) return null;

    return { ...this.waveState };
  }

  getSessionStats() {
    return { ...this.sessionStats };
  }

  handleShockwave(data) {
    if (!data || !data.position) {
      return;
    }

    const radius =
      typeof data.radius === 'number'
        ? data.radius
        : CONSTANTS.SHIELD_SHOCKWAVE_RADIUS;
    const force =
      typeof data.force === 'number'
        ? data.force
        : CONSTANTS.SHIELD_SHOCKWAVE_FORCE;

    const radiusSq = radius * radius;
    const originX = data.position.x;
    const originY = data.position.y;

    this.asteroids.forEach((asteroid) => {
      if (!asteroid || asteroid.destroyed) {
        return;
      }

      const dx = asteroid.x - originX;
      const dy = asteroid.y - originY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq > radiusSq || distanceSq === 0) {
        return;
      }

      const distance = Math.sqrt(distanceSq);
      const falloff = 1 - Math.min(distance / radius, 1);
      const impulse = (force * falloff) / Math.max(asteroid.mass, 1);
      const nx = dx / Math.max(distance, 0.001);
      const ny = dy / Math.max(distance, 0.001);

      asteroid.vx += nx * impulse;
      asteroid.vy += ny * impulse;
      asteroid.rotationSpeed += (Math.random() - 0.5) * 4 * falloff;
      asteroid.lastDamageTime = Math.max(asteroid.lastDamageTime, 0.12);
    });
  }
}

export { EnemySystem, Asteroid };
