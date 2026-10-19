// src/data/enemies/herald.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Heralds: single-phase mini-bosses on layers 3, 8 and 13 (one per biome),
// one mechanic each. Not Wardens: type 'herald' — no victory, no Warden card
// or music; a violet banner announces them (UISystem).
// Numbers: proposta 18/10 — the owner's play decides.
export const HERALD_SPAWN_AT = 15; // s into the layer
export const HERALD_SPAWN_INVULNERABILITY = 1.5; // s
export const HERALD_FIELD_MARGIN = 70; // px the Herald keeps inside the field

export const HERALD_KINDS = deepFreeze({
  // Outer Ring: a slow slab that raises walls of rock between itself and you.
  dust: {
    displayName: 'Herald of Dust',
    subtitle: 'The Ring’s first word',
    health: 420,
    radius: 34,
    contactDamage: 20,
    speed: 28, // px/s drift
    holdDistance: 230, // stops closing in here
    wallInterval: 7, // s
    wallWindup: 1.2, // s the slits light before the wall
    wallRocks: 5,
    wallSpacing: 30, // px between rocks
    wallDrift: 14, // px/s the wall creeps toward the ship
  },
  // Dense Core: circles you and sets the nearest rocks burning.
  heat: {
    displayName: 'Herald of Heat',
    subtitle: 'The Core remembers fire',
    health: 700,
    radius: 30,
    contactDamage: 20,
    speed: 120, // px/s max
    orbitDistance: 240,
    orbitSpeed: 0.35, // rad/s around the ship
    igniteInterval: 9, // s
    igniteWindup: 1.2, // s the seam brightens before igniting
    igniteCount: 3,
    spreadShots: 3,
    spreadArc: 0.5, // rad
    shotSpeed: 230,
    shotDamage: 12,
  },
  // Warden's Reach: blinks around you, blinds the radar, hunts with shards.
  silence: {
    displayName: 'Herald of Silence',
    subtitle: 'The Reach stops listening',
    health: 950,
    radius: 32,
    contactDamage: 20,
    speed: 40,
    holdDistance: 260,
    jamsRadar: true,
    blinkInterval: 6, // s
    blinkWindup: 0.6, // s the telegraph ring shows before the blink
    blinkDistance: 200,
    shardInterval: 3, // s
    shardSpeed: 120,
    shardTurnRate: 1.6, // rad/s the shard steers toward the ship
    shardLifetime: 5, // s
    shardDamage: 14,
  },
});

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
