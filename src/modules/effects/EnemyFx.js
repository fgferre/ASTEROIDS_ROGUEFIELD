// src/modules/effects/EnemyFx.js
//
// The colors machine enemies share across their muzzle flashes and deaths.

import { PALETTE, withAlpha } from '../../data/constants/palette.js';

// One light per source (docs/NORTE.md §2). Machine enemies glow threat-red and
// shed matte hull chips; the boss glows violet (BOSS_FX, in BossTransitions).
// Data-file colors are ignored here on purpose: they predate the palette.
export const ENEMY_FX = Object.freeze({
  spark: PALETTE.threat,
  sparkDim: withAlpha(PALETTE.threat, 0.7),
  glow: withAlpha(PALETTE.threat, 0.45),
  chip: PALETTE.hullLit,
  smoke: withAlpha(PALETTE.rock, 0.45),
});
