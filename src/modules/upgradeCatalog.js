// src/modules/upgradeCatalog.js
//
// The cards as the progression reads them (UpgradeSystem): the content's
// cards and categories normalized into definitions, a lookup by id and a
// category map, and a level's effects copied before they are applied.

import { UPGRADE_RARITIES } from '../core/GameConstants.js';

export const asArray = (value) => (Array.isArray(value) ? value : []);

export const DEFAULT_UPGRADE_CATEGORY = {
  id: 'general',
  label: 'Technology',
  description: 'Enhancements that improve general ship capabilities.',
  icon: '✨',
  themeColor: '#3399FF',
};

export function buildUpgradeDefinitions(source) {
  return asArray(source)
    .map((entry) => normalizeUpgradeDefinition(entry))
    .filter((entry) => entry && entry.id);
}

export function normalizeUpgradeDefinition(entry) {
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

  const text = normalizeUpgradeText(entry.text, levels.length);

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

function normalizeUpgradeText(text, levelCount) {
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

export function buildUpgradeLookup(definitions) {
  return asArray(definitions).reduce((map, definition) => {
    if (definition && definition.id) {
      map.set(definition.id, definition);
    }
    return map;
  }, new Map());
}

export function buildUpgradeCategoryMap(categories) {
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

export function cloneEffects(effects) {
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
