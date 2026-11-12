// Null Boundary (wardens-reach; docs/ROTEIRO.md "Os lugares" 9): the break
// itself. The broken Ring's torn end stays where the field always shows it
// (this set keeps it); across the gap its other end faces it, and between
// them a disc of ground-up matter turns slowly in the Ring's plane.

import { mergeStatic } from '../mergeStatic.js';
import { ringMaterial } from '../ring/ringMaterial.js';
import { ringParts } from '../ring/ringParts.js';
import { RING } from '../ring/ringShape.js';
import { gradientDisc } from './kit.js';

// proposta 12/11: the gap between the two ends (Ring units of arc), the
// modules of the far end shown, and the disc (radius, turn per second).
const GAP = 520;
const FAR_END_MODULES = 18;
const DISC = { radius: 1000, spin: 0.02, rocks: 360 };

// The far end: the torn end's first modules mirrored across the middle of
// the gap (faces turned back the right way round).
function farEnd(THREE, mirror) {
  const geometry = mergeStatic(
    THREE,
    ringParts(THREE, { lod: 0, from: 0, to: FAR_END_MODULES })
  );
  const c = Math.cos(2 * mirror);
  const s = Math.sin(2 * mirror);
  ['position', 'normal'].forEach((name) => {
    const attribute = geometry.getAttribute(name);
    for (let i = 0; i < attribute.count; i += 1) {
      const x = attribute.getX(i);
      const z = attribute.getZ(i);
      attribute.setX(i, c * x + s * z);
      attribute.setZ(i, s * x - c * z);
    }
  });
  const attributes = Object.values(geometry.attributes);
  for (let i = 0; i < geometry.getAttribute('position').count; i += 3) {
    attributes.forEach((attribute) => {
      for (let k = 0; k < attribute.itemSize; k += 1) {
        const a = attribute.array[(i + 1) * attribute.itemSize + k];
        attribute.array[(i + 1) * attribute.itemSize + k] =
          attribute.array[(i + 2) * attribute.itemSize + k];
        attribute.array[(i + 2) * attribute.itemSize + k] = a;
      }
    });
  }
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildWardensReach(THREE, kit) {
  const { tone, random } = kit;
  const mirror = RING.stump + GAP / RING.radius / 2;

  // The far end, in the Ring's own material and haze.
  const { material, uniforms } = ringMaterial(THREE);
  uniforms.uHaze.value = kit.haze;
  kit.materials.set('ring', material);
  const end = new THREE.Mesh(farEnd(THREE, mirror), material);
  end.renderOrder = -10;

  // The disc in the gap: rubble thickest in two arms, and its dust.
  const rubble = kit.parts();
  const shades = [tone('#2a2724'), tone('#221f1d'), tone('#302c28')];
  for (let i = 0; i < DISC.rocks; i += 1) {
    const r = DISC.radius * (0.15 + 0.85 * Math.sqrt(random()));
    const arm =
      (i % 2) * Math.PI + (r / DISC.radius) * 2.4 + (random() - 0.5) * 1.1;
    const size = 4 + random() ** 3 * 26;
    kit.put(
      rubble,
      kit.unit.rock,
      shades[i % 3],
      [
        Math.cos(arm) * r,
        (random() - 0.5) * 40 * (1 - r / DISC.radius),
        Math.sin(arm) * r,
      ],
      [size, size * (0.5 + random() * 0.5), size * (0.6 + random() * 0.6)],
      [random() * 6, random() * 6, random() * 6]
    );
  }
  for (let i = 0; i < 7; i += 1) {
    const a = random() * 6.3;
    const r = DISC.radius * (0.3 + random() * 0.6);
    kit.box(
      rubble,
      shades[2],
      [Math.cos(a) * r, 0, Math.sin(a) * r],
      [64, 18, 40],
      [random(), random() * 6, random()]
    );
  }
  const dust = kit.parts();
  kit.put(
    dust,
    gradientDisc(
      THREE,
      (r, a) => {
        const spiral = 0.55 + 0.45 * Math.cos(2 * a - r * 4.8);
        return Math.sin(Math.PI * Math.min(1, (r - 0.1) / 0.9)) * spiral * 0.5;
      },
      { rings: 10, sides: 64, hole: 0.1 }
    ),
    tone('#9c8cff', 0.9),
    [0, -6, 0],
    DISC.radius * 1.1
  );
  const disc = new THREE.Group();
  disc.add(kit.mesh(rubble), kit.mesh(dust, 'glow'));
  disc.position.set(
    Math.cos(mirror) * RING.radius,
    -20,
    Math.sin(mirror) * RING.radius
  );

  // In the Ring's frame, placed and followed the way the Ring is.
  const object = new THREE.Group();
  object.rotation.x = -RING.tilt;
  object.add(end, disc);
  return {
    layers: [{ object, anchor: RING.centre, follow: RING.follow }],
    update(time) {
      disc.rotation.y = time * DISC.spin;
    },
  };
}
