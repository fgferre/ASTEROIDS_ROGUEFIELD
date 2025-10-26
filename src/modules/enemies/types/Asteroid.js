// src/modules/enemies/types/Asteroid.js
import {
  ASTEROID_BASE_HEALTH,
  ASTEROID_HEALTH_SCALING,
  ASTEROID_SIZES,
  GAME_HEIGHT,
  GAME_WIDTH,
  SHIP_SIZE,
} from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import {
  ASTEROID_CRACK_THRESHOLDS,
  ASTEROID_CRACK_GRAPH_RULES,
  ASTEROID_SPEEDS,
} from '../../../data/constants/physics.js';
import {
  ASTEROID_CRACK_PROFILES,
  ASTEROID_FRAGMENT_RULES,
  ASTEROID_VARIANTS,
} from '../../../data/enemies/asteroid-configs.js';

/**
 * Asteroid Enemy Type
 *
 * The iconic asteroid enemy with advanced crack systems, variant behaviors,
 * and fragmentation mechanics. Extends BaseEnemy to integrate with the new
 * enemy system architecture.
 *
 * Features:
 * - Procedural shape generation with seeded randomness
 * - Multi-stage crack system with visual damage progression
 * - Variant system (common, iron, gold, crystal, volatile, parasite)
 * - Advanced fragmentation with inheritance
 * - Behavior systems (parasite tracking, volatile explosion)
 * - Visual effects (glow, pulse, trails)
 *
 * @extends BaseEnemy
 */
