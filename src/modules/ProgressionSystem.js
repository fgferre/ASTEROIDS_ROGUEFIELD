import {
  PROGRESSION_INITIAL_LEVEL,
  PROGRESSION_INITIAL_XP_REQUIREMENT,
  PROGRESSION_COMBO_TIMEOUT,
  PROGRESSION_COMBO_MULTIPLIER_STEP,
  PROGRESSION_COMBO_MULTIPLIER_CAP,
  PROGRESSION_LEVEL_SCALING,
  PROGRESSION_UPGRADE_ROLL_COUNT,
} from '../core/GameConstants.js';
import UpgradeSystem from './UpgradeSystem.js';
import { safeNumber, safeBoolean, deepClone } from '../utils/StateManager.js';

class ProgressionSystem extends UpgradeSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'ProgressionSystem',
      serviceName: 'progression',
      randomForkLabels: {
        base: 'progression.base',
        selection: 'progression.selection',
        progression: 'progression.levels',
        rewards: 'progression.rewards',
      },
    });

    this._eventTopic = 'progression';
    this._upgradeEventTopic = 'upgrades';
  }

  initialize() {
    super.initialize();

    const initialLevel = Number.isFinite(PROGRESSION_INITIAL_LEVEL)
      ? PROGRESSION_INITIAL_LEVEL
      : 1;
    this.level = Math.max(1, initialLevel);
    this.experience = 0;
    const initialRequirement = Number.isFinite(
      PROGRESSION_INITIAL_XP_REQUIREMENT
    )
      ? PROGRESSION_INITIAL_XP_REQUIREMENT
      : 100;
    this.experienceToNext = Math.max(1, Math.floor(initialRequirement));
    this.totalExperience = 0;

    const comboTimeout = Number.isFinite(PROGRESSION_COMBO_TIMEOUT)
      ? Math.max(0, Number(PROGRESSION_COMBO_TIMEOUT))
      : 3;
    const comboStep = Number.isFinite(PROGRESSION_COMBO_MULTIPLIER_STEP)
      ? Math.max(0, Number(PROGRESSION_COMBO_MULTIPLIER_STEP))
      : 0.1;
    const comboCap = Number.isFinite(PROGRESSION_COMBO_MULTIPLIER_CAP)
      ? Math.max(1, Number(PROGRESSION_COMBO_MULTIPLIER_CAP))
      : 2;

    this.defaultComboTimeout = comboTimeout;
    this.defaultComboMultiplierStep = comboStep;
    this.defaultComboMultiplierCap = comboCap;
    this.currentCombo = 0;
    this.comboTimer = 0;
    this.comboTimeout = comboTimeout;
    this.comboMultiplier = 1;
    this.comboMultiplierStep = comboStep;
    this.comboMultiplierCap = comboCap;

    this.xpOrbsService = null;
    this.playerService = null;
    this.uiService = null;
    this.effectsService = null;

    const levelScaling = Number.isFinite(PROGRESSION_LEVEL_SCALING)
      ? PROGRESSION_LEVEL_SCALING
      : 1;
    this.levelScaling = Math.max(1, levelScaling);

    this.refreshInjectedServices({ force: true });
  }

  refreshInjectedServices(options = {}) {
    const force = typeof options === 'boolean' ? options : Boolean(options.force);

    this.resolveCachedServices(
      {
        xpOrbsService: 'xp-orbs',
        playerService: 'player',
        uiService: 'ui',
        effectsService: 'effects',
      },
      { force }
    );
  }

  setupEventListeners() {
    super.setupEventListeners();

    this.registerEventListener('xp-orb-collected', (data) => {
      this.handleOrbCollected(data);
    });

    this.registerEventListener('enemy-destroyed', (data) => {
      this.handleEnemyDestroyed(data);
    });

    this.registerEventListener('progression-reset', (payload = {}) => {
      this.refreshInjectedServices({ force: true });
      this.resetCombo({ reason: 'progression-reset', silent: true, force: true });
    });

    this.registerEventListener('player-reset', (payload = {}) => {
      this.refreshInjectedServices({ force: true });
      this.resetCombo({ reason: 'player-reset', silent: true, force: true });
    });

    this.registerEventListener('player-died', (payload = {}) => {
      this.resetCombo({ reason: 'player-died', silent: false, force: true });
    });
  }

  handleOrbCollected(data) {
    const amount = Number(data?.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    this.collectXP(amount);
  }

  handleEnemyDestroyed(data = {}) {
    if (!this.isPlayerResponsibleForEnemyDeath(data)) {
      return;
    }

    this.incrementCombo({
      enemy: data?.enemy || null,
      payload: data,
      reason: 'enemy-destroyed',
    });
  }

  isPlayerResponsibleForEnemyDeath(data = {}) {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const extractCause = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return '';
      }

      const directCause =
        typeof payload.cause === 'string' ? payload.cause : '';
      const reasonCause =
        typeof payload.reason === 'string' ? payload.reason : '';
      const sourceCause =
        typeof payload.source?.cause === 'string' ? payload.source.cause : '';

      return (directCause || reasonCause || sourceCause || '').toLowerCase();
    };

    const cause = extractCause(data);
    if (!cause) {
      return false;
    }

    if (cause === 'damage') {
      return true;
    }

    if (cause.startsWith('player-') || cause === 'player') {
      return true;
    }

    const source = data.source || null;
    if (source && typeof source === 'object') {
      const sourceType =
        typeof source.type === 'string' ? source.type.toLowerCase() : '';
      if (sourceType === 'player') {
        return true;
      }

      const sourceOwner =
        typeof source.owner === 'string' ? source.owner.toLowerCase() : '';
      if (sourceOwner === 'player') {
        return true;
      }
    }

    return false;
  }

  incrementCombo(context = {}) {
    this.currentCombo = Math.max(0, Math.floor(this.currentCombo)) + 1;
    this.comboTimer = this.comboTimeout;
    this.updateComboMultiplier();

    this.emitComboUpdated({
      reason: context.reason || 'combo-increment',
      enemy: context.enemy || null,
      payload: context.payload || null,
    });
  }

  updateComboMultiplier() {
    const step = Number.isFinite(this.comboMultiplierStep)
      ? Math.max(0, this.comboMultiplierStep)
      : 0.1;
    const cap = Number.isFinite(this.comboMultiplierCap)
      ? Math.max(1, this.comboMultiplierCap)
      : 2;

    const effectiveCombo = Math.max(0, Math.floor(this.currentCombo) - 1);
    const calculated = 1 + effectiveCombo * step;

    this.comboMultiplier = Math.min(cap, Math.max(1, calculated));
  }

  emitComboUpdated(extra = {}) {
    gameEvents.emit('combo-updated', {
      comboCount: this.currentCombo,
      multiplier: this.comboMultiplier,
      remainingTime: this.comboTimer,
      timeout: this.comboTimeout,
      ...extra,
    });
  }

  resetCombo(options = {}) {
    const { silent = false, reason = 'reset', force = false, emit = true } = options;

    const previousCombo = Math.max(0, Math.floor(this.currentCombo));
    const previousMultiplier = Number.isFinite(this.comboMultiplier)
      ? Math.max(1, this.comboMultiplier)
      : 1;
    const hadCombo =
      previousCombo > 0 ||
      previousMultiplier > 1 ||
      (Number.isFinite(this.comboTimer) && this.comboTimer > 0);

    this.currentCombo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;

    if (!emit) {
      return;
    }

    if (!force && !hadCombo) {
      return;
    }

    gameEvents.emit('combo-broken', {
      comboCount: this.currentCombo,
      multiplier: this.comboMultiplier,
      remainingTime: this.comboTimer,
      timeout: this.comboTimeout,
      previousCombo,
      previousMultiplier,
      reason,
      silent: Boolean(silent),
    });
  }

  emitExperienceChanged() {
    gameEvents.emit('experience-changed', {
      current: this.experience,
      needed: this.experienceToNext,
      level: this.level,
      percentage:
        this.experienceToNext > 0
          ? this.experience / this.experienceToNext
          : 0,
    });
  }

  // === SISTEMA DE EXPERIÊNCIA ===
  collectXP(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return { gained: 0, levels: 0 };
    }

    const multiplier = Number.isFinite(this.comboMultiplier)
      ? Math.max(1, this.comboMultiplier)
      : 1;
    const adjustedValue = Math.max(1, Math.round(value * multiplier));

    this.totalExperience += adjustedValue;

    let pool = this.experience + adjustedValue;
    let levelsGained = 0;
    const levelContexts = [];

    while (pool >= this.experienceToNext) {
      pool -= this.experienceToNext;
      levelsGained += 1;
      levelContexts.push(this.applyLevelUp());
    }

    this.experience = pool;
    this.emitExperienceChanged();

    levelContexts.forEach((context) => {
      this.emitLevelUp(context);
    });

    return { gained: adjustedValue, levels: levelsGained };
  }

  update(deltaTime = 0) {
    const dt = Number(deltaTime);
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }

    if (this.currentCombo <= 0 || this.comboTimer <= 0) {
      return;
    }

    const previousTimer = this.comboTimer;
    this.comboTimer = Math.max(0, this.comboTimer - dt);

    if (previousTimer > 0 && this.comboTimer <= 0) {
      this.resetCombo({ reason: 'timeout', force: true });
    }
  }

  applyLevelUp() {
    this.level += 1;
    const previousRequirement = this.experienceToNext;
    this.experienceToNext = Math.floor(
      this.experienceToNext * this.levelScaling,
    );

    const upgradeContext = this.prepareUpgradeOptions(
      PROGRESSION_UPGRADE_ROLL_COUNT
    );

    return {
      level: this.level,
      previousRequirement,
      nextRequirement: this.experienceToNext,
      options: upgradeContext.options,
      poolSize: upgradeContext.poolSize,
      totalDefinitions: upgradeContext.totalDefinitions,
    };
  }

  emitLevelUp(context) {
    gameEvents.emit('player-leveled-up', {
      newLevel: context.level,
      previousRequirement: context.previousRequirement,
      nextRequirement: context.nextRequirement,
    });

    gameEvents.emit('upgrade-options-ready', {
      level: context.level,
      options: context.options || [],
      poolSize: context.poolSize ?? 0,
      totalDefinitions: context.totalDefinitions ?? 0,
      inventory: this.getUpgradeProgressSnapshot(),
      autoResolved: (context.options || []).length === 0,
    });
  }

  // === SISTEMA DE UPGRADES ===
  // Upgrade handling provided by UpgradeSystem base class.

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

  getComboState() {
    return {
      comboCount: this.currentCombo,
      multiplier: this.comboMultiplier,
      remainingTime: this.comboTimer,
      timeout: this.comboTimeout,
    };
  }

  getUpgradeCount(upgradeId) {
    return this.appliedUpgrades.get(upgradeId) || 0;
  }

  getAllUpgrades() {
    return new Map(this.appliedUpgrades);
  }

  // === RESET E SAVE ===
  reset(options = {}) {
    super.reset(options);

    const initialLevel = Number.isFinite(PROGRESSION_INITIAL_LEVEL)
      ? PROGRESSION_INITIAL_LEVEL
      : 1;
    this.level = Math.max(1, initialLevel);
    this.experience = 0;
    const initialRequirement = Number.isFinite(PROGRESSION_INITIAL_XP_REQUIREMENT)
      ? PROGRESSION_INITIAL_XP_REQUIREMENT
      : 100;
    this.experienceToNext = Math.max(1, Math.floor(initialRequirement));
    this.totalExperience = 0;
    this.appliedUpgrades.clear();
    this.pendingUpgradeOptions = [];

    if (Number.isFinite(this.defaultComboTimeout)) {
      this.comboTimeout = this.defaultComboTimeout;
    }
    if (Number.isFinite(this.defaultComboMultiplierStep)) {
      this.comboMultiplierStep = this.defaultComboMultiplierStep;
    }
    if (Number.isFinite(this.defaultComboMultiplierCap)) {
      this.comboMultiplierCap = this.defaultComboMultiplierCap;
    }

    this.resetCombo({ reason: 'progression-reset', silent: true, emit: false });

    this.refreshInjectedServices({ force: true });
    this.emitExperienceChanged();

    if (this._upgradeEventTopic && typeof gameEvents !== 'undefined') {
      gameEvents.emit(`${this._upgradeEventTopic}-reset`);
    }
  }

  // Para salvar progresso (futuro)
  serialize() {
    return {
      level: safeNumber(this.level, 1),
      experience: safeNumber(this.experience, 0),
      experienceToNext: safeNumber(this.experienceToNext, 100),
      totalExperience: safeNumber(this.totalExperience, 0),
      appliedUpgrades: Array.from(this.appliedUpgrades.entries()),
      comboState: {
        comboCount: safeNumber(this.currentCombo, 0),
        comboTimer: safeNumber(this.comboTimer, 0),
        comboTimeout: safeNumber(
          this.comboTimeout,
          safeNumber(this.defaultComboTimeout, 0)
        ),
        comboMultiplier: safeNumber(this.comboMultiplier, 1),
      },
    };
  }

  deserialize(data, options = {}) {
    const snapshot = data && typeof data === 'object' ? data : {};
    this.level = safeNumber(snapshot.level, 1);
    this.experience = safeNumber(snapshot.experience, 0);
    this.experienceToNext = safeNumber(snapshot.experienceToNext, 100);
    this.totalExperience = safeNumber(snapshot.totalExperience, 0);

    const entries = Array.isArray(snapshot.appliedUpgrades)
      ? snapshot.appliedUpgrades
      : [];
    this.appliedUpgrades = new Map(entries);
    this.pendingUpgradeOptions = [];

    if (Number.isFinite(this.defaultComboTimeout)) {
      this.comboTimeout = safeNumber(this.defaultComboTimeout, this.comboTimeout);
    }
    if (Number.isFinite(this.defaultComboMultiplierStep)) {
      this.comboMultiplierStep = safeNumber(
        this.defaultComboMultiplierStep,
        this.comboMultiplierStep
      );
    }
    if (Number.isFinite(this.defaultComboMultiplierCap)) {
      this.comboMultiplierCap = safeNumber(
        this.defaultComboMultiplierCap,
        this.comboMultiplierCap
      );
    }

    const comboData = deepClone(snapshot.comboState) || {};
    if (Number.isFinite(comboData?.comboTimeout) && comboData.comboTimeout >= 0) {
      this.comboTimeout = comboData.comboTimeout;
    }

    const restoredCombo = Number.isFinite(comboData?.comboCount)
      ? Math.max(0, Math.floor(comboData.comboCount))
      : 0;
    const restoredTimer = Number.isFinite(comboData?.comboTimer)
      ? Math.max(0, Number(comboData.comboTimer))
      : 0;

    this.currentCombo = restoredCombo;
    this.comboTimer = Math.min(this.comboTimeout, restoredTimer);

    if (this.currentCombo > 0 && this.comboTimer > 0) {
      const restoredMultiplier = Number(comboData?.comboMultiplier);
      if (Number.isFinite(restoredMultiplier) && restoredMultiplier >= 1) {
        this.comboMultiplier = Math.min(
          Math.max(1, restoredMultiplier),
          Number.isFinite(this.comboMultiplierCap)
            ? Math.max(1, this.comboMultiplierCap)
            : restoredMultiplier,
        );
      } else {
        this.updateComboMultiplier();
      }
    } else {
      this.comboTimer = 0;
      this.comboMultiplier = 1;
      this.currentCombo = 0;
    }

    const suppressEvents = safeBoolean(options?.suppressEvents, false);
    if (!suppressEvents) {
      this.emitExperienceChanged();
      if (this.currentCombo > 0) {
        this.emitComboUpdated({ reason: 'deserialize', silent: true });
      } else {
        this.resetCombo({ reason: 'deserialize', silent: true, force: true });
      }
    }
  }

  exportState() {
    return this.serialize();
  }

  importState(snapshot) {
    this.deserialize(snapshot);
    return true;
  }

  getSnapshotState() {
    return this.exportState();
  }

  restoreSnapshotState(snapshot) {
    return this.importState(snapshot);
  }

  restoreState(data) {
    this.refreshInjectedServices({ force: true });
    this.deserialize(data, { suppressEvents: true });
    this.emitExperienceChanged();

    if (this.currentCombo > 0) {
      this.emitComboUpdated({ reason: 'restore-state', silent: true });
    } else {
      this.resetCombo({ reason: 'restore-state', silent: true, force: true });
    }

    gameEvents.emit('progression-restored', {
      level: this.level,
      experience: this.experience,
      experienceToNext: this.experienceToNext,
      totalExperience: this.totalExperience,
    });

    return true;
  }

  destroy() {
    super.destroy();
    this.resetCombo({ emit: false });
    this.appliedUpgrades.clear();
    this.pendingUpgradeOptions = [];
    this.xpOrbsService = null;
    this.playerService = null;
    this.uiService = null;
    this.effectsService = null;
  }
}


export default ProgressionSystem;

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressionSystem;
}
