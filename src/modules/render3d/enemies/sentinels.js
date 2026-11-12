// Sentinel views (the bosses that end a sector), one per kind: a body built
// from `visual` recipes (recipes.js, the shape helpers every machine uses),
// its moving pieces as their own recipes on pivots, and what lights up. The
// Wardens' views are in wardens.js. A new Sentinel adds its recipes and an
// entry to VIEWS; its view kind is `boss-<id>` (enemyMirror.kindOf).
//
// Quarry Maw: a heavy, blunt mining hull (a hopper on its back, treads, twin
// stacks, a scarred bumper), two jaw plates hinged at its shoulders round a
// furnace core in a dark throat. Matte all over; the core glows hot only when
// the jaws open (boss.jawOpen), the rest are small status lights.

import { PALETTE } from '../../../data/constants/palette.js';
import { SENTINEL_KINDS } from '../../../data/enemies/boss.js';
import { colorOf } from '../batches.js';

/** View kinds the Sentinels draw: `boss-<kind>`. */
export const SENTINEL_VIEW_KINDS = Object.keys(SENTINEL_KINDS).map(
  (kind) => `boss-${kind}`
);

// Quarry Maw, in its radius: the hinges, the jaws' inward cant when shut and
// how far they swing out open (radians), the core, the outline.
const HINGE = [0.08, 0, 0.44];
const JAW_SHUT = 0.43;
const JAW_SWING = 0.8;
const CORE_AT = [0.4, 0.02, 0];
const CORE_SIZE = 0.22;
const RIM = 1.2;
// proposta 12/11: the core's heat, shut and open; its beat when open (rad/s)
// and how much a hit flares it.
const CORE_COLD = 0.1;
const CORE_HOT = 1.1;
const CORE_BEAT = 9;
const CORE_FLASH = 0.9;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const range = (from, to, n) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

const MAW_HULL = Object.freeze({
  parts: [
    // the dark lower slab, wider than the hull, and the hull plate on it
    {
      shape: 'body',
      stations: [
        [-1.0, 0.42, 0.1, 0.14],
        [-0.7, 0.64, 0.12, 0.18],
        [-0.1, 0.68, 0.12, 0.18],
        [0.25, 0.5, 0.1, 0.14],
      ],
      round: 5,
      rings: 10,
      material: 'trim',
    },
    {
      shape: 'body',
      stations: [
        [-0.95, 0.34, 0.26, 0],
        [-0.6, 0.52, 0.36, 0],
        [-0.1, 0.54, 0.34, 0],
        [0.22, 0.36, 0.2, 0],
      ],
      round: 4,
      ridge: 0.08,
      rings: 12,
      at: [0, 0.06, 0],
    },
    // the hopper on its back, ribbed across
    {
      shape: 'body',
      stations: [
        [-0.82, 0.22, 0.18, 0],
        [-0.58, 0.3, 0.26, 0],
        [-0.28, 0.28, 0.25, 0],
        [-0.06, 0.16, 0.12, 0],
      ],
      round: 6,
      rings: 10,
      at: [0, 0.36, 0],
    },
    ...range(-0.66, -0.2, 4).map((x) => ({
      shape: 'box',
      size: [0.025, 0.025, 0.25],
      at: [x, 0.63, 0],
      material: 'trim',
    })),
    // treads along both flanks, their pads in worn metal
    {
      shape: 'body',
      stations: [
        [-0.88, 0.09, 0.1, 0.1],
        [-0.1, 0.1, 0.12, 0.12],
        [0.12, 0.07, 0.08, 0.08],
      ],
      round: 6,
      rings: 8,
      at: [0, -0.1, 0.66],
      material: 'trim',
      mirror: true,
    },
    ...range(-0.8, 0.02, 6).map((x) => ({
      shape: 'box',
      size: [0.035, 0.07, 0.11],
      at: [x, -0.08, 0.68],
      mirror: true,
    })),
    // the shoulders that carry the jaws' hinges
    {
      shape: 'turned',
      profile: [
        [0, -0.16],
        [0.2, -0.16],
        [0.21, -0.06],
        [0.21, 0.16],
        [0.15, 0.22],
        [0, 0.22],
      ],
      sides: 14,
      at: HINGE,
      material: 'trim',
      mirror: true,
    },
    // the furnace's dark throat
    {
      shape: 'socket',
      dir: [1, 0, 0],
      size: 0.3,
      sides: 14,
      at: [0.28, 0.02, 0],
    },
    // twin stacks, exhausts behind, feed pipes along the flanks
    {
      shape: 'cylinder',
      size: [0.07, 0.15, 0.07],
      at: [-0.74, 0.58, 0.3],
      material: 'trim',
      mirror: true,
    },
    {
      shape: 'nozzle',
      dir: [-1, 0.1, 0],
      size: 0.12,
      at: [-0.98, 0.14, 0.26],
      mirror: true,
    },
    {
      shape: 'tube',
      points: [
        [0.0, 0.3, 0.4],
        [-0.35, 0.4, 0.44],
        [-0.72, 0.34, 0.42],
      ],
      radius: 0.035,
      sides: 6,
      material: 'trim',
      mirror: true,
    },
    // a scarred bumper across the back
    {
      shape: 'box',
      size: [0.05, 0.1, 0.38],
      at: [-1.0, 0.06, 0],
      color: 'neutral',
    },
  ],
  // status lights: two beacons by the stacks, one on the hopper's nose
  lights: [
    { at: [-0.86, 0.36, 0.17], dir: [-0.5, 1, 0.3], size: 0.05 },
    { at: [-0.86, 0.36, -0.17], dir: [-0.5, 1, -0.3], size: 0.05 },
    { at: [-0.1, 0.5, 0], dir: [0.6, 1, 0], size: 0.04, color: 'status' },
  ],
});

