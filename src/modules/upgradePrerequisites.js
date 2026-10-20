// src/modules/upgradePrerequisites.js
//
// A card's prerequisites (UpgradeSystem): read from its definition and its
// next level's, whether the progression meets them, and how a card face
// lists them. The progression comes first, as the Weapons instance does in
// combat/firePatterns.js.

import { asArray } from './upgradeCatalog.js';

export function collectRawPrerequisites(definition, options = {}) {
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
    const normalized = normalizePrerequisite(entry);
    if (normalized) {
      result.push(normalized);
    }
  });

  return result;
}

export function collectLevelPrerequisites(definition, levelIndex) {
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
    .map((entry) => normalizePrerequisite(entry))
    .filter(Boolean);
}

function normalizePrerequisite(prerequisite) {
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

export function evaluatePrerequisite(progression, prerequisite) {
  if (!prerequisite) {
    return true;
  }

  if (prerequisite.type === 'player-level') {
    return progression.level >= (prerequisite.level || 1);
  }

  if (prerequisite.type === 'upgrade') {
    const requiredLevel = prerequisite.level || 1;
    return progression.getUpgradeCount(prerequisite.id) >= requiredLevel;
  }

  return true;
}

function generatePrerequisiteLabel(progression, prerequisite) {
  if (!prerequisite) {
    return '';
  }

  if (prerequisite.type === 'player-level') {
    return `Pilot Level ${prerequisite.level || 1}+`;
  }

  if (prerequisite.type === 'upgrade') {
    const reference = progression.upgradeLookup?.get(prerequisite.id);
    const name = reference?.text?.name || reference?.name || prerequisite.id;
    const levelLabel =
      (prerequisite.level || 1) > 1 ? `Lvl ${prerequisite.level}` : 'Lvl 1';
    return `${name} (${levelLabel})`;
  }

  return '';
}

export function describePrerequisites(progression, definition, options = {}) {
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
      unlockEntry.text || generatePrerequisiteLabel(progression, unlockEntry);
    entries.push({
      ...unlockEntry,
      met: evaluatePrerequisite(progression, unlockEntry),
      label,
      description: label,
    });
  }

  collectRawPrerequisites(definition).forEach((entry) => {
    const label =
      entry.text && entry.text.length
        ? entry.text
        : generatePrerequisiteLabel(progression, entry);
    entries.push({
      ...entry,
      label,
      description: label,
      met: evaluatePrerequisite(progression, entry),
    });
  });

  return entries;
}

export function describeLevelPrerequisites(
  progression,
  definition,
  levelIndex
) {
  const entries = [];
  if (!definition) {
    return entries;
  }

  const levelRequirements = collectLevelPrerequisites(definition, levelIndex);

  levelRequirements.forEach((entry) => {
    const label =
      entry.text && entry.text.length
        ? entry.text
        : generatePrerequisiteLabel(progression, entry);
    entries.push({
      ...entry,
      label,
      description: label,
      met: evaluatePrerequisite(progression, entry),
    });
  });

  return entries;
}
