// The Herald of Dust's view (heralds.js draws Heat and Silence): a wall-laying
// rig side-on to the ship (local +x), long along z — a heavy spine beam with
// a raised survey house and dish amidships and a rock hopper each side of it,
// engines behind; out in front on four struts, open space between them, a
// wide spreader bar carrying one big counting light per rock of the wall it
// raises, lit one by one as it winds up; an outrigger off each end of the
// spine swinging a jointed grapple arm forward past the bar, a two-pronged
// claw at its tip; a slow haze of grit round it. A recipe look (recipes.js) as data.

import dust from '../../../content/bosses/dust.js';
import { PALETTE } from '../../../data/constants/palette.js';
import { createSeededRandom } from '../asteroidMesh.js';
import { colorOf } from '../batches.js';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// the grains of the haze
const DUST_MOTES = 16;
// a top-view rectangle [x0..x1] × [z0..z1], its corners cut by `chamfer`
const deck = (x0, x1, z0, z1, chamfer = 0.04) => [
  [x1, z1 - chamfer],
  [x1 - chamfer, z1],
  [x0 + chamfer, z1],
  [x0, z1 - chamfer],
  [x0, z0 + chamfer],
  [x0 + chamfer, z0],
  [x1 - chamfer, z0],
  [x1, z0 + chamfer],
];
// the spreader bar's centre line and half length, and the counting lights
// along it, one per wall rock
const BAR_X = 0.46;
const BAR_HALF = 0.8;
const COUNT = Array.from({ length: dust.wallRocks }, (_, i) => [
  BAR_X,
  0.1,
  -0.62 + (1.24 * i) / Math.max(1, dust.wallRocks - 1),
]);
// a grapple arm off the spine's end (side +1): out, then forward past the bar
const ARM = [
  [-0.3, 0.86],
  [-0.22, 1.1],
  [0.24, 1.14],
  [0.3, 1.08],
  [0.7, 1.08],
  [0.8, 1.02],
  [0.7, 0.96],
  [0.3, 0.96],
  [0.22, 0.9],
  [-0.02, 0.9],
  [-0.06, 0.86],
];
// the rocks riding in a hopper: [x, y, z offsets, size, turn]
const LOAD = [
  [-0.07, 0.2, -0.08, 0.1, 0.4],
  [0.04, 0.22, 0.07, 0.11, 1.9],
  [-0.1, 0.19, 0.1, 0.08, 2.7],
  [0.06, 0.19, -0.1, 0.08, 1.1],
];

const DUST_LOOK = Object.freeze({
  finish: 'panel',
  parts: [
    {
      shape: 'slab',
      outline: deck(-0.4, 0.02, -0.92, 0.92, 0.08),
      bottom: -0.26,
      top: -0.04,
      material: 'trim',
    },
    {
      shape: 'slab',
      outline: deck(-0.34, -0.04, -0.88, 0.88, 0.06),
      bottom: -0.06,
      top: 0.12,
      bevel: 0.04,
    },
    {
      shape: 'slab',
      outline: deck(-0.46, 0.12, -0.24, 0.24, 0.1),
      bottom: -0.2,
      top: 0.3,
      bevel: 0.05,
    },
    {
      shape: 'slab',
      outline: deck(-0.36, 0.04, -0.17, 0.17, 0.06),
      bottom: 0.28,
      top: 0.42,
      bevel: 0.03,
      material: 'steel',
    },
    {
      shape: 'box',
      size: [0.012, 0.03, 0.14],
      at: [0.125, 0.2, 0],
      material: 'soot',
    },
    {
      shape: 'drum',
      sides: 8,
      taper: 2.2,
      size: [0.09, 0.025, 0.09],
      at: [-0.2, 0.47, 0],
      material: 'trim',
    },
    {
      shape: 'drum',
      sides: 6,
      size: [0.025, 0.04, 0.025],
      at: [-0.2, 0.44, 0],
      material: 'soot',
    },
    ...[-0.56, 0.56].flatMap((z) => [
      {
        shape: 'slab',
        outline: deck(-0.4, 0.02, z - 0.2, z + 0.2, 0.05),
        bottom: 0.1,
        top: 0.22,
        bevel: 0.03,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: deck(-0.34, -0.04, z - 0.15, z + 0.15, 0.03),
        bottom: 0.1,
        top: 0.18,
        bevel: 0.01,
        material: 'soot',
      },
      ...LOAD.map(([x, y, dz, size, turn]) => ({
        shape: 'icosahedron',
        size: [size * 1.2, size * 0.8, size],
        at: [-0.19 + x, y, z + dz],
        rotate: [turn, turn * 1.7, 0.3],
        color: 'rockLit',
      })),
    ]),
    ...[-0.6, 0, 0.6].map((z) => ({
      shape: 'drum',
      axis: 'x',
      sides: 8,
      size: [0.07, 0.11, 0.11],
      at: [-0.45, -0.08, z],
      material: 'soot',
    })),
    {
      shape: 'slab',
      outline: deck(BAR_X - 0.11, BAR_X + 0.11, -BAR_HALF, BAR_HALF, 0.07),
      bottom: -0.12,
      top: 0.1,
      bevel: 0.04,
      material: 'trim',
    },
    ...[-0.66, -0.3, 0.3, 0.66].map((z) => ({
      shape: 'slab',
      outline: deck(0.0, BAR_X - 0.09, z - 0.05, z + 0.05, 0.01),
      bottom: -0.1,
      top: 0.04,
      bevel: 0.02,
      material: 'steel',
    })),
    ...[-1, 1].flatMap((side) => [
      {
        shape: 'slab',
        outline: ARM.map(([x, z]) => [x, side * z]),
        bottom: -0.14,
        top: 0.1,
        bevel: 0.04,
        material: 'steel',
      },
      {
        shape: 'drum',
        sides: 8,
        size: [0.13, 0.1, 0.13],
        at: [-0.2, 0.06, side * 0.94],
        material: 'trim',
      },
      {
        shape: 'drum',
        sides: 6,
        size: [0.1, 0.09, 0.1],
        at: [0.27, 0.06, side * 1.02],
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: deck(0.7, 0.84, side * 1.02 - 0.15, side * 1.02 + 0.15),
        bottom: -0.12,
        top: 0.08,
        bevel: 0.03,
        material: 'trim',
      },
      ...[-1, 1].map((jaw) => ({
        shape: 'drum',
        axis: 'x',
        sides: 4,
        taper: 0,
        size: [0.2, 0.09, 0.09],
        at: [1.0, -0.02, side * 1.02 + jaw * 0.13],
        rotate: [0, jaw * 0.3, 0],
        material: 'steel',
      })),
    ]),
  ],
  lights: COUNT.map((at) => ({
    at,
    dir: [0, 1, 0],
    size: 0.115,
    color: 'shot',
  })),
});

