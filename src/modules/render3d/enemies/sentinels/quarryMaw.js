import { PALETTE } from '../../../../data/constants/palette.js';
import { SENTINEL_KINDS } from '../../../../data/enemies/boss.js';
import { colorOf } from '../../batches.js';
import {
  RIM,
  CORE_COLD,
  CORE_HOT,
  CORE_BEAT,
  CORE_FLASH,
  clamp01,
  range,
  mirrorZ,
  half,
  lensGain,
  progressOf,
} from './kit.js';

// Quarry Maw, in its radius (+X the mouth, +Y up). The jaws are drawn shut,
// about their hinges, and swing out by JAW_SWING (radians) open.
const HINGE = [0.1, 0.5];
const JAW_SWING = 0.85;
// proposta 13/11: the mouth's flash as a salvo leaves it (gain) and how fast
// it fades (1/s).
const SALVO_FLASH = [3, 9];

// Top-view outlines ([x, z], counter-clockwise seen from above with +z down
// the page), mirrored where they span the centre line.
const CHASSIS = half([
  [0.2, 0.3],
  [0.16, 0.6],
  [-0.16, 0.74],
  [-0.8, 0.68],
  [-1.0, 0.4],
]);
const DECK = half([
  [0.12, 0.3],
  [0.06, 0.5],
  [-0.2, 0.6],
  [-0.74, 0.55],
  [-0.92, 0.32],
]);
const HOPPER = half([
  [-0.12, 0.2],
  [-0.3, 0.34],
  [-0.66, 0.34],
  [-0.8, 0.2],
]);
const TONGUE = half([
  [0.66, 0.16],
  [0.56, 0.26],
  [0.1, 0.26],
]);
// One jaw, shut, about its hinge (the +z one; its tip reaches the centre
// line at z −0.5): the bucket, hollowed where the crucible sits, and the
// roof over it, whose inner edge is cut into teeth that mesh with the other
// jaw's.
const JAW_BUCKET = [
  [-0.14, 0.14],
  [-0.14, -0.08],
  [0.0, -0.2],
  [0.44, -0.22],
  [0.6, -0.36],
  [0.62, -0.5],
  [0.86, -0.5],
  [0.84, -0.3],
  [0.62, 0.02],
  [0.26, 0.2],
];
const TEETH = 5;
const TOOTH = 0.05;
const toothX = (i) => 0.04 + (0.74 * i) / (TEETH * 2);
const jawRoof = (side) => [
  [-0.1, 0.1],
  [-0.1, -0.1],
  [0.0, -0.3],
  ...Array.from({ length: TEETH * 2 + 1 }, (_, i) => [
    toothX(i),
    -0.5 + (i % 2 ? -1 : 1) * side * TOOTH,
  ]),
  [0.82, -0.44],
  [0.8, -0.28],
  [0.58, 0.0],
  [0.24, 0.16],
];

const MAW_LIGHTS = Object.freeze({
  parts: [
    // a scarred bumper across the back
    {
      shape: 'box',
      size: [0.05, 0.1, 0.5],
      at: [-1.02, -0.06, 0],
      color: 'neutral',
    },
  ],
  // status lights: two beacons at the stern, one on the hopper's nose
  lights: [
    { at: [-0.9, 0.3, 0.26], dir: [-0.5, 1, 0.3], size: 0.05 },
    { at: [-0.9, 0.3, -0.26], dir: [-0.5, 1, -0.3], size: 0.05 },
    { at: [-0.1, 0.5, 0], dir: [0.6, 1, 0], size: 0.04, color: 'status' },
  ],
});

