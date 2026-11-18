// src/modules/render3d/travel/wakeParts.js
//
// The Wake's building kit (wake.js): hard-surface parts in authoring units
// (+x the bow, y up, z across), collected into named sets that merge into
// one mesh each (mergeStatic). Every painted part gets the hull plating's
// coordinates laid on each face in the face's own plane (u level, v up the
// slope: dirt runs down), in model units, at a random offset per part, so
// the plating never lines up like tiles from one part to the next.

import { createSeededRandom } from '../asteroidMesh.js';
import { colorOf } from '../batches.js';
import { skin, slab } from '../enemies/shapes.js';
import { mergeStatic } from '../mergeStatic.js';
import { CARGO_FACES } from './wakeSurface.js';

// Non-indexed copy, optionally mirrored across the centre plane (z → −z,
// faces turned to stay outward).
function prepare(geometry, mirror) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (!mirror) return g;
  ['position', 'normal', 'uv'].forEach((name) => {
    const attribute = g.getAttribute(name);
    if (!attribute) return;
    const { array, itemSize } = attribute;
    for (let i = 0; i < attribute.count; i += 3) {
      for (let c = 0; c < itemSize; c += 1) {
        const b = (i + 1) * itemSize + c;
        const d = (i + 2) * itemSize + c;
        [array[b], array[d]] = [array[d], array[b]];
      }
    }
    if (name !== 'uv') {
      for (let i = 0; i < attribute.count; i += 1) array[i * 3 + 2] *= -1;
    }
  });
  return g;
}

