import {
  PROGRESSION_UPGRADE_ROLL_COUNT,
  PROGRESSION_UPGRADE_FALLBACK_COUNT,
  PROGRESSION_UPGRADE_REROLLS_PER_RUN,
  PROGRESSION_UPGRADE_BANISHES_PER_RUN,
  UPGRADE_RARITIES,
  UPGRADE_RARITY_BASE_WEIGHTS,
  UPGRADE_RARITY_WEIGHT_PER_LEVEL,
  UPGRADE_RARITY_WEIGHT_CAPS,
  UPGRADE_FAMILY_STEER_PER_CARD,
  UPGRADE_WEAPON_OFFER_LEVELS,
} from '../core/GameConstants.js';
import UPGRADE_LIBRARY, {
  UPGRADE_CATEGORIES,
  WEAPON_CARD_IDS,
} from '../data/upgrades/index.js';
import {
  UPGRADE_FAMILIES,
  FAMILY_SYNERGY_THRESHOLD,
  FAMILY_APEX_THRESHOLD,
} from '../data/upgrades/families.js';
import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { BASE_MODIFIERS } from '../data/hangar.js';
import {
  MAGNETISM_FORCE,
  MAGNETISM_RADIUS,
} from '../data/constants/gameplay.js';

const asArray = (value) => (Array.isArray(value) ? value : []);

const DEFAULT_UPGRADE_CATEGORY = {
  id: 'general',
  label: 'Technology',
  description: 'Enhancements that improve general ship capabilities.',
  icon: '✨',
  themeColor: '#3399FF',
};

// Progression-owned numbers an upgrade effect may change directly.
const PROGRESSION_SELF_PROPERTIES = new Set([
  'comboTimeout',
  'comboMultiplierStep',
  'comboMultiplierCap',
  'xpGainMultiplier',
]);

class UpgradeSystem extends BaseSystem {
  constructor(dependencies = {}, options = {}) {
    const defaultOptions = {
      enableRandomManagement: true,
      systemName: 'UpgradeSystem',
      serviceName: 'upgrades',
      randomForkLabels: {
        base: 'upgrades.base',
        selection: 'upgrades.selection',
        progression: 'upgrades.progression',
        rewards: 'upgrades.rewards',
      },
    };

    // Merge options, allowing subclasses to override
    const mergedOptions = {
      ...defaultOptions,
      ...options,
      randomForkLabels: {
        ...defaultOptions.randomForkLabels,
        ...(options.randomForkLabels || {}),
      },
    };

    super(dependencies, mergedOptions);
  }

  initialize() {
    this.appliedUpgrades = new Map();
    this.activeSynergies = new Set();
    this.activeApexes = new Set();
    this.pendingUpgradeOptions = [];
    this.resetRunUpgradeActions();
    this.upgradeDefinitions = this.buildUpgradeDefinitions(UPGRADE_LIBRARY);
    this.upgradeLookup = this.buildUpgradeLookup(this.upgradeDefinitions);
    this.upgradeCategoryMap = this.buildUpgradeCategoryMap(UPGRADE_CATEGORIES);
    this.defaultUpgradeCategory = { ...DEFAULT_UPGRADE_CATEGORY };
    this.refreshInjectedServices({ force: true });
  }

  onReset() {
    this.resetRunUpgradeActions();
  }

  // Per-run reroll/banish budget and the upgrades banished this run.
  resetRunUpgradeActions() {
    const hangar =
      resolveService('hangar', this.dependencies)?.getModifiers() ??
      BASE_MODIFIERS;
    this.rerollsLeft =
      PROGRESSION_UPGRADE_REROLLS_PER_RUN + hangar.extraRerolls;
    this.banishesLeft =
      PROGRESSION_UPGRADE_BANISHES_PER_RUN + hangar.extraBanishes;
    this.banishedUpgrades = new Set();
  }

