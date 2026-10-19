// src/content/enemies/weaver.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Weaver: orbits the player without shooting and lays Tethers behind it.
// Numbers: proposta 17/10 — the owner's play decides.
const WEAVER_ORBIT_DISTANCE = 260; // proposta 17/10
const WEAVER_SPEED = 140; // proposta 17/10
export const WEAVER_LAY_INTERVAL = 4; // proposta 17/10: seconds between Tethers
export const WEAVER_MAX_TETHERS = 6; // proposta 17/10: live Tethers per Weaver
const WEAVER_HEALTH = 45; // proposta 17/10
const WEAVER_RADIUS = 13; // proposta 17/10
const WEAVER_SPIN_SPEED = 2.4; // proposta 17/10: arm rotation, rad/s

const WEAVER_CONFIG = deepFreeze({
  key: 'weaver',
  displayName: 'Weaver',
  radius: WEAVER_RADIUS,
  health: WEAVER_HEALTH,
});

const WEAVER_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'orbit',
    acceleration: 260,
    maxSpeed: WEAVER_SPEED,
    preferredDistance: WEAVER_ORBIT_DISTANCE,
  },
  collision: { shape: 'circle', radius: WEAVER_RADIUS, response: 'damage' },
  health: { base: WEAVER_HEALTH, armor: 0, scaling: 1.0 },
});

const WEAVER_REWARDS = deepFreeze({
  baseOrbs: 3, // proposta 17/10
  totalXP: 45, // proposta 17/10
  healthHeartChance: 0.02, // proposta 17/10
});

export default {
  id: 'weaver',
  order: 6,
  roles: ['minelayer'],
  config: WEAVER_CONFIG,
  components: WEAVER_COMPONENTS,
  rewards: WEAVER_REWARDS,
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'layer'],
  affixes: ['shielded', 'swift', 'volatile', 'splitter', 'warded'],
  seeded: true,
  behaviors: deepFreeze({
    'orbit-side': { stream: 'random' },
    spin: { speed: WEAVER_SPIN_SPEED },
    'lay-mines': {
      type: 'mine',
      interval: WEAVER_LAY_INTERVAL,
      max: WEAVER_MAX_TETHERS,
      glow: 0.35, // seconds the arms stay lit after laying one
      event: 'weaver-tether-laid',
    },
  }),
  // Its 3D look, drawn by hand (src/modules/render3d/enemies/machines.js).
  view: 'weaver',
  codex: {
    lore: 'It does not attack. It closes the Field around you.',
    hint: 'Orbits you and lays Tethers behind it. Kill it first.',
    glyph:
      '<circle r="12" fill="none" stroke-dasharray="3 3"/><circle r="5"/><circle class="eye" r="2"/>',
  },
  sighting: 'Weaver. It does not fire. It closes the lanes behind you.',
};
