import * as CONSTANTS from '../core/GameConstants.js';
import { GamePools } from '../core/GamePools.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';

const ORB_CLASS_ORDER = [
  { name: 'blue', tier: 1 },
  { name: 'green', tier: 2 },
  { name: 'yellow', tier: 3 },
  { name: 'purple', tier: 4 },
  { name: 'red', tier: 5 },
  { name: 'crystal', tier: 6 },
];

const ORB_COLOR_PALETTE = {
  blue: {
    baseColor: '#00DDFF',
    glowColor: 'rgba(0, 221, 255, 0.35)',
    highlightColor: '#E9FCFF',
    fusionFlash: 'rgba(0, 221, 255, 0.55)',
  },
  green: {
    baseColor: '#00FF00',
    glowColor: 'rgba(0, 255, 0, 0.35)',
    highlightColor: '#E6FFE6',
    fusionFlash: 'rgba(0, 255, 0, 0.55)',
  },
  yellow: {
    baseColor: '#FFFF00',
    glowColor: 'rgba(255, 255, 0, 0.35)',
    highlightColor: '#FFFFE6',
    fusionFlash: 'rgba(255, 255, 0, 0.55)',
  },
  purple: {
    baseColor: '#9932CC',
    glowColor: 'rgba(153, 50, 204, 0.35)',
    highlightColor: '#F3E6FF',
    fusionFlash: 'rgba(153, 50, 204, 0.55)',
  },
  red: {
    baseColor: '#FF0000',
    glowColor: 'rgba(255, 0, 0, 0.35)',
    highlightColor: '#FFE6E6',
    fusionFlash: 'rgba(255, 0, 0, 0.6)',
  },
  crystal: {
    baseColor: '#8DF7FF',
    glowColor: 'rgba(120, 240, 255, 0.55)',
    highlightColor: '#F2FFFF',
    fusionFlash: 'rgba(135, 255, 255, 0.75)',
  },
};

const ORB_CLASS_CONFIG = ORB_CLASS_ORDER.map(({ name, tier }) => {
  const palette = ORB_COLOR_PALETTE[name] || {};
  return {
    name,
    tier,
    baseColor: palette.baseColor || '#FFFFFF',
    glowColor: palette.glowColor || 'rgba(255, 255, 255, 0.35)',
    highlightColor: palette.highlightColor || '#FFFFFF',
    fusionFlash: palette.fusionFlash || 'rgba(255, 255, 255, 0.55)',
  };
});

const ORB_CLASSES = ORB_CLASS_CONFIG.reduce((lookup, config) => {
  lookup[config.name] = config;
  return lookup;
}, {});

const ORB_CLASS_SEQUENCE = ORB_CLASS_CONFIG.map((config) => config.name);

const ORB_NEXT_CLASS = ORB_CLASS_CONFIG.reduce(
  (lookup, config, index, array) => {
    lookup[config.name] = array[index + 1]?.name || null;
    return lookup;
  },
  {}
);

const ORB_SPATIAL_NEIGHBOURS = [-1, 0, 1];

class XPOrbSystem {
  constructor({ player, progression } = {}) {
    this.dependencies = normalizeDependencies({
      player,
      progression,
    });

    this.orbClasses = [...ORB_CLASS_SEQUENCE];
    this.xpOrbs = [];
    this.xpOrbPools = this.createEmptyOrbPools();
    this.maxOrbsPerClass = Number.isFinite(CONSTANTS.XP_ORB_MAX_PER_CLASS)
      ? CONSTANTS.XP_ORB_MAX_PER_CLASS
      : 100;
    this.baseOrbValue = Number.isFinite(CONSTANTS.XP_ORB_BASE_VALUE)
      ? CONSTANTS.XP_ORB_BASE_VALUE
      : 5;

    this.orbMagnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
    this.magnetismForce =
      CONSTANTS.ENHANCED_SHIP_MAGNETISM_FORCE || CONSTANTS.MAGNETISM_FORCE;
    this.magnetismBoost = Number.isFinite(CONSTANTS.XP_ORB_MAGNETISM_BOOST)
      ? CONSTANTS.XP_ORB_MAGNETISM_BOOST
      : 2.2;
    this.minOrbDistance = CONSTANTS.MIN_ORB_DISTANCE;
    this.clusterFusionCount = CONSTANTS.CLUSTER_FUSION_COUNT;
    this.clusterConfig =
      typeof CONSTANTS.XP_ORB_CLUSTER_CONFIG === 'object'
        ? CONSTANTS.XP_ORB_CLUSTER_CONFIG
        : {};
    this.collectionRadiusPadding = Number.isFinite(
      CONSTANTS.XP_ORB_COLLECTION_RADIUS_PADDING
    )
      ? CONSTANTS.XP_ORB_COLLECTION_RADIUS_PADDING
      : 0.1;

    this.fusionCheckInterval =
      Number.isFinite(CONSTANTS.XP_ORB_FUSION_CHECK_INTERVAL) &&
      CONSTANTS.XP_ORB_FUSION_CHECK_INTERVAL > 0
        ? CONSTANTS.XP_ORB_FUSION_CHECK_INTERVAL
        : 0.3;
    this.fusionCheckTimer = 0;
    this.activeFusionAnimations = [];

    this.orbClusterRadius = 0;
    this.orbClusterForce = 0;
    this.fusionDetectionRadius = 0;
    this.fusionDetectionRadiusSq = 0;
    this.fusionAnimationDuration =
      Number.isFinite(CONSTANTS.XP_ORB_FUSION_ANIMATION_DURATION) &&
      CONSTANTS.XP_ORB_FUSION_ANIMATION_DURATION > 0
        ? CONSTANTS.XP_ORB_FUSION_ANIMATION_DURATION
        : 0.82;

    this.spatialIndex = new Map();
    this.spatialIndexDirty = true;

    this.cachedPlayer = this.dependencies.player || null;
    this.cachedProgression = this.dependencies.progression || null;

    this.visualCache = new Map();

    this.usesOrbPool = false;
    this.setupOrbPoolIntegration();

    this.configureOrbClustering();

    if (typeof gameServices !== 'undefined') {
      gameServices.register('xp-orbs', this);
    }

    this.setupEventListeners();
    this.resolveCachedServices(true);

    console.log('[XPOrbSystem] Initialized');
  }

