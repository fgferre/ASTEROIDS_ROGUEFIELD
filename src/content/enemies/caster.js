// src/content/enemies/caster.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Caster: artillery. Holds its range, marks where the ship is going, then lobs
// a shell there that lands on a shrinking ring.
// Numbers: proposta 18/10 — the owner's play decides.
const SPEED = 95; // proposta 18/10
const HEALTH = 55; // proposta 18/10
const RADIUS = 15; // proposta 18/10
const CONTACT_DAMAGE = 12; // proposta 18/10
// The 3D view draws the shell's blast ring and its arc from these.
export const CASTER_SHELL_RADIUS = 110; // proposta 18/10: blast radius, px
export const CASTER_SHELL_APEX = 90; // proposta 18/10: px of rise mid-flight

export default {
  id: 'caster',
  order: 8,
  config: deepFreeze({
    key: 'caster',
    displayName: 'Caster',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    // hold-range steers it; 'linear' only integrates vx/vy.
    movement: { strategy: 'linear', maxSpeed: SPEED },
    collision: {
      shape: 'circle',
      radius: RADIUS,
      response: 'damage',
      contactDamage: CONTACT_DAMAGE,
    },
    health: { base: HEALTH, armor: 0, scaling: 1.0 },
  }),
  rewards: deepFreeze({
    baseOrbs: 3, // proposta 18/10
    totalXP: 45, // proposta 18/10
    healthHeartChance: 0.02, // proposta 18/10
  }),
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'ranged', 'artillery'],
  affixes: ['shielded', 'swift', 'warded'],
  seeded: true,
  behaviors: deepFreeze({
    'hold-range': {
      min: 300, // proposta 18/10: backs off inside this
      max: 360, // proposta 18/10: closes in beyond this
      margin: 30, // proposta 18/10: never backs off-field
    },
    'lob-shell': {
      interval: 3.2, // proposta 18/10: seconds per shell
      telegraph: 0.5, // proposta 18/10: lens + ring
      lead: 0.6, // proposta 18/10: aims ahead of the ship
      flight: 1.1, // proposta 18/10: seconds in the air
      radius: CASTER_SHELL_RADIUS,
      damage: 24, // proposta 18/10
      cause: 'caster-shell',
      telegraphEvent: 'caster-telegraphed',
      fireEvent: 'caster-shell-fired',
      landEvent: 'caster-shell-landed',
    },
  }),
  codex: {
    lore: 'It once lit the beacons that marked the Ring’s lanes. It still marks them. You are standing on one.',
    hint: 'A ring marks where its shell will land. Be gone before it closes.',
    glyph:
      '<circle r="8"/><rect x="3" y="-3.5" width="11" height="7" rx="1"/><circle class="eye" cx="11" r="2"/>',
  },
  sighting:
    'Beacon keeper, awake. It marks your next position. Choose another.',
};
