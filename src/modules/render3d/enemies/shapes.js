// The shape helpers the hand-made enemy models are built from
// (lightMachines.js, heavyMachines.js): flat profiles and splines, rings
// skinned into smooth closed parts, turned, lofted and swept bodies, blades
// and seams, the dark sockets and nozzles, part records in the kit's tones and
// outlines. Each takes the Three namespace where it builds geometry; +X is
// the nose, +Y up.

import { rimLoop } from '../rimBatch.js';

const TAU = Math.PI * 2;

// [a0, b0, a1, b1, …] as [[a0, b0], [a1, b1], …]: profiles and knots are
// written flat.
export function pairs(flat, scale = 1) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push([flat[i] * scale, flat[i + 1] * scale]);
  }
  return out;
}

/**
 * A smooth value through `flat` knots (x, value, …; x ascending): a cubic
 * through each knot with Catmull-Rom slopes, flat past the ends.
 */
export function spline(flat) {
  const knots = pairs(flat);
  const slopes = knots.map((_, i) => {
    const [x0, v0] = knots[Math.max(0, i - 1)];
    const [x1, v1] = knots[Math.min(knots.length - 1, i + 1)];
    return x1 === x0 ? 0 : (v1 - v0) / (x1 - x0);
  });
  return (x) => {
    if (x <= knots[0][0]) return knots[0][1];
    let i = 0;
    while (i < knots.length - 2 && x > knots[i + 1][0]) i += 1;
    const [x0, v0] = knots[i];
    const [x1, v1] = knots[i + 1];
    if (x >= x1) return v1;
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * v0 +
      (t3 - 2 * t2 + t) * h * slopes[i] +
      (-2 * t3 + 3 * t2) * v1 +
      (t3 - t2) * h * slopes[i + 1]
    );
  };
}

/**
 * Rings of points (Vector3s, the same count each) skinned in order, each ring
 * closed on itself (`open`: not) so normals run smooth all round. `start` and
 * `end` cap the first/last ring with a fan: 'flat' on its own vertices (a
 * crisp lip), 'smooth' on the ring's. `flip` reverses the faces; `orient`
 * flips them instead when they face inward (the enclosed volume < 0).
 */
export function skin(THREE, rings, options = {}) {
  const { start, end, open = false, flip = false, orient = true } = options;
  const n = rings[0].length;
  const spans = open ? n - 1 : n;
  const position = [];
  const index = [];
  const push = (p) => {
    position.push(p.x, p.y, p.z);
    return position.length / 3 - 1;
  };
  const face = (a, b, c) => (flip ? index.push(a, c, b) : index.push(a, b, c));
  rings.forEach((ring) => ring.forEach(push));
  for (let i = 0; i + 1 < rings.length; i += 1) {
    for (let j = 0; j < spans; j += 1) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      face(a, a + n, b);
      face(b, a + n, b + n);
    }
  }
  const cap = (ring, style, first) => {
    if (!style) return;
    let base = first ? 0 : (rings.length - 1) * n;
    if (style === 'flat') base = position.length / 3;
    if (style === 'flat') ring.forEach(push);
    const centre = new THREE.Vector3();
    ring.forEach((p) => centre.add(p));
    const c = push(centre.divideScalar(ring.length));
    for (let j = 0; j < spans; j += 1) {
      const a = base + j;
      const b = base + ((j + 1) % n);
      if (first) face(c, a, b);
      else face(c, b, a);
    }
  };
  cap(rings[0], start, true);
  cap(rings[rings.length - 1], end, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(position, 3)
  );
  geometry.setIndex(index);
  if (orient && volume(THREE, geometry) < 0) reverse(geometry);
  geometry.computeVertexNormals();
  return geometry;
}

// Signed volume the faces enclose about their centroid (> 0: they face out).
function volume(THREE, geometry) {
  const pos = geometry.getAttribute('position');
  const index = geometry.index.array;
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    c.x += pos.getX(i);
    c.y += pos.getY(i);
    c.z += pos.getZ(i);
  }
  c.divideScalar(pos.count);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i < index.length; i += 3) {
    a.fromBufferAttribute(pos, index[i]).sub(c);
    b.fromBufferAttribute(pos, index[i + 1]).sub(c);
    d.fromBufferAttribute(pos, index[i + 2]).sub(c);
    sum += a.dot(b.cross(d));
  }
  return sum;
}

function reverse(geometry) {
  const index = geometry.index.array;
  for (let i = 0; i < index.length; i += 3) {
    const t = index[i + 1];
    index[i + 1] = index[i + 2];
    index[i + 2] = t;
  }
  geometry.index.needsUpdate = true;
}