export class Asteroid extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'asteroid';

    // Asteroid-specific properties initialization
    this.size = 'small';
    this.variant = 'common';
    this.variantConfig = null;
    this.crackProfileKey = 'default';
    this.fragmentProfileKey = 'default';
    this.crackProfile = null;
    this.fragmentProfile = null;
    this.behavior = null;

    this.lastDamageTime = 0;
    this.shieldHitCooldown = 0;
    this.destroyed = false;

    this.crackSeed = 0;
    this.crackStage = 0;

    this.vertices = [];
    this.polygonEdges = [];
    this.minSurfaceRadius = 0;
    this.crackLayers = [];
    this.variantState = {};
    this.visualState = {};
    this.spawnTime = 0;
    this.random = null;
    this.randomScopes = null;
    this.randomScopeSeeds = null;
    this.randomScopeLabels = {
      movement: 'movement',
      visual: 'visual',
      collision: 'collision',
      cracks: 'cracks',
    };

    // Initialize if config was provided
    if (system && Object.keys(config).length > 0) {
      this.initialize(system, config);
    }
  }

  setRandomSource(random) {
    if (random && typeof random.float === 'function') {
      this.random = random;
    } else {
      this.random = new RandomService();
    }
    this.randomScopes = null;
    this.randomScopeSeeds = null;
    return this.random;
  }

  ensureRandomScopes() {
    if (!this.random) {
      this.setRandomSource();
    }

    if (!this.randomScopes) {
      this.randomScopes = {
        core: this.random,
        movement: this.random.fork(this.randomScopeLabels.movement),
        visual: this.random.fork(this.randomScopeLabels.visual),
        collision: this.random.fork(this.randomScopeLabels.collision),
        cracks: this.random.fork(this.randomScopeLabels.cracks),
      };
      this.randomScopeSeeds = {};
      this.captureRandomScopeSeeds();
    }

    return this.randomScopes;
  }

  getRandomFor(scope = 'core') {
    const scopes = this.ensureRandomScopes();
    if (scope === 'core') {
      return scopes.core;
    }

    if (!scopes[scope]) {
      const label = this.randomScopeLabels?.[scope] || `asteroid:${scope}`;
      scopes[scope] = this.random.fork(label);
      this.captureRandomScopeSeed(scope, scopes[scope]);
    }

    return scopes[scope];
  }

  /**
   * Initializes the asteroid with configuration.
   * Overrides BaseEnemy.initialize() to add asteroid-specific setup.
   */
  initialize(system, config) {
    const options = config || {};

    // Reset first
    this.resetForPool();

    this.system = system;
    const scopeHint = options.randomScope || (options.spawnedBy ? 'fragments' : 'spawn');
    let randomSource = options.random;
    if (!randomSource && this.system && typeof this.system.getRandomScope === 'function') {
      const scopedRandom = this.system.getRandomScope(scopeHint, {
        label: `asteroid-fallback:${scopeHint}`,
      });
      if (scopedRandom && typeof scopedRandom.fork === 'function') {
        randomSource = scopedRandom.fork('asteroid-core');
      } else {
        randomSource = scopedRandom;
      }
    }

    const baseRandom = this.setRandomSource(randomSource);
    const movementRandom = this.getRandomFor('movement');
    const cracksRandom = this.getRandomFor('cracks');

    this.id = options.id ?? baseRandom.uuid('asteroid');
    this.size = options.size ?? 'small';
    if (
      typeof this.size !== 'string' ||
      !['small', 'medium', 'large'].includes(this.size)
    ) {
      this.size = 'small';
    }
    this.variant = options.variant ?? null;
    this.wave = options.wave || 1;
    this.spawnedBy = options.spawnedBy ?? null;
    this.generation = options.generation ?? 0;

    // WAVE-006: Auto-decide variant if not provided (delegates to EnemySystem)
    if (!this.variant || this.variant === 'auto') {
      if (this.system && typeof this.system.decideVariant === 'function') {
        const variantContext = {
          wave: this.wave,
          spawnType: options.spawnedBy ? 'fragment' : 'spawn',
          parent: options.parent || null,
          disallowedVariants: options.disallowedVariants || [],
        };

        if (
          this.system &&
          typeof this.system.getRandomScope === 'function'
        ) {
          const systemVariantRandom = this.system.getRandomScope('variants');
          if (systemVariantRandom) {
            variantContext.random = systemVariantRandom;
          }
        }

        this.variant = this.system.decideVariant(this.size, variantContext);
      } else {
        // Fallback to common if decideVariant not available
        this.variant = 'common';
      }
    }

    if (!this.variant) {
      this.variant = 'common';
    }

    this.radius = ASTEROID_SIZES[this.size] || 12;
    this.variantConfig =
      ASTEROID_VARIANTS[this.variant] ||
      ASTEROID_VARIANTS.common;

    this.crackProfileKey =
      this.variantConfig?.crackProfile || this.variant || 'default';
    this.fragmentProfileKey =
      this.variantConfig?.fragmentProfile || this.variant || 'default';
    this.crackProfile =
      ASTEROID_CRACK_PROFILES[this.crackProfileKey] ||
      ASTEROID_CRACK_PROFILES.default;
    this.fragmentProfile =
      ASTEROID_FRAGMENT_RULES[this.fragmentProfileKey] ||
      ASTEROID_FRAGMENT_RULES.default;

    this.behavior = this.variantConfig?.behavior || null;

    const baseMass = this.radius * this.radius * 0.05;
    this.mass = baseMass * (this.variantConfig?.massMultiplier ?? 1);

    const baseSpeed = ASTEROID_SPEEDS[this.size] || 40;
    const randomSpeed = baseSpeed * movementRandom.range(0.8, 1.2);
    const speedMultiplier = this.variantConfig?.speedMultiplier ?? 1;
    const finalSpeed = randomSpeed * speedMultiplier;

    this.x = options.x ?? 0;
    this.y = options.y ?? 0;

    if (Number.isFinite(options.vx) || Number.isFinite(options.vy)) {
      this.vx = (options.vx ?? 0) * speedMultiplier;
      this.vy = (options.vy ?? 0) * speedMultiplier;

      if (this.vx === 0 && this.vy === 0) {
        const angle = movementRandom.range(0, Math.PI * 2);
        this.vx = Math.cos(angle) * finalSpeed;
        this.vy = Math.sin(angle) * finalSpeed;
      }
    } else {
      const angle = options.angle ?? movementRandom.range(0, Math.PI * 2);
      this.vx = Math.cos(angle) * finalSpeed;
      this.vy = Math.sin(angle) * finalSpeed;
    }

    this.rotation = options.rotation ?? movementRandom.range(0, Math.PI * 2);
    const baseRotationSpeed =
      options.rotationSpeed ?? movementRandom.range(-0.75, 0.75);
    this.rotationSpeed =
      baseRotationSpeed * (this.variantConfig?.rotationMultiplier ?? 1);

    const baseHealth =
      ASTEROID_BASE_HEALTH[this.size] ??
      ASTEROID_BASE_HEALTH.small ??
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
    this.alive = true;
    this.initialized = true;

    this.crackSeed = cracksRandom.int(0, 999999);
    this.crackStage = 0;

    this.vertices = this.generateVertices();
    this.rebuildPolygonCache();

    const crackData = this.generateCrackLayers();
    this.crackLayers = crackData.layers;

    this.variantState = this.initializeVariantState();
    this.visualState = this.initializeVisualState();
  }

  /**
   * Resets asteroid state for object pooling.
   * Overrides BaseEnemy.resetForPool() to add asteroid-specific resets.
   */
  resetForPool() {
    // Call parent reset
    super.resetForPool();

    // Asteroid-specific resets
    this.system = null;
    this.id = 0;
    this.size = null;
    this.variant = null;
    this.wave = 1;
    this.spawnedBy = null;
    this.generation = 0;
    this.radius = 0;
    this.variantConfig = null;
    this.crackProfileKey = 'default';
    this.fragmentProfileKey = 'default';
    this.crackProfile = null;
    this.fragmentProfile = null;
    this.behavior = null;
    this.mass = 0;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.maxHealth = 0;
    this.health = 0;
    this.lastDamageTime = 0;
    this.shieldHitCooldown = 0;
    this.destroyed = true;
    this.crackSeed = 0;
    this.crackStage = 0;
    this.vertices = [];
    this.polygonEdges = [];
    this.minSurfaceRadius = 0;
    this.crackLayers = [];
    this.variantState = {};
    this.visualState = {};
    this.spawnTime = 0;
    this.random = null;
    this.randomScopes = null;
    this.randomScopeSeeds = null;
  }

  computeWaveHealthMultiplier(wave) {
    const scaling = ASTEROID_HEALTH_SCALING || {};
    const currentWave = wave || 1;

    // Waves 1-10: Original scaling with cap at 2.2x
    if (currentWave <= 10) {
      const perWave = scaling.perWave ?? 0.12;
      const maxMultiplier = scaling.maxMultiplier ?? 2.2;
      const waveIndex = Math.max(0, currentWave - 1);
      const multiplier = 1 + perWave * waveIndex;
      return Math.min(multiplier, maxMultiplier);
    }

    // Waves 11+: Infinite scaling with soft cap and hard cap
    const infiniteConfig = scaling.infiniteScaling || {};
    if (!infiniteConfig.enabled) {
      return scaling.maxMultiplier ?? 2.2;
    }

    const baseMultiplier = scaling.maxMultiplier ?? 2.2;
    const startWave = infiniteConfig.startWave ?? 11;
    const increment = infiniteConfig.perWaveIncrement ?? 0.08;
    const softCapWave = infiniteConfig.softCapWave ?? 50;
    const hardCap = infiniteConfig.maxMultiplier ?? 10.0;

    const wavesAboveStart = currentWave - startWave;

    // Before soft cap: linear scaling
    if (currentWave < softCapWave) {
      const multiplier = baseMultiplier + (wavesAboveStart * increment);
      return Math.min(multiplier, hardCap);
    }

    // After soft cap: logarithmic diminishing returns
    // Formula: base + (softCapBonus) + log2(wavesAboveSoftCap) * increment
    const softCapBonus = (softCapWave - startWave) * increment;
    const wavesAboveSoftCap = currentWave - softCapWave;
    const logBonus = Math.log2(wavesAboveSoftCap + 1) * increment;
    const multiplier = baseMultiplier + softCapBonus + logBonus;

    return Math.min(multiplier, hardCap);
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
    const visualRandom = this.getRandomFor('visual');

    if (visual.pulse) {
      state.glowTime = visualRandom.range(0, Math.PI * 2);
    }

    if (this.behavior?.type === 'volatile' && visual.trail) {
      const baseInterval = visual.trail.interval ?? 0.05;
      state.trailCooldown = visualRandom.range(0, baseInterval);
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
    const thresholds = ASTEROID_CRACK_THRESHOLDS || [];
    if (!thresholds.length) {
      return { layers: [], segments: [], segmentLookup: {} };
    }

    if (!Array.isArray(this.vertices) || this.vertices.length < 3) {
      return { layers: [], segments: [], segmentLookup: {} };
    }

    const profile =
      this.crackProfile ||
      ASTEROID_CRACK_PROFILES?.[this.crackProfileKey] ||
      ASTEROID_CRACK_PROFILES.default;

    const baseGraphRules = ASTEROID_CRACK_GRAPH_RULES || {};
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
        this.visualState.glowTime = this.getRandomFor('visual').range(0, Math.PI * 2);
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

  /**
   * Updates asteroid state.
   * Overrides BaseEnemy.update() to add asteroid-specific behavior.
   */
  update(deltaTime) {
    if (this.destroyed) {
      return;
    }

    // Check if using external movement component
    const useExternalMovement = this.system?.useComponents && this.system?.movementComponent;

    // Always update visual state
    this.updateVisualState(deltaTime);

    // Behavior updates (non-movement)
    if (this.behavior?.type === 'volatile') {
      this.updateVolatileBehavior(deltaTime);
    }

    // Movement - only if NOT using component
    if (!useExternalMovement) {
      // Parasite behavior (movement + attack)
      if (this.behavior?.type === 'parasite') {
        this.updateParasiteBehavior(deltaTime);
      }

      // Linear movement
      this.x += this.vx * deltaTime;
      this.y += this.vy * deltaTime;
      this.rotation += this.rotationSpeed * deltaTime;

      // Screen wrapping
      const margin = this.radius;
      if (this.x < -margin) this.x = GAME_WIDTH + margin;
      if (this.x > GAME_WIDTH + margin) this.x = -margin;
      if (this.y < -margin) this.y = GAME_HEIGHT + margin;
      if (this.y > GAME_HEIGHT + margin) this.y = -margin;
    }

    // Timers (always update)
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
        : SHIP_SIZE;
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
    const thresholds = ASTEROID_CRACK_THRESHOLDS || [];
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

  /**
   * Applies damage to the asteroid.
   * Overrides BaseEnemy.takeDamage() to add crack stage tracking.
   */
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

  /**
   * Renders the asteroid.
   * Overrides BaseEnemy.draw() to provide asteroid-specific rendering.
   */
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
          this.visualState.glowTime = this.getRandomFor('visual').range(0, Math.PI * 2);
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
      ASTEROID_FRAGMENT_RULES?.[this.fragmentProfileKey] ||
      ASTEROID_FRAGMENT_RULES.default;

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
    const baseSpeed = ASTEROID_SPEEDS[newSize] || 40;
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

  captureRandomScopeSeed(scope, generator) {
    if (!generator || typeof generator.seed !== 'number') {
      return;
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
    }

    this.randomScopeSeeds[scope] = generator.seed >>> 0;
  }

  captureRandomScopeSeeds(scopes = this.randomScopes) {
    if (!scopes) {
      return;
    }

    Object.entries(scopes).forEach(([scope, generator]) => {
      if (scope === 'core') {
        return;
      }
      this.captureRandomScopeSeed(scope, generator);
    });
  }

  reseedRandomScopes() {
    if (!this.randomScopes || !this.randomScopeSeeds) {
      return;
    }

    Object.entries(this.randomScopes).forEach(([scope, generator]) => {
      if (scope === 'core' || !generator || typeof generator.reset !== 'function') {
        return;
      }

      const storedSeed = this.randomScopeSeeds?.[scope];
      if (storedSeed !== undefined) {
        generator.reset(storedSeed);
      }
    });
  }
}
