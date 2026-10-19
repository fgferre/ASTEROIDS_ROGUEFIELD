// An enemy that is never shipped (tests/modules/render3d/recipeViews.test.js):
// one file whose 3D look is a `visual` recipe, with no render code — a matte
// core in a dark ring, three nodes that light before it fires, turning slowly.
const HEALTH = 40;
const RADIUS = 14;
const CONTACT_DAMAGE = 10;
const TURN = (Math.PI * 2) / 3;
const around = (i, r, y) => [Math.cos(i * TURN) * r, y, Math.sin(i * TURN) * r];

export default {
  id: 'sentry',
  order: 12,
  roles: ['skirmisher'],
  fromLayer: 9,
  config: {
    key: 'sentry',
    displayName: 'Sentry',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  },
  components: {
    movement: {
      strategy: 'tracking',
      acceleration: 200,
      maxSpeed: 90,
      targetingRange: 460,
    },
    weapon: {
      pattern: 'single',
      damage: 12,
      speed: 320,
      lifetime: 2.0,
      cooldown: 1.6,
      variance: 0.2,
      spread: 0.05,
      predictive: true,
    },
    collision: {
      shape: 'circle',
      radius: RADIUS,
      response: 'damage',
      contactDamage: CONTACT_DAMAGE,
    },
    health: { base: HEALTH, armor: 0, scaling: 1.0 },
  },
  rewards: { baseOrbs: 2, totalXP: 35, healthHeartChance: 0 },
  pool: { initial: 4, max: 12 },
  tags: ['enemy', 'hostile', 'ranged'],
  affixes: ['shielded', 'swift'],
  seeded: true,
  behaviors: {
    'fork-streams': {},
    'spawn-on-field': { margin: 100, spread: 100 },
    'weapon-telegraph': { telegraph: 0.6 },
  },
  visual: {
    scale: 1,
    parts: [
      { shape: 'octahedron', size: [0.56, 0.44, 0.56] },
      { shape: 'torus', size: [0.96, 0.8, 0.96], material: 'trim' },
      ...[0, 1, 2].map((i) => ({
        shape: 'box',
        size: [0.3, 0.05, 0.06],
        at: around(i, 0.62, 0),
        rotate: [0, -i * TURN, 0],
        material: 'trim',
      })),
      {
        shape: 'cylinder',
        size: [0.2, 0.03, 0.2],
        at: [0, 0.3, 0],
        material: 'glow',
      },
    ],
    lights: [0, 1, 2].map((i) => ({
      at: around(i, 0.96, 0.08),
      size: 0.13,
      pulse: 'telegraphRatio',
    })),
    animate: { spin: [0, 0.9, 0], bob: 0.05 },
  },
};
