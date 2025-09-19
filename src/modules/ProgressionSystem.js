import * as CONSTANTS from '../core/GameConstants.js';

const ORB_CLASS_CONFIG = [
  {
    name: 'blue',
    tier: 1,
    baseColor: '#00DDFF',
    glowColor: 'rgba(0, 221, 255, 0.35)',
    highlightColor: '#E9FCFF',
    fusionFlash: 'rgba(0, 221, 255, 0.55)',
  },
  {
    name: 'green',
    tier: 2,
    baseColor: '#2EE58F',
    glowColor: 'rgba(46, 229, 143, 0.35)',
    highlightColor: '#E6FFEF',
    fusionFlash: 'rgba(46, 229, 143, 0.55)',
  },
  {
    name: 'yellow',
    tier: 3,
    baseColor: '#FFD54F',
    glowColor: 'rgba(255, 213, 79, 0.35)',
    highlightColor: '#FFF8E1',
    fusionFlash: 'rgba(255, 213, 79, 0.55)',
  },
  {
    name: 'purple',
    tier: 4,
    baseColor: '#B388FF',
    glowColor: 'rgba(179, 136, 255, 0.35)',
    highlightColor: '#F3E9FF',
    fusionFlash: 'rgba(179, 136, 255, 0.55)',
  },
  {
    name: 'red',
    tier: 5,
    baseColor: '#FF6B6B',
    glowColor: 'rgba(255, 107, 107, 0.35)',
    highlightColor: '#FFE6E6',
    fusionFlash: 'rgba(255, 107, 107, 0.6)',
  },
];

const ORB_CLASS_LOOKUP = ORB_CLASS_CONFIG.reduce((lookup, config) => {
  lookup[config.name] = config;
  return lookup;
}, {});

const ORB_CLASS_SEQUENCE = ORB_CLASS_CONFIG.map((config) => config.name);

const ORB_NEXT_CLASS = ORB_CLASS_CONFIG.reduce((lookup, config, index, array) => {
  lookup[config.name] = array[index + 1]?.name || null;
  return lookup;
}, {});