// The same part on the other side (z → −z), faces turned to stay outward.
export function mirrorZ(geometry) {
  const mirrored = geometry.clone();
  mirrored.scale(1, 1, -1);
  reverse(mirrored);
  mirrored.computeVertexNormals();
  return mirrored;
}

/**
 * Turned about Y: `profile` (r, y, … flat, × `scale`) listed top to bottom
 * along an outer wall (bottom to top along an inner one, so a cup's lip
 * turns in), over `segments` round from angle `from` (0 = +x, toward +z)
 * for `span`.
 */
export function revolve(THREE, profile, segments, options = {}) {
  const { from = 0, span = TAU, start, end, scale = 1 } = options;
  const full = span >= TAU - 1e-6;
  const count = full ? segments : segments + 1;
  const rings = pairs(profile, scale).map(([r, y]) =>
    Array.from({ length: count }, (_, j) => {
      const a = from + (span * j) / segments;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    })
  );
  return skin(THREE, rings, {
    open: !full,
    flip: true,
    orient: false,
    start,
    end,
  });
}

// A part built about +Y turned to face `dir` and moved to `at`.
export function aim(THREE, geometry, dir, at) {
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  geometry.translate(at.x, at.y, at.z);
  return geometry;
}

/**
 * A closed cross-section of `n` points, as [across, up]: half-width `w`,
 * `top` above and `bottom` below its centre; `e` squares it off (2 = an
 * ellipse), `ridge` raises a spine along the top.
 */
export function section(n, { w, top, bottom, e = 2, ridge = 0 }) {
  const points = [];
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const across = w * Math.sign(c) * Math.abs(c) ** (2 / e);
    const up = Math.sign(s) * Math.abs(s) ** (2 / e) * (s > 0 ? top : bottom);
    points.push([across, up + (s > 0 ? ridge * (1 - Math.abs(c)) ** 2 : 0)]);
  }
  return points;
}

/**
 * A body lofted along a path: `count` stations, `shape(s)` (s 0..1) gives
 * the station's centre `at` [x, y, z] and its section (see `section`); the
 * section stands upright, across the path's heading in the field plane.
 */
export function loft(THREE, count, n, shape, caps = {}) {
  const stations = Array.from({ length: count }, (_, i) =>
    shape(i / (count - 1))
  );
  const rings = stations.map((station, i) => {
    const prev = stations[Math.max(0, i - 1)].at;
    const next = stations[Math.min(count - 1, i + 1)].at;
    const dx = next[0] - prev[0];
    const dz = next[2] - prev[2];
    const len = Math.hypot(dx, dz) || 1;
    const [x, y, z] = station.at;
    return section(n, station).map(
      ([across, up]) =>
        new THREE.Vector3(
          x - (dz / len) * across,
          y + up,
          z + (dx / len) * across
        )
    );
  });
  return skin(THREE, rings, caps);
}

/**
 * A blade (wing, fin, keel) lofted span-wise: per station its leading and
 * trailing points `le`, `te` (Vector3s), `thick`ness and the `up` it is
 * thick along; a rounded leading edge, a sharp trailing one, the lower face
 * `under` × as full as the upper.
 */
export function blade(THREE, stations, n, under = 0.6) {
  const rings = stations.map(({ le, te, thick, up }) => {
    const ring = [];
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * TAU;
      const u = (1 - Math.cos(a)) / 2;
      const h = thick * 1.3 * Math.sqrt(u) * (1 - u);
      const side = Math.sin(a) >= 0 ? h : -h * under;
      ring.push(le.clone().lerp(te, u).addScaledVector(up, side));
    }
    return ring;
  });
  return skin(THREE, rings, { start: 'flat', end: 'smooth' });
}

// The point at chord fraction `u` on a blade station's upper face.
export function bladeTop(station, u) {
  const { le, te, thick, up } = station;
  const h = thick * 1.3 * Math.sqrt(u) * (1 - u);
  return le.clone().lerp(te, u).addScaledVector(up, h);
}

/** A thin raised line laid along `points` (Vector3s on a surface). */
export function seam(THREE, points, w = 0.018, h = 0.01) {
  const last = points.length - 1;
  return loft(
    THREE,
    points.length,
    6,
    (s) => {
      const p = points[Math.round(s * last)];
      const k = Math.sin(Math.PI * s) ** 0.3;
      return {
        at: [p.x, p.y, p.z],
        w: w * k + 0.002,
        top: h * k + 0.001,
        bottom: h,
      };
    },
    { start: 'smooth', end: 'smooth' }
  );
}

