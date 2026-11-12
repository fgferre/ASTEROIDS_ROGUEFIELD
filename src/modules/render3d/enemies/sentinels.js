// Sentinel views (the bosses that end a sector), one per kind: a body of
// chamfered slabs and drums merged into one mesh (mergeStatic) under the
// panelled hull material, its moving pieces as their own meshes on pivots,
// and what lights up. The Wardens' views are in wardens.js. A new Sentinel
// adds its geometry and an entry to VIEWS; its view kind is `boss-<id>`
// (enemyMirror.kindOf).
//
// Quarry Maw: a mining machine in chamfered slabs of riveted panel (the baked
// hull maps), dark below and lit above: a wide chassis with ribbed skirts, a
// hopper with its grille, twin exhaust blocks, and two bucket jaws hinged on
// shoulder drums, their toothed roofs zipped shut over a crucible. Matte all
// over; the crucible under the grinder rolls glows only when the jaws open
// (boss.jawOpen), the rest are small status lights.

import { PALETTE } from '../../../data/constants/palette.js';
import { SENTINEL_KINDS } from '../../../data/enemies/boss.js';
import { bakeHullMaps } from '../bakedMaps.js';
import { colorOf } from '../batches.js';
import { mergeStatic } from '../mergeStatic.js';
import { addRimLight } from '../rimLight.js';

/** View kinds the Sentinels draw: `boss-<kind>`. */
export const SENTINEL_VIEW_KINDS = Object.keys(SENTINEL_KINDS).map(
  (kind) => `boss-${kind}`
);

// Quarry Maw, in its radius (+X the mouth, +Y up). The jaws are drawn shut,
// about their hinges, and swing out by JAW_SWING (radians) open.
const HINGE = [0.1, 0.5];
const JAW_SWING = 0.85;
const RIM = 1.2;
// proposta 12/11: the crucible's heat, shut and open; its beat when open
// (rad/s) and how much a hit flares it.
const CORE_COLD = 0.05;
const CORE_HOT = 1.5;
const CORE_BEAT = 9;
const CORE_FLASH = 0.9;
// Panels per unit of hull (the baked maps' tiling).
const PANEL_TILE = 1.6;
const MAW_MAP_SEED = 0x51a7;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const range = (from, to, n) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
const mirrorZ = (points) => points.map(([x, z]) => [x, -z]).reverse();

// Top-view outlines ([x, z], counter-clockwise seen from above with +z down
// the page), mirrored where they span the centre line.
const half = (points) => [...points, ...mirrorZ(points)];
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

/**
 * Sentinel views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit).
 * @param {object} recipeViews - the recipe looks (recipes.js), which build
 *   each Sentinel's lights.
 */
