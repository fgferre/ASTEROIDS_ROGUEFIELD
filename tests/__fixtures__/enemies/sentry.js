// An enemy that is never shipped (tests/modules/render3d/recipeViews.test.js):
// one file whose 3D look is a `visual` recipe, with no render code — a matte
// core in an armoured ring, three nodes in dark sockets that light before it
// fires, turning slowly.
const HEALTH = 40;
const RADIUS = 14;
const CONTACT_DAMAGE = 10;
const TURN = (Math.PI * 2) / 3;
const around = (i, r, y) => [Math.cos(i * TURN) * r, y, Math.sin(i * TURN) * r];

export default {
  id: 'sentry',
  order: 901, // fixtures sit far past real content, so new items never collide
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
      // the core: an armoured dome with a dark band round it, over a dark
      // waist, a rounded belly and a hover nozzle
      {
        shape: 'turned',
        profile: [
          [0.1, 0.34],
          [0.22, 0.32],
          [0.33, 0.25],
          [0.41, 0.14],
          [0.44, 0.03],
        ],
        sides: 20,
      },
      {
        shape: 'turned',
        profile: [
          [0.33, 0.27],
          [0.37, 0.24],
          [0.385, 0.2],
          [0.36, 0.2],
        ],
        sides: 20,
        material: 'trim',
      },
      {
        shape: 'turned',
        profile: [
          [0.43, 0.05],
          [0.475, 0],
          [0.43, -0.05],
        ],
        sides: 20,
        material: 'trim',
      },
      {
        shape: 'turned',
        profile: [
          [0.43, -0.03],
          [0.39, -0.13],
          [0.3, -0.21],
          [0.16, -0.26],
          [0.06, -0.27],
        ],
        sides: 20,
      },
      { shape: 'nozzle', at: [0, -0.27, 0], dir: [0, -1, 0], size: 0.14 },
      // the lens on top in its dark collar
      {
        shape: 'turned',
        profile: [
          [0.1, 0.33],
          [0.16, 0.385],
          [0.22, 0.32],
          [0.1, 0.33],
        ],
        sides: 16,
        material: 'trim',
      },
      {
        shape: 'turned',
        profile: [
          [0.01, 0.39],
          [0.07, 0.38],
          [0.12, 0.35],
        ],
        sides: 16,
        material: 'glow',
      },
      // the ring: an armour band over a dark keel band
      {
        shape: 'turned',
        profile: [
          [0.8, 0.0],
          [0.84, 0.07],
          [0.93, 0.085],
          [0.995, 0.05],
          [1.015, 0.0],
          [0.8, 0.0],
        ],
        sides: 32,
      },
      {
        shape: 'turned',
        profile: [
          [1.0, 0.005],
          [0.92, -0.065],
          [0.82, -0.05],
          [1.0, 0.005],
        ],
        sides: 32,
        material: 'trim',
      },
      // three struts, core to ring, a clamp round each node and a fin
      // under it
      ...[0, 1, 2].flatMap((i) => [
        {
          shape: 'tube',
          points: [
            around(i, 0.4, 0),
            around(i, 0.6, -0.03),
            around(i, 0.82, 0),
          ],
          radius: [0.065, 0.04],
          rings: 5,
        },
        {
          shape: 'turned',
          profile: [
            [0.02, 0.15],
            [0.07, 0.12],
            [0.1, 0],
            [0.07, -0.12],
            [0.02, -0.14],
          ],
          axis: 'x',
          sides: 8,
          size: [1, 1.1, 1.2],
          at: around(i, 0.9, 0.03),
          rotate: [0, -i * TURN, 0],
        },
        {
          shape: 'wing',
          root: 0.24,
          tip: 0.1,
          span: 0.13,
          sweep: 0.08,
          thick: 0.06,
          dihedral: -Math.PI / 2,
          under: 1,
          sides: 6,
          at: around(i, 0.9, -0.05),
          rotate: [0, -i * TURN, 0],
          material: 'trim',
        },
      ]),
    ],
    lights: [0, 1, 2].map((i) => ({
      at: around(i, 0.93, 0.12),
      dir: around(i, 0.8, 1),
      size: 0.11,
      pulse: 'telegraphRatio',
    })),
    animate: { spin: [0, 0.9, 0], bob: 0.05 },
  },
};