  resolveCachedServices(force = false) {
    if (force) {
      this.cachedPlayer = this.dependencies.player || null;
      this.cachedProgression = this.dependencies.progression || null;
    }

    if (!this.cachedPlayer) {
      this.cachedPlayer = resolveService('player', this.dependencies);
    }

    if (!this.cachedProgression) {
      this.cachedProgression = resolveService('progression', this.dependencies);
    }
  }

  createEmptyOrbPools() {
    return this.orbClasses.reduce((pools, className) => {
      pools[className] = [];
      return pools;
    }, {});
  }

  setupOrbPoolIntegration() {
    if (!GamePools || typeof GamePools.configureXPOrbLifecycle !== 'function') {
      this.usesOrbPool = false;
      return;
    }

    try {
      GamePools.configureXPOrbLifecycle({
        create: () => this.createPooledOrb(),
        reset: (orb) => this.resetOrbForPool(orb)
      });
      this.usesOrbPool = true;
    } catch (error) {
      this.usesOrbPool = false;
      console.warn('[XPOrbSystem] Failed to configure XP orb pool lifecycle', error);
    }
  }

  createPooledOrb() {
    return {
      id: 0,
      x: 0,
      y: 0,
      value: 0,
      class: 'blue',
      tier: 1,
      collected: false,
      age: 0,
      isFusing: false,
      fusionTimer: 0,
      pulsePhase: 0,
      clusterId: null,
      source: 'drop',
      pendingRemoval: false,
      active: false
    };
  }

  resetOrbForPool(orb) {
    if (!orb) {
      return;
    }

    orb.id = 0;
    orb.x = 0;
    orb.y = 0;
    orb.value = 0;
    orb.class = 'blue';
    orb.tier = 1;
    orb.collected = false;
    orb.age = 0;
    orb.isFusing = false;
    orb.fusionTimer = 0;
    orb.pulsePhase = 0;
    orb.clusterId = null;
    orb.source = 'drop';
    orb.pendingRemoval = false;
    orb.active = false;
  }

  acquireOrb() {
    if (
      this.usesOrbPool &&
      GamePools?.xpOrbs &&
      typeof GamePools.xpOrbs.acquire === 'function'
    ) {
      return GamePools.xpOrbs.acquire();
    }

    return this.createPooledOrb();
  }

  releaseOrb(orb) {
    if (
      !orb ||
      !this.usesOrbPool ||
      !GamePools?.xpOrbs ||
      typeof GamePools.xpOrbs.release !== 'function'
    ) {
      return false;
    }

    return GamePools.xpOrbs.release(orb);
  }

  releaseAllOrbsToPool() {
    if (!Array.isArray(this.xpOrbs) || this.xpOrbs.length === 0) {
      return;
    }

    for (let i = 0; i < this.xpOrbs.length; i += 1) {
      this.releaseOrb(this.xpOrbs[i]);
    }

    this.xpOrbs.length = 0;
  }

