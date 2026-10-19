// src/data/enemies/herald.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import dust from '../../content/bosses/dust.js';
import heat from '../../content/bosses/heat.js';
import silence from '../../content/bosses/silence.js';

// Heralds: single-phase mini-bosses on layers 3, 8 and 13 (one per biome),
// one mechanic each. Not Wardens: type 'herald' — no victory, no Warden card
// or music; a violet banner announces them (UISystem).
// Numbers: proposta 18/10 — the owner's play decides.
export const HERALD_SPAWN_AT = 15; // s into the layer
export const HERALD_SPAWN_INVULNERABILITY = 1.5; // s
export const HERALD_FIELD_MARGIN = 70; // px the Herald keeps inside the field

// The three kinds, one file each in src/content/bosses/, in this order.
export const HERALD_KINDS = deepFreeze(
  Object.fromEntries(
    [dust, heat, silence].map(({ id, order: _order, ...kind }) => [id, kind])
  )
);

export const HERALD_COMPONENTS = deepFreeze({
  // The Herald steers itself (Herald.onUpdate); 'linear' only integrates vx/vy.
  movement: { strategy: 'linear' },
  // Radius and contact damage are the kind's (Herald.initialize); so is
  // health (it sets healthInitialized).
  collision: { shape: 'circle', response: 'damage' },
  health: { armor: 0, scaling: 1.0 },
});

export const HERALD_REWARDS = deepFreeze({
  baseOrbs: 6,
  totalXP: 200,
  healthHeartChance: 0,
});