/**
 * The Dust view.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit).
 * @param {object} recipeViews - the recipe looks (recipes.js).
 */
export function createDustView(kit, recipeViews) {
  const { THREE } = kit;
  const look = recipeViews.lookOf(DUST_LOOK);

  function createDust() {
    const view = look.create('herald-dust');
    // the haze: a slow ring of dust grains, faceted and lit (they read as
    // grit from any side), half see-through; charging warms them amber,
    // never into the bloom
    const haze = new THREE.Group();
    const hazeMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.rockLit),
      emissive: colorOf(THREE, PALETTE.shot),
      emissiveIntensity: 0,
      metalness: 0.1,
      roughness: 0.9,
      flatShading: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    haze.add(
      new THREE.Mesh(
        kit.merged('herald-dust-haze', () => {
          const random = createSeededRandom(31.7);
          const grain = new THREE.IcosahedronGeometry(1, 0);
          return Array.from({ length: DUST_MOTES }, (_, i) => {
            const angle = (i / DUST_MOTES) * TAU + random() * 0.5;
            const reach = 1.0 + random() * 0.5;
            const position = [
              Math.cos(angle) * reach,
              -0.12 + random() * 0.36,
              Math.sin(angle) * reach,
            ];
            const size = 0.03 + random() * 0.045;
            return {
              geometry: grain,
              position,
              scale: [size, size * (0.6 + random() * 0.3), size * 0.85],
              rotationY: random() * TAU,
            };
          });
        }),
        hazeMaterial
      )
    );
    view.object.add(haze);
    view.accents.push(view.lights[0].tone);
    return Object.assign(view, {
      haze,
      hazeMaterial,
      rimColor: kit.rimColors.boss,
    });
  }

  // `telegraphRatio` counts the wall in: the bar's lights come on one by
  // one as it winds up, and the haze warms.
  function updateDust(view, herald, time, flash) {
    const charge = clamp01(herald.telegraphRatio || 0);
    view.object.rotation.y = -(herald.rotation || 0);
    const { lights } = view;
    for (let i = 0; i < lights.length; i += 1) {
      const lit = clamp01(charge * lights.length - i);
      kit.setGain(lights[i].tone, 0.25 + 1.6 * lit + flash * 0.6);
      lights[i].anchor.scale.setScalar(lights[i].size * (1 + 0.5 * lit));
    }
    view.haze.rotation.y = time * 0.15 + (herald.rotation || 0);
    view.hazeMaterial.opacity = 0.5 + 0.35 * charge;
    view.hazeMaterial.emissiveIntensity = 0.45 * charge;
  }

  return { createDust, updateDust };
}
