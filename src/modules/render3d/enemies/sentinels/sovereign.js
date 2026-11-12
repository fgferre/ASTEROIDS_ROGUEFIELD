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
} from './kit.js';

// proposta 12/11: how far an open plate slides out (radii) and tilts (rad).
const PLATE_SLIDE = 0.24;
const PLATE_TILT = 0.75;

export function createSovereign(sk) {
  const { THREE, kit, panelMaterial, hull, dark, steel, slab, drum, merge } =
    sk;
  // Sovereign, a placeholder until its model is made: a dark octagonal foot,
  // a faceted core on a collar, and a ring of plates round it on their own
  // pivots, turned by boss.plateTurn. Shut (boss.plateOpen 0) the plates
  // close round the core; open they slide out and tilt up. Each plate has a
  // lit strip, the core its heat: cool (the shielded colour) under PROTECT,
  // warm (the exposed one) under REBUILD; with both orders each plate opens
  // and tints by the half it is on (boss.splitAngle). Four telegraphs under
  // one group: the wall, the cone, the lanes and the split.
  const SOV = SENTINEL_KINDS.sovereign;
  const PLATES = 8;
  const octagon = (radius) =>
    Array.from({ length: 8 }, (_, i) => {
      const angle = Math.PI / 8 + (i * Math.PI) / 4;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
  const body = merge([
    { geometry: slab(octagon(0.62), -0.3, -0.08, 0.05), color: dark },
    { geometry: drum(0.36, 0.14, 8), color: hull, position: [0, -0.02, 0] },
    { geometry: drum(0.3, 0.04, 8), color: steel, position: [0, 0.07, 0] },
  ]);
  // One plate, along +x from its pivot: a wedge of the ring, and its strip.
  const plateShape = [
    [0.5, -0.17],
    [0.92, -0.3],
    [0.98, 0],
    [0.92, 0.3],
    [0.5, 0.17],
  ];
  const plate = merge([
    { geometry: slab(plateShape, -0.05, 0.12, 0.03), color: hull },
  ]);
  const strip = new THREE.BoxGeometry(0.05, 0.02, 0.34);
  const core = new THREE.IcosahedronGeometry(0.3, 0);
  const protect = colorOf(THREE, PALETTE.status);
  const rebuild = colorOf(THREE, PALETTE.shot);
  const both = colorOf(THREE, '#fff3d6');

  function create(kind) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(body, panelMaterial));
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#14100a'),
      emissive: protect.clone(),
      emissiveIntensity: CORE_COLD,
      roughness: 0.35,
      metalness: 0.2,
      flatShading: true,
    });
    const heart = new THREE.Mesh(core, coreMaterial);
    heart.position.set(0, 0.24, 0);
    group.add(heart);
    const ring = new THREE.Group();
    const plates = Array.from({ length: PLATES }, (_, i) => {
      const pivot = new THREE.Group();
      pivot.rotation.y = -(i * Math.PI * 2) / PLATES;
      const hinge = new THREE.Group();
      hinge.add(new THREE.Mesh(plate, panelMaterial));
      const stripMaterial = new THREE.MeshBasicMaterial({
        color: protect.clone(),
        toneMapped: false,
      });
      const lit = new THREE.Mesh(strip, stripMaterial);
      lit.position.set(0.86, 0.13, 0);
      hinge.add(lit);
      pivot.add(hinge);
      ring.add(pivot);
      return { hinge, stripMaterial, angle: (i * Math.PI * 2) / PLATES };
    });
    group.add(ring);
    kit.scene.add(group);
    const wall = kit.createTelegraph(4);
    const cone = kit.createTelegraph(0);
    const lanes = kit.createTelegraph(SOV.lanes.count);
    const split = kit.createTelegraph(1, 2);
    const telegraphs = new THREE.Group();
    telegraphs.add(wall.group, cone.group, lanes.group, split.group);
    kit.scene.add(telegraphs);
    return {
      kind,
      object: group,
      heart,
      ring,
      plates,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: [],
      telegraph: { group: telegraphs, wall, cone, lanes, split },
      id: null,
    };
  }

  function update(view, boss, time) {
    const radius = boss.radius || SOV.radius;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = 0;
    const turn = boss.plateTurn ?? 0;
    view.ring.rotation.y = -turn;
    view.heart.rotation.y = time * 0.4;
    const open = clamp01(boss.plateOpen ?? 0);
    const order = boss.order ?? 'protect';
    const tint = order === 'rebuild' ? rebuild : protect;
    for (const p of view.plates) {
      // with both orders, a plate opens on the REBUILD half only
      const side = Math.sin(turn + p.angle - (boss.splitAngle ?? 0));
      const half = order === 'both' ? clamp01(0.5 + 2 * side) : 1;
      const amount = open * half;
      p.hinge.position.x = PLATE_SLIDE * amount;
      p.hinge.rotation.z = PLATE_TILT * amount;
      p.stripMaterial.color.copy(
        order === 'both' ? (half > 0.5 ? rebuild : protect) : tint
      );
    }
    view.coreMaterial.emissive.copy(order === 'both' ? both : tint);
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      open * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      boss.getHitFlash() * CORE_FLASH * (0.2 + open);
    const { wall, cone, lanes, split } = view.telegraph;
    kit.updateTelegraph(wall, { telegraph: boss.barrier }, radius);
    kit.updateTelegraph(cone, boss, radius);
    kit.updateTelegraph(lanes, { telegraph: boss.beams }, radius);
    kit.updateTelegraph(split, { telegraph: boss.split }, radius);
  }

  return { kind: 'boss-sovereign', create, update };
}
