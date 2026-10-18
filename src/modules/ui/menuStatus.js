// src/modules/ui/menuStatus.js

// The strip under the main menu title: best layer, today's Daily Field best,
// the Boss Rush best, Salvage, Codex and achievement counts, the difficulty and the 3D quality. Reads the services; MainMenu
// redraws it whenever the menu shows or one of them changes.

import { DIFFICULTY_LABELS } from '../../data/difficulty.js';
import { BOSS_RUSH_LAYERS } from '../../data/layers.js';
import { formatRunTime } from './runRecap.js';

/** 'AUTO', 'AUTO · HIGH' once Auto has picked a preset, or the pinned preset. */
export function qualityLabel(mode = 'auto', livePreset = null) {
  if (mode === 'auto' && livePreset) {
    return `AUTO · ${livePreset.toUpperCase()}`;
  }
  return String(mode).toUpperCase();
}

/** The Boss Rush best: the fastest clear, else the furthest Warden, else '—'. */
export function bossRushBest(stage = 0, time = 0) {
  if (time > 0) return formatRunTime(time);
  return stage > 0 ? `Warden ${stage}/${BOSS_RUSH_LAYERS.length}` : '—';
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
    ['Boss Rush', bossRushBest(records.bossRushStage, records.bossRushTime)],
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
