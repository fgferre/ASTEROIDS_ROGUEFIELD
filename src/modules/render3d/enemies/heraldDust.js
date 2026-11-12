// The Herald of Dust's view (heralds.js draws Heat and Silence): a
// hauler-surveyor side-on to the ship (local +x), long along z — three
// armoured cars on dark couplings along a front rail, the middle one raised
// under a survey house and dish, the end ones each swinging a grapple boom
// forward; one counting light on the rail per rock of the wall it raises,
// lit one by one as it winds up; a slow haze of grit round it. A recipe look
// (recipes.js) as data.

import dust from '../../../content/bosses/dust.js';
import { PALETTE } from '../../../data/constants/palette.js';
import { createSeededRandom } from '../asteroidMesh.js';
import { colorOf } from '../batches.js';
import { turned } from './shapes.js';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// the grains of the haze
const DUST_MOTES = 16;
// the cars: centre [x, z] and turn about y, the end ones swung forward so
// the train bows toward the ship; a point [x, z] in a car's own frame
const CARS = [
  [0.1, -0.68, -0.32],
  [0, 0, 0],
  [0.1, 0.68, 0.32],
];
const inCar = ([cx, cz, a], [x, z]) => {
  const [[u, v]] = turned([[x, z]], a);
  return [cx + u, cz + v];
};
const carAt = (frame, [x, y, z]) => {
  const [u, v] = inCar(frame, [x, z]);
  return [u, y, v];
};
// a car's own top-view outline, its front chamfered
const car = (front, back, half, chamfer = 0.08) => [
  [front, half - chamfer],
  [front - chamfer, half],
  [back + 0.05, half],
  [back, half - 0.05],
  [back, -half + 0.05],
  [back + 0.05, -half],
  [front - chamfer, -half],
  [front, -half + chamfer],
];
// the counting lights along the front, one per wall rock, in the car each
// falls on
const COUNT = Array.from({ length: dust.wallRocks }, (_, i) => {
  const z = -0.78 + (1.56 * i) / Math.max(1, dust.wallRocks - 1);
  const frame = CARS[Math.abs(z) < 0.34 ? 1 : z < 0 ? 0 : 2];
  return carAt(frame, [0.4, 0.07, z - frame[1]]);
});
// a grapple boom off an end car's outer side (its frame, side ±1): out,
// then forward, ending in a claw
const BOOM = [
  [-0.12, 0.24],
  [-0.04, 0.46],
  [0.52, 0.5],
  [0.6, 0.42],
  [0.5, 0.36],
  [0.06, 0.34],
  [0.02, 0.24],
];
const flip = (side) => (points) => points.map(([x, z]) => [x, side * z]);

const DUST_LOOK = Object.freeze({
  finish: 'panel',
  parts: [
    ...CARS.flatMap((frame, i) => {
      const slab = (outline, part) => ({
        shape: 'slab',
        outline: outline.map((p) => inCar(frame, p)),
        ...part,
      });
      const tall = i === 1;
      return [
        slab(car(0.4, -0.4, 0.3, 0.12), {
          bottom: -0.24,
          top: -0.04,
          material: 'trim',
        }),
        slab(car(0.34, -0.34, 0.27, 0.14), {
          bottom: -0.06,
          top: tall ? 0.22 : 0.16,
          bevel: 0.05,
        }),
        slab(car(0.16, -0.28, 0.2, 0.08), {
          bottom: tall ? 0.2 : 0.14,
          top: tall ? 0.3 : 0.24,
          bevel: 0.03,
          material: tall ? 'trim' : 'steel',
        }),
        slab(car(0.48, 0.3, 0.26, 0.06), {
          bottom: -0.16,
          top: 0.06,
          bevel: 0.025,
          material: 'trim',
        }),
        {
          shape: 'drum',
          axis: 'x',
          sides: 8,
          size: [0.05, 0.08, 0.08],
          at: carAt(frame, [-0.42, -0.02, 0]),
          rotate: [0, frame[2], 0],
          material: 'soot',
        },
      ];
    }),
    {
      shape: 'slab',
      outline: car(0.1, -0.22, 0.13),
      bottom: 0.28,
      top: 0.42,
      bevel: 0.03,
      material: 'steel',
    },
    {
      shape: 'drum',
      sides: 8,
      taper: 2.2,
      size: [0.08, 0.025, 0.08],
      at: [-0.1, 0.46, 0],
      material: 'trim',
    },
    {
      shape: 'drum',
      sides: 6,
      size: [0.025, 0.04, 0.025],
      at: [-0.1, 0.43, 0],
      material: 'soot',
    },
    ...[-0.34, 0.34].map((z) => ({
      shape: 'drum',
      axis: 'z',
      sides: 8,
      size: [0.13, 0.13, 0.12],
      at: [0.02, -0.04, z],
      rotate: [0, z * 0.45, 0],
      material: 'soot',
    })),
    ...[-1, 1].flatMap((side) => {
      const frame = CARS[side < 0 ? 0 : 2];
      const at = (x, y, z) => carAt(frame, [x, y, side * z]);
      return [
        {
          shape: 'slab',
          outline: flip(side)(BOOM).map((p) => inCar(frame, p)),
          bottom: -0.08,
          top: 0.06,
          bevel: 0.02,
          material: 'steel',
        },
        {
          shape: 'drum',
          sides: 8,
          size: [0.09, 0.08, 0.09],
          at: at(-0.04, 0, 0.3),
          material: 'trim',
        },
        ...[0.47, 0.37].map((z) => ({
          shape: 'drum',
          axis: 'x',
          sides: 4,
          taper: 0,
          size: [0.16, 0.065, 0.065],
          at: at(0.7, -0.01, z),
          rotate: [0, frame[2], 0],
          material: 'trim',
        })),
      ];
    }),
  ],
  lights: COUNT.map((at) => ({
    at,
    dir: [0.5, 1, 0],
    size: 0.065,
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

  // `telegraphRatio` counts the wall in: the rail's lights come on one by
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