const DEFLECTOR_DESCRIPTIONS = {
  0: 'Adiciona um escudo ativável (Tecla E) que absorve 3 impactos.',
  1: 'Aumenta a capacidade do escudo para 4 impactos.',
  2: 'Reduz o cooldown do escudo em 5 segundos.',
  3: 'Aumenta a capacidade do escudo para 5 impactos.',
  4: 'Poder Final: Adiciona a Sobrecarga Defletora.',
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
    this.orbClusterRadius = CONSTANTS.ORB_MAGNETISM_RADIUS;
    this.orbClusterForce = CONSTANTS.ORB_MAGNETISM_FORCE;
    this.minOrbDistance = CONSTANTS.MIN_ORB_DISTANCE;
    this.clusterFusionCount = CONSTANTS.CLUSTER_FUSION_COUNT;
    this.fusionCheckInterval = 0.3;
    this.fusionCheckTimer = 0;
    this.maxOrbsPerClass = 100;
    this.baseOrbValue = 5;

    // === UPGRADES APLICADOS ===
    this.appliedUpgrades = new Map();
    this.availableUpgrades = [...CONSTANTS.SPACE_UPGRADES];

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
    return this.orbClasses?.reduce((pools, className) => {
      pools[className] = [];
      return pools;
    }, {}) || ORB_CLASS_SEQUENCE.reduce((pools, className) => {
      pools[className] = [];
      return pools;
    }, {});
  }

  getOrbConfig(className) {
    return ORB_CLASS_LOOKUP[className] || ORB_CLASS_LOOKUP.blue;
  }

  resolveOrbClass(value, options = {}) {
    if (options.className && ORB_CLASS_LOOKUP[options.className]) {
      return ORB_CLASS_LOOKUP[options.className];
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
      ORB_CLASS_LOOKUP.blue
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

    const active = pool.filter((orb) => !orb.collected);
    const excess = active.length - this.maxOrbsPerClass;
    if (excess <= 0) {
      return;
    }

    const nextClassName = ORB_NEXT_CLASS[className];
    if (nextClassName) {
      const groupsNeeded = Math.ceil(
        excess / Math.max(this.clusterFusionCount - 1, 1)
      );
      this.performFusionForClass(className, nextClassName, groupsNeeded, 'overflow');
      return;
    }

    active
      .sort((a, b) => b.age - a.age)
      .slice(0, excess)
      .forEach((orb) => {
        orb.collected = true;
      });
  }

  performFusionForClass(
    className,
    nextClassName,
    maxGroups,
    reason = 'interval'
  ) {
    if (!maxGroups || maxGroups <= 0) {
      return;
    }

    const pool = this.xpOrbPools[className];
    if (!Array.isArray(pool)) {
      return;
    }

    const eligible = pool
      .filter((orb) => !orb.collected)
      .sort((a, b) => b.age - a.age);

    const availableGroups = Math.min(
      Math.floor(eligible.length / this.clusterFusionCount),
      maxGroups
    );

    for (let i = 0; i < availableGroups; i += 1) {
      const batch = eligible.splice(0, this.clusterFusionCount);
      if (batch.length < this.clusterFusionCount) {
        break;
      }
      this.fuseOrbs(className, nextClassName, batch, reason);
    }
  }

  setupEventListeners() {
    if (typeof gameEvents !== 'undefined') {
      // Quando inimigo morre, criar XP orb
      gameEvents.on('enemy-destroyed', (data) => {
        const xpValue = this.calculateXPReward(data.enemy, data.size);
        this.createXPOrb(data.position.x, data.position.y, xpValue);
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
      lifetime: options.lifetime ?? 45,
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
    if (!this.xpOrbs.length) {
      return;
    }

    this.updateShipMagnetism(deltaTime);
    this.updateOrbClustering(deltaTime);
    this.checkOrbFusion(deltaTime);
    this.cleanupCollectedOrbs();
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
        if (!orb || orb.collected) {
          continue;
        }

        orb.age += deltaTime;

        if (orb.age > orb.lifetime) {
          orb.collected = true;
          continue;
        }

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

    for (let i = 0; i < this.orbClasses.length; i += 1) {
      const className = this.orbClasses[i];
      const pool = this.xpOrbPools[className];
      if (!Array.isArray(pool) || pool.length < 2) {
        continue;
      }

      for (let a = 0; a < pool.length; a += 1) {
        const orbA = pool[a];
        if (!orbA || orbA.collected) {
          continue;
        }

        for (let b = a + 1; b < pool.length; b += 1) {
          const orbB = pool[b];
          if (!orbB || orbB.collected) {
            continue;
          }

          const dx = orbB.x - orbA.x;
          const dy = orbB.y - orbA.y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq <= 0) {
            continue;
          }

          const distance = Math.sqrt(distanceSq);
          if (distance > this.orbClusterRadius) {
            continue;
          }

          const normalizedDx = dx / distance;
          const normalizedDy = dy / distance;

          if (distance < this.minOrbDistance) {
            const overlap = this.minOrbDistance - distance;
            const correction = (overlap * 0.5) || 0;
            orbA.x -= normalizedDx * correction;
            orbA.y -= normalizedDy * correction;
            orbB.x += normalizedDx * correction;
            orbB.y += normalizedDy * correction;
            continue;
          }

          const closeness = 1 - distance / this.orbClusterRadius;
          if (closeness <= 0) {
            continue;
          }

          const attraction = this.orbClusterForce * closeness;
          const movement = attraction * deltaTime * 0.5;

          orbA.x += normalizedDx * movement;
          orbA.y += normalizedDy * movement;
          orbB.x -= normalizedDx * movement;
          orbB.y -= normalizedDy * movement;
        }
      }
    }
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

      const pool = this.xpOrbPools[className];
      if (!Array.isArray(pool)) {
        continue;
      }

      const available = pool.filter((orb) => !orb.collected);
      if (available.length < this.clusterFusionCount) {
        continue;
      }

      const groups = Math.floor(available.length / this.clusterFusionCount);
      if (groups > 0) {
        this.performFusionForClass(className, nextClassName, groups, 'interval');
      }
    }
  }

  fuseOrbs(className, targetClassName, orbs, reason = 'interval') {
    if (!Array.isArray(orbs) || orbs.length === 0) {
      return;
    }

    const targetConfig = this.getOrbConfig(targetClassName);

    let totalValue = 0;
    let centerX = 0;
    let centerY = 0;

    orbs.forEach((orb) => {
      if (!orb) {
        return;
      }

      totalValue += orb.value;
      centerX += orb.x;
      centerY += orb.y;
      orb.collected = true;
    });

    const count = orbs.length;
    centerX /= count;
    centerY /= count;

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
    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-leveled-up', {
        newLevel: this.level,
        availableUpgrades: this.getRandomUpgrades(3),
      });
    }

    console.log('[ProgressionSystem] Level up! New level:', this.level);
  }

  calculateXPReward(enemy, size) {
    // XP baseado no tamanho e nível atual
    const baseXP = {
      large: 15,
      medium: 8,
      small: 5,
    };

    const xp = (baseXP[size] || 5) + Math.floor(this.level * 0.5);
    return xp;
  }

  // === SISTEMA DE UPGRADES ===
  getRandomUpgrades(count = 3) {
    const filtered = this.availableUpgrades.filter((upgrade) => {
      if (upgrade.id !== 'deflector_shield') {
        return true;
      }

      const currentLevel = this.getUpgradeCount(upgrade.id);
      return currentLevel < 5;
    });

    const shuffled = [...filtered].sort(() => Math.random() - 0.5);

    return shuffled.slice(0, count).map((upgrade) => {
      const currentLevel = this.getUpgradeCount(upgrade.id);
      let description = upgrade.description;

      if (upgrade.id === 'deflector_shield') {
        const cappedLevel = Math.min(currentLevel, 4);
        description = DEFLECTOR_DESCRIPTIONS[cappedLevel];
      }

      return {
        ...upgrade,
        description,
        currentLevel,
      };
    });
  }

  applyUpgrade(upgradeId) {
    const upgrade = CONSTANTS.SPACE_UPGRADES.find((u) => u.id === upgradeId);
    if (!upgrade) {
      console.error('[ProgressionSystem] Upgrade not found:', upgradeId);
      return false;
    }

    const currentCount = this.appliedUpgrades.get(upgradeId) || 0;
    if (upgradeId === 'deflector_shield' && currentCount >= 5) {
      console.warn('[ProgressionSystem] Deflector shield already at max level');
      return false;
    }

    // Aplicar efeito do upgrade
    this.applyUpgradeEffect(upgrade);

    // Registrar upgrade aplicado
    this.appliedUpgrades.set(upgradeId, currentCount + 1);

    // Emitir evento
    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('upgrade-applied', {
        upgrade: upgrade,
        count: currentCount + 1,
        playerId: 'player',
      });
    }

    console.log('[ProgressionSystem] Applied upgrade:', upgrade.name);
    return true;
  }

  applyUpgradeEffect(upgrade) {
    // Por enquanto, emitir eventos para outros sistemas aplicarem
    // No futuro, PlayerStats system gerenciará isso

    switch (upgrade.id) {
      case 'plasma':
        gameEvents.emit('upgrade-damage-boost', { multiplier: 1.25 });
        break;

      case 'propulsors':
        gameEvents.emit('upgrade-speed-boost', { multiplier: 1.2 });
        break;

      case 'shield':
        gameEvents.emit('upgrade-health-boost', { bonus: 50 });
        break;

      case 'multishot':
        gameEvents.emit('upgrade-multishot', { bonus: 1 });
        break;

      case 'magfield':
        this.orbMagnetismRadius *= 1.5;
        gameEvents.emit('upgrade-magnetism', { multiplier: 1.5 });
        break;

      case 'deflector_shield': {
        const newLevel = this.getUpgradeCount(upgrade.id) + 1;
        gameEvents.emit('upgrade-deflector-shield', { level: newLevel });
        break;
      }
    }
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
    this.orbMagnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
    this.magnetismForce =
      CONSTANTS.ENHANCED_SHIP_MAGNETISM_FORCE || CONSTANTS.MAGNETISM_FORCE;
    this.orbClusterRadius = CONSTANTS.ORB_MAGNETISM_RADIUS;
    this.orbClusterForce = CONSTANTS.ORB_MAGNETISM_FORCE;
    this.fusionCheckTimer = 0;

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
    this.orbClusterRadius = data.orbClusterRadius || CONSTANTS.ORB_MAGNETISM_RADIUS;
    this.orbClusterForce = data.orbClusterForce || CONSTANTS.ORB_MAGNETISM_FORCE;
    this.xpOrbs = [];
    this.orbClasses = [...ORB_CLASS_SEQUENCE];
    this.xpOrbPools = this.createEmptyOrbPools();
    this.fusionCheckTimer = 0;
  }

  destroy() {
    this.xpOrbs = [];
    this.xpOrbPools = this.createEmptyOrbPools();
    this.appliedUpgrades.clear();
    this.fusionCheckTimer = 0;
    console.log('[ProgressionSystem] Destroyed');
  }
}

export default ProgressionSystem;

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressionSystem;
}
