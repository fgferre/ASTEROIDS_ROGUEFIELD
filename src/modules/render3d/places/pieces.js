// Pieces more than one place's set is built from (places/kit.js parts).

// The gameplay camera leans this much (cameraRig.js TILT): what sits
// `depth` under the point it aims at shows at the middle of the screen
// this much further up the field.
const LEAN = Math.tan((18 * Math.PI) / 180);

/** A layer's anchor `depth` under the view's middle, moved by (dx, dz). */
export function under(depth, dx = 0, dz = 0) {
  return [dx, -depth, dz - depth * LEAN];
}

/**
 * The Ring seen whole from far off: modules round a circle of `radius` in
 * the x-z plane over the angles [from, to] (radians, +x toward +z), `count`
 * slots over the full turn, each a deck `width` across and `thick` deep with
 * a keel under it; slots inside `gap` ([from, to]) are missing and the ones
 * at its edges hang loose. Every `lightEvery`th slot carries a dead running
 * light (dim) onto `lights`.
 */
export function ringBand(kit, parts, lights, options) {
  const {
    radius,
    count,
    width,
    thick,
    from = 0,
    to = Math.PI * 2,
    gap = null,
    tones,
    light,
    lightEvery = 7,
  } = options;
  const { random } = kit;
  const step = (Math.PI * 2) / count;
  const along = radius * step;
  for (let a = from; a < to - step * 0.5; a += step) {
    const mid = a + step / 2;
    const inGap = gap && mid > gap[0] && mid < gap[1];
    if (inGap) continue;
    const edge = gap
      ? Math.min(Math.abs(mid - gap[0]), Math.abs(mid - gap[1])) / step
      : 99;
    const loose = edge < 2.5 ? (2.5 - edge) / 2.5 : 0;
    const r = radius + loose * (random() - 0.3) * width * 1.5;
    const y = loose * (random() - 0.5) * width;
    const turn = [
      loose * (random() - 0.5) * 0.9,
      -(mid + Math.PI / 2) + loose * (random() - 0.5) * 0.6,
      loose * (random() - 0.5) * 0.9,
    ];
    const at = [Math.cos(mid) * r, y, Math.sin(mid) * r];
    const tone = tones[Math.floor(random() * tones.length)];
    kit.box(parts, tone, at, [along * 0.94, thick, width], turn);
    const keel = [Math.cos(mid) * r, y - thick * 0.9, Math.sin(mid) * r];
    kit.box(parts, tones[0], keel, [along * 0.7, thick, width * 0.45], turn);
    if (lights && light && Math.floor(mid / step) % lightEvery === 0) {
      const side = width * 0.5 * (random() < 0.5 ? -1 : 1);
      kit.box(
        lights,
        light,
        [
          Math.cos(mid) * (r + side),
          y + thick * 0.6,
          Math.sin(mid) * (r + side),
        ],
        thick * 0.8
      );
    }
  }
}

/** A small glowing point (a running light, a beacon) of `size`. */
export function lightPoint(kit, parts, color, at, size) {
  return kit.put(parts, kit.unit.octahedron, color, at, size);
}

/**
 * A crystal: a `sides`-sided prism `length` long and `radius` thick,
 * pointed at its tip, standing along +y from its foot at the origin; its
 * vertex colour runs from `foot` (k) to 1 at the tip, so it reads as lit
 * from inside toward its point.
 */
export function crystal(THREE, length, radius, sides = 6, foot = 0.25) {
  const tip = Math.min(length * 0.3, radius * 2.2);
  const body = new THREE.CylinderGeometry(
    radius * 0.9,
    radius,
    length - tip,
    sides,
    1,
    true
  ).translate(0, (length - tip) / 2, 0);
  const point = new THREE.ConeGeometry(
    radius * 0.9,
    tip,
    sides,
    1,
    true
  ).translate(0, length - tip / 2, 0);
  const geometry = mergeGeometries(THREE, [body, point]);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  // Each facet a shade of its own, so the faces read.
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    const facing = c.sub(b).cross(a.sub(b)).normalize();
    const facet = 0.35 + 0.65 * Math.abs(facing.x * 0.8 + facing.z * 0.6);
    for (let v = 0; v < 3; v += 1) {
      const k =
        (foot + (1 - foot) * (position.getY(i + v) / length) ** 1.5) * facet;
      colors.set([k, k, k], (i + v) * 3);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Non-indexed geometries (position, normal) joined into one.
function mergeGeometries(THREE, list) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const join = (name) => {
    const arrays = flat.map((g) => g.getAttribute(name).array);
    const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let o = 0;
    arrays.forEach((a) => {
      out.set(a, o);
      o += a.length;
    });
    return new THREE.BufferAttribute(out, 3);
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', join('position'));
  geometry.setAttribute('normal', join('normal'));
  return geometry;
}
