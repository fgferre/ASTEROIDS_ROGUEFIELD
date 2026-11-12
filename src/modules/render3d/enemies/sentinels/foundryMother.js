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
  half,
} from './kit.js';

export function createFoundryMother(sk) {
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
    both,
  } = sk;
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

  return {
    kind: 'boss-foundry-mother',
    create: createFoundryMother,
    update: updateFoundryMother,
  };
}
