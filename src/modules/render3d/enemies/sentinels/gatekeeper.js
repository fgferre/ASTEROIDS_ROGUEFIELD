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

export function createGatekeeper(sk) {
  const {
    THREE,
    kit,
    recipeViews,
    panelMaterial,
    emitterMaterial,
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
  // The barrier's projectors: on each tower, a polished barrel looking out
  // along the barrier's line (the towers sit on it), a collar at its mouth
  // round the lens; the lens charges as the barrier warns and burns while
  // it holds. On each door's nose a ram lamp lights as the strip winds up.
  const GATE_PROJECTOR = [GATE_TOWER[0], 0.36, GATE_TOWER[1] + 0.25];
  const gateProjectors = merge(
    [1, -1].flatMap((side) => [
      {
        geometry: drum(0.075, 0.2, 8, 'z'),
        color: steel,
        position: [
          GATE_PROJECTOR[0],
          GATE_PROJECTOR[1],
          side * GATE_PROJECTOR[2],
        ],
      },
      {
        geometry: drum(0.1, 0.04, 8, 'z'),
        color: steel,
        position: [
          GATE_PROJECTOR[0],
          GATE_PROJECTOR[1],
          side * (GATE_PROJECTOR[2] + 0.1),
        ],
      },
      {
        geometry: box(0.1, 0.16, 0.08),
        color: dark,
        position: [GATE_PROJECTOR[0], GATE_PROJECTOR[1] - 0.1, side * 0.84],
      },
    ])
  );
  const GATE = SENTINEL_KINDS.gatekeeper;
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
      // the ram lamp on its nose
      const ram = lens(pivot, [0.56, 0.3, side * -0.3], 0.045);
      return { pivot, side, ram };
    });
    group.add(new THREE.Mesh(gateProjectors, emitterMaterial));
    const projectors = [1, -1].map((side) =>
      lens(
        group,
        [
          GATE_PROJECTOR[0],
          GATE_PROJECTOR[1],
          side * (GATE_PROJECTOR[2] + 0.13),
        ],
        0.085
      )
    );
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
    const barrier = kit.createTelegraph(4, 0, 2);
    barrier.width = GATE.barrier.thickness;
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
      projectors,
      glows: [
        ...lights.lights,
        ...projectors,
        ...doors.map((door) => door.ram),
        ...barrier.sparks,
      ],
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
    // the projectors charge with the barrier's warning and burn while it
    // holds; the ram lamps with the strip
    const wall = boss.barrier;
    const projector = wall
      ? lensGain(wall.phase === 'warn', progressOf(wall), wall.solid ?? 1)
      : lensGain(false, 0, 0);
    for (const glow of view.projectors) kit.setGain(glow.tone, projector);
    const strip = boss.telegraph?.type === 'lane' ? boss.telegraph : null;
    const ram = strip
      ? lensGain(!strip.charging, progressOf(strip), 1)
      : lensGain(false, 0, 0);
    for (const door of view.doors) kit.setGain(door.ram.tone, ram);
    kit.updateTelegraph(lane, boss, radius);
    kit.updateTelegraph(barrier, { telegraph: boss.barrier }, radius);
  }

  return {
    kind: 'boss-gatekeeper',
    create: createGatekeeper,
    update: updateGatekeeper,
  };
}