/**
 * A dark housing for a glow of radius `r` at `at`, open toward `dir`: a cup
 * behind the glow and a lip round it, so from the side it shows its rim and
 * a sliver of light.
 */
export function socket(THREE, at, dir, r, segments = 12) {
  const profile = [
    0.98, -0.05, 1.08, 0.3, 1.3, 0.25, 1.34, 0, 1.1, -0.62, 0.5, -1,
  ];
  return aim(
    THREE,
    revolve(THREE, profile, segments, { end: 'smooth', scale: r }),
    dir,
    at
  );
}

/** A dark exhaust bell of radius `r` at `at`, its mouth toward `dir`. */
export function nozzle(THREE, at, dir, r, segments = 12) {
  const profile = [0.55, -0.2, 0.8, 0.55, 1.08, 0.5, 1.06, -0.5];
  return aim(
    THREE,
    revolve(THREE, profile, segments, { start: 'smooth', scale: r }),
    dir,
    at
  );
}

// The matte tones a part merges in (kit.tones), as part records.
export function toned(tones) {
  return {
    hull: (geometry, rotationY = 0) => ({
      geometry,
      color: tones.hull,
      rotationY,
    }),
    dark: (geometry, rotationY = 0) => ({
      geometry,
      color: tones.dark,
      rotationY,
    }),
  };
}

// A closed outline from its right half (x, z flat, nose first, tail last),
// mirrored across the spine, at height `y`.
export function outline(THREE, right, y) {
  const half = pairs(right);
  const left = half
    .slice(1, half[half.length - 1][1] === 0 ? -1 : undefined)
    .reverse()
    .map(([x, z]) => [x, -z]);
  if (half[0][1] !== 0) left.push([half[0][0], -half[0][1]]);
  return rimLoop(
    [...half, ...left].map(([x, z]) => new THREE.Vector3(x, y, z))
  );
}

const catmull = (a, b, c, d, t) =>
  0.5 *
  (2 * b +
    (c - a) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (3 * b - a - 3 * c + d) * t * t * t);

// Rows of numbers smoothed by a Catmull-Rom spline, `steps` rows per span.
export function refine(rows, steps) {
  const out = [];
  const last = rows.length - 1;
  for (let i = 0; i < last; i += 1) {
    const [a, b, c, d] = [i - 1, i, i + 1, i + 2].map(
      (k) => rows[Math.max(0, Math.min(last, k))]
    );
    for (let s = 0; s < steps; s += 1) {
      out.push(b.map((_, n) => catmull(a[n], b[n], c[n], d[n], s / steps)));
    }
  }
  out.push(rows[last]);
  return out;
}

// A section swept along `path`: `section(i, angle)` is the [side, lift]
// offset of ring i's point at `angle` (side = across, lift = up).
export function sweep(
  THREE,
  path,
  section,
  sides,
  { closed = false, capped = false }
) {
  const up = new THREE.Vector3(0, 1, 0);
  const n = path.length;
  const position = [];
  const index = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const point = new THREE.Vector3();
  const at = (i) =>
    path[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n; i += 1) {
    tangent.subVectors(at(i + 1), at(i - 1)).normalize();
    side.crossVectors(tangent, up).normalize();
    lift.crossVectors(side, tangent);
    for (let j = 0; j < sides; j += 1) {
      const [s, l] = section(i, (j / sides) * TAU);
      point.copy(path[i]).addScaledVector(side, s).addScaledVector(lift, l);
      position.push(point.x, point.y, point.z);
    }
  }
  for (let i = 0; i < (closed ? n : n - 1); i += 1) {
    const a = i * sides;
    const b = ((i + 1) % n) * sides;
    for (let j = 0; j < sides; j += 1) {
      const k = (j + 1) % sides;
      index.push(a + j, b + j, a + k, a + k, b + j, b + k);
    }
  }
  // caps: a fan over each end ring, on its own vertices (a crisp edge)
  if (capped) {
    [0, n - 1].forEach((ring, end) => {
      const centre = position.length / 3;
      const ringAt = ring * sides * 3;
      const mid = new THREE.Vector3();
      for (let j = 0; j < sides; j += 1) {
        mid.add(point.fromArray(position, ringAt + j * 3));
      }
      mid.divideScalar(sides);
      position.push(mid.x, mid.y, mid.z);
      position.push(...position.slice(ringAt, ringAt + sides * 3));
      for (let j = 0; j < sides; j += 1) {
        const k = (j + 1) % sides;
        if (end) index.push(centre, centre + 1 + k, centre + 1 + j);
        else index.push(centre, centre + 1 + j, centre + 1 + k);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(position, 3)
  );
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