// One jaw about its hinge (`side` 1: the +z one), canted in when shut: a
// lofted plate on a dark under-jaw, blunt crusher teeth on its inner edge, a
// ram along its back and a cap on the hinge.
function mawJaw(side) {
  const turn = side * JAW_SHUT;
  const along = (t) => [
    t * Math.cos(JAW_SHUT),
    0,
    -side * t * Math.sin(JAW_SHUT),
  ];
  const inward = [-Math.sin(JAW_SHUT), 0, -side * Math.cos(JAW_SHUT)];
  return Object.freeze({
    parts: [
      {
        shape: 'body',
        stations: [
          [0, 0.17, 0.24, 0.12],
          [0.35, 0.2, 0.28, 0.14],
          [0.75, 0.15, 0.22, 0.12],
          [1.0, 0.07, 0.12, 0.08],
        ],
        round: 3.5,
        ridge: 0.15,
        rings: 12,
        rotate: [0, turn, 0],
      },
      {
        shape: 'body',
        stations: [
          [0.05, 0.19, 0.06, 0.22],
          [0.5, 0.21, 0.06, 0.24],
          [0.95, 0.09, 0.05, 0.1],
        ],
        round: 4,
        rings: 8,
        at: [0, -0.06, 0],
        rotate: [0, turn, 0],
        material: 'trim',
      },
      ...[0.32, 0.5, 0.68, 0.85].map((t) => {
        const [x, , z] = along(t);
        const reach = 0.19 - 0.08 * t;
        return {
          shape: 'box',
          size: [0.05, 0.09, 0.06],
          at: [x + inward[0] * reach, 0.02, z + inward[2] * reach],
          rotate: [0, turn, 0],
          color: 'neutral',
        };
      }),
      {
        shape: 'tube',
        points: [
          [0.06, 0.3, 0],
          [0.45, 0.33, 0],
          [0.72, 0.26, 0],
        ],
        radius: 0.03,
        sides: 6,
        rotate: [0, turn, 0],
        material: 'trim',
      },
      {
        shape: 'turned',
        profile: [
          [0, -0.12],
          [0.14, -0.12],
          [0.14, 0.27],
          [0.1, 0.31],
          [0, 0.31],
        ],
        sides: 12,
      },
    ],
  });
}

const MAW_JAWS = [mawJaw(1), mawJaw(-1)];

/**
 * Sentinel views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit).
 * @param {object} recipeViews - the recipe looks (recipes.js), which build
 *   each Sentinel's pieces.
 */
export function createSentinelViews(kit, recipeViews) {
  const { THREE } = kit;
  const coreGeometry = new THREE.SphereGeometry(1, 20, 14);
  const piece = (visual, kind) => recipeViews.lookOf(visual).create(kind);

  function createQuarryMaw(kind) {
    const group = new THREE.Group();
    const hull = piece(MAW_HULL, kind);
    group.add(hull.object);
    const jaws = MAW_JAWS.map((visual, i) => {
      const side = i ? -1 : 1;
      const pivot = new THREE.Group();
      pivot.position.set(HINGE[0], HINGE[1], side * HINGE[2]);
      pivot.add(piece(visual, kind).object);
      group.add(pivot);
      return { pivot, side };
    });
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#1a0e06'),
      emissive: colorOf(THREE, PALETTE.shot),
      emissiveIntensity: CORE_COLD,
      roughness: 0.5,
      metalness: 0.2,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.position.fromArray(CORE_AT);
    core.scale.setScalar(CORE_SIZE);
    group.add(core);
    kit.scene.add(group);
    return {
      kind,
      object: group,
      jaws,
      core,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: hull.lights,
      telegraph: kit.createTelegraph(SENTINEL_KINDS['quarry-maw'].eject.max),
      id: null,
    };
  }

  // The jaws follow the fight (and the entrance): eased open about their
  // hinges; the core heats with them.
  function updateQuarryMaw(view, boss, time) {
    const radius = boss.radius || 66;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = -(boss.facing ?? boss.rotation ?? 0);
    const open = clamp01(boss.jawOpen ?? 0);
    const swing = JAW_SWING * open * open * (3 - 2 * open);
    for (const jaw of view.jaws) jaw.pivot.rotation.y = -jaw.side * swing;
    const flash = boss.getHitFlash();
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      open * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      flash * CORE_FLASH * (0.2 + open);
    view.core.scale.setScalar(CORE_SIZE * (1 + 0.08 * open));
    kit.updateTelegraph(view.telegraph, boss, radius);
  }

  const VIEWS = {
    'boss-quarry-maw': { create: createQuarryMaw, update: updateQuarryMaw },
  };

  return {
    has: (kind) => Boolean(VIEWS[kind]),
    create: (kind) => VIEWS[kind].create(kind),
    update: (view, boss, time) => VIEWS[view.kind].update(view, boss, time),
  };
}
