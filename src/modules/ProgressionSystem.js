import * as CONSTANTS from '../core/GameConstants.js';
import UPGRADE_LIBRARY, { UPGRADE_CATEGORIES } from '../data/upgrades.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';
import RandomService from '../core/RandomService.js';

const asArray = (value) => (Array.isArray(value) ? value : []);

const DEFAULT_UPGRADE_CATEGORY = {
  id: 'general',
  label: 'Tecnologia',
  description: 'Melhorias que ampliam capacidades gerais da nave.',
  icon: '✨',
  themeColor: '#3399FF',
};

const COMBO_TIMEOUT_FALLBACK = 3;
const COMBO_MULTIPLIER_STEP_FALLBACK = 0.1;
const COMBO_MAX_MULTIPLIER_FALLBACK = 2;

class ProgressionSystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    this.randomSource = null;
    this.random = null;
    this._fallbackRandom = null;
    this._fallbackRandomSeed = null;
    this._fallbackRandomFork = null;
    this._fallbackRandomForkSeed = null;
    // === DADOS DE PROGRESSÃO ===
    const initialLevel = Number.isFinite(CONSTANTS.PROGRESSION_INITIAL_LEVEL)
      ? CONSTANTS.PROGRESSION_INITIAL_LEVEL
      : 1;
    this.level = Math.max(1, initialLevel);
    this.experience = 0;
    const initialRequirement = Number.isFinite(
      CONSTANTS.PROGRESSION_INITIAL_XP_REQUIREMENT
    )
      ? CONSTANTS.PROGRESSION_INITIAL_XP_REQUIREMENT
      : 100;
    this.experienceToNext = Math.max(1, Math.floor(initialRequirement));
    this.totalExperience = 0;

    // === COMBO STATE ===
    this.currentCombo = 0;
    this.comboTimer = 0;
    this.comboTimeout = this.getDefaultComboTimeout();
    this.comboMultiplier = this.calculateComboMultiplier(0);

    // === UPGRADES APLICADOS ===
    this.appliedUpgrades = new Map();
    this.upgradeDefinitions = this.buildUpgradeDefinitions(UPGRADE_LIBRARY);
    this.upgradeLookup = this.buildUpgradeLookup(this.upgradeDefinitions);
    this.upgradeCategoryMap = this.buildUpgradeCategoryMap(UPGRADE_CATEGORIES);
    this.defaultUpgradeCategory = { ...DEFAULT_UPGRADE_CATEGORY };
    this.pendingUpgradeOptions = [];

    // === CACHES DE SERVIÇOS ===
    this.services = {
      xpOrbs: this.dependencies['xp-orbs'] || null,
      player: this.dependencies.player || null,
      ui: this.dependencies.ui || null,
      effects: this.dependencies.effects || null,
    };

    this.refreshRandom(true);

    // === CONFIGURAÇÕES ===

    const levelScaling = Number.isFinite(CONSTANTS.PROGRESSION_LEVEL_SCALING)
      ? CONSTANTS.PROGRESSION_LEVEL_SCALING
      : 1;
    this.levelScaling = Math.max(1, levelScaling);

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('progression', this);
    }

    // Escutar eventos
    this.setupEventListeners();

    console.log('[ProgressionSystem] Initialized - Level', this.level);
  }

  ensureFallbackRandom(force = false) {
    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService('progression:fallback');
      this._fallbackRandomSeed = this._fallbackRandom.seed >>> 0;
    } else if (
      force &&
      typeof this._fallbackRandom.reset === 'function' &&
      this._fallbackRandomSeed !== null
    ) {
      this._fallbackRandom.reset(this._fallbackRandomSeed);
    }

    if (!this._fallbackRandomFork) {
      this._fallbackRandomFork = this._fallbackRandom.fork('progression.upgrades');
      this._fallbackRandomForkSeed = this._fallbackRandomFork.seed >>> 0;
    } else if (
      force &&
      typeof this._fallbackRandomFork.reset === 'function' &&
      this._fallbackRandomForkSeed !== null
    ) {
      this._fallbackRandomFork.reset(this._fallbackRandomForkSeed);
    }

    return this._fallbackRandomFork;
  }

  refreshInjectedServices(force = false) {
    if (force) {
      this.services.xpOrbs = this.dependencies['xp-orbs'] || null;
      this.services.player = this.dependencies.player || null;
      this.services.ui = this.dependencies.ui || null;
      this.services.effects = this.dependencies.effects || null;
    }

    if (!this.services.xpOrbs) {
      this.services.xpOrbs = resolveService('xp-orbs', this.dependencies);
    }

    if (!this.services.player) {
      this.services.player = resolveService('player', this.dependencies);
    }

    if (!this.services.ui) {
      this.services.ui = resolveService('ui', this.dependencies);
    }

    if (!this.services.effects) {
      this.services.effects = resolveService('effects', this.dependencies);
    }

    this.refreshRandom(force);
  }

  setupEventListeners() {
    this.refreshInjectedServices();
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('xp-orb-collected', (data) => {
      this.handleOrbCollected(data);
    });

    gameEvents.on('progression-reset', () => {
      this.refreshInjectedServices(true);
      this.comboTimeout = this.getDefaultComboTimeout();
      this.resetCombo({ reason: 'progression-reset', silent: true });
    });

    gameEvents.on('player-reset', () => {
      this.refreshInjectedServices(true);
      this.comboTimeout = this.getDefaultComboTimeout();
      this.resetCombo({ reason: 'player-reset', silent: true });
    });

    gameEvents.on('player-died', (data) => {
      this.resetCombo({ reason: 'player-died', payload: data });
    });

    gameEvents.on('enemy-destroyed', (data) => {
      this.handleEnemyDestroyed(data);
    });
  }

  refreshRandom(force = false) {
    const resolvedRandom = resolveService('random', this.dependencies);

    if (!resolvedRandom) {
      const fallbackRandom = this.ensureFallbackRandom(force);
      this.randomSource = this._fallbackRandom;
      this.random = fallbackRandom;
      return this.random;
    }

    const needsInitialization =
      resolvedRandom !== this.randomSource || !this.random;

    if (needsInitialization) {
      this.randomSource = resolvedRandom;
      if (resolvedRandom && typeof resolvedRandom.fork === 'function') {
        this.random = resolvedRandom.fork('progression.upgrades');
      } else {
        this.random = resolvedRandom;
      }
    }

    if ((force || needsInitialization) && this.random && typeof this.random.reset === 'function') {
      if (Object.prototype.hasOwnProperty.call(this.random, 'seed')) {
        this.random.reset(this.random.seed);
      } else {
        this.random.reset();
      }
    }

    return this.random;
  }

  getDefaultComboTimeout() {
    const timeout = Number(CONSTANTS.PROGRESSION_COMBO_TIMEOUT);
    if (Number.isFinite(timeout) && timeout > 0) {
      return timeout;
    }

    return COMBO_TIMEOUT_FALLBACK;
  }

  getComboMultiplierStep() {
    const step = Number(CONSTANTS.PROGRESSION_COMBO_MULTIPLIER_STEP);
    if (Number.isFinite(step) && step > 0) {
      return step;
    }

    return COMBO_MULTIPLIER_STEP_FALLBACK;
  }

  getComboMaxMultiplier() {
    const max = Number(CONSTANTS.PROGRESSION_COMBO_MAX_MULTIPLIER);
    if (Number.isFinite(max) && max > 1) {
      return max;
    }

    return COMBO_MAX_MULTIPLIER_FALLBACK;
  }

  calculateComboMultiplier(comboCount = this.currentCombo) {
    const count = Number.isFinite(comboCount)
      ? Math.max(0, Math.floor(comboCount))
      : 0;

    if (count <= 1) {
      return 1;
    }

    const step = this.getComboMultiplierStep();
    const maxMultiplier = this.getComboMaxMultiplier();

    const multiplier = 1 + (count - 1) * step;
    if (Number.isFinite(maxMultiplier) && maxMultiplier > 1) {
      return Math.min(multiplier, maxMultiplier);
    }

    return multiplier;
  }

  emitComboUpdated(extra = {}) {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    const payload = {
      comboCount: this.currentCombo,
      multiplier: this.comboMultiplier,
      timeout: this.comboTimeout,
      remaining: Math.max(0, this.comboTimer),
      ...extra,
    };

    gameEvents.emit('combo-updated', payload);
  }

  handleEnemyDestroyed(data = {}) {
    if (data?.ignoreCombo) {
      return;
    }

    const incrementValue = Number.isFinite(data?.comboIncrement)
      ? Math.max(1, Math.floor(data.comboIncrement))
      : 1;

    this.currentCombo = Math.max(0, this.currentCombo) + incrementValue;
    this.comboTimer = Math.max(0, this.comboTimeout);
    this.comboMultiplier = this.calculateComboMultiplier(this.currentCombo);

    this.emitComboUpdated({
      reason: 'enemy-destroyed',
      enemy: data?.enemy || null,
      position: data?.position || null,
      comboIncrement: incrementValue,
    });
  }

  resetCombo(options = {}) {
    const {
      silent = false,
      emitUpdate = true,
      reason = 'manual',
      payload = {},
    } = options;

    const previousCombo = this.currentCombo;
    const previousMultiplier = this.comboMultiplier;

    this.currentCombo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = this.calculateComboMultiplier(0);

    if (typeof gameEvents !== 'undefined' && !silent && previousCombo > 0) {
      gameEvents.emit('combo-broken', {
        reason,
        comboCount: previousCombo,
        multiplier: previousMultiplier,
        timeout: this.comboTimeout,
        ...payload,
      });
    }

    if (emitUpdate) {
      this.emitComboUpdated({
        reason,
        ...payload,
      });
    }
  }

  handleOrbCollected(data) {
    const amount = Number(data?.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    this.collectXP(amount);
  }

  emitExperienceChanged() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

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

  update(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (this.currentCombo <= 0) {
      return;
    }

    this.comboTimer = Math.max(0, this.comboTimer - deltaTime);

    if (this.comboTimer <= 0) {
      this.resetCombo({ reason: 'timeout' });
    }
  }

  // === SISTEMA DE EXPERIÊNCIA ===
  collectXP(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return { gained: 0, levels: 0 };
    }

    const multiplier = Math.max(1, Number(this.comboMultiplier) || 1);
    const gained = Math.max(0, Math.round(value * multiplier));

    this.totalExperience += gained;

    let pool = this.experience + gained;
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

    return { gained, levels: levelsGained, multiplier };
  }

  applyLevelUp() {
    this.level += 1;
    const previousRequirement = this.experienceToNext;
    this.experienceToNext = Math.floor(
      this.experienceToNext * this.levelScaling,
    );

    const upgradeContext = this.prepareUpgradeOptions(
      CONSTANTS.PROGRESSION_UPGRADE_ROLL_COUNT
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
    if (typeof gameEvents === 'undefined') {
      return;
    }

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
  prepareUpgradeOptions(count = CONSTANTS.PROGRESSION_UPGRADE_ROLL_COUNT) {
    const eligible = asArray(this.upgradeDefinitions).filter((definition) =>
      this.isUpgradeSelectable(definition)
    );

    const fallbackCount = Number.isFinite(
      CONSTANTS.PROGRESSION_UPGRADE_FALLBACK_COUNT
    )
      ? Math.max(1, Math.floor(CONSTANTS.PROGRESSION_UPGRADE_FALLBACK_COUNT))
      : 3;
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

    let rng = this.refreshRandom() || this.random;
    if (!rng || typeof rng.int !== 'function') {
      rng = this.ensureFallbackRandom();
    }

    const pool = [...eligible];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = rng.int(0, index);
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    const selection = pool.slice(0, cappedCount);
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
    const baseRequirementsMet = prerequisites.every((requirement) =>
      this.evaluatePrerequisite(requirement)
    );

    if (!baseRequirementsMet) {
      return false;
    }

    const levelRequirements = this.collectLevelPrerequisites(
      definition,
      currentLevel
    );

    return levelRequirements.every((requirement) =>
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

  collectLevelPrerequisites(definition, levelIndex) {
    if (!definition || typeof definition !== 'object') {
      return [];
    }

    const nextLevelIndex = Number.isFinite(levelIndex)
      ? Math.max(0, Math.floor(levelIndex))
      : 0;
    const levels = asArray(definition.levels);

    if (nextLevelIndex >= levels.length) {
      return [];
    }

    const levelDefinition = levels[nextLevelIndex];
    if (!levelDefinition || !Array.isArray(levelDefinition.prerequisites)) {
      return [];
    }

    return levelDefinition.prerequisites
      .map((entry) => this.normalizePrerequisite(entry))
      .filter(Boolean);
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

  describeLevelPrerequisites(definition, levelIndex) {
    const entries = [];
    if (!definition) {
      return entries;
    }

    const levelRequirements = this.collectLevelPrerequisites(
      definition,
      levelIndex
    );

    levelRequirements.forEach((entry) => {
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

    const globalPrereqs = this.describePrerequisites(definition);
    const levelPrereqs = this.describeLevelPrerequisites(
      definition,
      currentLevel
    );

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
      prerequisites: [...globalPrereqs, ...levelPrereqs],
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

      const prerequisites = asArray(level?.prerequisites);

      return {
        rank,
        title: level?.title || '',
        description: level?.description || '',
        highlights: asArray(level?.highlights)
          .map((item) => (typeof item === 'string' ? item : `${item}`))
          .filter(Boolean),
        effects,
        prerequisites,
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

    effects.forEach((effect) => {
      if (!effect || typeof effect !== 'object') {
        return;
      }

      const type = effect.type || 'event';

      if (type === 'progression') {
        this.applyProgressionEffect(effect);
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
  }

  applyProgressionEffect(effect) {
    if (!effect || typeof effect !== 'object') {
      return;
    }

    const property = effect.property;
    const value = Number(effect.value);
    if (!property || !Number.isFinite(value)) {
      return;
    }

    const operation = effect.operation || 'set';
    this.refreshInjectedServices();
    const xpSystem = this.services.xpOrbs;

    if (!xpSystem) {
      return;
    }

    const applyNumericOperation = (current, modifier) => {
      switch (operation) {
        case 'multiply':
          return current * modifier;
        case 'add':
          return current + modifier;
        case 'set':
        default:
          return modifier;
      }
    };

    if (property === 'orbMagnetismRadius') {
      const current =
        typeof xpSystem.getMagnetismRadius === 'function'
          ? xpSystem.getMagnetismRadius()
          : xpSystem.orbMagnetismRadius || CONSTANTS.MAGNETISM_RADIUS;
      const nextRadius = applyNumericOperation(current, value);
      if (typeof xpSystem.setMagnetismRadius === 'function') {
        xpSystem.setMagnetismRadius(nextRadius);
      }
      return;
    }

    if (property === 'magnetismForce') {
      const current =
        typeof xpSystem.getMagnetismForce === 'function'
          ? xpSystem.getMagnetismForce()
          : xpSystem.magnetismForce || CONSTANTS.MAGNETISM_FORCE;
      const nextForce = applyNumericOperation(current, value);
      if (typeof xpSystem.setMagnetismForce === 'function') {
        xpSystem.setMagnetismForce(nextForce);
      }
      return;
    }

    console.warn('[ProgressionSystem] Unknown progression property:', property);
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

  getUpgradeCount(upgradeId) {
    return this.appliedUpgrades.get(upgradeId) || 0;
  }

  getAllUpgrades() {
    return new Map(this.appliedUpgrades);
  }

  // === RESET E SAVE ===
  reset() {
    this.level = 1;
    this.experience = 0;
    this.experienceToNext = 100;
    this.totalExperience = 0;
    this.appliedUpgrades.clear();
    this.pendingUpgradeOptions = [];
    this.comboTimeout = this.getDefaultComboTimeout();
    this.resetCombo({ reason: 'progression-reset', silent: true });

    this.refreshInjectedServices(true);
    this.emitExperienceChanged();

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('progression-reset');
    }

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
      comboState: {
        comboCount: this.currentCombo,
        comboTimer: this.comboTimer,
        comboTimeout: this.comboTimeout,
        comboMultiplier: this.comboMultiplier,
      },
    };
  }

  deserialize(data, options = {}) {
    this.level = data?.level || 1;
    this.experience = data?.experience || 0;
    this.experienceToNext = data?.experienceToNext || 100;
    this.totalExperience = data?.totalExperience || 0;

    const entries = Array.isArray(data?.appliedUpgrades)
      ? data.appliedUpgrades
      : [];
    this.appliedUpgrades = new Map(entries);
    this.pendingUpgradeOptions = [];

    const comboData =
      (data && (data.comboState || data.combo || data.comboData)) || {};
    const resolvedTimeout = Number(
      comboData.comboTimeout ?? comboData.timeout ?? comboData.duration
    );
    this.comboTimeout = Number.isFinite(resolvedTimeout) && resolvedTimeout > 0
      ? resolvedTimeout
      : this.getDefaultComboTimeout();

    const restoredCombo = Number(
      comboData.comboCount ?? comboData.currentCombo ?? comboData.count
    );
    this.currentCombo = Number.isFinite(restoredCombo)
      ? Math.max(0, Math.floor(restoredCombo))
      : 0;

    const restoredTimer = Number(
      comboData.comboTimer ?? comboData.timer ?? comboData.remaining
    );
    const normalizedTimer = Number.isFinite(restoredTimer)
      ? Math.max(0, restoredTimer)
      : 0;
    this.comboTimer = Math.min(normalizedTimer, this.comboTimeout);

    this.comboMultiplier = this.calculateComboMultiplier(this.currentCombo);

    if (!options?.suppressEvents) {
      this.emitExperienceChanged();
      this.emitComboUpdated({ reason: 'deserialize' });
    }
  }

  restoreState(data) {
    this.refreshInjectedServices(true);
    this.deserialize(data, { suppressEvents: true });
    this.emitExperienceChanged();
    this.emitComboUpdated({ reason: 'restore' });

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('progression-restored', {
        level: this.level,
        experience: this.experience,
        experienceToNext: this.experienceToNext,
        totalExperience: this.totalExperience,
      });
    }

    return true;
  }

  destroy() {
    this.appliedUpgrades.clear();
    this.pendingUpgradeOptions = [];
    this.resetCombo({ silent: true, emitUpdate: false });
    this.services = {
      xpOrbs: null,
      player: null,
      ui: null,
      effects: null
    };
    console.log('[ProgressionSystem] Destroyed');
  }
}


export default ProgressionSystem;

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressionSystem;
}