export function createSentinelViews(kit, recipeViews) {
  const { THREE } = kit;
  const { hull, dark } = kit.tones;
  // Worn steel (teeth, rolls, rams), soot (inside the mouth) and old hazard
  // paint: matte tones in the vertex colours, like hull and dark.
  const steel = hull.clone().multiplyScalar(1.7);
  const soot = dark.clone().multiplyScalar(0.55);
  const paint = colorOf(THREE, '#7a5a1c');
  const maps = bakeHullMaps(THREE, kit.mapSeed + MAW_MAP_SEED);
  Object.values(maps).forEach((map) => map.repeat.set(PANEL_TILE, PANEL_TILE));
  // clone() drops the rim patch: add it again
  const panelMaterial = addRimLight(kit.plateMaterial.clone());
  Object.assign(panelMaterial, maps, {
    normalScale: new THREE.Vector2(0.8, 0.8),
    aoMapIntensity: 0.8,
    vertexColors: true,
  });
  panelMaterial.color.setRGB(1, 1, 1);

  // A slab: `outline` ([x, z]) from y0 up to y1, its edges chamfered by
  // `bevel`.
  function slab(outline, y0, y1, bevel = 0.025) {
    const shape = new THREE.Shape(
      outline.map(([x, z]) => new THREE.Vector2(x, z))
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: y1 - y0 - 2 * bevel,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 1,
      curveSegments: 1,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, y1 - bevel, 0);
    return geometry;
  }
  const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
  // A drum of `sides` round +Y, or lying along x or z.
  function drum(radius, length, sides, axis = 'y', taper = 1) {
    const geometry = new THREE.CylinderGeometry(
      radius * taper,
      radius,
      length,
      sides
    );
    if (axis === 'x') geometry.rotateZ(-Math.PI / 2);
    if (axis === 'z') geometry.rotateX(Math.PI / 2);
    return geometry;
  }
  function merge(parts) {
    const geometry = mergeStatic(
      THREE,
      parts.map((part) => ({ flat: true, ...part }))
    );
    geometry.setAttribute('uv2', geometry.getAttribute('uv'));
    return geometry;
  }
  const both = (part) => [
    part,
    {
      ...part,
      position: [part.position[0], part.position[1], -part.position[2]],
    },
  ];

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
    kit.scene.add(group);
    return {
      kind,
      object: group,
      jaws,
      core,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: lights.lights,
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
    kit.updateTelegraph(view.telegraph, boss, radius);
  }

  // Gatekeeper: a blockade, wider than it is long: a low chassis, a bridge
  // with a slit, a reactor astern under a grille, and two gate towers that
  // carry the doors. The doors are its shield: shut they wall off its whole
  // front (boss.shieldUp 1); recovering, they swing back along the flanks and
  // the reactor burns hot. Two telegraphs under one group (the mirror hides
  // `telegraph.group`): the strip and the barrier.
  const GATE_TOWER = [0.12, 0.66];
  const GATE_SWING = 1.25;
  const GATE_CHASSIS = half([
    [0.3, 0.44],
    [-0.1, 0.62],
    [-0.62, 0.58],
    [-0.9, 0.3],
  ]);
  const GATE_DECK = half([
    [0.22, 0.36],
    [-0.14, 0.5],
    [-0.58, 0.46],
    [-0.82, 0.24],
  ]);
  const GATE_BRIDGE = half([
    [0.16, 0.14],
    [0.04, 0.26],
    [-0.26, 0.26],
    [-0.36, 0.14],
  ]);
  // One door, shut, about its tower (the +z one): a blade from the tower
  // round the front to the centre line.
  const GATE_DOOR = [
    [-0.06, 0.2],
    [-0.06, 0.0],
    [0.14, -0.04],
    [0.34, -0.14],
    [0.38, -0.66],
    [0.54, -0.66],
    [0.52, -0.06],
    [0.36, 0.18],
    [0.12, 0.26],
  ];
  const gateHull = merge([
    { geometry: slab(GATE_CHASSIS, -0.24, 0.05, 0.04), color: dark },
    { geometry: slab(GATE_DECK, 0.03, 0.24, 0.045), color: hull },
    { geometry: slab(GATE_BRIDGE, 0.22, 0.42, 0.04), color: hull },
    // the bridge's slit and its roof plate
    { geometry: box(0.03, 0.05, 0.3), color: soot, position: [0.15, 0.33, 0] },
    {
      geometry: box(0.24, 0.02, 0.3),
      color: steel,
      position: [-0.12, 0.425, 0],
    },
    // the reactor's well astern and the grille over it
    {
      geometry: box(0.3, 0.03, 0.52),
      color: soot,
      position: [-0.6, 0.235, 0],
    },
    ...range(-0.22, 0.22, 6).map((z) => ({
      geometry: box(0.34, 0.05, 0.035),
      color: dark,
      position: [-0.6, 0.275, z],
    })),
    // drive blocks astern, a dark bore in each
    ...both({
      geometry: drum(0.12, 0.22, 8, 'x'),
      color: dark,
      position: [-0.86, 0.02, 0.3],
    }),
    ...both({
      geometry: drum(0.075, 0.04, 8, 'x'),
      color: soot,
      position: [-0.98, 0.02, 0.3],
    }),
    // the gate towers: a drum banded in old paint, a steel cap, the
    // projector's post on top
    ...both({
      geometry: drum(0.2, 0.7, 12),
      color: dark,
      position: [GATE_TOWER[0], 0.1, GATE_TOWER[1]],
    }),
    ...both({
      geometry: drum(0.215, 0.07, 12),
      color: paint,
      position: [GATE_TOWER[0], 0.34, GATE_TOWER[1]],
    }),
    ...both({
      geometry: drum(0.15, 0.06, 12),
      color: steel,
      position: [GATE_TOWER[0], 0.48, GATE_TOWER[1]],
    }),
    ...both({
      geometry: drum(0.05, 0.16, 6, 'y', 0.5),
      color: steel,
      position: [GATE_TOWER[0], 0.58, GATE_TOWER[1]],
    }),
    // braces from the towers back to the deck
    ...both({
      geometry: box(0.5, 0.07, 0.07),
      color: steel,
      position: [-0.2, 0.27, 0.56],
    }),
  ]);
  function gateDoor(side) {
    const flip = (points) => (side > 0 ? points : mirrorZ(points));
    return merge([
      { geometry: slab(flip(GATE_DOOR), -0.22, 0.4, 0.04), color: hull },
      // its dark footing, a steel lip along the top, ribs down its face
      {
        geometry: box(0.2, 0.1, 0.56),
        color: dark,
        position: [0.47, -0.2, side * -0.38],
      },
      {
        geometry: box(0.05, 0.03, 0.56),
        color: steel,
        position: [0.5, 0.41, side * -0.38],
      },
      ...range(-0.6, -0.16, 5).map((z) => ({
        geometry: box(0.05, 0.46, 0.05),
        color: dark,
        position: [0.55, 0.1, side * z],
      })),
      // hazard bars on its crown
      ...range(-0.56, -0.2, 4).map((z) => ({
        geometry: box(0.1, 0.012, 0.035),
        color: paint,
        position: [0.44, 0.405, side * z],
        rotationY: side * 0.7,
      })),
    ]);
  }
  const gateDoors = [gateDoor(1), gateDoor(-1)];
  const reactorGeometry = box(0.26, 0.03, 0.48);
  const GATE_LIGHTS = Object.freeze({
    parts: [],
    // status lights: one on each tower's post, one on the bridge
    lights: [
      { at: [0.12, 0.68, 0.66], dir: [0, 1, 0], size: 0.05 },
      { at: [0.12, 0.68, -0.66], dir: [0, 1, 0], size: 0.05 },
      { at: [-0.12, 0.44, 0], dir: [0.3, 1, 0], size: 0.04, color: 'status' },
    ],
  });

  function createGatekeeper(kind) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(gateHull, panelMaterial));
    const lights = recipeViews.lookOf(GATE_LIGHTS).create(kind);
    group.add(lights.object);
    const doors = gateDoors.map((geometry, i) => {
      const side = i ? -1 : 1;
      const pivot = new THREE.Group();
      pivot.position.set(GATE_TOWER[0], 0, side * GATE_TOWER[1]);
      pivot.add(new THREE.Mesh(geometry, panelMaterial));
      group.add(pivot);
      return { pivot, side };
    });
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#1a0e06'),
      emissive: colorOf(THREE, PALETTE.shot),
      emissiveIntensity: CORE_COLD,
      roughness: 0.6,
      metalness: 0.1,
    });
    const core = new THREE.Mesh(reactorGeometry, coreMaterial);
    core.position.set(-0.6, 0.255, 0);
    group.add(core);
    kit.scene.add(group);
    const lane = kit.createTelegraph();
    const barrier = kit.createTelegraph(4);
    const telegraphs = new THREE.Group();
    telegraphs.add(lane.group, barrier.group);
    kit.scene.add(telegraphs);
    return {
      kind,
      object: group,
      doors,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: lights.lights,
      telegraph: { group: telegraphs, lane, barrier },
      id: null,
    };
  }

  // The doors follow the shield, eased; the reactor heats as they open.
  function updateGatekeeper(view, boss, time) {
    const radius = boss.radius || 70;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = -(boss.facing ?? boss.rotation ?? 0);
    const open = 1 - clamp01(boss.shieldUp ?? 1);
    const swing = GATE_SWING * open * open * (3 - 2 * open);
    for (const { pivot, side } of view.doors) pivot.rotation.y = -side * swing;
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      open * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      boss.getHitFlash() * CORE_FLASH * (0.2 + open);
    const { group, lane, barrier } = view.telegraph;
    group.visible = true;
    kit.updateTelegraph(lane, boss, radius);
    kit.updateTelegraph(barrier, { telegraph: boss.barrier }, radius);
  }

  // Kiln Engine: a six-sided furnace (one face per wedge it burns): a dark
  // skirt with a buttress at every corner, the furnace drum with a vent on
  // every face, and a crown with a grille. Six cooling fins hinge on the
  // drum's rim and lie shut over the furnace mouth, a ring of melt round the
  // crown; venting (boss.ventOpen) they tilt up and the mouth burns hot. Two
  // telegraphs under one group: the hot wedges and the slag pools.
  const KILN = SENTINEL_KINDS['kiln-engine'];
  const KILN_FIN_AT = 0.62;
  const KILN_FIN_Y = 0.3;
  const KILN_FIN_SWING = 1.1;
  const ring = (n, radius, turn = 0) =>
    Array.from({ length: n }, (_, i) => {
      const angle = turn + (i * 2 * Math.PI) / n;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius, angle];
    });
  const hex = (radius, turn = 0) =>
    ring(6, radius, turn).map(([x, z]) => [x, z]);
  const kilnHull = merge([
    { geometry: slab(hex(0.94, Math.PI / 6), -0.28, -0.02, 0.05), color: dark },
    { geometry: drum(0.74, 0.34, 12), color: hull, position: [0, 0.11, 0] },
    // a buttress at every corner, capped in old paint
    ...ring(6, 0.8, Math.PI / 6).flatMap(([x, z, angle]) => [
      {
        geometry: box(0.2, 0.34, 0.2),
        color: dark,
        position: [x, 0.02, z],
        rotationY: -angle,
      },
      {
        geometry: box(0.21, 0.04, 0.21),
        color: paint,
        position: [x, 0.21, z],
        rotationY: -angle,
      },
    ]),
    // a dark vent on every face
    ...ring(6, 0.745).map(([x, z, angle]) => ({
      geometry: box(0.04, 0.12, 0.3),
      color: soot,
      position: [x, 0.08, z],
      rotationY: -angle,
    })),
    // the crown over the mouth and the grille across it
    { geometry: slab(hex(0.34), 0.26, 0.44, 0.04), color: hull },
    ...range(-0.16, 0.16, 4).map((z) => ({
      geometry: box(0.4, 0.03, 0.04),
      color: dark,
      position: [0, 0.45, z],
    })),
  ]);
  // One fin about its hinge on the rim, lying shut toward the crown: a
  // wedge of plate, a steel rib along it, a hazard bar by the hinge.
  const kilnFin = merge([
    {
      geometry: slab(
        [
          [0, 0.29],
          [-0.27, 0.165],
          [-0.27, -0.165],
          [0, -0.29],
        ],
        0,
        0.06,
        0.02
      ),
      color: hull,
    },
    {
      geometry: box(0.24, 0.03, 0.05),
      color: steel,
      position: [-0.14, 0.07, 0],
    },
    {
      geometry: box(0.03, 0.012, 0.4),
      color: paint,
      position: [-0.04, 0.062, 0],
    },
  ]);
  const kilnMouth = drum(0.62, 0.02, 12);
  const KILN_LIGHTS = Object.freeze({
    parts: [],
    lights: [{ at: [0, 0.2, 0.5], dir: [0, 1, 0.4], size: 0.04 }],
  });

  function createKilnEngine(kind) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(kilnHull, panelMaterial));
    const lights = recipeViews.lookOf(KILN_LIGHTS).create(kind);
    group.add(lights.object);
    const fins = Array.from({ length: 6 }, (_, i) => {
      const angle = (i * Math.PI) / 3;
      const pivot = new THREE.Group();
      pivot.position.set(
        Math.cos(angle) * KILN_FIN_AT,
        KILN_FIN_Y,
        Math.sin(angle) * KILN_FIN_AT
      );
      pivot.rotation.y = -angle;
      pivot.add(new THREE.Mesh(kilnFin, panelMaterial));
      group.add(pivot);
      return pivot;
    });
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#1a0e06'),
      emissive: colorOf(THREE, PALETTE.shot),
      emissiveIntensity: CORE_COLD,
      roughness: 0.6,
      metalness: 0.1,
    });
    const mouth = new THREE.Mesh(kilnMouth, coreMaterial);
    mouth.position.set(0, 0.285, 0);
    group.add(mouth);
    kit.scene.add(group);
    const sectors = kit.createTelegraph(0, KILN.sectors.count / 2);
    const pools = kit.createTelegraph(
      0,
      Math.max(...KILN.cycle.map((c) => c.slagShots))
    );
    const telegraphs = new THREE.Group();
    telegraphs.add(sectors.group, pools.group);
    kit.scene.add(telegraphs);
    return {
      kind,
      object: group,
      fins,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: lights.lights,
      telegraph: { group: telegraphs, sectors, pools },
      poolState: { type: 'pools', pools: [], x: 0, y: 0, timer: 0 },
      id: null,
    };
  }

  function updateKilnEngine(view, boss, time) {
    const radius = boss.radius || KILN.radius;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = -(boss.rotation ?? 0);
    const open = clamp01(boss.ventOpen ?? 0);
    const swing = KILN_FIN_SWING * open * open * (3 - 2 * open);
    for (const pivot of view.fins) pivot.rotation.z = -swing;
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      open * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      boss.getHitFlash() * CORE_FLASH * (0.2 + open);
    const { group, sectors, pools } = view.telegraph;
    group.visible = true;
    kit.updateTelegraph(sectors, { telegraph: boss.sectors }, radius);
    const state = view.poolState;
    state.pools = boss.pools ?? [];
    state.x = boss.x;
    state.y = boss.y;
    kit.updateTelegraph(
      pools,
      { telegraph: state.pools.length ? state : null },
      radius
    );
  }

  // Prism Crown: a six-sided setting (a dark foot, a collar, a steel claw at
  // every corner) holding a cut gem, and up to four mirrors placed each frame
  // from boss.mirrors: a pane of crystal in a dark frame on a foot, turned so
  // that it really reflects the core's beam into its own (its face bisects
  // the two). Spread out (boss.crownOpen) the panes go dark and the gem burns
  // hot. Its beams are one telegraph under one group.
  const CROWN = SENTINEL_KINDS['prism-crown'];
  const CROWN_MIRRORS = Math.max(...CROWN.cycle.map((c) => c.mirrors));
  const crownCore = merge([
    { geometry: slab(hex(0.68, Math.PI / 6), -0.28, -0.04, 0.05), color: dark },
    { geometry: slab(hex(0.54), -0.06, 0.12, 0.04), color: hull },
    { geometry: drum(0.34, 0.03, 12), color: soot, position: [0, 0.125, 0] },
    ...ring(6, 0.42).flatMap(([x, z, angle]) => [
      {
        geometry: box(0.09, 0.36, 0.09),
        color: steel,
        position: [x, 0.24, z],
        rotationY: -angle,
      },
      {
        geometry: box(0.16, 0.05, 0.09),
        color: steel,
        position: [x * 0.86, 0.43, z * 0.86],
        rotationY: -angle,
      },
    ]),
    // a rib down every face of the foot
    ...ring(6, 0.6, Math.PI / 6).map(([x, z, angle]) => ({
      geometry: box(0.05, 0.2, 0.2),
      color: hull,
      position: [x, -0.16, z],
      rotationY: -angle,
    })),
  ]);
  // The gem: a bipyramid, taller than wide.
  const crownGem = new THREE.OctahedronGeometry(0.3).scale(1, 1.25, 1);
  // A mirror, its face toward +x: the frame (posts, sills, a foot) and the
  // pane in it.
  const crownFrame = merge([
    ...[0.31, -0.31].map((z) => ({
      geometry: box(0.07, 0.56, 0.06),
      color: dark,
      position: [0, 0.2, z],
    })),
    { geometry: box(0.07, 0.05, 0.68), color: steel, position: [0, 0.5, 0] },
    { geometry: box(0.09, 0.06, 0.68), color: dark, position: [0, -0.06, 0] },
    { geometry: drum(0.16, 0.1, 8), color: dark, position: [0, -0.14, 0] },
  ]);
  const crownPane = box(0.03, 0.48, 0.56);
  crownPane.translate(0, 0.21, 0);
  const CROWN_LIGHTS = Object.freeze({
    parts: [],
    lights: [{ at: [0, 0.3, 0.3], dir: [0, 1, 0.4], size: 0.04 }],
  });

  function createPrismCrown(kind) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(crownCore, panelMaterial));
    const lights = recipeViews.lookOf(CROWN_LIGHTS).create(kind);
    group.add(lights.object);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#0a1a22'),
      emissive: colorOf(THREE, PALETTE.threat),
      emissiveIntensity: CORE_COLD,
      roughness: 0.3,
      metalness: 0.1,
      flatShading: true,
    });
    const gem = new THREE.Mesh(crownGem, coreMaterial);
    gem.position.set(0, 0.42, 0);
    group.add(gem);
    const mirrorMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#9fe8ff'),
      emissive: colorOf(THREE, '#9fe8ff'),
      emissiveIntensity: 0.6,
      roughness: 0.15,
      metalness: 0.4,
    });
    const mirrors = Array.from({ length: CROWN_MIRRORS }, () => {
      const mirror = new THREE.Group();
      mirror.add(
        new THREE.Mesh(crownFrame, panelMaterial),
        new THREE.Mesh(crownPane, mirrorMaterial)
      );
      group.add(mirror);
      return mirror;
    });
    kit.scene.add(group);
    const beams = kit.createTelegraph(CROWN_MIRRORS * 2);
    const telegraphs = new THREE.Group();
    telegraphs.add(beams.group);
    kit.scene.add(telegraphs);
    return {
      kind,
      object: group,
      mirrors,
      mirrorMaterial,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: lights.lights,
      telegraph: { group: telegraphs, beams },
      id: null,
    };
  }

  function updatePrismCrown(view, boss, time) {
    const radius = boss.radius || CROWN.radius;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = 0;
    view.mirrors.forEach((mesh, i) => {
      const m = boss.mirrors?.[i];
      mesh.visible = Boolean(m);
      if (!m) return;
      mesh.position.set((m.x - boss.x) / radius, 0, (m.y - boss.y) / radius);
      // its face bisects the way back to the core and the way its beam goes
      mesh.rotation.y = -Math.atan2(
        Math.sin(m.angle) - Math.sin(m.orbit),
        Math.cos(m.angle) - Math.cos(m.orbit)
      );
    });
    const open = clamp01(boss.crownOpen ?? 0);
    view.mirrorMaterial.emissiveIntensity = 0.6 * (1 - open);
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      open * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      boss.getHitFlash() * CORE_FLASH * (0.2 + open);
    view.telegraph.group.visible = true;
    kit.updateTelegraph(
      view.telegraph.beams,
      { telegraph: boss.beams },
      radius
    );
  }

  // Foundry Mother: a factory block, wider than deep: a dark chassis with a
  // conveyor rib along each long side, the deck with two assembly bays (a
  // soot-black well in a steel frame, a hatch on a hinge over each that
  // tilts open with boss.bays[i].open, a chassis growing hot inside with its
  // progress), a gantry between the bays carrying the hub the two arms turn
  // on (boss.armAngle, reaching out with boss.armReach: a boom with a claw),
  // and a stack at every corner. Hot while it vents or builds. Its arms'
  // zones are one telegraph under one group.
  const MOTHER = SENTINEL_KINDS['foundry-mother'];
  const MOTHER_BAYS = [-0.38, 0.38]; // x of each bay, in its radius
  const motherBody = merge([
    {
      geometry: slab(
        half([
          [0.86, 0.3],
          [0.72, 0.52],
          [-0.72, 0.52],
          [-0.86, 0.3],
        ]),
        -0.28,
        -0.02,
        0.05
      ),
      color: dark,
    },
    {
      geometry: slab(
        half([
          [0.76, 0.26],
          [0.64, 0.44],
          [-0.64, 0.44],
          [-0.76, 0.26],
        ]),
        -0.04,
        0.2,
        0.04
      ),
      color: hull,
    },
    // conveyor ribs along both long sides
    ...range(-0.6, 0.6, 7).flatMap((x) =>
      both({
        geometry: box(0.07, 0.16, 0.08),
        color: hull,
        position: [x, -0.14, 0.5],
      })
    ),
    // the bays: a dark well in a steel frame
    ...MOTHER_BAYS.flatMap((x) => [
      { geometry: box(0.36, 0.02, 0.36), color: soot, position: [x, 0.205, 0] },
      ...[0.19, -0.19].flatMap((d) => [
        {
          geometry: box(0.42, 0.04, 0.03),
          color: steel,
          position: [x, 0.215, d],
        },
        {
          geometry: box(0.03, 0.04, 0.36),
          color: steel,
          position: [x + d, 0.215, 0],
        },
      ]),
    ]),
    // the gantry between the bays, the hub on it banded in old paint
    { geometry: box(0.2, 0.2, 0.78), color: hull, position: [0, 0.29, 0] },
    { geometry: box(0.06, 0.03, 0.86), color: steel, position: [0, 0.4, 0] },
    { geometry: drum(0.15, 0.12, 12), color: dark, position: [0, 0.44, 0] },
    { geometry: drum(0.16, 0.035, 12), color: paint, position: [0, 0.47, 0] },
    // a stack at every corner
    ...[0.62, -0.62].flatMap((x) =>
      both({
        geometry: drum(0.065, 0.3, 8, 'y', 0.8),
        color: dark,
        position: [x, 0.32, 0.36],
      })
    ),
    ...[0.62, -0.62].flatMap((x) =>
      both({
        geometry: drum(0.07, 0.035, 8),
        color: paint,
        position: [x, 0.36, 0.36],
      })
    ),
  ]);
  // A hatch about its hinge (its edge at x 0): the plate and a hazard bar.
  const motherDoor = merge([
    { geometry: box(0.34, 0.03, 0.34), color: hull, position: [0.17, 0, 0] },
    {
      geometry: box(0.05, 0.012, 0.3),
      color: paint,
      position: [0.28, 0.02, 0],
    },
  ]);
  const motherCap = drum(0.12, 0.03, 12);
  const motherUnit = box(0.22, 0.14, 0.18);
  motherUnit.translate(0, 0.07, 0);
  // An arm from its root (x 0) to its claw (x 1): the boom, a rail on it and
  // the two fingers of the claw.
  const motherArm = merge([
    { geometry: box(1, 0.08, 0.1), color: dark, position: [0.5, 0, 0] },
    { geometry: box(0.9, 0.025, 0.04), color: steel, position: [0.5, 0.05, 0] },
    ...both({
      geometry: box(0.1, 0.12, 0.05),
      color: steel,
      position: [0.97, 0, 0.11],
    }),
    { geometry: box(0.05, 0.14, 0.28), color: dark, position: [0.9, 0, 0] },
  ]);
  const MOTHER_LIGHTS = Object.freeze({
    parts: [],
    lights: [{ at: [0, 0.36, 0], dir: [0, 1, 0], size: 0.04 }],
  });

  function createFoundryMother(kind) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(motherBody, panelMaterial));
    const lights = recipeViews.lookOf(MOTHER_LIGHTS).create(kind);
    group.add(lights.object);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#1a0e06'),
      emissive: colorOf(THREE, PALETTE.shot),
      emissiveIntensity: CORE_COLD,
      roughness: 0.6,
      metalness: 0.1,
    });
    // the hub's cap burns with the shell open, bays or vent
    const cap = new THREE.Mesh(motherCap, coreMaterial);
    cap.position.set(0, 0.5, 0);
    group.add(cap);
    // a door on its hinge over each bay, the chassis being built under it
    const doors = [];
    const units = [];
    for (const x of MOTHER_BAYS) {
      const hinge = new THREE.Group();
      hinge.position.set(x - 0.17, 0.27, 0);
      hinge.add(new THREE.Mesh(motherDoor, panelMaterial));
      const unit = new THREE.Mesh(motherUnit, coreMaterial);
      unit.position.set(x, 0.25, 0);
      group.add(hinge, unit);
      doors.push(hinge);
      units.push(unit);
    }
    const arms = [0, 1].map(() => {
      const pivot = new THREE.Group();
      const arm = new THREE.Mesh(motherArm, panelMaterial);
      arm.position.set(0.7, 0.1, 0);
      pivot.add(arm);
      group.add(pivot);
      return pivot;
    });
    kit.scene.add(group);
    const zones = kit.createTelegraph(0, 2);
    return {
      kind,
      object: group,
      doors,
      units,
      arms,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: lights.lights,
      telegraph: { group: zones.group, arms: zones },
      id: null,
    };
  }

  function updateFoundryMother(view, boss, time) {
    const radius = boss.radius || MOTHER.radius;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = 0;
    let bayHeat = 0;
    view.doors.forEach((hinge, i) => {
      const bay = boss.bays?.[i];
      const open = clamp01(bay?.open ?? 0);
      bayHeat = Math.max(bayHeat, open);
      hinge.rotation.z = 1.2 * open;
      const progress = clamp01(bay?.progress ?? 0);
      view.units[i].visible = progress > 0;
      view.units[i].scale.setScalar(Math.max(0.01, progress));
    });
    const reach = clamp01(boss.armReach ?? 0);
    const outer = MOTHER.arms.outer / radius;
    view.arms.forEach((pivot, i) => {
      pivot.rotation.y = -((boss.armAngle ?? 0) + i * Math.PI);
      pivot.children[0].scale.x = 0.3 + (outer - 1) * reach;
    });
    const heat = Math.max(clamp01(boss.ventOpen ?? 0), bayHeat);
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      heat * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      boss.getHitFlash() * CORE_FLASH * (0.2 + heat);
    kit.updateTelegraph(view.telegraph.arms, { telegraph: boss.arms }, radius);
  }

  const VIEWS = {
    'boss-quarry-maw': { create: createQuarryMaw, update: updateQuarryMaw },
    'boss-gatekeeper': { create: createGatekeeper, update: updateGatekeeper },
    'boss-kiln-engine': { create: createKilnEngine, update: updateKilnEngine },
    'boss-prism-crown': { create: createPrismCrown, update: updatePrismCrown },
    'boss-foundry-mother': {
      create: createFoundryMother,
      update: updateFoundryMother,
    },
  };

  return {
    has: (kind) => Boolean(VIEWS[kind]),
    create: (kind) => VIEWS[kind].create(kind),
    update: (view, boss, time) => VIEWS[view.kind].update(view, boss, time),
  };
}