  createOffscreenCanvas(width, height) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));

    if (
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function'
    ) {
      const canvas = document.createElement('canvas');
      canvas.width = safeWidth;
      canvas.height = safeHeight;
      return canvas;
    }

    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(safeWidth, safeHeight);
    }

    return null;
  }

  createOrbSprite(visual) {
    const diameter = Math.ceil(visual.glowRadius * 2 + 6);
    const canvas = this.createOffscreenCanvas(diameter, diameter);
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.save();
    ctx.translate(diameter / 2, diameter / 2);

    const gradient = ctx.createRadialGradient(
      0,
      0,
      visual.baseRadius * 0.4,
      0,
      0,
      visual.glowRadius
    );
    gradient.addColorStop(0, visual.baseColor);
    gradient.addColorStop(0.6, visual.glowColor);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.fill(visual.glowPath);

    ctx.fillStyle = visual.baseColor;
    ctx.fill(visual.basePath);

    ctx.fillStyle = visual.highlightColor;
    ctx.fill(visual.highlightPath);

    ctx.restore();

    return {
      canvas,
      width: diameter,
      height: diameter,
      halfWidth: diameter / 2,
      halfHeight: diameter / 2,
    };
  }

  ensureOrbSprite(visual) {
    if (!visual) {
      return null;
    }

    if (visual.sprite) {
      return visual.sprite;
    }

    if (visual.spriteAttempted) {
      return null;
    }

    visual.spriteAttempted = true;
    const sprite = this.createOrbSprite(visual);
    if (sprite) {
      visual.sprite = sprite;
    }
    return visual.sprite || null;
  }

  configureOrbClustering() {
    const baseRadius = CONSTANTS.ORB_MAGNETISM_RADIUS || 35;
    const baseForce = CONSTANTS.ORB_MAGNETISM_FORCE || 150;

    const radiusMultiplier = Number.isFinite(this.clusterConfig.radiusMultiplier)
      ? this.clusterConfig.radiusMultiplier
      : 1.55;
    const minRadius = Number.isFinite(this.clusterConfig.minRadius)
      ? this.clusterConfig.minRadius
      : 52;
    const forceMultiplier = Number.isFinite(this.clusterConfig.forceMultiplier)
      ? this.clusterConfig.forceMultiplier
      : 2.4;

    this.orbClusterRadius = Math.max(baseRadius * radiusMultiplier, minRadius);
    this.orbClusterForce = baseForce * forceMultiplier;

    this.refreshFusionParameters();
  }

  refreshFusionParameters() {
    const detectionFactor = Number.isFinite(
      this.clusterConfig.detectionRadiusFactor
    )
      ? this.clusterConfig.detectionRadiusFactor
      : 0.85;
    const detectionMinRadius = Number.isFinite(
      this.clusterConfig.detectionMinRadius
    )
      ? this.clusterConfig.detectionMinRadius
      : 48;

    this.fusionDetectionRadius = Math.max(
      this.orbClusterRadius * detectionFactor,
      detectionMinRadius
    );
    this.fusionDetectionRadiusSq =
      this.fusionDetectionRadius * this.fusionDetectionRadius;
    const baseDuration =
      Number.isFinite(CONSTANTS.XP_ORB_FUSION_ANIMATION_DURATION) &&
      CONSTANTS.XP_ORB_FUSION_ANIMATION_DURATION > 0
        ? CONSTANTS.XP_ORB_FUSION_ANIMATION_DURATION
        : this.fusionAnimationDuration;
    this.fusionAnimationDuration = baseDuration;
    this.invalidateSpatialIndex();
  }

  invalidateSpatialIndex() {
    this.spatialIndexDirty = true;
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    // ARCHITECTURE NOTE:
    // XPOrbSystem is responsible for MANAGING orbs (pooling, fusion, magnetism, rendering)
    // RewardManager is responsible for DECIDING what to drop (XP orbs, health hearts, coins, etc.)
    // This separation keeps the architecture clean and extensible.
    //
    // The old 'enemy-destroyed' listener here was removed because:
    // - It caused duplicate orb creation (both systems creating orbs)
    // - Drop decisions should be centralized in RewardManager
    // - XPOrbSystem should only receive createXPOrb() calls, not decide when to drop
    //
    // RewardManager now calls xpOrbSystem.createXPOrb() for XP drops
    // HealthHeartSystem handles health hearts
    // Future systems (coins, etc.) will follow the same pattern

    gameEvents.on('progression-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('player-reset', () => {
      this.resolveCachedServices(true);
    });
  }

  isOrbActive(orb) {
    return Boolean(orb) && !orb.collected;
  }

  isOrbEligibleForFusion(orb) {
    return this.isOrbActive(orb) && !orb.isFusing;
  }

  getOrbConfig(className) {
    return ORB_CLASSES[className] || ORB_CLASSES.blue;
  }

  resolveOrbClass(value, options = {}) {
    if (options.className && ORB_CLASSES[options.className]) {
      return ORB_CLASSES[options.className];
    }

    if (typeof options.tier === 'number') {
      const configByTier = ORB_CLASS_CONFIG.find(
        (config) => config.tier === options.tier
      );
      if (configByTier) {
        return configByTier;
      }
    }

    const numericValue = Number.isFinite(value) ? value : this.baseOrbValue;
    let tier = 1;
    let threshold = this.baseOrbValue;

    for (let i = 1; i < ORB_CLASS_CONFIG.length; i += 1) {
      threshold *= this.clusterFusionCount;
      if (numericValue >= threshold) {
        tier = i + 1;
      } else {
        break;
      }
    }

    return (
      ORB_CLASS_CONFIG.find((config) => config.tier === tier) ||
      ORB_CLASSES.blue
    );
  }

  addOrbToPools(orb) {
    this.xpOrbs.push(orb);
    if (!this.xpOrbPools[orb.class]) {
      this.xpOrbPools[orb.class] = [];
    }
    this.xpOrbPools[orb.class].push(orb);
    this.invalidateSpatialIndex();
  }

  enforceClassLimit(className) {
    const pool = this.xpOrbPools[className];
    if (!Array.isArray(pool)) {
      return;
    }

    const active = pool.filter((orb) => this.isOrbEligibleForFusion(orb));
    const excess = active.length - this.maxOrbsPerClass;
    if (excess <= 0) {
      return;
    }

    const nextClassName = ORB_NEXT_CLASS[className];
    if (nextClassName) {
      const groupsNeeded = Math.ceil(
        excess / Math.max(this.clusterFusionCount - 1, 1)
      );
      this.performFusionForClass(
        className,
        nextClassName,
        groupsNeeded,
        'overflow'
      );
    }
  }

  performFusionForClass(
    className,
    nextClassName,
    maxGroups,
    reason = 'interval'
  ) {
    if (!maxGroups || maxGroups <= 0 || !nextClassName) {
      return false;
    }

    const clusters = this.findOrbClusters(className, maxGroups);
    if (!clusters.length) {
      return false;
    }

    let started = false;
    for (let index = 0; index < clusters.length; index += 1) {
      started =
        this.initiateOrbFusion(
          className,
          nextClassName,
          clusters[index],
          reason
        ) || started;
    }
    return started;
  }

  createXPOrb(x, y, value, options = {}) {
    const resolvedConfig = this.resolveOrbClass(value, options);
    const orb = this.acquireOrb();
    this.initializeOrbState(orb, x, y, value, resolvedConfig, options);

    this.addOrbToPools(orb);
    this.enforceClassLimit(orb.class);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('xp-orb-created', {
        orb,
        position: { x, y },
        value,
        class: orb.class,
        tier: orb.tier,
        source: options.source || 'drop',
        color: resolvedConfig.baseColor,
        glow: resolvedConfig.glowColor,
      });
    }

    return orb;
  }

  initializeOrbState(orb, x, y, value, resolvedConfig, options = {}) {
    if (!orb) {
      return null;
    }

    orb.id = Date.now() + Math.random();
    orb.x = x;
    orb.y = y;
    orb.value = Number.isFinite(value) ? value : this.baseOrbValue;
    orb.class = resolvedConfig.name;
    orb.tier = resolvedConfig.tier;
    orb.collected = false;
    orb.age = options.age ?? 0;
    orb.isFusing = false;
    orb.fusionTimer = 0;
    orb.pulsePhase = orb.pulsePhase ?? 0;
    orb.clusterId = options.clusterId ?? null;
    orb.source = options.source || 'drop';
    orb.pendingRemoval = false;
    orb.active = true;

    return orb;
  }

  update(deltaTime) {
    if (!this.xpOrbs.length && this.activeFusionAnimations.length === 0) {
      return;
    }

    this.updateFusionAnimations(deltaTime);

    if (this.xpOrbs.length) {
      this.advanceOrbAges(deltaTime);
      this.updateShipMagnetism(deltaTime);
      this.updateOrbClustering(deltaTime);
      this.checkOrbFusion(deltaTime);
    }

    this.cleanupCollectedOrbs();
  }

  advanceOrbAges(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (!this.xpOrbs.length) {
      return;
    }

    for (let i = 0; i < this.xpOrbs.length; i += 1) {
      const orb = this.xpOrbs[i];
      if (!orb || orb.collected) {
        continue;
      }

      const currentAge = Number.isFinite(orb.age) ? orb.age : 0;
      orb.age = currentAge + deltaTime;
    }
  }

  updateFusionAnimations(deltaTime) {
    if (!this.activeFusionAnimations.length) {
      return;
    }

    for (
      let index = this.activeFusionAnimations.length - 1;
      index >= 0;
      index -= 1
    ) {
      const animation = this.activeFusionAnimations[index];
      if (!animation) {
        this.activeFusionAnimations.splice(index, 1);
        continue;
      }

      animation.elapsed = (animation.elapsed || 0) + deltaTime;
      const progress = Math.min(animation.elapsed / animation.duration, 1);
      const eased = this.easeInOutCubic(progress);

      let activeCount = 0;

      for (let orbIndex = 0; orbIndex < animation.orbs.length; orbIndex += 1) {
        const entry = animation.orbs[orbIndex];
        const orb = entry?.orb;
        if (!this.isOrbActive(orb)) {
          continue;
        }

        activeCount += 1;
        orb.x = this.lerp(entry.startX, animation.center.x, eased);
        orb.y = this.lerp(entry.startY, animation.center.y, eased);
      }

      if (activeCount < this.clusterFusionCount) {
        this.activeFusionAnimations.splice(index, 1);
        animation.orbs.forEach(({ orb }) => {
          if (!orb || orb.collected) {
            return;
          }
          orb.isFusing = false;
          delete orb.fusionId;
        });
        continue;
      }

      if (progress >= 1) {
        this.activeFusionAnimations.splice(index, 1);
        const orbsToFuse = animation.orbs
          .map((entry) => entry.orb)
          .filter((orb) => this.isOrbActive(orb));
        const hasEnoughOrbs = orbsToFuse.length >= this.clusterFusionCount;

        animation.orbs.forEach((entry) => {
          const orb = entry?.orb;
          if (!orb) {
            return;
          }

          if (!this.isOrbActive(orb) || !hasEnoughOrbs) {
            orb.isFusing = false;
            delete orb.fusionId;
          }
        });

        if (hasEnoughOrbs) {
          this.fuseOrbs(
            animation.className,
            animation.targetClassName,
            orbsToFuse,
            animation.reason,
            { center: animation.center }
          );
        }
      }
    }
  }

  lerp(start, end, t) {
    return start + (end - start) * t;
  }

  easeInOutCubic(t) {
    if (t <= 0) {
      return 0;
    }
    if (t >= 1) {
      return 1;
    }
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  ensureSpatialIndex() {
    if (!this.spatialIndexDirty) {
      return this.spatialIndex;
    }

    const index = new Map();
    const cellSize = Math.max(this.fusionDetectionRadius, 24);
    let counter = 0;

    for (let i = 0; i < this.orbClasses.length; i += 1) {
      const className = this.orbClasses[i];
      const pool = this.xpOrbPools[className];
      if (!Array.isArray(pool) || pool.length === 0) {
        continue;
      }

      const active = pool.filter((orb) => this.isOrbActive(orb));
      if (!active.length) {
        continue;
      }

      const classData = {
        cellSize,
        cells: new Map(),
        orbs: active,
      };

      for (let j = 0; j < active.length; j += 1) {
        const orb = active[j];
        orb._gridIndex = counter += 1;
        const cellX = Math.floor(orb.x / cellSize);
        const cellY = Math.floor(orb.y / cellSize);
        const key = `${cellX}:${cellY}`;
        const bucket = classData.cells.get(key);
        if (bucket) {
          bucket.push(orb);
        } else {
          classData.cells.set(key, [orb]);
        }
      }

      index.set(className, classData);
    }

    this.spatialIndex = index;
    this.spatialIndexDirty = false;
    return index;
  }

  updateShipMagnetism(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (
      !this.cachedPlayer ||
      typeof this.cachedPlayer.getPosition !== 'function'
    ) {
      this.resolveCachedServices();
    }

    const player = this.cachedPlayer;
    if (!player || typeof player.getPosition !== 'function') {
      return;
    }

    const playerPos = player.getPosition();
    if (
      !playerPos ||
      !Number.isFinite(playerPos.x) ||
      !Number.isFinite(playerPos.y)
    ) {
      return;
    }

    const magnetismRadius =
      (typeof player.getMagnetismRadius === 'function'
        ? player.getMagnetismRadius()
        : this.orbMagnetismRadius) || this.orbMagnetismRadius;

    if (!Number.isFinite(magnetismRadius) || magnetismRadius <= 0) {
      return;
    }

    const magnetismRadiusSq = magnetismRadius * magnetismRadius;
    const collectionRadius =
      CONSTANTS.SHIP_SIZE +
      CONSTANTS.XP_ORB_SIZE +
      this.minOrbDistance * this.collectionRadiusPadding;
    const collectionRadiusSq = collectionRadius * collectionRadius;

    const spatialIndex = this.ensureSpatialIndex();
    if (!spatialIndex || spatialIndex.size === 0) {
      return;
    }

    const playerX = playerPos.x;
    const playerY = playerPos.y;
    const magnetismForce = this.magnetismForce || 0;
    const boostMultiplier =
      Number.isFinite(this.magnetismBoost) && this.magnetismBoost >= 0
        ? this.magnetismBoost
        : 2.2;

    let moved = false;

    spatialIndex.forEach((classData) => {
      if (!classData || !classData.cells || classData.cells.size === 0) {
        return;
      }

      const cellSize =
        Number.isFinite(classData.cellSize) && classData.cellSize > 0
          ? classData.cellSize
          : magnetismRadius;
      if (!Number.isFinite(cellSize) || cellSize <= 0) {
        return;
      }

      const searchRange = Math.max(
        1,
        Math.ceil((magnetismRadius + this.minOrbDistance) / cellSize)
      );
      const centerCellX = Math.floor(playerX / cellSize);
      const centerCellY = Math.floor(playerY / cellSize);

      for (let offsetX = -searchRange; offsetX <= searchRange; offsetX += 1) {
        for (
          let offsetY = -searchRange;
          offsetY <= searchRange;
          offsetY += 1
        ) {
          const key = `${centerCellX + offsetX}:${centerCellY + offsetY}`;
          const bucket = classData.cells.get(key);
          if (!bucket || bucket.length === 0) {
            continue;
          }

          for (let idx = 0; idx < bucket.length; idx += 1) {
            const orb = bucket[idx];
            if (!this.isOrbActive(orb) || orb.isFusing) {
              continue;
            }

            const dx = playerX - orb.x;
            const dy = playerY - orb.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq <= collectionRadiusSq) {
              this.collectOrb(orb);
              moved = true;
              continue;
            }

            if (distanceSq <= 0 || distanceSq > magnetismRadiusSq) {
              continue;
            }

            const distance = Math.sqrt(distanceSq);
            if (!Number.isFinite(distance) || distance === 0) {
              this.collectOrb(orb);
              moved = true;
              continue;
            }

            const normalizedDx = dx / distance;
            const normalizedDy = dy / distance;
            const proximity = 1 - Math.min(distance / magnetismRadius, 1);
            const magnetBoost = 1 + proximity * boostMultiplier;
            const speed = magnetismForce * magnetBoost;
            const step = speed * deltaTime;

            if (!Number.isFinite(step) || step <= 0) {
              continue;
            }

            orb.x += normalizedDx * step;
            orb.y += normalizedDy * step;
            moved = true;

            const postDx = playerX - orb.x;
            const postDy = playerY - orb.y;
            if (postDx * postDx + postDy * postDy <= collectionRadiusSq) {
              this.collectOrb(orb);
            }
          }
        }
      }
    });

    if (moved) {
      this.invalidateSpatialIndex();
    }
  }

  updateOrbClustering(deltaTime) {
    if (this.orbClusterRadius <= 0 || this.orbClusterForce <= 0) {
      return;
    }

    const index = this.ensureSpatialIndex();
    const clusterRadiusSq = this.orbClusterRadius * this.orbClusterRadius;
    const comfortableSpacingFactor = Number.isFinite(
      this.clusterConfig.comfortableSpacingFactor
    )
      ? this.clusterConfig.comfortableSpacingFactor
      : 1.12;
    const idealSpacingFactor = Number.isFinite(
      this.clusterConfig.idealSpacingFactor
    )
      ? this.clusterConfig.idealSpacingFactor
      : 0.95;
    const denseSpacingFactor = Number.isFinite(
      this.clusterConfig.denseSpacingFactor
    )
      ? this.clusterConfig.denseSpacingFactor
      : 0.75;
    const comfortableSpacing = this.minOrbDistance * comfortableSpacingFactor;
    const idealSpacing = this.minOrbDistance * idealSpacingFactor;
    const denseSpacing = this.minOrbDistance * denseSpacingFactor;

    index.forEach((classData) => {
      const { orbs, cells, cellSize } = classData;
      if (!orbs || orbs.length < 2) {
        return;
      }

      for (let i = 0; i < orbs.length; i += 1) {
        const orbA = orbs[i];
        if (!this.isOrbEligibleForFusion(orbA)) {
          continue;
        }

        const cellX = Math.floor(orbA.x / cellSize);
        const cellY = Math.floor(orbA.y / cellSize);

        for (let gx = 0; gx < ORB_SPATIAL_NEIGHBOURS.length; gx += 1) {
          for (let gy = 0; gy < ORB_SPATIAL_NEIGHBOURS.length; gy += 1) {
            const key = `${cellX + ORB_SPATIAL_NEIGHBOURS[gx]}:${cellY + ORB_SPATIAL_NEIGHBOURS[gy]}`;
            const neighbors = cells.get(key);
            if (!neighbors) {
              continue;
            }

            for (let n = 0; n < neighbors.length; n += 1) {
              const orbB = neighbors[n];
              if (
                orbA === orbB ||
                !this.isOrbEligibleForFusion(orbB) ||
                orbB._gridIndex <= orbA._gridIndex
              ) {
                continue;
              }

              const dx = orbB.x - orbA.x;
              const dy = orbB.y - orbA.y;
              const distanceSq = dx * dx + dy * dy;
              if (distanceSq <= 0 || distanceSq > clusterRadiusSq) {
                continue;
              }

              const distance = Math.sqrt(distanceSq);
              const normalizedDx = dx / distance;
              const normalizedDy = dy / distance;
              const closeness = Math.max(
                1 - distance / this.orbClusterRadius,
                0
              );

              if (distance > comfortableSpacing) {
                const forceBase = Number.isFinite(
                  this.clusterConfig.comfortableForceBase
                )
                  ? this.clusterConfig.comfortableForceBase
                  : 0.5;
                const forceCloseness = Number.isFinite(
                  this.clusterConfig.comfortableForceCloseness
                )
                  ? this.clusterConfig.comfortableForceCloseness
                  : 1.5;
                const forceOffset = Number.isFinite(
                  this.clusterConfig.comfortableForceOffset
                )
                  ? this.clusterConfig.comfortableForceOffset
                  : 30;
                const stepClamp = Number.isFinite(
                  this.clusterConfig.comfortableStepClamp
                )
                  ? this.clusterConfig.comfortableStepClamp
                  : 0.9;
                const movementFactor = Number.isFinite(
                  this.clusterConfig.comfortableMovementFactor
                )
                  ? this.clusterConfig.comfortableMovementFactor
                  : 0.5;

                const baseStrength =
                  this.orbClusterForce * (forceBase + closeness * forceCloseness) +
                  forceOffset;
                const step = Math.min(
                  baseStrength * deltaTime,
                  distance * stepClamp
                );
                const movement = step * movementFactor;

                orbA.x += normalizedDx * movement;
                orbA.y += normalizedDy * movement;
                orbB.x -= normalizedDx * movement;
                orbB.y -= normalizedDy * movement;
              } else if (distance > idealSpacing) {
                const forceBase = Number.isFinite(
                  this.clusterConfig.idealForceBase
                )
                  ? this.clusterConfig.idealForceBase
                  : 0.3;
                const forceCloseness = Number.isFinite(
                  this.clusterConfig.idealForceCloseness
                )
                  ? this.clusterConfig.idealForceCloseness
                  : 1.1;
                const forceOffset = Number.isFinite(
                  this.clusterConfig.idealForceOffset
                )
                  ? this.clusterConfig.idealForceOffset
                  : 18;
                const stepClamp = Number.isFinite(
                  this.clusterConfig.idealStepClamp
                )
                  ? this.clusterConfig.idealStepClamp
                  : 0.6;
                const movementFactor = Number.isFinite(
                  this.clusterConfig.idealMovementFactor
                )
                  ? this.clusterConfig.idealMovementFactor
                  : 0.5;

                const baseStrength =
                  this.orbClusterForce * (forceBase + closeness * forceCloseness) +
                  forceOffset;
                const step = Math.min(
                  baseStrength * deltaTime,
                  distance * stepClamp
                );
                const movement = step * movementFactor;

                orbA.x += normalizedDx * movement;
                orbA.y += normalizedDy * movement;
                orbB.x -= normalizedDx * movement;
                orbB.y -= normalizedDy * movement;
              } else if (distance < denseSpacing) {
                const overlap = denseSpacing - distance;
                const pushFactor = Number.isFinite(
                  this.clusterConfig.densePushFactor
                )
                  ? this.clusterConfig.densePushFactor
                  : 0.5;
                const push = overlap * pushFactor;

                orbA.x -= normalizedDx * push;
                orbA.y -= normalizedDy * push;
                orbB.x += normalizedDx * push;
                orbB.y += normalizedDy * push;
              }
            }
          }
        }
      }
    });

    this.invalidateSpatialIndex();
  }

  findOrbClusters(className, maxClusters = 1) {
    if (!maxClusters || maxClusters <= 0) {
      return [];
    }

    const index = this.ensureSpatialIndex();
    const classData = index.get(className);
    if (!classData || !Array.isArray(classData.orbs)) {
      return [];
    }

    const candidates = classData.orbs.filter((orb) =>
      this.isOrbEligibleForFusion(orb)
    );
    if (candidates.length < this.clusterFusionCount) {
      return [];
    }

    const { cellSize, cells } = classData;
    const detectionRadiusSq = this.fusionDetectionRadiusSq;
    const visited = new Set();
    const clusters = [];

    for (let i = 0; i < candidates.length; i += 1) {
      const seed = candidates[i];
      if (visited.has(seed)) {
        continue;
      }

      const stack = [seed];
      const component = [];
      visited.add(seed);

      while (stack.length > 0) {
        const current = stack.pop();
        if (!this.isOrbEligibleForFusion(current)) {
          continue;
        }

        component.push(current);

        const cellX = Math.floor(current.x / cellSize);
        const cellY = Math.floor(current.y / cellSize);

        for (let gx = 0; gx < ORB_SPATIAL_NEIGHBOURS.length; gx += 1) {
          for (let gy = 0; gy < ORB_SPATIAL_NEIGHBOURS.length; gy += 1) {
            const key = `${cellX + ORB_SPATIAL_NEIGHBOURS[gx]}:${cellY + ORB_SPATIAL_NEIGHBOURS[gy]}`;
            const neighbors = cells.get(key);
            if (!neighbors) {
              continue;
            }

            for (let n = 0; n < neighbors.length; n += 1) {
              const neighbor = neighbors[n];
              if (
                visited.has(neighbor) ||
                !this.isOrbEligibleForFusion(neighbor)
              ) {
                continue;
              }

              const dx = neighbor.x - current.x;
              const dy = neighbor.y - current.y;
              if (dx * dx + dy * dy <= detectionRadiusSq) {
                visited.add(neighbor);
                stack.push(neighbor);
              }
            }
          }
        }
      }

      if (component.length < this.clusterFusionCount) {
        continue;
      }

      let sumX = 0;
      let sumY = 0;
      for (let index = 0; index < component.length; index += 1) {
        sumX += component[index].x;
        sumY += component[index].y;
      }

      const centerX = sumX / component.length;
      const centerY = sumY / component.length;

      const ordered = component
        .map((orb) => {
          const dx = orb.x - centerX;
          const dy = orb.y - centerY;
          return {
            orb,
            distanceSq: dx * dx + dy * dy,
            age: orb.age || 0,
          };
        })
        .sort((a, b) => {
          if (a.distanceSq === b.distanceSq) {
            return b.age - a.age;
          }
          return a.distanceSq - b.distanceSq;
        })
        .map((entry) => entry.orb);

      let radiusSq = 0;
      const sampleCount = Math.min(ordered.length, this.clusterFusionCount);
      for (let index = 0; index < sampleCount; index += 1) {
        const orb = ordered[index];
        const dx = orb.x - centerX;
        const dy = orb.y - centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) {
          radiusSq = distSq;
        }
      }

      clusters.push({
        orbs: ordered,
        center: { x: centerX, y: centerY },
        radius: Math.sqrt(radiusSq),
        size: component.length,
      });
    }

    clusters.sort((a, b) => {
      if (a.radius === b.radius) {
        return b.size - a.size;
      }
      return a.radius - b.radius;
    });

    return clusters.slice(0, maxClusters);
  }

  initiateOrbFusion(className, targetClassName, cluster, reason = 'interval') {
    if (!cluster || !Array.isArray(cluster.orbs) || !targetClassName) {
      return false;
    }

    const selected = [];
    for (let index = 0; index < cluster.orbs.length; index += 1) {
      const orb = cluster.orbs[index];
      if (!this.isOrbEligibleForFusion(orb)) {
        continue;
      }

      selected.push(orb);
      if (selected.length >= this.clusterFusionCount) {
        break;
      }
    }

    if (selected.length < this.clusterFusionCount) {
      return false;
    }

    const animationId = `fusion:${className}:${Date.now()}:${Math.random()}`;
    const animation = {
      id: animationId,
      className,
      targetClassName,
      reason,
      duration: this.fusionAnimationDuration,
      elapsed: 0,
      center: { x: cluster.center.x, y: cluster.center.y },
      orbs: [],
    };

    let sumX = 0;
    let sumY = 0;

    selected.forEach((orb) => {
      orb.isFusing = true;
      orb.fusionId = animationId;
      animation.orbs.push({
        orb,
        startX: orb.x,
        startY: orb.y,
      });
      sumX += orb.x;
      sumY += orb.y;
    });

    if (animation.orbs.length > 0) {
      animation.center.x = sumX / animation.orbs.length;
      animation.center.y = sumY / animation.orbs.length;
    }

    this.activeFusionAnimations.push(animation);
    return true;
  }

  checkOrbFusion(deltaTime) {
    if (this.clusterFusionCount <= 1) {
      return;
    }

    this.fusionCheckTimer += deltaTime;
    if (this.fusionCheckTimer < this.fusionCheckInterval) {
      return;
    }

    this.fusionCheckTimer = 0;

    for (let i = 0; i < this.orbClasses.length; i += 1) {
      const className = this.orbClasses[i];
      const nextClassName = ORB_NEXT_CLASS[className];
      if (!nextClassName) {
        continue;
      }

      const clusters = this.findOrbClusters(className, 1);
      if (!clusters.length) {
        continue;
      }

      this.initiateOrbFusion(className, nextClassName, clusters[0], 'interval');
    }
  }

  fuseOrbs(
    className,
    targetClassName,
    orbs,
    reason = 'interval',
    options = {}
  ) {
    if (!Array.isArray(orbs) || orbs.length === 0) {
      return;
    }

    const targetConfig = this.getOrbConfig(targetClassName);

    const validOrbs = orbs.filter((orb) => this.isOrbActive(orb));
    const count = validOrbs.length;
    if (count < this.clusterFusionCount) {
      orbs.forEach((orb) => {
        if (!orb) {
          return;
        }
        orb.isFusing = false;
        delete orb.fusionId;
      });
      return;
    }

    let totalValue = 0;
    let centerX = 0;
    let centerY = 0;

    validOrbs.forEach((orb) => {
      totalValue += orb.value;
      centerX += orb.x;
      centerY += orb.y;
      orb.collected = true;
      orb.isFusing = false;
      delete orb.fusionId;
    });

    if (options && options.center) {
      centerX = options.center.x;
      centerY = options.center.y;
    } else {
      centerX /= count;
      centerY /= count;
    }

    const fusedOrb = this.createXPOrb(centerX, centerY, totalValue, {
      className: targetConfig.name,
      tier: targetConfig.tier,
      source: 'fusion',
      age: 0,
    });

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('xp-orb-fused', {
        fromClass: className,
        toClass: fusedOrb.class,
        consumed: count,
        value: totalValue,
        position: { x: centerX, y: centerY },
        tier: fusedOrb.tier,
        reason,
        color: targetConfig.baseColor,
        glow: targetConfig.glowColor,
        flash: targetConfig.fusionFlash,
      });
    }

    this.enforceClassLimit(fusedOrb.class);
    this.invalidateSpatialIndex();
  }

  cleanupCollectedOrbs() {
    if (!this.xpOrbs.length) {
      return;
    }

    const remaining = [];
    const toRelease = [];
    let removed = 0;
    let sawNullEntry = false;

    for (let i = 0; i < this.xpOrbs.length; i += 1) {
      const orb = this.xpOrbs[i];
      if (!orb) {
        removed += 1;
        sawNullEntry = true;
        continue;
      }

      if (orb.collected) {
        orb.active = false;
        toRelease.push(orb);
        removed += 1;
        continue;
      }

      remaining.push(orb);
    }

    this.xpOrbs = remaining;

    if (toRelease.length > 0) {
      const releaseSet = new Set(toRelease);
      const poolNames = Object.keys(this.xpOrbPools);

      for (let i = 0; i < poolNames.length; i += 1) {
        const className = poolNames[i];
        const pool = this.xpOrbPools[className];
        if (!Array.isArray(pool) || pool.length === 0) {
          continue;
        }

        this.xpOrbPools[className] = pool.filter(
          (candidate) => candidate && !releaseSet.has(candidate)
        );
      }

      for (let i = 0; i < toRelease.length; i += 1) {
        this.releaseOrb(toRelease[i]);
      }
    }

    if (sawNullEntry) {
      const poolNames = Object.keys(this.xpOrbPools);
      for (let i = 0; i < poolNames.length; i += 1) {
        const className = poolNames[i];
        const pool = this.xpOrbPools[className];
        if (!Array.isArray(pool) || pool.length === 0) {
          continue;
        }

        this.xpOrbPools[className] = pool.filter(Boolean);
      }
    }

    if (removed > 0) {
      this.invalidateSpatialIndex();
    }
  }

  collectOrb(orb) {
    if (!orb || orb.collected) {
      return;
    }

    orb.collected = true;

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('xp-collected', {
        orb,
        position: { x: orb.x, y: orb.y },
        value: orb.value,
        class: orb.class,
        tier: orb.tier,
      });

      gameEvents.emit('xp-orb-collected', {
        value: orb.value,
        position: { x: orb.x, y: orb.y },
        class: orb.class,
        tier: orb.tier,
      });
    }
  }

  getMagnetismRadius() {
    return this.orbMagnetismRadius;
  }

  setMagnetismRadius(radius) {
    const next = Number(radius);
    if (!Number.isFinite(next)) {
      return;
    }
    this.orbMagnetismRadius = Math.max(10, next);
  }

  getMagnetismForce() {
    return this.magnetismForce;
  }

  setMagnetismForce(force) {
    const next = Number(force);
    if (!Number.isFinite(next)) {
      return;
    }
    this.magnetismForce = Math.max(0, next);
  }

  getActiveOrbs() {
    return this.xpOrbs.filter((orb) => !orb.collected);
  }

  getOrbVisualConfig(className, tier) {
    const key = `${className}:${tier}`;
    if (this.visualCache.has(key)) {
      return this.visualCache.get(key);
    }

    const config = this.getOrbConfig(className);
    const baseRadius = CONSTANTS.XP_ORB_SIZE * (1 + (tier - 1) * 0.2);
    const glowRadius = baseRadius * 2.1;
    const highlightRadius = baseRadius * 0.35;

    const basePath = new Path2D();
    basePath.arc(0, 0, baseRadius, 0, Math.PI * 2);

    const glowPath = new Path2D();
    glowPath.arc(0, 0, glowRadius, 0, Math.PI * 2);

    const highlightPath = new Path2D();
    highlightPath.arc(
      -baseRadius * 0.35,
      -baseRadius * 0.35,
      highlightRadius,
      0,
      Math.PI * 2
    );

    const visual = {
      baseRadius,
      glowRadius,
      highlightRadius,
      basePath,
      glowPath,
      highlightPath,
      baseColor: config.baseColor,
      glowColor: config.glowColor,
      highlightColor: config.highlightColor,
    };

    this.ensureOrbSprite(visual);
    this.visualCache.set(key, visual);
    return visual;
  }

  render(ctx) {
    if (!ctx) return;

    const activeOrbs = this.getActiveOrbs();
    if (!activeOrbs.length) {
      return;
    }

    activeOrbs.forEach((orb) => {
      const visual = this.getOrbVisualConfig(orb.class, orb.tier);
      const sprite = this.ensureOrbSprite(visual);

      if (sprite && (sprite.canvas || sprite.bitmap)) {
        const image = sprite.bitmap || sprite.canvas;
        const offsetX = sprite.halfWidth || sprite.width / 2 || 0;
        const offsetY = sprite.halfHeight || sprite.height / 2 || 0;

        ctx.drawImage(
          image,
          orb.x - offsetX,
          orb.y - offsetY,
          sprite.width || image.width,
          sprite.height || image.height
        );
        return;
      }

      ctx.save();
      ctx.translate(orb.x, orb.y);

      const gradient = ctx.createRadialGradient(
        0,
        0,
        visual.baseRadius * 0.4,
        0,
        0,
        visual.glowRadius
      );
      gradient.addColorStop(0, visual.baseColor);
      gradient.addColorStop(0.6, visual.glowColor);
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.fill(visual.glowPath);

      ctx.fillStyle = visual.baseColor;
      ctx.fill(visual.basePath);

      ctx.fillStyle = visual.highlightColor;
      ctx.fill(visual.highlightPath);

      ctx.restore();
    });
  }

  getBaseXPValue(size, wave = 1) {
    const baseLookup = CONSTANTS.ASTEROID_XP_BASE || {
      large: 15,
      medium: 8,
      small: 5,
    };

    const baseValue = baseLookup[size] ?? baseLookup.small ?? 5;

    // Wave scaling: matches HP difficulty (+12% per wave, cap at wave 10)
    const effectiveWave = Math.max(1, Math.min(wave, 10));
    const waveMultiplier = 1 + ((effectiveWave - 1) * 0.12);

    // Player level bonus (small extra reward for progression)
    const progression = this.cachedProgression;
    const level =
      progression && typeof progression.getLevel === 'function'
        ? progression.getLevel()
        : 1;
    const levelBonus = Math.floor(level * 0.3);

    return Math.max(1, Math.round(baseValue * waveMultiplier + levelBonus));
  }

  getVariantConfig(variantKey = 'common') {
    const variants = CONSTANTS.ASTEROID_VARIANTS || {};
    return variants[variantKey] || variants.common || null;
  }

  buildVariantXPDropPlan(data) {
    if (!data) {
      return [];
    }

    if (!this.cachedProgression) {
      this.resolveCachedServices();
    }

    const size = data.size || data.enemy?.size || 'small';
    const variantKey = data.variant || data.enemy?.variant || 'common';
    const wave = data.wave || data.enemy?.wave || 1;

    // === NEW ORB-BASED SYSTEM ===
    // Calculate number of orbs based on: BASE × SIZE × VARIANT × WAVE
    const orbValue = CONSTANTS.ORB_VALUE || 5;  // Fixed 5 XP per orb
    const baseOrbs = CONSTANTS.ASTEROID_BASE_ORBS?.[size] ?? 1;
    const sizeFactor = CONSTANTS.ASTEROID_SIZE_ORB_FACTOR?.[size] ?? 1.0;

    const variantConfig = this.getVariantConfig(variantKey);
    const orbMultiplier = variantConfig?.orbMultiplier ?? 1.0;

    // Wave scaling: +1 orb per 5 waves (wave 1-4: +0, wave 5-9: +1, wave 10+: +2)
    const waveBonus = wave <= 10
      ? Math.floor(wave / 5)
      : Math.floor((wave - 10) / 3) + 2;

    // Final orb count (rounded)
    const numOrbs = Math.max(1, Math.round(baseOrbs * sizeFactor * orbMultiplier + waveBonus));
    const totalValue = numOrbs * orbValue;

    // === SIMPLIFIED ORB DISTRIBUTION ===
    // Distribute totalValue evenly across numOrbs
    // Each orb gets orbValue (5 XP), but may vary slightly due to rounding
    const drops = [];
    const valuePerOrb = Math.floor(totalValue / numOrbs);
    let remainder = totalValue - (valuePerOrb * numOrbs);

    for (let i = 0; i < numOrbs; i += 1) {
      let value = valuePerOrb;

      // Distribute remainder across first orbs
      if (remainder > 0) {
        value += 1;
        remainder -= 1;
      }

      drops.push({
        value: Math.max(1, value),  // Each orb should be at least 1 XP
        options: {
          variant: variantKey,
          tier: 1,  // Always tier 1 (blue) for fusion system
        },
      });
    }

    return drops;
  }

  getDropOffset(index, total) {
    if (!Number.isFinite(index) || !Number.isFinite(total) || total <= 1) {
      return { x: 0, y: 0 };
    }

    const spreadRadius = 12 + Math.min(total * 4, 28);
    const angle = (index / total) * Math.PI * 2;
    return {
      x: Math.cos(angle) * spreadRadius,
      y: Math.sin(angle) * spreadRadius,
    };
  }

  reset() {
    this.releaseAllOrbsToPool();
    this.orbClasses = [...ORB_CLASS_SEQUENCE];
    this.xpOrbs = [];
    this.xpOrbPools = this.createEmptyOrbPools();
    this.fusionCheckTimer = 0;
    this.activeFusionAnimations = [];
    this.spatialIndex.clear();
    this.spatialIndexDirty = true;
    this.visualCache.clear();

    this.orbMagnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
    this.magnetismForce =
      CONSTANTS.ENHANCED_SHIP_MAGNETISM_FORCE || CONSTANTS.MAGNETISM_FORCE;
    this.minOrbDistance = CONSTANTS.MIN_ORB_DISTANCE;
    this.clusterFusionCount = CONSTANTS.CLUSTER_FUSION_COUNT;
    this.configureOrbClustering();

    this.resolveCachedServices(true);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('xp-orbs-reset');
    }

    console.log('[XPOrbSystem] Reset');
  }
}

export default XPOrbSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = XPOrbSystem;
}
