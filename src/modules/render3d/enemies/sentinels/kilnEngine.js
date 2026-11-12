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
  ring,
  hex,
} from './kit.js';

export function createKilnEngine(sk) {
  const {
    THREE,
    kit,
    recipeViews,
    panelMaterial,
    hull,
    dark,
    steel,
    soot,
    paint,
    slab,
    box,
    drum,
    merge,
  } = sk;
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

  return {
    kind: 'boss-kiln-engine',
    create: createKilnEngine,
    update: updateKilnEngine,
  };
}
