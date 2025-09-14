import * as CONSTANTS from '../core/GameConstants.js';

class ProgressionSystem {
  constructor() {
    // === DADOS DE PROGRESSÃO ===
    this.level = 1;
    this.experience = 0;
    this.experienceToNext = 100;
    this.totalExperience = 0;

    // === XP ORBS ===
    this.xpOrbs = [];
    this.orbMagnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
    this.magnetismForce = CONSTANTS.MAGNETISM_FORCE;

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
  createXPOrb(x, y, value) {
    const orb = {
      id: Date.now() + Math.random(),
      x: x,
      y: y,
      value: value,
      collected: false,
      lifetime: 30, // 30 segundos antes de desaparecer
      age: 0,
    };

    this.xpOrbs.push(orb);

    // Emitir evento para efeitos
    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('xp-orb-created', {
        orb: orb,
        position: { x, y },
        value: value,
      });
    }

    return orb;
  }

  updateXPOrbs(deltaTime) {
    const player = gameServices.get('player');
    if (!player) return;

    const playerPos = player.getPosition();

    this.xpOrbs.forEach((orb) => {
      if (orb.collected) return;

      orb.age += deltaTime;

      // Remover orbs antigas
      if (orb.age > orb.lifetime) {
        orb.collected = true;
        return;
      }

      const dx = playerPos.x - orb.x;
      const dy = playerPos.y - orb.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Magnetismo
      if (distance < this.orbMagnetismRadius && distance > 0) {
        const force = this.magnetismForce / Math.max(distance, 1);
        const normalizedDx = dx / distance;
        const normalizedDy = dy / distance;

        orb.x += normalizedDx * force * deltaTime;
        orb.y += normalizedDy * force * deltaTime;
      }

      // Coleta
      if (distance < CONSTANTS.SHIP_SIZE + CONSTANTS.XP_ORB_SIZE) {
        orb.collected = true;
        this.collectXP(orb.value);

        // Efeitos
        if (typeof gameEvents !== 'undefined') {
          gameEvents.emit('xp-collected', {
            orb: orb,
            position: { x: orb.x, y: orb.y },
            value: orb.value,
            playerLevel: this.level,
          });
        }
      }
    });

    // Limpeza
    this.xpOrbs = this.xpOrbs.filter((orb) => !orb.collected);
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
    // Misturar upgrades disponíveis
    const shuffled = [...this.availableUpgrades].sort(
      () => Math.random() - 0.5
    );
    return shuffled.slice(0, count);
  }

  applyUpgrade(upgradeId) {
    const upgrade = CONSTANTS.SPACE_UPGRADES.find((u) => u.id === upgradeId);
    if (!upgrade) {
      console.error('[ProgressionSystem] Upgrade not found:', upgradeId);
      return false;
    }

    // Aplicar efeito do upgrade
    this.applyUpgradeEffect(upgrade);

    // Registrar upgrade aplicado
    const currentCount = this.appliedUpgrades.get(upgradeId) || 0;
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

      case 'armor':
        gameEvents.emit('upgrade-armor-boost', { multiplier: 1.25 });
        break;

      case 'multishot':
        gameEvents.emit('upgrade-multishot', { bonus: 1 });
        break;

      case 'magfield':
        this.orbMagnetismRadius *= 1.5;
        gameEvents.emit('upgrade-magnetism', { multiplier: 1.5 });
        break;
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
    this.appliedUpgrades.clear();
    this.orbMagnetismRadius = CONSTANTS.MAGNETISM_RADIUS;

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
  }

  destroy() {
    this.xpOrbs = [];
    this.appliedUpgrades.clear();
    console.log('[ProgressionSystem] Destroyed');
  }
}

export default ProgressionSystem;

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressionSystem;
}
