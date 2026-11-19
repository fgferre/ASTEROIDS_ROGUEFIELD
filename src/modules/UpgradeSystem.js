import {
  PROGRESSION_UPGRADE_ROLL_COUNT,
  PROGRESSION_UPGRADE_FALLBACK_COUNT,
  PROGRESSION_UPGRADE_REROLLS_PER_RUN,
  PROGRESSION_UPGRADE_BANISHES_PER_RUN,
  UPGRADE_RARITY_BASE_WEIGHTS,
  UPGRADE_RARITY_WEIGHT_PER_LEVEL,
  UPGRADE_RARITY_WEIGHT_CAPS,
  UPGRADE_FAMILY_STEER_PER_CARD,
  UPGRADE_WEAPON_OFFER_LEVELS,
  UPGRADE_PILOT_OFFER_EVERY,
  UPGRADE_CARD_SLOTS,
} from '../core/GameConstants.js';
import UPGRADE_LIBRARY, {
  UPGRADE_CATEGORIES,
  WEAPON_CARD_IDS,
  pilotCardIds,
  textForWeapon,
  trailSteps,
} from '../data/upgrades/index.js';
import {
  UPGRADE_FAMILIES,
  FAMILY_SYNERGY_THRESHOLD,
  FAMILY_APEX_THRESHOLD,
} from '../data/upgrades/families.js';
import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { BASE_MODIFIERS } from '../data/hangar.js';
import { DEFAULT_WEAPON_ID } from '../data/weapons.js';
import { MAGNETISM_FORCE } from '../data/constants/gameplay.js';
import {
  DEFAULT_UPGRADE_CATEGORY,
  asArray,
  buildUpgradeCategoryMap,
  buildUpgradeDefinitions,
  buildUpgradeLookup,
  cloneEffects,
} from './upgradeCatalog.js';
import {
  collectLevelPrerequisites,
  collectRawPrerequisites,
  describeLevelPrerequisites,
  describePrerequisites,
  evaluatePrerequisite,
} from './upgradePrerequisites.js';

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
    this.upgradeDefinitions = buildUpgradeDefinitions(UPGRADE_LIBRARY);
    this.upgradeLookup = buildUpgradeLookup(this.upgradeDefinitions);
    this.pilotCardIds = pilotCardIds(this.upgradeDefinitions);
    this.trailSteps = trailSteps(this.upgradeDefinitions);
    this.upgradeCategoryMap = buildUpgradeCategoryMap(UPGRADE_CATEGORIES);
    this.defaultUpgradeCategory = { ...DEFAULT_UPGRADE_CATEGORY };
    this.refreshInjectedServices({ force: true });
  }

  onReset() {
    this.resetRunUpgradeActions();
  }

  // Per-run reroll/banish/hold budget, the upgrades banished this run, and
  // the hangar's run contract: the cards open to the draw (null: all), the
  // cards sealed out of it, and a piloting card to start with.
  resetRunUpgradeActions() {
    const hangar =
      resolveService('hangar', this.dependencies)?.getModifiers() ??
      BASE_MODIFIERS;
    this.rerollsLeft =
      PROGRESSION_UPGRADE_REROLLS_PER_RUN + hangar.extraRerolls;
    this.banishesLeft =
      PROGRESSION_UPGRADE_BANISHES_PER_RUN + hangar.extraBanishes;
    this.banishedUpgrades = new Set();
    this.openCards = hangar.openCards ? new Set(hangar.openCards) : null;
    this.sealedCards = new Set(hangar.sealed ?? []);
    this.holdsPerRun = hangar.holds ?? 0;
    this.holdsLeft = this.holdsPerRun;
    // { id, level }: the card held on the level-up screen of `level`.
    this.heldCard = null;
    this.startingCard = hangar.startingCard ?? null;
  }

  // At run start, after the reset: the contract's starting piloting card,
  // rank 1, when the trail would offer it now; otherwise nothing.
  applyStartingCard() {
    const id = this.startingCard;
    if (
      id &&
      this.trailSlotIds().includes(id) &&
      this.getEligibleUpgradeDefinitions().some((d) => d.id === id)
    ) {
      this.applyUpgrade(id);
    }
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
  // one slot, at random, holds a weapon card while the run has none; in the
  // new flight, at every UPGRADE_PILOT_OFFER_EVERY levels, a piloting card.
  // The piloting trail comes only through that slot, never the regular draw.
  prepareUpgradeOptions(
    count = PROGRESSION_UPGRADE_ROLL_COUNT,
    { exclude = [], level = this.level } = {}
  ) {
    this.offerLevel = level;
    const eligible = this.getEligibleUpgradeDefinitions();
    const kept = this.takeHeldCard(eligible, level);

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
    const regular = ({ id }) => !this.pilotCardIds.includes(id);
    // Slots full: the regular draw and the weapon slot only rank up what the
    // run holds.
    const full = this.slotsFull();
    const held = ({ id }) => !full || this.getUpgradeCount(id) > 0;
    const isNew = ({ id }) => this.getUpgradeCount(id) === 0;
    const newElsewhere = eligible.some((d) => !avoided(d) && isNew(d));
    const preferred = eligible.filter(
      (d) => !avoided(d) || (!newElsewhere && isNew(d))
    );
    const slotIds = UPGRADE_WEAPON_OFFER_LEVELS.includes(level)
      ? WEAPON_CARD_IDS
      : level % UPGRADE_PILOT_OFFER_EVERY === 0
        ? this.trailSlotIds()
        : [];
    const slotted = preferred.filter(
      (definition) =>
        definition !== kept &&
        slotIds.includes(definition.id) &&
        (held(definition) || this.pilotCardIds.includes(definition.id))
    );
    const selection = this.rollUpgradeDefinitions(slotted, 1);
    if (kept) selection.push(kept);
    selection.push(
      ...this.rollUpgradeDefinitions(
        preferred.filter(
          (definition) =>
            regular(definition) &&
            held(definition) &&
            !selection.includes(definition)
        ),
        cappedCount - selection.length,
        selection
      )
    );
    if (selection.length < cappedCount) {
      const repeats = eligible.filter(
        (definition) =>
          regular(definition) &&
          held(definition) &&
          avoided(definition) &&
          !selection.includes(definition)
      );
      selection.push(
        ...this.rollUpgradeDefinitions(
          repeats,
          cappedCount - selection.length,
          selection
        )
      );
    }
    if (full) this.fillFullOffer(selection, preferred, desired);
    if (slotted.length > 0) {
      const [first] = selection.splice(0, 1);
      const slot = this.selectionRandom().int(0, selection.length);
      selection.splice(slot, 0, first);
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

  // A card held on an earlier level-up's screen, for the offer of `level`:
  // its definition while it can still be taken (a piloting card only while
  // the trail allows it), else null. The hold is then spent either way; a
  // reroll of the screen it was held on keeps it.
  takeHeldCard(eligible, level) {
    if (!this.heldCard || this.heldCard.level === level) return null;
    const { id } = this.heldCard;
    this.heldCard = null;
    const definition = eligible.find((d) => d.id === id);
    if (!definition) return null;
    const pilot = this.pilotCardIds.includes(id);
    const fits = pilot
      ? this.trailSlotIds().includes(id)
      : !this.slotsFull() || this.getUpgradeCount(id) > 0;
    return fits ? definition : null;
  }

  // Slots full and the offer short: more trail cards the trail allows, then
  // the fallback cards (Hull Patch while hurt, Salvage Cache otherwise).
  fillFullOffer(selection, pool, count) {
    const trailIds = this.trailSlotIds();
    selection.push(
      ...this.rollUpgradeDefinitions(
        pool.filter(
          (definition) =>
            trailIds.includes(definition.id) && !selection.includes(definition)
        ),
        count - selection.length,
        selection
      )
    );
    const hurt = this.isHullHurt();
    const fallbacks = this.upgradeDefinitions
      .filter((definition) => definition.fallback)
      .sort((a, b) =>
        (a.id === 'hull_patch') === hurt
          ? -1
          : (b.id === 'hull_patch') === hurt
            ? 1
            : 0
      );
    fallbacks.forEach((definition) => {
      if (selection.length < count) selection.push(definition);
    });
  }

  isHullHurt() {
    const stats = this.playerService?.getStats?.();
    return Boolean(stats) && stats.health < stats.maxHealth;
  }

  // The cap is the new flight's: the old one has no piloting trail.
  slotsFull() {
    const { used, max } = this.getCardSlots();
    return this.pilotCardIds.length > 0 && used >= max;
  }

  // The run's card slots: distinct cards held (weapon cards count, the
  // piloting trail does not), in the order taken.
  getCardSlots() {
    const ids = [];
    this.appliedUpgrades.forEach((level, id) => {
      if (level > 0 && !this.pilotCardIds.includes(id)) ids.push(id);
    });
    return { used: ids.length, max: UPGRADE_CARD_SLOTS, ids };
  }

  // The trail's slot: while the Flight Computer is not held, only the steps
  // still short of the rank its way asks for (trailSteps); after it, any
  // piloting card (the owner's plan, 16/11: a trail of its own to the last
  // card).
  trailSlotIds() {
    // Once the Auto Turret is eligible and not held, the slot offers it and
    // nothing else.
    const turret = this.upgradeLookup.get('auto_aim');
    if (
      turret &&
      this.getUpgradeCount('auto_aim') === 0 &&
      this.isUpgradeSelectable(turret)
    ) {
      return ['auto_aim'];
    }
    if (this.getUpgradeCount('flight_computer') > 0) return this.pilotCardIds;
    return this.pilotCardIds.filter(
      (id) => this.getUpgradeCount(id) < (this.trailSteps.get(id) ?? 0)
    );
  }

  getEligibleUpgradeDefinitions() {
    return asArray(this.upgradeDefinitions).filter(
      (definition) =>
        !definition.fallback &&
        this.isUpgradeSelectable(definition) &&
        !this.isDeadForWeapon(definition) &&
        !this.isOutOfContract(definition)
    );
  }

  // The hangar's run contract leaves out a card not open or sealed (never
  // the piloting trail; the fallback cards are drawn apart).
  isOutOfContract({ id }) {
    return (
      !this.pilotCardIds.includes(id) &&
      ((this.openCards !== null && !this.openCards.has(id)) ||
        this.sealedCards.has(id))
    );
  }

  // The weapon the run fires: its weapon card's, else the default cannon.
  currentWeaponId() {
    const weaponCard = this.upgradeDefinitions.find(
      ({ weaponId, id }) => weaponId && this.getUpgradeCount(id) > 0
    );
    return weaponCard?.weaponId ?? DEFAULT_WEAPON_ID;
  }

  // The new flight's draw leaves out a card that does nothing for the weapon
  // in hand (never the piloting trail).
  isDeadForWeapon({ id, deadFor }) {
    return (
      this.pilotCardIds.length > 0 &&
      !this.pilotCardIds.includes(id) &&
      deadFor.includes(this.currentWeaponId())
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
    // A banished piloting card is replaced from the trail, anything else
    // from the regular draw.
    const trail = this.pilotCardIds.includes(upgradeId);
    const [replacement] = this.rollUpgradeDefinitions(
      eligible.filter(
        (definition) =>
          !offeredIds.includes(definition.id) &&
          (trail
            ? this.trailSlotIds().includes(definition.id)
            : !this.pilotCardIds.includes(definition.id) &&
              (!this.slotsFull() || this.getUpgradeCount(definition.id) > 0))
      ),
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

  // Holds an offered card for the next level-up's offer (one per screen, and
  // only beside another card to take now). Returns the options, or null when
  // not allowed.
  holdUpgrade(upgradeId) {
    const current = asArray(this.pendingUpgradeOptions);
    if (
      this.holdsLeft <= 0 ||
      this.heldCard ||
      current.length < 2 ||
      !current.some((option) => option.id === upgradeId)
    ) {
      return null;
    }

    this.heldCard = { id: upgradeId, level: this.offerLevel };
    this.holdsLeft -= 1;
    this.eventBus?.emit?.('upgrade-held', { upgradeId });
    return current;
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

    const prerequisites = collectRawPrerequisites(definition);
    const baseRequirementsMet = prerequisites.every((requirement) =>
      evaluatePrerequisite(this, requirement)
    );

    if (!baseRequirementsMet) {
      return false;
    }

    const levelRequirements = collectLevelPrerequisites(
      definition,
      currentLevel
    );

    return levelRequirements.every((requirement) =>
      evaluatePrerequisite(this, requirement)
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

  buildUpgradeOption(definition) {
    if (!definition || typeof definition !== 'object') {
      return null;
    }

    const currentLevel = this.getUpgradeCount(definition.id);
    const levels = asArray(definition.levels);
    const maxLevel = levels.length;
    const category = this.resolveUpgradeCategory(definition.category);
    // The text with the weapon in hand (a card can act differently with it).
    const text = textForWeapon(definition, this.currentWeaponId()) || {};
    const levelTexts = asArray(text.levels);
    const hasNextLevel = currentLevel < maxLevel;
    const nextLevelDefinition = hasNextLevel ? levels[currentLevel] : null;
    const nextLevelText = hasNextLevel ? levelTexts[currentLevel] || {} : null;

    const globalPrereqs = describePrerequisites(this, definition);
    const levelPrereqs = describeLevelPrerequisites(
      this,
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
    const effects = cloneEffects(levelDefinition.effects);
    const prerequisites = describePrerequisites(this, definition);

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
      familyComplete: this.isFamilyComplete(definition.family),
    });

    console.log(
      `[${systemLabel}] Applied upgrade:`,
      summary?.name || upgradeId,
      '→ level',
      newLevel
    );

    // A fallback card is spent on the pick, never held.
    if (definition.fallback) this.appliedUpgrades.delete(upgradeId);
    // The held card taken on its own screen: the hold is spent.
    if (this.heldCard?.id === upgradeId) this.heldCard = null;
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
    // The piloting trail is outside the families: it never counts.
    this.appliedUpgrades.forEach((level, upgradeId) => {
      if (this.pilotCardIds.includes(upgradeId)) return;
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

  // The build holds every card of the family (at any rank), but for a card
  // it can no longer take because one it holds excludes
  // it: the ship carries one weapon, so a family's weapon cards are shut out
  // by the weapon held from any family, and thermal has two (the owner, 13/11:
  // "a segunda arma não conta").
  isFamilyComplete(familyId) {
    if (!UPGRADE_FAMILIES[familyId]) return false;
    const cards = this.upgradeDefinitions.filter(
      (definition) => definition.family === familyId
    );
    const held = ({ id }) => this.getUpgradeCount(id) > 0;
    const shutOut = (card) =>
      this.upgradeDefinitions.some(
        (other) =>
          held(other) &&
          (other.excludes.includes(card.id) || card.excludes.includes(other.id))
      );
    return cards.every((card) => held(card) || shutOut(card));
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
