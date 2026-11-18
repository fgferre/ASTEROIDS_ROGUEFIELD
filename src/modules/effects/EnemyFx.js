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
  // proposta 17/11 (efeito/impacto, lote 4): a machine's death burns in its
  // own metal's heat (white-hot, orange), not the threat's red, and leaves
  // no ring: the threat colours stay on what still threatens.
  deathSpark: '#ffd9a0',
  deathSparkDim: '#ff8a3a',
  deathGlow: withAlpha('#ff7a2a', 0.45),
});