  refreshInjectedServices(options = {}) {
    const force =
      typeof options === 'boolean' ? options : Boolean(options.force);

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
    this.refreshInjectedServices();

    this.registerEventListener('progression-reset', () => {
      this.refreshInjectedServices({ force: true });
    });

    this.registerEventListener('player-reset', () => {
      this.refreshInjectedServices({ force: true });
    });
  }

  getSystemLabel() {
    if (this.systemName) {
      return this.systemName;
    }

    if (this.constructor && this.constructor.name) {
      return this.constructor.name;
    }

    return 'UpgradeSystem';
  }

  // === SISTEMA DE UPGRADES ===
  // `exclude`: ids drawn only if the rest of the pool runs out (reroll).
  // `level`: the pilot level the offer is for; at UPGRADE_WEAPON_OFFER_LEVELS
  // one slot, at random, holds a weapon card while the run has none.
  prepareUpgradeOptions(
    count = PROGRESSION_UPGRADE_ROLL_COUNT,
    { exclude = [], level = this.level } = {}
  ) {
    this.offerLevel = level;
    const eligible = this.getEligibleUpgradeDefinitions();

    const fallbackCount = Number.isFinite(PROGRESSION_UPGRADE_FALLBACK_COUNT)
      ? Math.max(1, Math.floor(PROGRESSION_UPGRADE_FALLBACK_COUNT))
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

    // A reroll avoids the current cards, but keeps the ones the run doesn't
    // own in the draw when no other card is new.
    const avoided = ({ id }) => exclude.includes(id);
    const isNew = ({ id }) => this.getUpgradeCount(id) === 0;
    const newElsewhere = eligible.some((d) => !avoided(d) && isNew(d));
    const preferred = eligible.filter(
      (d) => !avoided(d) || (!newElsewhere && isNew(d))
    );
    const weapons = UPGRADE_WEAPON_OFFER_LEVELS.includes(level)
      ? preferred.filter(({ id }) => WEAPON_CARD_IDS.includes(id))
      : [];
    const selection = this.rollUpgradeDefinitions(weapons, 1);
    selection.push(
      ...this.rollUpgradeDefinitions(
        preferred.filter((definition) => !selection.includes(definition)),
        cappedCount - selection.length,
        selection
      )
    );
    if (selection.length < cappedCount) {
      const repeats = eligible.filter(
        (definition) => avoided(definition) && !selection.includes(definition)
      );
      selection.push(
        ...this.rollUpgradeDefinitions(
          repeats,
          cappedCount - selection.length,
          selection
        )
      );
    }
    if (weapons.length > 0) {
      const [weapon] = selection.splice(0, 1);
      const slot = this.selectionRandom().int(0, selection.length);
      selection.splice(slot, 0, weapon);
    }
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

  getEligibleUpgradeDefinitions() {
    return asArray(this.upgradeDefinitions).filter((definition) =>
      this.isUpgradeSelectable(definition)
    );
  }

  // A card's draw weight: its rarity's at the pilot level (GameConstants),
  // × (1 + UPGRADE_FAMILY_STEER_PER_CARD × k) when the run holds k distinct
  // cards of its family, short of an Apex.
  getDrawWeight({ rarity, family }) {
    const rarityWeight = Math.min(
      UPGRADE_RARITY_WEIGHT_CAPS[rarity] ?? Infinity,
      UPGRADE_RARITY_BASE_WEIGHTS[rarity] +
        (UPGRADE_RARITY_WEIGHT_PER_LEVEL[rarity] ?? 0) * (this.level - 1)
    );
    const owned = this.getFamilyCounts()[family] ?? 0;
    const steer = owned < FAMILY_APEX_THRESHOLD ? owned : 0;
    return rarityWeight * (1 + UPGRADE_FAMILY_STEER_PER_CARD * steer);
  }

  selectionRandom() {
    return this.randomForks?.selection ?? this.random;
  }

  // Draws up to `count` distinct definitions, each by its draw weight. The
  // last draw is a card the run doesn't own yet when neither `kept` (cards
  // already in the offer) nor the draws before it hold one and the pool does.
  rollUpgradeDefinitions(pool, count, kept = []) {
    const isNew = ({ id }) => this.getUpgradeCount(id) === 0;
    const remaining = [...pool];
    const picks = [];
    while (picks.length < count && remaining.length > 0) {
      const fresh = remaining.filter(isNew);
      const lastNeedsNew =
        picks.length === count - 1 && ![...kept, ...picks].some(isNew);
      const candidates = lastNeedsNew && fresh.length ? fresh : remaining;
      const pick = this.selectionRandom().weightedPick(
        candidates.map((value) => ({
          value,
          weight: this.getDrawWeight(value),
        }))
      );
      remaining.splice(remaining.indexOf(pick), 1);
      picks.push(pick);
    }
    return picks;
  }

  // Replaces the offered cards with a fresh roll, avoiding the current ones
  // when the pool allows. Returns the new options, or null when not allowed.
  rerollUpgradeOptions() {
    const current = asArray(this.pendingUpgradeOptions);
    if (this.rerollsLeft <= 0 || current.length === 0) {
      return null;
    }

    const { options, poolSize } = this.prepareUpgradeOptions(current.length, {
      exclude: current.map((option) => option.id),
      level: this.offerLevel,
    });
    this.rerollsLeft -= 1;
    this.eventBus?.emit?.('upgrade-rerolled', {
      options,
      poolSize,
      rerollsLeft: this.rerollsLeft,
      banishesLeft: this.banishesLeft,
    });
    return options;
  }

  // Removes an offered upgrade from the pool for the rest of the run and
  // rerolls only its slot. Returns the new options, or null when not allowed.
  banishUpgrade(upgradeId) {
    const current = asArray(this.pendingUpgradeOptions);
    const slot = current.findIndex((option) => option.id === upgradeId);
    if (this.banishesLeft <= 0 || slot < 0) {
      return null;
    }

    this.banishedUpgrades.add(upgradeId);
    this.banishesLeft -= 1;

    const eligible = this.getEligibleUpgradeDefinitions();
    const offeredIds = current.map((option) => option.id);
    const [replacement] = this.rollUpgradeDefinitions(
      eligible.filter((definition) => !offeredIds.includes(definition.id)),
      1,
      current.filter((option) => option.id !== upgradeId)
    );
    const options = [...current];
    if (replacement) {
      options[slot] = this.buildUpgradeOption(replacement);
    } else {
      options.splice(slot, 1);
    }
    this.pendingUpgradeOptions = options;

    this.eventBus?.emit?.('upgrade-banished', {
      upgradeId,
      options,
      poolSize: eligible.length,
      rerollsLeft: this.rerollsLeft,
      banishesLeft: this.banishesLeft,
    });
    return options;
  }

  getRandomUpgrades(count = 3) {
    const { options } = this.prepareUpgradeOptions(count);
    return options;
  }

  isUpgradeSelectable(definition) {
    if (!definition || typeof definition !== 'object') {
      return false;
    }

    if (this.banishedUpgrades.has(definition.id)) {
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

    if (this.isExcludedByBuild(definition)) {
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

  // A card that rules out an owned card, or that an owned card rules out.
  isExcludedByBuild(definition) {
    for (const [id, level] of this.appliedUpgrades) {
      if (
        level > 0 &&
        (definition.excludes.includes(id) ||
          this.upgradeLookup.get(id)?.excludes.includes(definition.id))
      ) {
        return true;
      }
    }
    return false;
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
        text: `Available from level ${definition.unlockLevel}.`,
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
      return `Pilot Level ${prerequisite.level || 1}+`;
    }

    if (prerequisite.type === 'upgrade') {
      const reference = this.upgradeLookup?.get(prerequisite.id);
      const name = reference?.text?.name || reference?.name || prerequisite.id;
      const levelLabel =
        (prerequisite.level || 1) > 1 ? `Lvl ${prerequisite.level}` : 'Lvl 1';
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
      rarity: definition.rarity,
      cursed: definition.cursed,
      tags: asArray(definition.tags),
      family: this.describeFamilyProgress(definition),
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
              `Level ${currentLevel + 1}`,
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
      family: entry.family || null,
      rarity: UPGRADE_RARITIES.includes(entry.rarity)
        ? entry.rarity
        : UPGRADE_RARITIES[0],
      // A big boost with a real cost; no family.
      cursed: entry.cursed === true,
      icon: entry.icon || '✨',
      themeColor:
        entry.themeColor || entry.color || DEFAULT_UPGRADE_CATEGORY.themeColor,
      unlockLevel: entry.unlockLevel ?? null,
      tags: asArray(entry.tags).map((tag) => `${tag}`),
      prerequisites: asArray(entry.prerequisites),
      // Ids never in one build with this card (either side may list them).
      excludes: asArray(entry.excludes),
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
        title: levelText.title || levelData.title || `Level ${levelIndex + 1}`,
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
    const systemLabel = this.getSystemLabel();

    if (!definition) {
      console.error(`[${systemLabel}] Upgrade not found:`, upgradeId);
      return false;
    }

    const levels = asArray(definition.levels);
    const currentLevel = this.getUpgradeCount(upgradeId);
    const maxLevel = levels.length;

    if (maxLevel > 0 && currentLevel >= maxLevel) {
      console.warn(`[${systemLabel}] Upgrade already at max level:`, upgradeId);
      return false;
    }

    if (
      Number.isFinite(definition.unlockLevel) &&
      this.level < definition.unlockLevel
    ) {
      console.warn(`[${systemLabel}] Upgrade locked by level:`, upgradeId);
      return false;
    }

    if (!this.isUpgradeSelectable(definition)) {
      console.warn(
        `[${systemLabel}] Upgrade prerequisites not met:`,
        upgradeId
      );
      return false;
    }

    const levelDefinition = levels[currentLevel];
    if (!levelDefinition) {
      console.error(
        `[${systemLabel}] Missing level definition for upgrade:`,
        upgradeId
      );
      return false;
    }

    const newLevel = currentLevel + 1;
    this.appliedUpgrades.set(upgradeId, newLevel);

    this.applyUpgradeEffects(definition, levelDefinition, newLevel);

    const summary = this.buildAppliedUpgradeSummary(definition, currentLevel);
    const effects = this.cloneEffects(levelDefinition.effects);
    const prerequisites = this.describePrerequisites(definition);

    this.eventBus?.emit?.('upgrade:purchased', {
      upgradeId,
      level: newLevel,
      previousLevel: currentLevel,
      maxLevel,
      summary,
      effects,
      prerequisites,
    });

    this.eventBus?.emit?.('upgrade-applied', {
      upgradeId,
      level: newLevel,
      previousLevel: currentLevel,
      maxLevel,
      summary,
      effects,
      prerequisites,
    });

    console.log(
      `[${systemLabel}] Applied upgrade:`,
      summary?.name || upgradeId,
      '→ level',
      newLevel
    );

    this.pendingUpgradeOptions = [];

    return true;
  }

  applyUpgradeEffects(definition, levelDefinition, newLevel) {
    this.applyEffectList(levelDefinition?.effects, {
      upgradeId: definition.id,
      level: newLevel,
      category: definition.category,
    });
    this.syncSynergies();
  }

  applyEffectList(effects, context) {
    asArray(effects).forEach((effect) => {
      if (!effect || typeof effect !== 'object') {
        return;
      }

      const type = effect.type || 'event';

      if (type === 'progression') {
        this.applyProgressionEffect(effect);
        return;
      }

      if (type === 'event' && typeof effect.event === 'string') {
        this.eventBus?.emit?.(effect.event, {
          ...(effect.payload || {}),
          ...context,
        });
        return;
      }

      console.warn(
        `[${this.getSystemLabel()}] Unknown upgrade effect type:`,
        type
      );
    });
  }

  // === FAMILIES AND SYNERGIES ===
  getFamilyCounts() {
    const counts = {};
    Object.keys(UPGRADE_FAMILIES).forEach((id) => {
      counts[id] = 0;
    });
    this.appliedUpgrades.forEach((level, upgradeId) => {
      const family = this.upgradeLookup?.get(upgradeId)?.family;
      if (level > 0 && family in counts) {
        counts[family] += 1;
      }
    });
    return counts;
  }

  // Switches on every family bonus whose threshold is met and is not on
  // yet; an Apex (five cards) follows the same way, always after its bonus.
  syncSynergies() {
    const counts = this.getFamilyCounts();
    Object.values(UPGRADE_FAMILIES).forEach((family) => {
      const count = counts[family.id];
      if (
        count >= FAMILY_SYNERGY_THRESHOLD &&
        !this.activeSynergies.has(family.id)
      ) {
        this.activeSynergies.add(family.id);
        this.applyEffectList(family.bonus.effects, {
          synergy: family.id,
          level: 1,
        });
        this.eventBus?.emit?.('synergy-unlocked', {
          family: family.id,
          familyName: family.name,
          name: family.bonus.name,
          description: family.bonus.description,
          color: family.color,
        });
      }
      if (count >= FAMILY_APEX_THRESHOLD && !this.activeApexes.has(family.id)) {
        this.activeApexes.add(family.id);
        this.eventBus?.emit?.('apex-unlocked', { family: family.id });
      }
    });
  }

  describeFamilyProgress(definition) {
    const family = UPGRADE_FAMILIES[definition.family];
    if (!family) {
      return null;
    }
    const owned = this.getFamilyCounts()[family.id];
    const isNewToFamily = this.getUpgradeCount(definition.id) === 0;
    return {
      id: family.id,
      name: family.name,
      color: family.color,
      bonusName: family.bonus.name,
      bonusDescription: family.bonus.description,
      owned,
      required: FAMILY_SYNERGY_THRESHOLD,
      active: this.activeSynergies.has(family.id),
      completesSynergy:
        isNewToFamily &&
        !this.activeSynergies.has(family.id) &&
        owned + 1 === FAMILY_SYNERGY_THRESHOLD,
    };
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

    if (PROGRESSION_SELF_PROPERTIES.has(property)) {
      this[property] = applyNumericOperation(this[property], value);
      return;
    }

    this.refreshInjectedServices();
    const xpSystem = this.xpOrbsService;

    if (!xpSystem) {
      return;
    }

    if (property === 'orbMagnetismRadius') {
      const current =
        typeof xpSystem.getMagnetismRadius === 'function'
          ? xpSystem.getMagnetismRadius()
          : xpSystem.orbMagnetismRadius || MAGNETISM_RADIUS;
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
          : xpSystem.magnetismForce || MAGNETISM_FORCE;
      const nextForce = applyNumericOperation(current, value);
      if (typeof xpSystem.setMagnetismForce === 'function') {
        xpSystem.setMagnetismForce(nextForce);
      }
      return;
    }

    console.warn(
      `[${this.getSystemLabel()}] Unknown progression property:`,
      property
    );
  }

  getUpgradeProgressSnapshot() {
    return Array.from(this.appliedUpgrades.entries()).map(([id, level]) => ({
      id,
      level,
      family: this.upgradeLookup?.get(id)?.family || null,
    }));
  }

  // Distinct upgrades per family and the bonuses already on (game over build list).
  getSynergySnapshot() {
    return {
      families: this.getFamilyCounts(),
      synergies: Array.from(this.activeSynergies).map((id) => ({
        family: id,
        name: UPGRADE_FAMILIES[id].bonus.name,
      })),
    };
  }
}

export default UpgradeSystem;
