import * as CONSTANTS from '../core/GameConstants.js';
import UPGRADE_LIBRARY, { UPGRADE_CATEGORIES } from '../data/upgrades.js';

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

const asArray = (value) => (Array.isArray(value) ? value : []);

const DEFAULT_UPGRADE_CATEGORY = {
  id: 'general',
  label: 'Tecnologia',
  description: 'Melhorias que ampliam capacidades gerais da nave.',
  icon: '✨',
  themeColor: '#3399FF',
};

class ProgressionSystem {
  constructor() {
    // === DADOS DE PROGRESSÃO ===
    this.level = 1;
    this.experience = 0;
    this.experienceToNext = 100;
    this.totalExperience = 0;

    // === XP ORBS ===
    this.xpOrbs = [];
    this.orbClasses = [...ORB_CLASS_SEQUENCE];
    this.xpOrbPools = this.createEmptyOrbPools();
    this.orbMagnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
    this.magnetismForce =
      CONSTANTS.ENHANCED_SHIP_MAGNETISM_FORCE || CONSTANTS.MAGNETISM_FORCE;
    this.minOrbDistance = CONSTANTS.MIN_ORB_DISTANCE;
    this.clusterFusionCount = CONSTANTS.CLUSTER_FUSION_COUNT;
    this.maxOrbsPerClass = 100;
    this.baseOrbValue = 5;
    this.fusionCheckInterval = 0.3;
    this.fusionCheckTimer = 0;
    this.activeFusionAnimations = [];
    this.configureOrbClustering();

    // === UPGRADES APLICADOS ===
    this.appliedUpgrades = new Map();
    this.upgradeDefinitions = this.buildUpgradeDefinitions(UPGRADE_LIBRARY);
    this.upgradeLookup = this.buildUpgradeLookup(this.upgradeDefinitions);
    this.upgradeCategoryMap = this.buildUpgradeCategoryMap(UPGRADE_CATEGORIES);
    this.defaultUpgradeCategory = { ...DEFAULT_UPGRADE_CATEGORY };
    this.pendingUpgradeOptions = [];

    // === CONFIGURAÇÕES ===
    this.levelScaling = 1.2; // Multiplicador de XP por nível

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('progression', this);
    }

    // Escutar eventos
    this.setupEventListeners();

