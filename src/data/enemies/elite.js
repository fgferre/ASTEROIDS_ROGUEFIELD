// src/data/enemies/elite.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { BOSS_KINDS } from './boss.js';

// Elite: a modifier any support enemy can roll at spawn (never asteroids or
// the Warden); the chance per layer lives in src/data/layers.js. Numbers:
// proposta 17/10 — the owner's play decides.
export const ELITE_MODIFIERS = deepFreeze({
  health: 2.5, // proposta 17/10
  radius: 1.3, // proposta 17/10
  speed: 0.9, // proposta 17/10
  contactDamage: 1.5, // proposta 17/10
  rewards: 3, // proposta 17/10: XP and orb count
  heartChanceBonus: 0.1, // proposta 17/10: added to the heart drop chance
});

// Asteroids, the Heralds and every boss kind under its factory key: Prime's is
// 'boss', any other's 'boss-<kind>' (wardenFactoryKey, types/wardens.js).
export const ELITE_EXCLUDED_TYPES = deepFreeze([
  'asteroid',
  ...Object.keys(BOSS_KINDS).map((kind) =>
    kind === 'prime' ? 'boss' : `boss-${kind}`
  ),
  'herald',
]);