// Plating coordinates per face, in the face's own plane.
function layUv(THREE, g, scale, shift) {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const [a, b, c, n, t, s] = Array.from(
    { length: 6 },
    () => new THREE.Vector3()
  );
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(t.subVectors(a, b)).normalize();
    if (Math.abs(n.y) > 0.999) {
      t.set(1, 0, 0);
      s.set(0, 0, 1);
    } else {
      t.set(n.z, 0, -n.x).normalize();
      s.crossVectors(n, t);
    }
    [a, b, c].forEach((p, k) => {
      uv[(i + k) * 2] = p.dot(t) * scale + shift[0];
      uv[(i + k) * 2 + 1] = p.dot(s) * scale + shift[1];
    });
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * The kit: `tile` is the plating tile's size in authoring units. Parts go
 * to a set with add(set, geometry, colour, options); options: `mirror` (the
 * part and its twin across the centre plane), `smooth` (keep the geometry's
 * round normals), `shine` (a hullModel.js SHINE class), `uv: false` (the
 * geometry brings its own or needs none).
 */
export function createKit(THREE, seed, tile) {
  const random = createSeededRandom(seed);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const sets = {};
  const colors = new Map();
  const paint = (css, gain = 1) => {
    const key = `${css}:${gain}`;
    if (!colors.has(key))
      colors.set(key, colorOf(THREE, css).multiplyScalar(gain));
    return colors.get(key);
  };
  const add = (set, geometry, color, options = {}) => {
    const { mirror = false, smooth = false, shine, uv = true } = options;
    (mirror ? [false, true] : [false]).forEach((twin) => {
      const g = prepare(geometry, twin);
      if (uv) layUv(THREE, g, 1 / tile, [random(), random()]);
      (sets[set] ||= []).push({ geometry: g, color, shine, flat: !smooth });
    });
  };

  // Turns a geometry so its direction `from` points along `to` (unit).
  const turn = (g, from, to) =>
    g.applyMatrix4(
      new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(from, to)
      )
    );
  const box = (x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(
      Math.abs(x1 - x0),
      Math.abs(y1 - y0),
      Math.abs(z1 - z0)
    );
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  };
  // A flat `polygon` ([[a, b], …] in the plane through `origin` spanned by
  // the unit vectors u and v) raised `depth` along u × v.
  const prism = (origin, u, v, polygon, depth, holes = []) => {
    const loop = (points) => points.map(([a, b]) => new THREE.Vector2(a, b));
    const shape = new THREE.Shape(loop(polygon));
    holes.forEach((hole) => shape.holes.push(new THREE.Path(loop(hole))));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 1,
    });
    g.applyMatrix4(
      new THREE.Matrix4()
        .makeBasis(u, v, new THREE.Vector3().crossVectors(u, v))
        .setPosition(origin)
    );
    return g;
  };
  // A side-view outline ([[x, y], …]) from z0 to z1.
  const profile = (outline, z0, z1) =>
    prism(
      V(0, 0, Math.min(z0, z1)),
      V(1, 0, 0),
      V(0, 1, 0),
      outline,
      Math.abs(z1 - z0)
    );
  // A stern-view outline ([[z, y], …]) from x0 to x1.
  const cross = (outline, x0, x1, holes) =>
    prism(
      V(Math.max(x0, x1), 0, 0),
      V(0, 0, 1),
      V(0, 1, 0),
      outline,
      Math.abs(x1 - x0),
      holes
    );
  // A plate on the corners of a flat face (in order round it), from `lift`
  // above the face to `lift + thick`, its edges drawn in by `inset`. Above
  // is the side away from the point `away` (default: the ship's axis).
  const plate = (corners, lift, thick, inset = 0, away) => {
    const centre = corners
      .reduce((sum, p) => sum.add(p), V(0, 0, 0))
      .divideScalar(corners.length);
    const normal = new THREE.Vector3()
      .subVectors(corners[1], corners[0])
      .cross(
        new THREE.Vector3().subVectors(corners[corners.length - 1], corners[0])
      )
      .normalize();
    const from = away || V(centre.x, 0, 0);
    if (normal.dot(new THREE.Vector3().subVectors(centre, from)) < 0)
      normal.negate();
    const ring = (h) =>
      corners.map((p) => {
        const toCentre = new THREE.Vector3().subVectors(centre, p);
        const pull = Math.min(0.45, inset / Math.max(1e-6, toCentre.length()));
        return p
          .clone()
          .addScaledVector(toCentre, pull)
          .addScaledVector(normal, h);
      });
    return skin(THREE, [ring(lift), ring(lift + thick)], {
      start: 'flat',
      end: 'flat',
    });
  };
  // A rod of `sides` between two points.
  const tube = (from, to, radius, sides = 6, open = false) => {
    const axis = new THREE.Vector3().subVectors(to, from);
    const g = new THREE.CylinderGeometry(
      radius,
      radius,
      axis.length(),
      sides,
      1,
      open
    );
    turn(g, V(0, 1, 0), axis.normalize());
    g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    return g;
  };
  // A turned body: `points` ([[radius, distance], …]) round the axis from
  // `origin` along `dir`.
  const lathe = (points, sides, origin, dir) => {
    const g = new THREE.LatheGeometry(
      points.map(([r, d]) => new THREE.Vector2(r, d)),
      sides
    );
    // Faces outward whichever way the profile was listed: the first face's
    // normal against its direction from the axis.
    const pos = g.getAttribute('position');
    const index = g.index.array;
    const [a, b, c] = [0, 1, 2].map((k) =>
      new THREE.Vector3().fromBufferAttribute(pos, index[k])
    );
    const out = a.clone().add(b).add(c).setY(0);
    if (b.sub(a).cross(c.sub(a)).dot(out) < 0) {
      for (let i = 0; i < index.length; i += 3)
        [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
      g.computeVertexNormals();
    }
    turn(g, V(0, 1, 0), dir.clone().normalize());
    g.translate(origin.x, origin.y, origin.z);
    return g;
  };
  // A faceted body through rings of Vector3s.
  const body = (rings, options = {}) =>
    skin(THREE, rings, { start: 'flat', end: 'flat', ...options });
  // A cargo container, its faces mapped to the cargo texture; `turn` swaps
  // which end the side's marks read from, `short` takes half the side (a
  // half-length container).
  const crate = (x0, x1, y0, y1, z0, z1, turn = false, short = false) => {
    const from = short && random() < 0.5 ? 0.5 : 0;
    const span = short ? 0.5 : 1;
    const g = box(x0, x1, y0, y1, z0, z1).toNonIndexed();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const fit = ([u0, v0, u1, v1], s, t) => [
      u0 + 0.006 + (u1 - u0 - 0.012) * s,
      v0 + 0.006 + (v1 - v0 - 0.012) * t,
    ];
    for (let i = 0; i < pos.count; i += 1) {
      const fx = (pos.getX(i) - x0) / (x1 - x0);
      const fy = (pos.getY(i) - y0) / (y1 - y0);
      const fz = (pos.getZ(i) - z0) / (z1 - z0);
      const along = from + (turn ? 1 - fx : fx) * span;
      let at;
      if (Math.abs(nor.getZ(i)) > 0.5) at = fit(CARGO_FACES.side, along, fy);
      else if (Math.abs(nor.getX(i)) > 0.5) at = fit(CARGO_FACES.end, fz, fy);
      else at = fit(CARGO_FACES.top, along, fz);
      uv.setXY(i, at[0], at[1]);
    }
    return g;
  };
  // A light pool: a soft glow lying on a surface at `at`, facing `normal`.
  const pool = (at, normal, radius) => {
    const g = new THREE.PlaneGeometry(radius * 2, radius * 2);
    turn(g, V(0, 0, 1), normal.clone().normalize());
    g.translate(at.x, at.y, at.z);
    return g;
  };

  // A light: a small hot box standing `size` off the surface at `at`, and
  // its pool on that surface (set `<set>Pools`).
  const lamp = (set, at, normal, css, options = {}) => {
    const { size = 0.16, gain = 2.6, spill = 1.5, spillGain = 0.5 } = options;
    const n = normal.clone().normalize();
    const c = at.clone().addScaledVector(n, size / 2);
    const h = size / 2;
    add(
      set,
      box(c.x - h, c.x + h, c.y - h, c.y + h, c.z - h, c.z + h),
      paint(css, gain),
      { uv: false }
    );
    if (spill > 0) {
      add(
        `${set}Pools`,
        pool(at.clone().addScaledVector(n, 0.05), n, spill),
        paint(css, spillGain),
        { uv: false }
      );
    }
  };
  // A handrail along `points`: posts about `step` apart, a top and a middle
  // rail, `height` tall.
  const railing = (set, points, color, options = {}) => {
    const { height = 0.8, step = 1, radius = 0.035, shine } = options;
    const up = V(0, height, 0);
    for (let i = 0; i + 1 < points.length; i += 1) {
      const [p, q] = [points[i], points[i + 1]];
      const count = Math.max(1, Math.round(p.distanceTo(q) / step));
      for (let k = i ? 1 : 0; k <= count; k += 1) {
        const foot = p.clone().lerp(q, k / count);
        add(set, tube(foot, foot.clone().add(up), radius, 4, true), color, {
          shine,
        });
      }
      [1, 0.5].forEach((t) =>
        add(
          set,
          tube(
            p.clone().addScaledVector(up, t),
            q.clone().addScaledVector(up, t),
            radius,
            4,
            true
          ),
          color,
          { shine }
        )
      );
    }
  };
  // Armour plates over a flat hull facet: `at(fx, ft)` gives the facet's
  // points (0..1 along, 0..1 across), xs its cuts along and ts its cuts
  // across (an array, or a function of the column for rows that do not line
  // up); style(i, j) says each plate's { color, thick, lift, cut } or
  // { skip }; `cut` ([corner 0..3, size 0..1]) chamfers a corner. Both sides
  // of the ship.
  const armour = (set, at, xs, ts, style, gap = 0.07) => {
    for (let i = 0; i + 1 < xs.length; i += 1) {
      const rows = typeof ts === 'function' ? ts(i) : ts;
      for (let j = 0; j + 1 < rows.length; j += 1) {
        const look = style(i, j);
        if (!look || look.skip) continue;
        const [x0, x1, t0, t1] = [xs[i], xs[i + 1], rows[j], rows[j + 1]];
        const round = [
          [x0, t0],
          [x1, t0],
          [x1, t1],
          [x0, t1],
        ];
        if (look.cut) {
          const [corner, size] = look.cut;
          const [px, pt] = round[corner];
          const [ax, at0] = round[(corner + 3) % 4];
          const [bx, bt] = round[(corner + 1) % 4];
          round.splice(
            corner,
            1,
            [px + (ax - px) * size, pt + (at0 - pt) * size],
            [px + (bx - px) * size, pt + (bt - pt) * size]
          );
        }
        add(
          set,
          plate(
            round.map(([fx, ft]) => at(fx, ft)),
            look.lift || 0,
            look.thick || 0.16,
            gap
          ),
          look.color,
          { mirror: true, shine: look.shine }
        );
      }
    }
  };
  // Cuts of 0..1 into `count` uneven spans.
  const cuts = (count, jitter = 0.3) => {
    const out = [0];
    for (let i = 1; i < count; i += 1)
      out.push((i + (random() - 0.5) * jitter) / count);
    out.push(1);
    return out;
  };

  const merged = (set) => mergeStatic(THREE, sets[set] || []);
  return {
    THREE,
    V,
    random,
    paint,
    add,
    box,
    prism,
    profile,
    cross,
    plate,
    tube,
    lathe,
    body,
    slab: (outline, y0, y1, bevel) => slab(THREE, outline, y0, y1, bevel),
    crate,
    pool,
    lamp,
    railing,
    armour,
    cuts,
    merged,
    sets,
  };
}
