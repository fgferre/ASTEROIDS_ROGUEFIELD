// src/data/enemies/elite.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Elite: a modifier any support enemy can roll at spawn (never asteroids or
// the Warden). Numbers: proposta 17/10 — the owner's play decides.
export const ELITE_MODIFIERS = deepFreeze({
  health: 2.5, // proposta 17/10
  radius: 1.3, // proposta 17/10
  speed: 0.9, // proposta 17/10
  contactDamage: 1.5, // proposta 17/10
  rewards: 3, // proposta 17/10: XP and orb count
  heartChanceBonus: 0.1, // proposta 17/10: added to the heart drop chance
});

// Chance a support enemy spawns elite: none before startWave, then base +
// perWave for each wave after it, capped. proposta 17/10
export const ELITE_CHANCE_BY_WAVE = deepFreeze({
  startWave: 6,
  base: 0.08,
  perWave: 0.02,
  cap: 0.3,
});

export const ELITE_EXCLUDED_TYPES = deepFreeze(['asteroid', 'boss']);

export function eliteChanceForWave(wave) {
  const { startWave, base, perWave, cap } = ELITE_CHANCE_BY_WAVE;
  if (!(wave >= startWave)) return 0;
  return Math.min(cap, base + perWave * (wave - startWave));
}