export function createQuarryMaw(sk) {
  const {
    THREE,
    kit,
    recipeViews,
    panelMaterial,
    lens,
    hull,
    dark,
    steel,
    soot,
    paint,
    slab,
    box,
    drum,
    merge,
    both,
  } = sk;
  const mawHull = merge([
    { geometry: slab(CHASSIS, -0.24, 0.06, 0.04), color: dark },
    { geometry: slab(DECK, 0.04, 0.3, 0.05), color: hull },
    { geometry: slab(HOPPER, 0.28, 0.5, 0.04), color: hull },
    // the hopper's dark bin and the grille across it
    { geometry: box(0.4, 0.02, 0.4), color: soot, position: [-0.46, 0.5, 0] },
    ...range(-0.62, -0.3, 5).map((x) => ({
      geometry: box(0.035, 0.05, 0.5),
      color: dark,
      position: [x, 0.515, 0],
    })),
    // ribbed skirts along both flanks
    ...range(-0.7, -0.14, 6).flatMap((x) =>
      both({
        geometry: box(0.06, 0.2, 0.08),
        color: hull,
        position: [x, -0.08, 0.72 - 0.04 * Math.max(0, -x - 0.45) * 4],
      })
    ),
    // twin exhaust blocks astern, a dark bore in each
    ...both({
      geometry: drum(0.14, 0.26, 8, 'x'),
      color: dark,
      position: [-0.9, 0.12, 0.26],
    }),
    ...both({
      geometry: drum(0.09, 0.04, 8, 'x'),
      color: soot,
      position: [-1.04, 0.12, 0.26],
    }),
    // feed pipes from the hopper to the shoulders
    ...both({
      geometry: box(0.5, 0.06, 0.06),
      color: steel,
      position: [-0.2, 0.33, 0.42],
    }),
    // the shoulder drums that carry the jaws, banded in old paint
    ...both({
      geometry: drum(0.2, 0.62, 12),
      color: dark,
      position: [HINGE[0], 0.08, HINGE[1]],
    }),
    ...both({
      geometry: drum(0.215, 0.07, 12),
      color: paint,
      position: [HINGE[0], 0.3, HINGE[1]],
    }),
    ...both({
      geometry: drum(0.12, 0.06, 12),
      color: steel,
      position: [HINGE[0], 0.42, HINGE[1]],
    }),
    // the tongue the crucible sits on, its soot-black walls
    { geometry: slab(TONGUE, -0.24, -0.06, 0.03), color: soot },
    // the grinder: two toothed rolls across the crucible
    ...[0.24, 0.46].flatMap((x) => [
      {
        geometry: drum(0.06, 0.44, 10, 'z'),
        color: steel,
        position: [x, 0.02, 0],
      },
      ...range(-0.16, 0.16, 5).map((z) => ({
        geometry: box(0.15, 0.15, 0.03),
        color: dark,
        position: [x, 0.02, z],
      })),
    ]),
  ]);

  // One jaw about its hinge, shut (`side` 1: the +z one).
  function mawJaw(side) {
    const flip = (points) => (side > 0 ? points : mirrorZ(points));
    const teeth = range(1, TEETH * 2 - 1, TEETH).map((i) => ({
      geometry: drum(0.045, 0.07, 4, 'y', 0.4),
      color: steel,
      position: [toothX(i), 0.33, side * (-0.5 + 0.03)],
    }));
    return merge([
      { geometry: slab(flip(JAW_BUCKET), -0.2, 0.18, 0.04), color: dark },
      { geometry: slab(flip(jawRoof(side)), 0.16, 0.31, 0.035), color: hull },
      ...teeth,
      // hazard bars on the roof's outer edge
      ...[0.2, 0.36, 0.52].map((x) => ({
        geometry: box(0.09, 0.012, 0.035),
        color: paint,
        position: [x, 0.316, side * (0.1 - 0.42 * Math.max(0, x - 0.24))],
        rotationY: side * 0.6,
      })),
      // the ram's lug on its back
      {
        geometry: box(0.1, 0.1, 0.08),
        color: steel,
        position: [0.2, 0.2, side * 0.19],
      },
    ]);
  }
  const jawGeometries = [mawJaw(1), mawJaw(-1)];
  // The crucible: a bed of melt under the rolls.
  const coreGeometry = box(0.5, 0.04, 0.4);
  const ramGeometry = drum(0.035, 1, 6, 'x');
  ramGeometry.translate(0.5, 0, 0);
  // Where each ram is anchored on the deck and on its jaw's lug (jaw-local).
  const RAM_FROM = [-0.3, 0.33, 0.5];
  const RAM_TO = [0.2, 0.22, 0.19];

  function createQuarryMaw(kind) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(mawHull, panelMaterial));
    const lights = recipeViews.lookOf(MAW_LIGHTS).create(kind);
    group.add(lights.object);
    const jaws = jawGeometries.map((geometry, i) => {
      const side = i ? -1 : 1;
      const pivot = new THREE.Group();
      pivot.position.set(HINGE[0], 0, side * HINGE[1]);
      pivot.add(new THREE.Mesh(geometry, panelMaterial));
      const ram = new THREE.Mesh(ramGeometry, panelMaterial);
      ram.position.set(RAM_FROM[0], RAM_FROM[1], side * RAM_FROM[2]);
      group.add(pivot, ram);
      return { pivot, ram, side };
    });
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#1a0e06'),
      emissive: colorOf(THREE, PALETTE.shot),
      emissiveIntensity: CORE_COLD,
      roughness: 0.6,
      metalness: 0.1,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.position.set(0.36, -0.06, 0);
    group.add(core);
    // the mouth's light, just ahead of the jaws' tips: it gathers as the
    // intake warns and burns while it pulls; it charges for each salvo and
    // flashes as the rocks leave
    const mouth = lens(group, [0.98, 0.06, 0], 0.075);
    kit.scene.add(group);
    return {
      mouth,
      salvo: 0,
      flash: -Infinity,
      kind,
      object: group,
      jaws,
      core,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: [...lights.lights, mouth],
      telegraph: kit.createTelegraph(SENTINEL_KINDS['quarry-maw'].eject.max),
      id: null,
    };
  }

  // The jaws follow the fight (and the entrance): eased open about their
  // hinges, each ram stretching to its lug; the crucible heats with them.
  const lug = new THREE.Vector3();
  function updateQuarryMaw(view, boss, time) {
    const radius = boss.radius || 66;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = -(boss.facing ?? boss.rotation ?? 0);
    const open = clamp01(boss.jawOpen ?? 0);
    const swing = JAW_SWING * open * open * (3 - 2 * open);
    for (const { pivot, ram, side } of view.jaws) {
      pivot.rotation.y = -side * swing;
      lug
        .set(RAM_TO[0], RAM_TO[1], side * RAM_TO[2])
        .applyAxisAngle(pivot.up, pivot.rotation.y)
        .add(pivot.position)
        .sub(ram.position);
      ram.scale.x = lug.length();
      ram.rotation.set(
        0,
        Math.atan2(-lug.z, lug.x),
        Math.asin(lug.y / ram.scale.x),
        'YZX'
      );
    }
    const flash = boss.getHitFlash();
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      open * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      flash * CORE_FLASH * (0.2 + open);
    const t = boss.telegraph;
    if ((boss.salvo ?? 0) !== view.salvo) {
      if ((boss.salvo ?? 0) > view.salvo) view.flash = time;
      view.salvo = boss.salvo ?? 0;
    }
    const warning = t && !t.pulling && (t.type === 'intake' || t.timer > 0);
    const mouth = t
      ? lensGain(warning, progressOf(t), 1)
      : lensGain(false, 0, 0);
    kit.setGain(
      view.mouth.tone,
      mouth + SALVO_FLASH[0] * Math.exp(-SALVO_FLASH[1] * (time - view.flash))
    );
    kit.updateTelegraph(view.telegraph, boss, radius);
  }

  return {
    kind: 'boss-quarry-maw',
    create: createQuarryMaw,
    update: updateQuarryMaw,
  };
}