    console.log('[ProgressionSystem] Initialized - Level', this.level);
  }

  createEmptyOrbPools() {
    return (
      this.orbClasses?.reduce((pools, className) => {
        pools[className] = [];
        return pools;
      }, {}) ||
      ORB_CLASS_SEQUENCE.reduce((pools, className) => {
        pools[className] = [];
        return pools;
      }, {})
    );
  }

  configureOrbClustering() {
    const baseRadius = CONSTANTS.ORB_MAGNETISM_RADIUS || 35;
    const baseForce = CONSTANTS.ORB_MAGNETISM_FORCE || 150;

    this.orbClusterRadius = Math.max(baseRadius * 1.55, 52);
    this.orbClusterForce = baseForce * 2.4;

    this.refreshFusionParameters();
  }

  refreshFusionParameters() {
    this.fusionDetectionRadius = Math.max(this.orbClusterRadius * 0.85, 48);
    this.fusionDetectionRadiusSq =
      this.fusionDetectionRadius * this.fusionDetectionRadius;
    this.fusionAnimationDuration = 0.82;
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

  setupEventListeners() {
    if (typeof gameEvents !== 'undefined') {
      // Quando inimigo morre, criar XP orb
      gameEvents.on('enemy-destroyed', (data) => {
        const drops = this.buildVariantXPDropPlan(data);
        if (!Array.isArray(drops) || drops.length === 0) {
          return;
        }

        const originX = data?.position?.x ?? 0;
        const originY = data?.position?.y ?? 0;

        drops.forEach((drop, index) => {
          const offset = this.getDropOffset(index, drops.length);
          this.createXPOrb(originX + offset.x, originY + offset.y, drop.value, {
            ...drop.options,
            source: drop.options?.source || 'enemy-drop',
          });
        });
      });

      // Quando bullet acerta inimigo (bonus XP futuro)
      gameEvents.on('bullet-hit', (data) => {
        // Futuro: XP por hit, não só por kill
      });
    }
  }

  // === UPDATE PRINCIPAL ===
  update(deltaTime) {
    this.updateXPOrbs(deltaTime);
  }

  // === SISTEMA DE XP ORBS ===
  createXPOrb(x, y, value, options = {}) {
    const resolvedConfig = this.resolveOrbClass(value, options);
    const orb = {
      id: Date.now() + Math.random(),
      x,
      y,
      value,
      class: resolvedConfig.name,
      tier: resolvedConfig.tier,
      collected: false,
      age: options.age ?? 0,
    };

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

  updateXPOrbs(deltaTime) {
    if (!this.xpOrbs.length && this.activeFusionAnimations.length === 0) {
      return;
    }

    this.updateFusionAnimations(deltaTime);

    if (this.xpOrbs.length) {
      this.updateShipMagnetism(deltaTime);
      this.updateOrbClustering(deltaTime);
      this.checkOrbFusion(deltaTime);
    }

    this.cleanupCollectedOrbs();
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

  updateShipMagnetism(deltaTime) {
    const player = gameServices.get('player');
    const playerPos = player ? player.getPosition() : null;
    const collectionRadius =
      CONSTANTS.SHIP_SIZE + CONSTANTS.XP_ORB_SIZE + this.minOrbDistance * 0.1;

    for (let i = 0; i < this.orbClasses.length; i += 1) {
      const className = this.orbClasses[i];
      const pool = this.xpOrbPools[className];
      if (!Array.isArray(pool) || pool.length === 0) {
        continue;
      }

      for (let index = 0; index < pool.length; index += 1) {
        const orb = pool[index];
        if (!this.isOrbActive(orb) || orb.isFusing) {
          continue;
        }

        orb.age += deltaTime;

        if (!playerPos) {
          continue;
        }

        const dx = playerPos.x - orb.x;
        const dy = playerPos.y - orb.y;
        let distance = Math.hypot(dx, dy);

        if (distance > 0 && distance < this.orbMagnetismRadius) {
          const normalizedDx = dx / distance;
          const normalizedDy = dy / distance;
          const proximity = 1 - Math.min(distance / this.orbMagnetismRadius, 1);
          const magnetBoost = 1 + proximity * 2.2;
          const speed = this.magnetismForce * magnetBoost;
          const step = speed * deltaTime;

          orb.x += normalizedDx * step;
          orb.y += normalizedDy * step;

          distance = Math.hypot(playerPos.x - orb.x, playerPos.y - orb.y);
        }

        if (distance < collectionRadius) {
          orb.collected = true;
          this.collectXP(orb.value);

          if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('xp-collected', {
              orb,
              position: { x: orb.x, y: orb.y },
              value: orb.value,
              playerLevel: this.level,
              class: orb.class,
              tier: orb.tier,
            });
          }
        }
      }
    }
  }

  updateOrbClustering(deltaTime) {
    if (this.orbClusterRadius <= 0 || this.orbClusterForce <= 0) {
      return;
    }

    const clusterRadiusSq = this.orbClusterRadius * this.orbClusterRadius;
    const comfortableSpacing = this.minOrbDistance * 1.12;
    const idealSpacing = this.minOrbDistance * 0.95;
    const denseSpacing = this.minOrbDistance * 0.75;

    for (let i = 0; i < this.orbClasses.length; i += 1) {
      const className = this.orbClasses[i];
      const pool = this.xpOrbPools[className];
      if (!Array.isArray(pool) || pool.length < 2) {
        continue;
      }

      for (let a = 0; a < pool.length; a += 1) {
        const orbA = pool[a];
        if (!this.isOrbEligibleForFusion(orbA)) {
          continue;
        }

        for (let b = a + 1; b < pool.length; b += 1) {
          const orbB = pool[b];
          if (!this.isOrbEligibleForFusion(orbB)) {
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
          const closeness = Math.max(1 - distance / this.orbClusterRadius, 0);

          if (distance > comfortableSpacing) {
            const baseStrength =
              this.orbClusterForce * (0.5 + closeness * 1.5) + 30;
            const step = Math.min(baseStrength * deltaTime, distance * 0.9);
            const movement = step * 0.5;

            orbA.x += normalizedDx * movement;
            orbA.y += normalizedDy * movement;
            orbB.x -= normalizedDx * movement;
            orbB.y -= normalizedDy * movement;
          } else if (distance > idealSpacing) {
            const baseStrength =
              this.orbClusterForce * (0.3 + closeness * 1.1) + 18;
            const step = Math.min(baseStrength * deltaTime, distance * 0.6);
            const movement = step * 0.5;

            orbA.x += normalizedDx * movement;
            orbA.y += normalizedDy * movement;
            orbB.x -= normalizedDx * movement;
            orbB.y -= normalizedDy * movement;
          } else if (distance < denseSpacing) {
            const overlap = denseSpacing - distance;
            const push = overlap * 0.5;

            orbA.x -= normalizedDx * push;
            orbA.y -= normalizedDy * push;
            orbB.x += normalizedDx * push;
            orbB.y += normalizedDy * push;
          }
        }
      }
    }
  }

  findOrbClusters(className, maxClusters = 1) {
    if (!maxClusters || maxClusters <= 0) {
      return [];
    }

    const pool = this.xpOrbPools[className];
    if (!Array.isArray(pool) || pool.length < this.clusterFusionCount) {
      return [];
    }

    const candidates = pool.filter((orb) => this.isOrbEligibleForFusion(orb));
    if (candidates.length < this.clusterFusionCount) {
      return [];
    }

    const detectionRadius = this.fusionDetectionRadius;
    const detectionRadiusSq = this.fusionDetectionRadiusSq;
    const cellSize = detectionRadius;
    const grid = new Map();
    const getKey = (x, y) =>
      `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;

    for (let i = 0; i < candidates.length; i += 1) {
      const orb = candidates[i];
      const key = getKey(orb.x, orb.y);
      const cell = grid.get(key);
      if (cell) {
        cell.push(orb);
      } else {
        grid.set(key, [orb]);
      }
    }

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

        for (let gx = cellX - 1; gx <= cellX + 1; gx += 1) {
          for (let gy = cellY - 1; gy <= cellY + 1; gy += 1) {
            const key = `${gx}:${gy}`;
            const neighbors = grid.get(key);
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
  }

  cleanupCollectedOrbs() {
    if (!this.xpOrbs.length) {
      return;
    }

    this.xpOrbs = this.xpOrbs.filter((orb) => !orb.collected);

    for (let i = 0; i < this.orbClasses.length; i += 1) {
      const className = this.orbClasses[i];
      const pool = this.xpOrbPools[className];
      if (!Array.isArray(pool) || pool.length === 0) {
        continue;
      }

      this.xpOrbPools[className] = pool.filter((orb) => !orb.collected);
    }
  }

  // === SISTEMA DE EXPERIÊNCIA ===
  collectXP(amount) {
    this.experience += amount;
    this.totalExperience += amount;

    // Verificar level up
    if (this.experience >= this.experienceToNext) {
      this.levelUp();
    }

    // Emitir evento para UI
    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('experience-changed', {
        current: this.experience,
        needed: this.experienceToNext,
        level: this.level,
        percentage: this.experience / this.experienceToNext,
      });
    }
  }

  levelUp() {
    this.level++;
    this.experience = 0;
    this.experienceToNext = Math.floor(
      this.experienceToNext * this.levelScaling
    );

    // Emitir evento
    const { options, poolSize, totalDefinitions } =
      this.prepareUpgradeOptions(3);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-leveled-up', {
        newLevel: this.level,
      });

      gameEvents.emit('upgrade-options-ready', {
        level: this.level,
        options,
        poolSize,
        totalDefinitions,
        inventory: this.getUpgradeProgressSnapshot(),
        autoResolved: options.length === 0,
      });
    }

    console.log('[ProgressionSystem] Level up! New level:', this.level);
  }

  getBaseXPValue(size) {
    const baseLookup = CONSTANTS.ASTEROID_XP_BASE || {
      large: 15,
      medium: 8,
      small: 5,
    };

    const baseValue = baseLookup[size] ?? baseLookup.small ?? 5;
    return Math.max(1, Math.round(baseValue + Math.floor(this.level * 0.5)));
  }

  getVariantConfig(variantKey = 'common') {
    const variants = CONSTANTS.ASTEROID_VARIANTS || {};
    return variants[variantKey] || variants.common || null;
  }

  buildVariantXPDropPlan(data) {
    if (!data) {
      return [];
    }

    const size = data.size || data.enemy?.size || 'small';
    const variantKey = data.variant || data.enemy?.variant || 'common';

    const baseValue = this.getBaseXPValue(size);
    const variantConfig = this.getVariantConfig(variantKey);
    const multiplier = variantConfig?.xpMultiplier ?? 1;
    const totalValue = Math.max(1, Math.round(baseValue * multiplier));

    const drops = [];
    let allocated = 0;

    const dropConfig = variantConfig?.drops || { baseSplit: 1, extraOrbs: [] };
    const extras = Array.isArray(dropConfig.extraOrbs)
      ? dropConfig.extraOrbs
      : [];

    extras.forEach((extra) => {
      if (!extra) return;

      const count = Math.max(1, extra.count ?? 1);
      const valueMultiplier = extra.valueMultiplier ?? 0;
      if (valueMultiplier <= 0) {
        return;
      }

      for (let i = 0; i < count; i += 1) {
        if (allocated >= totalValue) {
          break;
        }

        const value = Math.max(
          1,
          Math.min(
            Math.round(baseValue * valueMultiplier),
            totalValue - allocated
          )
        );

        allocated += value;
        drops.push({
          value,
          options: {
            tier: extra.tier,
            className: extra.className,
            variant: variantKey,
          },
        });
      }
    });

    const remaining = Math.max(totalValue - allocated, 0);
    const baseSplit = Math.max(0, dropConfig.baseSplit ?? 1);

    if (remaining > 0 && baseSplit > 0) {
      const baseValueEach = Math.max(1, Math.floor(remaining / baseSplit));
      let remainder = remaining - baseValueEach * baseSplit;

      for (let i = 0; i < baseSplit; i += 1) {
        let value = baseValueEach;
        if (remainder > 0) {
          value += 1;
          remainder -= 1;
        }

        drops.push({
          value,
          options: { variant: variantKey },
        });
      }
    } else if (remaining > 0 && drops.length > 0) {
      drops[drops.length - 1].value += remaining;
    } else if (remaining > 0 && drops.length === 0) {
      drops.push({
        value: remaining,
        options: { variant: variantKey },
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

  calculateXPReward(enemy, size, variant) {
    const baseValue = this.getBaseXPValue(size);
    const variantKey = variant || enemy?.variant || 'common';
    const variantConfig = this.getVariantConfig(variantKey);
    const multiplier = variantConfig?.xpMultiplier ?? 1;
    return Math.max(1, Math.round(baseValue * multiplier));
  }

  // === SISTEMA DE UPGRADES ===
  prepareUpgradeOptions(count = 3) {
    const eligible = asArray(this.upgradeDefinitions).filter((definition) =>
      this.isUpgradeSelectable(definition)
    );

    const fallbackCount = 3;
    const numericCount = Number(count);
    const requested = Number.isFinite(numericCount)
      ? Math.max(0, Math.floor(numericCount))
      : fallbackCount;
    const desired = requested > 0 ? requested : fallbackCount;
    const cappedCount = Math.min(desired, eligible.length);

    if (!eligible.length || cappedCount === 0) {
      this.pendingUpgradeOptions = [];
      return {
        options: [],
        poolSize: eligible.length,
        totalDefinitions: this.upgradeDefinitions.length,
      };
    }

    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const selection = shuffled.slice(0, cappedCount);
    const options = selection
      .map((definition) => this.buildUpgradeOption(definition))
      .filter(Boolean);

    this.pendingUpgradeOptions = options;

    return {
      options,
      poolSize: eligible.length,
      totalDefinitions: this.upgradeDefinitions.length,
    };
  }

  getRandomUpgrades(count = 3) {
    const { options } = this.prepareUpgradeOptions(count);
    return options;
  }

  isUpgradeSelectable(definition) {
    if (!definition || typeof definition !== 'object') {
      return false;
    }

    const levels = asArray(definition.levels);
    const maxLevel = levels.length;
    const currentLevel = this.getUpgradeCount(definition.id);

    if (maxLevel > 0 && currentLevel >= maxLevel) {
      return false;
    }

    if (
      Number.isFinite(definition.unlockLevel) &&
      this.level < definition.unlockLevel
    ) {
      return false;
    }

    const prerequisites = this.collectRawPrerequisites(definition);
    return prerequisites.every((requirement) =>
      this.evaluatePrerequisite(requirement)
    );
  }

  collectRawPrerequisites(definition, options = {}) {
    if (!definition || typeof definition !== 'object') {
      return [];
    }

    const includeUnlock = options.includeUnlock === true;
    const result = [];

    if (
      includeUnlock &&
      Number.isFinite(definition.unlockLevel) &&
      definition.unlockLevel > 1
    ) {
      result.push({
        type: 'player-level',
        level: Math.max(1, Math.floor(definition.unlockLevel)),
        text: `Disponível a partir do level ${definition.unlockLevel}.`,
      });
    }

    asArray(definition.prerequisites).forEach((entry) => {
      const normalized = this.normalizePrerequisite(entry);
      if (normalized) {
        result.push(normalized);
      }
    });

    return result;
  }

  normalizePrerequisite(prerequisite) {
    if (!prerequisite) {
      return null;
    }

    if (typeof prerequisite === 'string') {
      return {
        type: 'upgrade',
        id: prerequisite,
        level: 1,
        text: '',
      };
    }

    if (typeof prerequisite !== 'object') {
      return null;
    }

    const rawType =
      typeof prerequisite.type === 'string'
        ? prerequisite.type.toLowerCase()
        : 'upgrade';

    if (
      rawType === 'player-level' ||
      rawType === 'playerlevel' ||
      rawType === 'level'
    ) {
      const levelValue = Number(
        prerequisite.level ?? prerequisite.value ?? prerequisite.minLevel
      );
      const level = Number.isFinite(levelValue)
        ? Math.max(1, Math.floor(levelValue))
        : 1;
      return {
        type: 'player-level',
        level,
        text: prerequisite.text || prerequisite.description || '',
      };
    }

    const id =
      prerequisite.id || prerequisite.upgradeId || prerequisite.key || null;
    if (!id) {
      return null;
    }

    const levelValue = Number(
      prerequisite.level ?? prerequisite.minLevel ?? prerequisite.value
    );
    const level = Number.isFinite(levelValue)
      ? Math.max(1, Math.floor(levelValue))
      : 1;

    return {
      type: 'upgrade',
      id,
      level,
      text: prerequisite.text || prerequisite.description || '',
    };
  }

  evaluatePrerequisite(prerequisite) {
    if (!prerequisite) {
      return true;
    }

    if (prerequisite.type === 'player-level') {
      return this.level >= (prerequisite.level || 1);
    }

    if (prerequisite.type === 'upgrade') {
      const requiredLevel = prerequisite.level || 1;
      return this.getUpgradeCount(prerequisite.id) >= requiredLevel;
    }

    return true;
  }

  generatePrerequisiteLabel(prerequisite) {
    if (!prerequisite) {
      return '';
    }

    if (prerequisite.type === 'player-level') {
      return `Level do piloto ${prerequisite.level || 1}+`;
    }

    if (prerequisite.type === 'upgrade') {
      const reference = this.upgradeLookup?.get(prerequisite.id);
      const name = reference?.text?.name || reference?.name || prerequisite.id;
      const levelLabel =
        (prerequisite.level || 1) > 1 ? `Nv. ${prerequisite.level}` : 'Nv. 1';
      return `${name} (${levelLabel})`;
    }

    return '';
  }

  describePrerequisites(definition, options = {}) {
    const includeUnlock = options.includeUnlock !== false;
    const entries = [];

    if (
      includeUnlock &&
      Number.isFinite(definition?.unlockLevel) &&
      definition.unlockLevel > 1
    ) {
      const unlockEntry = {
        type: 'player-level',
        level: Math.max(1, Math.floor(definition.unlockLevel)),
        text: options.unlockText || '',
      };
      const label =
        unlockEntry.text || this.generatePrerequisiteLabel(unlockEntry);
      entries.push({
        ...unlockEntry,
        met: this.evaluatePrerequisite(unlockEntry),
        label,
        description: label,
      });
    }

    this.collectRawPrerequisites(definition).forEach((entry) => {
      const label =
        entry.text && entry.text.length
          ? entry.text
          : this.generatePrerequisiteLabel(entry);
      entries.push({
        ...entry,
        label,
        description: label,
        met: this.evaluatePrerequisite(entry),
      });
    });

    return entries;
  }

  buildUpgradeOption(definition) {
    if (!definition || typeof definition !== 'object') {
      return null;
    }

    const currentLevel = this.getUpgradeCount(definition.id);
    const levels = asArray(definition.levels);
    const maxLevel = levels.length;
    const category = this.resolveUpgradeCategory(definition.category);
    const text = definition.text || {};
    const levelTexts = asArray(text.levels);
    const hasNextLevel = currentLevel < maxLevel;
    const nextLevelDefinition = hasNextLevel ? levels[currentLevel] : null;
    const nextLevelText = hasNextLevel ? levelTexts[currentLevel] || {} : null;

    return {
      id: definition.id,
      name: text.name || definition.name || definition.id,
      summary: text.summary || definition.description || '',
      lore: text.lore || '',
      icon: definition.icon || '✨',
      themeColor: definition.themeColor || category.themeColor,
      category,
      tags: asArray(definition.tags),
      currentLevel,
      maxLevel,
      unlockLevel: definition.unlockLevel ?? null,
      isMaxed: !hasNextLevel,
      nextLevel: hasNextLevel
        ? {
            rank: nextLevelDefinition.rank ?? currentLevel + 1,
            title:
              nextLevelText?.title ||
              nextLevelDefinition.title ||
              `Nível ${currentLevel + 1}`,
            description:
              nextLevelText?.description ||
              nextLevelDefinition.description ||
              '',
            highlights: asArray(
              nextLevelText?.highlights || nextLevelDefinition.highlights
            ).filter(Boolean),
          }
        : null,
      prerequisites: this.describePrerequisites(definition),
    };
  }

  resolveUpgradeCategory(categoryRef) {
    if (!categoryRef) {
      return { ...this.defaultUpgradeCategory };
    }

    if (typeof categoryRef === 'string') {
      if (this.upgradeCategoryMap.has(categoryRef)) {
        return { ...this.upgradeCategoryMap.get(categoryRef) };
      }

      return { ...this.defaultUpgradeCategory, id: categoryRef };
    }

    if (typeof categoryRef === 'object') {
      const key =
        categoryRef.id ||
        categoryRef.key ||
        categoryRef.slug ||
        categoryRef.name ||
        null;

      if (key && this.upgradeCategoryMap.has(key)) {
        return {
          ...this.upgradeCategoryMap.get(key),
          ...categoryRef,
          id: key,
        };
      }

      return {
        ...this.defaultUpgradeCategory,
        ...categoryRef,
        id: key || this.defaultUpgradeCategory.id,
      };
    }

    return { ...this.defaultUpgradeCategory };
  }

  buildUpgradeDefinitions(source) {
    return asArray(source)
      .map((entry) => this.normalizeUpgradeDefinition(entry))
      .filter((entry) => entry && entry.id);
  }

  normalizeUpgradeDefinition(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) {
      return null;
    }

    const levels = asArray(entry.levels).map((level, index) => {
      const rankValue = Number(level?.rank);
      const rank =
        Number.isFinite(rankValue) && rankValue > 0
          ? Math.floor(rankValue)
          : index + 1;

      const effects = asArray(level?.effects)
        .map((effect) => {
          if (!effect || typeof effect !== 'object') {
            return null;
          }

          const payload =
            effect.payload && typeof effect.payload === 'object'
              ? { ...effect.payload }
              : effect.payload;

          const type =
            typeof effect.type === 'string'
              ? effect.type.toLowerCase()
              : effect.type;

          return {
            ...effect,
            type,
            payload,
          };
        })
        .filter(Boolean);

      return {
        rank,
        title: level?.title || '',
        description: level?.description || '',
        highlights: asArray(level?.highlights)
          .map((item) => (typeof item === 'string' ? item : `${item}`))
          .filter(Boolean),
        effects,
      };
    });

    const text = this.normalizeUpgradeText(entry.text, levels.length);

    return {
      id,
      category: entry.category || entry.type || DEFAULT_UPGRADE_CATEGORY.id,
      icon: entry.icon || '✨',
      themeColor:
        entry.themeColor || entry.color || DEFAULT_UPGRADE_CATEGORY.themeColor,
      unlockLevel: entry.unlockLevel ?? null,
      tags: asArray(entry.tags).map((tag) => `${tag}`),
      prerequisites: asArray(entry.prerequisites),
      name: entry.name || '',
      description: entry.description || '',
      text,
      levels,
    };
  }

  normalizeUpgradeText(text, levelCount) {
    const normalized = {
      name: '',
      summary: '',
      lore: '',
      levels: [],
    };

    if (text && typeof text === 'object') {
      normalized.name = text.name || text.title || '';
      normalized.summary = text.summary || text.description || '';
      normalized.lore = text.lore || text.flavor || '';
    }

    for (let index = 0; index < levelCount; index += 1) {
      const sourceLevel =
        (text && Array.isArray(text.levels) && text.levels[index]) || {};

      normalized.levels.push({
        title: sourceLevel.title || '',
        description: sourceLevel.description || '',
        highlights: asArray(sourceLevel.highlights)
          .map((item) => (typeof item === 'string' ? item : `${item}`))
          .filter(Boolean),
      });
    }

    return normalized;
  }

  buildUpgradeLookup(definitions) {
    return asArray(definitions).reduce((map, definition) => {
      if (definition && definition.id) {
        map.set(definition.id, definition);
      }
      return map;
    }, new Map());
  }

  buildUpgradeCategoryMap(categories) {
    const map = new Map();

    if (categories && typeof categories === 'object') {
      Object.values(categories).forEach((entry) => {
        if (!entry || typeof entry !== 'object') {
          return;
        }

        const id = entry.id || entry.key || entry.slug || entry.name || null;
        if (!id) {
          return;
        }

        map.set(id, {
          ...DEFAULT_UPGRADE_CATEGORY,
          ...entry,
          id,
          themeColor:
            entry.themeColor ||
            entry.color ||
            DEFAULT_UPGRADE_CATEGORY.themeColor,
        });
      });
    }

    return map;
  }

  buildAppliedUpgradeSummary(definition, levelIndex) {
    if (!definition || typeof definition !== 'object') {
      return null;
    }

    const text = definition.text || {};
    const category = this.resolveUpgradeCategory(definition.category);
    const levelTexts = asArray(text.levels);
    const levels = asArray(definition.levels);
    const levelData = levels[levelIndex] || {};
    const levelText = levelTexts[levelIndex] || {};

    return {
      id: definition.id,
      name: text.name || definition.name || definition.id,
      icon: definition.icon || '✨',
      themeColor: definition.themeColor || category.themeColor,
      category,
      level: levelIndex + 1,
      totalLevels: levels.length,
      summary: text.summary || '',
      lore: text.lore || '',
      levelText: {
        title: levelText.title || levelData.title || `Nível ${levelIndex + 1}`,
        description: levelText.description || levelData.description || '',
        highlights: asArray(
          levelText.highlights || levelData.highlights
        ).filter(Boolean),
      },
      tags: asArray(definition.tags),
    };
  }

  cloneEffects(effects) {
    return asArray(effects)
      .map((effect) => {
        if (!effect || typeof effect !== 'object') {
          return null;
        }

        const payload =
          effect.payload && typeof effect.payload === 'object'
            ? { ...effect.payload }
            : effect.payload;

        return {
          ...effect,
          payload,
        };
      })
      .filter(Boolean);
  }

  applyUpgrade(upgradeId) {
    const definition = this.upgradeLookup?.get(upgradeId);
    if (!definition) {
      console.error('[ProgressionSystem] Upgrade not found:', upgradeId);
      return false;
    }

    const levels = asArray(definition.levels);
    const currentLevel = this.getUpgradeCount(upgradeId);
    const maxLevel = levels.length;

    if (maxLevel > 0 && currentLevel >= maxLevel) {
      console.warn(
        '[ProgressionSystem] Upgrade already at max level:',
        upgradeId
      );
      return false;
    }

    if (
      Number.isFinite(definition.unlockLevel) &&
      this.level < definition.unlockLevel
    ) {
      console.warn('[ProgressionSystem] Upgrade locked by level:', upgradeId);
      return false;
    }

    if (!this.isUpgradeSelectable(definition)) {
      console.warn(
        '[ProgressionSystem] Upgrade prerequisites not met:',
        upgradeId
      );
      return false;
    }

    const levelDefinition = levels[currentLevel];
    if (!levelDefinition) {
      console.error(
        '[ProgressionSystem] Missing level definition for upgrade:',
        upgradeId
      );
      return false;
    }

    const newLevel = currentLevel + 1;
    this.appliedUpgrades.set(upgradeId, newLevel);

    this.applyUpgradeEffects(definition, levelDefinition, newLevel);

    const summary = this.buildAppliedUpgradeSummary(definition, currentLevel);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('upgrade-applied', {
        upgradeId,
        level: newLevel,
        previousLevel: currentLevel,
        maxLevel,
        summary,
        effects: this.cloneEffects(levelDefinition.effects),
        prerequisites: this.describePrerequisites(definition),
      });
    }

    console.log(
      '[ProgressionSystem] Applied upgrade:',
      summary?.name || upgradeId,
      '→ nível',
      newLevel
    );

    this.pendingUpgradeOptions = [];

    return true;
  }

  applyUpgradeEffects(definition, levelDefinition, newLevel) {
    const effects = asArray(levelDefinition?.effects);
    let shouldRefreshFusion = false;

    effects.forEach((effect) => {
      if (!effect || typeof effect !== 'object') {
        return;
      }

      const type = effect.type || 'event';

      if (type === 'progression') {
        this.applyProgressionEffect(effect);
        if (
          effect.property === 'orbMagnetismRadius' ||
          effect.property === 'magnetismForce'
        ) {
          shouldRefreshFusion = true;
        }
        return;
      }

      if (type === 'event' && typeof effect.event === 'string') {
        if (typeof gameEvents !== 'undefined') {
          const payload = {
            ...(effect.payload || {}),
            upgradeId: definition.id,
            level: newLevel,
            category: definition.category,
          };
          gameEvents.emit(effect.event, payload);
        }
        return;
      }

      console.warn('[ProgressionSystem] Unknown upgrade effect type:', type);
    });

    if (shouldRefreshFusion) {
      this.refreshFusionParameters();
    }
  }

  applyProgressionEffect(effect) {
    if (!effect || typeof effect !== 'object') {
      return;
    }

    const property = effect.property;
    if (!property || typeof this[property] !== 'number') {
      return;
    }

    const value = Number(effect.value);
    if (!Number.isFinite(value)) {
      return;
    }

    const operation = effect.operation || 'set';

    switch (operation) {
      case 'multiply':
        this[property] *= value;
        break;
      case 'add':
        this[property] += value;
        break;
      case 'set':
        this[property] = value;
        break;
      default:
        console.warn(
          '[ProgressionSystem] Unknown progression operation:',
          operation
        );
        break;
    }
  }

  getUpgradeProgressSnapshot() {
    return Array.from(this.appliedUpgrades.entries()).map(([id, level]) => ({
      id,
      level,
    }));
  }

  // === GETTERS PÚBLICOS ===
  getLevel() {
    return this.level;
  }

  getExperience() {
    return {
      current: this.experience,
      needed: this.experienceToNext,
      total: this.totalExperience,
      percentage: this.experience / this.experienceToNext,
    };
  }

  getXPOrbs() {
    return this.xpOrbs.filter((orb) => !orb.collected);
  }

  render(ctx) {
    if (!ctx) return;

    const activeOrbs = this.getXPOrbs();
    if (!activeOrbs.length) {
      return;
    }

    activeOrbs.forEach((orb) => {
      const config = this.getOrbConfig(orb.class);
      const baseRadius = CONSTANTS.XP_ORB_SIZE * (1 + (orb.tier - 1) * 0.2);
      const glowRadius = baseRadius * 2.1;

      const gradient = ctx.createRadialGradient(
        orb.x,
        orb.y,
        baseRadius * 0.4,
        orb.x,
        orb.y,
        glowRadius
      );
      gradient.addColorStop(0, config.baseColor);
      gradient.addColorStop(0.6, config.glowColor);
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = config.baseColor;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = config.highlightColor;
      ctx.beginPath();
      ctx.arc(
        orb.x - baseRadius * 0.35,
        orb.y - baseRadius * 0.35,
        baseRadius * 0.35,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
  }

  getUpgradeCount(upgradeId) {
    return this.appliedUpgrades.get(upgradeId) || 0;
  }

  getAllUpgrades() {
    return new Map(this.appliedUpgrades);
  }

  // === CONFIGURAÇÃO ===
  setMagnetismRadius(radius) {
    this.orbMagnetismRadius = Math.max(10, radius);
  }

  // === RESET E SAVE ===
  reset() {
    this.level = 1;
    this.experience = 0;
    this.experienceToNext = 100;
    this.totalExperience = 0;
    this.xpOrbs = [];
    this.orbClasses = [...ORB_CLASS_SEQUENCE];
    this.xpOrbPools = this.createEmptyOrbPools();
    this.appliedUpgrades.clear();
    this.pendingUpgradeOptions = [];
    this.orbMagnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
    this.magnetismForce =
      CONSTANTS.ENHANCED_SHIP_MAGNETISM_FORCE || CONSTANTS.MAGNETISM_FORCE;
    this.minOrbDistance = CONSTANTS.MIN_ORB_DISTANCE;
    this.clusterFusionCount = CONSTANTS.CLUSTER_FUSION_COUNT;
    this.configureOrbClustering();
    this.fusionCheckTimer = 0;
    this.activeFusionAnimations = [];

    console.log('[ProgressionSystem] Reset');
  }

  // Para salvar progresso (futuro)
  serialize() {
    return {
      level: this.level,
      experience: this.experience,
      experienceToNext: this.experienceToNext,
      totalExperience: this.totalExperience,
      appliedUpgrades: Array.from(this.appliedUpgrades.entries()),
      orbMagnetismRadius: this.orbMagnetismRadius,
      magnetismForce: this.magnetismForce,
      orbClusterRadius: this.orbClusterRadius,
      orbClusterForce: this.orbClusterForce,
    };
  }

  deserialize(data) {
    this.level = data.level || 1;
    this.experience = data.experience || 0;
    this.experienceToNext = data.experienceToNext || 100;
    this.totalExperience = data.totalExperience || 0;
    this.appliedUpgrades = new Map(data.appliedUpgrades || []);
    this.orbMagnetismRadius =
      data.orbMagnetismRadius || CONSTANTS.MAGNETISM_RADIUS;
    this.magnetismForce =
      data.magnetismForce ||
      CONSTANTS.ENHANCED_SHIP_MAGNETISM_FORCE ||
      CONSTANTS.MAGNETISM_FORCE;
    this.minOrbDistance = CONSTANTS.MIN_ORB_DISTANCE;
    this.clusterFusionCount =
      data.clusterFusionCount || CONSTANTS.CLUSTER_FUSION_COUNT;
    this.configureOrbClustering();
    if (typeof data.orbClusterRadius === 'number') {
      this.orbClusterRadius = data.orbClusterRadius;
    }
    if (typeof data.orbClusterForce === 'number') {
      this.orbClusterForce = data.orbClusterForce;
    }
    this.refreshFusionParameters();
    this.xpOrbs = [];
    this.orbClasses = [...ORB_CLASS_SEQUENCE];
    this.xpOrbPools = this.createEmptyOrbPools();
    this.fusionCheckTimer = 0;
    this.activeFusionAnimations = [];
    this.pendingUpgradeOptions = [];
  }

  destroy() {
    this.xpOrbs = [];
    this.xpOrbPools = this.createEmptyOrbPools();
    this.appliedUpgrades.clear();
    this.fusionCheckTimer = 0;
    this.activeFusionAnimations = [];
    console.log('[ProgressionSystem] Destroyed');
  }
}

export default ProgressionSystem;

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressionSystem;
}
