// An enemy that is never shipped (tests/content/newEnemyRole.test.js): one
// file that takes a role the layers already ask for, a skirmisher like the
// Mote, from layer 9 on.
const HEALTH = 20;
const RADIUS = 10;
const CONTACT_DAMAGE = 8;

export default {
  id: 'gnat',
  order: 900, // fixtures sit far past real content, so new items never collide
  roles: ['skirmisher'],
  weight: 1,
  fromLayer: 9,
  config: {
    key: 'gnat',
    displayName: 'Gnat',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  },
  components: {
    movement: {
      strategy: 'tracking',
      acceleration: 300,
      maxSpeed: 220,
      targetingRange: 460,
    },
    collision: {
      shape: 'circle',
      radius: RADIUS,
      response: 'damage',
      contactDamage: CONTACT_DAMAGE,
    },
    health: { base: HEALTH, armor: 0, scaling: 1.0 },
  },
  rewards: { baseOrbs: 1, totalXP: 20, healthHeartChance: 0 },
  pool: { initial: 4, max: 20 },
  tags: ['enemy', 'hostile'],
  affixes: ['swift'],
  seeded: true,
  behaviors: { 'spawn-on-field': { margin: 100, spread: 100 } },
};
