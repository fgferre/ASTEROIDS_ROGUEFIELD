// src/modules/ui/menuStatus.js

// The strip under the main menu title: best layer, today's Daily Field best,
// Salvage, Codex and achievement counts, the difficulty and the 3D quality. Reads the services; UISystem
// redraws it whenever the menu shows or one of them changes.

import { DIFFICULTY_LABELS } from '../../data/difficulty.js';

/** 'AUTO', 'AUTO · HIGH' once Auto has picked a preset, or the pinned preset. */
export function qualityLabel(mode = 'auto', livePreset = null) {
  if (mode === 'auto' && livePreset) {
    return `AUTO · ${livePreset.toUpperCase()}`;
  }
  return String(mode).toUpperCase();
}

/** [label, value] pairs in strip order. */
export function menuStatusItems({
  records,
  hangar,
  codex,
  achievements,
  difficulty,
  quality,
  livePreset = null,
}) {
  const enemies = codex.getEntries();
  const feats = achievements.getEntries();
  const daily = difficulty.getDailyRecord().bestLayer;
  return [
    ['Best layer', String(records.bestLayer)],
    ['Daily best', daily > 0 ? String(daily) : '—'],
    ['Salvage', String(hangar.salvage)],
    [
      'Codex',
      `${enemies.filter((entry) => entry.seen).length}/${enemies.length}`,
    ],
    [
      'Achievements',
      `${feats.filter((entry) => entry.unlockedAt).length}/${feats.length}`,
    ],
    [
      'Difficulty',
      DIFFICULTY_LABELS[difficulty.getSelectedDifficulty()].toUpperCase(),
    ],
    ['Quality', qualityLabel(quality, livePreset)],
  ];
}

export function menuStatusMarkup(items) {
  return items
    .map(
      ([label, value]) =>
        `<span class="menu-status__item">${label} <span class="menu-status__value">${value}</span></span>`
    )
    .join('');
}
