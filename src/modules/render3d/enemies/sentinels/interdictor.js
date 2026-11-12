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
  hex,
  ring,
} from './kit.js';

export function createInterdictor(sk) {
  const { THREE, kit, recipeViews, panelMaterial, hull, dark, steel, slab } =
    sk;
  const { box, drum, merge, both, soot, paint } = sk;
  // Interdictor: a six-sided watch post: a dark foot with a boundary post at
  // every corner (the cage's own posts in small), a deck ribbed toward each
  // corner, two vent wells either side of the mast under flaps that open
  // with boss.ventOpen (the plates under them burn hot then), and the mast,
  // which rises with boss.mastRise and carries the emitter: a housing with a
  // long barrel and two fins, turned to boss.aimAngle, its lens hot while a
  // lock is frozen or burning. Its cage and its lock are two telegraphs
  // under one group.
  const INTERDICTOR = SENTINEL_KINDS.interdictor;
  const body = merge([
    { geometry: slab(hex(0.92, Math.PI / 6), -0.26, -0.02, 0.05), color: dark },
    { geometry: slab(hex(0.74, Math.PI / 6), -0.04, 0.14, 0.04), color: hull },
    // a boundary post at every corner, capped in old paint
    ...ring(6, 0.84, Math.PI / 6).flatMap(([x, z]) => [
      { geometry: drum(0.07, 0.34, 8), color: steel, position: [x, 0.02, z] },
      { geometry: drum(0.08, 0.04, 8), color: paint, position: [x, 0.2, z] },
    ]),
    // ribs across the deck toward the corners
    ...ring(6, 0.5, Math.PI / 6).map(([x, z, angle]) => ({
      geometry: box(0.36, 0.03, 0.05),
      color: dark,
      position: [x, 0.15, z],
      rotationY: -angle,
    })),
    // the vent wells either side of the mast, and the mast's collar
    ...both({
      geometry: box(0.44, 0.02, 0.24),
      color: soot,
      position: [0, 0.145, 0.2],
    }),
    { geometry: drum(0.14, 0.05, 10), color: dark, position: [0, 0.165, 0] },
  ]);
  const mast = merge([
    {
      geometry: drum(0.085, 0.5, 8, 'y', 0.75),
      color: hull,
      position: [0, 0.25, 0],
    },
    { geometry: drum(0.1, 0.03, 8), color: steel, position: [0, 0.16, 0] },
    { geometry: drum(0.085, 0.03, 8), color: steel, position: [0, 0.4, 0] },
  ]);
  // The emitter, its barrel toward +x.
  const head = merge([
    { geometry: box(0.3, 0.15, 0.2), color: dark },
    { geometry: box(0.12, 0.1, 0.24), color: hull, position: [-0.18, 0, 0] },
    { geometry: drum(0.05, 0.3, 8, 'x'), color: steel, position: [0.28, 0, 0] },
    { geometry: drum(0.07, 0.05, 8, 'x'), color: dark, position: [0.42, 0, 0] },
    ...both({
      geometry: box(0.22, 0.02, 0.1),
      color: steel,
      position: [0.02, 0.05, 0.14],
    }),
  ]);
  const flap = merge([
    { geometry: box(0.44, 0.03, 0.24), color: hull, position: [0, 0, 0.12] },
    {
      geometry: box(0.36, 0.012, 0.03),
      color: paint,
      position: [0, 0.02, 0.2],
    },
  ]);
  const hotPlate = box(0.4, 0.015, 0.2);
  const LIGHTS = Object.freeze({
    parts: [],
    lights: [{ at: [0, 0.2, 0], dir: [0, 1, 0], size: 0.04 }],
  });

  function create(kind) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(body, panelMaterial));
    const lights = recipeViews.lookOf(LIGHTS).create(kind);
    group.add(lights.object);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#1a0608'),
      emissive: colorOf(THREE, PALETTE.threat),
      emissiveIntensity: CORE_COLD,
      roughness: 0.4,
      metalness: 0.1,
    });
    const mastPivot = new THREE.Group();
    mastPivot.position.set(0, 0.14, 0);
    mastPivot.add(new THREE.Mesh(mast, panelMaterial));
    const emitter = new THREE.Group();
    emitter.position.set(0, 0.55, 0);
    emitter.add(new THREE.Mesh(head, panelMaterial));
    const eye = new THREE.Mesh(drum(0.05, 0.02, 8, 'x'), coreMaterial);
    eye.position.set(0.455, 0, 0);
    emitter.add(eye);
    mastPivot.add(emitter);
    group.add(mastPivot);
    // the hot plate in each vent well, under its flap
    for (const side of [1, -1]) {
      const plate = new THREE.Mesh(hotPlate, coreMaterial);
      plate.position.set(0, 0.158, side * 0.2);
      group.add(plate);
    }
    const flaps = [1, -1].map((side) => {
      const hinge = new THREE.Group();
      hinge.position.set(0, 0.175, side * 0.08);
      if (side < 0) hinge.rotation.y = Math.PI;
      hinge.userData.side = side;
      hinge.add(new THREE.Mesh(flap, panelMaterial));
      group.add(hinge);
      return hinge;
    });
    kit.scene.add(group);
    const grid = kit.createTelegraph(7);
    const lock = kit.createTelegraph(1);
    const telegraphs = new THREE.Group();
    telegraphs.add(grid.group, lock.group);
    kit.scene.add(telegraphs);
    return {
      kind,
      object: group,
      mastPivot,
      emitter,
      flaps,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: lights.lights,
      telegraph: { group: telegraphs, grid, lock },
      id: null,
    };
  }

  function update(view, boss, time) {
    const radius = boss.radius || INTERDICTOR.radius;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = 0;
    view.mastPivot.scale.y = Math.max(0.05, clamp01(boss.mastRise ?? 1));
    view.emitter.rotation.y = -(boss.aimAngle ?? 0);
    const vent = clamp01(boss.ventOpen ?? 0);
    view.flaps.forEach((hinge) => {
      hinge.rotation.x = -hinge.userData.side * 1.1 * vent;
    });
    const locked = ['freeze', 'burn'].includes(boss.lock?.phase) ? 1 : 0;
    const heat = Math.max(vent, locked);
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      heat * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      boss.getHitFlash() * CORE_FLASH * (0.2 + heat);
    const { grid, lock } = view.telegraph;
    kit.updateTelegraph(grid, { telegraph: boss.grid }, radius);
    kit.updateTelegraph(lock, { telegraph: boss.lock }, radius);
  }

  return { kind: 'boss-interdictor', create, update };
}
