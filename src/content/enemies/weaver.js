// src/content/enemies/weaver.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Weaver: orbits the player without shooting and lays Tethers behind it.
// Numbers: proposta 17/10 — the owner's play decides.
export const WEAVER_ORBIT_DISTANCE = 260; // proposta 17/10
export const WEAVER_SPEED = 140; // proposta 17/10
export const WEAVER_LAY_INTERVAL = 4; // proposta 17/10: seconds between Tethers
export const WEAVER_MAX_TETHERS = 6; // proposta 17/10: live Tethers per Weaver
export const WEAVER_HEALTH = 45; // proposta 17/10
export const WEAVER_RADIUS = 13; // proposta 17/10
export const WEAVER_SPIN_SPEED = 2.4; // proposta 17/10: arm rotation, rad/s

export const WEAVER_CONFIG = deepFreeze({
  key: 'weaver',
  displayName: 'Weaver',
  radius: WEAVER_RADIUS,
  health: WEAVER_HEALTH,
});

export const WEAVER_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'orbit',
    acceleration: 260,
    maxSpeed: WEAVER_SPEED,
    preferredDistance: WEAVER_ORBIT_DISTANCE,
  },
  collision: { shape: 'circle', radius: WEAVER_RADIUS, response: 'damage' },
  health: { base: WEAVER_HEALTH, armor: 0, scaling: 1.0 },
});

export const WEAVER_REWARDS = deepFreeze({
  baseOrbs: 3, // proposta 17/10
  totalXP: 45, // proposta 17/10
  healthHeartChance: 0.02, // proposta 17/10
});

export default {
  id: 'weaver',
  order: 6,
  config: WEAVER_CONFIG,
  components: WEAVER_COMPONENTS,
  rewards: WEAVER_REWARDS,
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'layer'],
  affixes: ['shielded', 'swift', 'volatile', 'splitter', 'warded'],
};
