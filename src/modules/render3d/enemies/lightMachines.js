// The five light machines' hulls (machines.js draws them): the Mote, Seeker,
// Tether, Ram and Shade, shaped to be seen from any angle the camera takes —
// a top, sides, a back with dark nozzles and a designed underside — out of
// smooth lofted and turned parts in the hull/dark tones, merged into each
// machine's one body (kit.body). Each model also says where its eye, lens or
// nodes sit (in a dark socket) and where its outline runs (its waist).

import { rimLoop } from '../rimBatch.js';

const TAU = Math.PI * 2;

// --- shaping helpers ----------------------------------------------------------

// [a0, b0, a1, b1, …] as [[a0, b0], [a1, b1], …]: profiles and knots are
// written flat.
function pairs(flat, scale = 1) {
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
function spline(flat) {
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
function skin(THREE, rings, options = {}) {
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
function mirrorZ(geometry) {
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
function revolve(THREE, profile, segments, options = {}) {
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
function aim(THREE, geometry, dir, at) {
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
function section(n, { w, top, bottom, e = 2, ridge = 0 }) {
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
function loft(THREE, count, n, shape, caps = {}) {
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
function blade(THREE, stations, n, under = 0.6) {
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
function bladeTop(station, u) {
  const { le, te, thick, up } = station;
  const h = thick * 1.3 * Math.sqrt(u) * (1 - u);
  return le.clone().lerp(te, u).addScaledVector(up, h);
}

/** A thin raised line laid along `points` (Vector3s on a surface). */
function seam(THREE, points, w = 0.018, h = 0.01) {
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
function socket(THREE, at, dir, r, segments = 12) {
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
function nozzle(THREE, at, dir, r, segments = 12) {
  const profile = [0.55, -0.2, 0.8, 0.55, 1.08, 0.5, 1.06, -0.5];
  return aim(
    THREE,
    revolve(THREE, profile, segments, { start: 'smooth', scale: r }),
    dir,
    at
  );
}

// --- the models ---------------------------------------------------------------

// The matte tones a part merges in (kit.tones), as part records.
function toned(tones) {
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
function outline(THREE, right, y) {
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

/**
 * Mote: a small lens-shaped disc — six hull plates a side over a dark frame,
 * a raised dome in a dark collar, a dark waist band, a recessed boss under
 * it and two small nozzles behind — and one red eye in a socket at its
 * front edge.
 */
export function moteModel(kit) {
  const { THREE } = kit;
  const eye = new THREE.Vector3(0.79, 0.145, 0);
  const eyeSize = 0.2;
  const look = new THREE.Vector3(1, 0.85, 0).normalize();
  const parts = () => {
    const { hull, dark } = toned(kit.tones);
    const plates = (profile) =>
      Array.from({ length: 6 }, (_, i) =>
        hull(
          revolve(THREE, profile, 3, {
            from: (i * TAU) / 6 + 0.04,
            span: TAU / 6 - 0.08,
          })
        )
      );
    const upper = [
      0.44, 0.222, 0.64, 0.196, 0.82, 0.138, 0.94, 0.072, 0.985, 0.036,
    ];
    const lower = [0.985, -0.04, 0.92, -0.094, 0.76, -0.15, 0.52, -0.188];
    const back = (side) =>
      nozzle(
        THREE,
        new THREE.Vector3(-0.88, -0.01, 0.3 * side),
        new THREE.Vector3(-1, -0.2, 0.25 * side),
        0.075,
        6
      );
    return [
      ...plates(upper),
      ...plates(lower),
      dark(revolve(THREE, [0.42, 0.208, 0.75, 0.15, 0.99, 0.02], 12)),
      dark(revolve(THREE, [0.99, -0.02, 0.75, -0.135, 0.5, -0.175], 12)),
      dark(revolve(THREE, [0.985, 0.04, 1, 0, 0.985, -0.042], 24)),
      dark(revolve(THREE, [0.52, -0.188, 0.47, -0.17, 0.3, -0.16], 16)),
      hull(
        revolve(
          THREE,
          [0.3, -0.16, 0.26, -0.195, 0.15, -0.228, 0.05, -0.24],
          16,
          {
            end: 'smooth',
          }
        )
      ),
      hull(
        revolve(
          THREE,
          [0.06, 0.4, 0.2, 0.385, 0.33, 0.33, 0.395, 0.262, 0.41, 0.2],
          16,
          {
            start: 'smooth',
          }
        )
      ),
      dark(revolve(THREE, [0.395, 0.24, 0.43, 0.258, 0.47, 0.212], 16)),
      dark(socket(THREE, eye, look, eyeSize, 10)),
      dark(back(1)),
      dark(back(-1)),
    ];
  };
  return { parts, eye, eyeSize };
}

/**
 * Seeker: a slim chined fuselage with a dark spine line and belly pan, two
 * big cranked swept wings with dark intakes at their roots, a V of tail fins
 * and a dark exhaust; its head forks into two long prongs that hold the
 * frontal lens in a dark socket.
 */
export function seekerModel(kit) {
  const { THREE } = kit;
  const lens = new THREE.Vector3(0.92, 0.15, 0);
  const lensSize = 0.15;
  const y = 0.13;
  const w = spline([
    -1, 0.085, -0.8, 0.16, -0.5, 0.22, -0.15, 0.25, 0.2, 0.24, 0.5, 0.21, 0.75,
    0.18, 0.9, 0.165,
  ]);
  const top = spline([
    -1, 0.08, -0.8, 0.12, -0.5, 0.16, -0.15, 0.18, 0.2, 0.175, 0.5, 0.16, 0.75,
    0.14, 0.9, 0.12,
  ]);
  const bottom = spline([
    -1, 0.08, -0.5, 0.1, -0.15, 0.11, 0.5, 0.1, 0.9, 0.08,
  ]);
  const ridge = 0.05;
  const parts = () => {
    const { hull, dark } = toned(kit.tones);
    const v = (x, yy, z) => new THREE.Vector3(x, yy, z);
    const station = (x, pan) => ({
      at: [x, y, 0],
      w: w(x) * (pan ? 1.04 : 1),
      top: pan ? 0.012 : top(x),
      bottom: bottom(x) * (pan ? 1.06 : 1),
      e: 1.9,
      ridge: pan ? 0 : ridge,
    });
    const fuselage = loft(THREE, 13, 18, (s) => station(-1 + 1.9 * s), {
      start: 'flat',
      end: 'flat',
    });
    const pan = loft(THREE, 10, 14, (s) => station(-0.96 + 1.82 * s, true), {
      start: 'smooth',
      end: 'smooth',
    });
    // a dark line along the spine's crest
    const spine = loft(
      THREE,
      8,
      6,
      (s) => {
        const x = -0.62 + 1.2 * s;
        const k = Math.sin(Math.PI * s) ** 0.4;
        return {
          at: [x, y + top(x) + ridge - 0.012, 0],
          w: 0.035 * k + 0.004,
          top: 0.02 * k + 0.002,
          bottom: 0.02,
        };
      },
      { start: 'smooth', end: 'smooth' }
    );
    // a prong from the head's side to its point, bowing out then in
    const prongPath = new THREE.QuadraticBezierCurve3(
      v(0.42, 0.15, 0.17),
      v(1.05, 0.16, 0.31),
      v(1.48, 0.1, 0.1)
    );
    const prong = loft(
      THREE,
      11,
      10,
      (s) => {
        const p = prongPath.getPoint(s);
        const k = 1 - s ** 1.5;
        return {
          at: [p.x, p.y, p.z],
          w: 0.09 * k + 0.01,
          top: 0.1 * k + 0.012,
          bottom: 0.06 * k + 0.01,
          e: 1.9,
          ridge: 0.03 * k,
        };
      },
      { start: 'flat', end: 'smooth' }
    );
    // root to tip: z, leading x, trailing x
    const wingRows = [
      0.15, 0.3, -0.72, 0.26, 0.08, -0.73, 0.37, -0.13, -0.74, 0.5, -0.32,
      -0.76, 0.63, -0.48, -0.79, 0.74, -0.6, -0.82, 0.82, -0.7, -0.81, 0.86,
      -0.77, -0.79,
    ];
    const rows = wingRows.length / 3;
    const wingStations = Array.from({ length: rows }, (_, i) => {
      const [z, le, te] = wingRows.slice(i * 3, i * 3 + 3);
      const t = i / (rows - 1);
      const h = 0.12 - 0.07 * t;
      return {
        le: v(le, h, z),
        te: v(te, h, z),
        thick: 0.085 * (1 - 0.86 * t),
        up: v(0, 1, 0),
      };
    });
    const wing = blade(THREE, wingStations, 12);
    // a dark spar line along the wing, root to near the tip
    const spar = seam(
      THREE,
      wingStations.slice(1, -1).map((station) => bladeTop(station, 0.38))
    );
    const intake = nozzle(THREE, v(0.2, 0.12, 0.2), v(1, 0, 0.15), 0.06, 10);
    // a tail fin, canted out: root on the spine, tip up and outboard
    const fin = blade(
      THREE,
      pairs([-0.5, -0.95, -0.68, -0.98, -0.88, -1.01]).map(([le, te], i) => {
        const t = i / 2;
        const at = (x) => v(x, 0.25 + 0.2 * t, 0.04 + 0.12 * t);
        return {
          le: at(le),
          te: at(te),
          thick: 0.045 - 0.025 * t,
          up: v(0, -0.5, 0.86),
        };
      }),
      10,
      1
    );
    return [
      hull(fuselage),
      dark(pan),
      dark(spine),
      hull(prong),
      hull(mirrorZ(prong)),
      hull(wing),
      hull(mirrorZ(wing)),
      dark(spar),
      dark(mirrorZ(spar)),
      dark(intake),
      dark(mirrorZ(intake)),
      hull(fin),
      hull(mirrorZ(fin)),
      dark(socket(THREE, lens, v(1, 0.3, 0), lensSize, 14)),
      dark(nozzle(THREE, v(-1, y, 0), v(-1, 0, 0), 0.085, 12)),
    ];
  };
  // its outline at the wings: prong points, the prongs' bow, wings, tail
  const rim = outline(
    THREE,
    [
      1.52, 0.1, 1.2, 0.28, 0.8, 0.36, 0.42, 0.28, 0.22, 0.3, -0.2, 0.52, -0.74,
      0.9, -0.87, 0.82, -0.86, 0.26, -1.08, 0.12,
    ],
    0.1
  );
  return { parts, lens, lensSize, rim };
}

/**
 * Tether: a dark turned core — domes with recessed ports, hull plates
 * between the struts, an armour belt — and three swept struts trailing its
 * spin, each ending in a dark collar clamped round a node.
 */
export function tetherModel(kit) {
  const { THREE } = kit;
  const reach = 1.05;
  const nodeSize = 0.15;
  const angles = [0, 1, 2].map((i) => (i / 3) * TAU);
  const tips = angles.map(
    (angle) =>
      new THREE.Vector3(Math.cos(angle) * reach, 0, -Math.sin(angle) * reach)
  );
  const parts = () => {
    const { hull, dark } = toned(kit.tones);
    // the lower half turns the upper's profiles upside down
    const flipY = (flat) => {
      const out = [];
      for (let i = flat.length - 2; i >= 0; i -= 2) {
        out.push(flat[i], -flat[i + 1]);
      }
      return out;
    };
    const dome = [
      0.16, 0.318, 0.25, 0.302, 0.34, 0.25, 0.41, 0.16, 0.44, 0.085,
    ];
    const port = [0.1, 0.262, 0.135, 0.29, 0.16, 0.318];
    const belt = [
      0.44, 0.085, 0.47, 0.055, 0.475, 0, 0.47, -0.055, 0.44, -0.085,
    ];
    // plates between the struts (struts at revolve angles 0, ±120°)
    const plate = [0.2, 0.33, 0.3, 0.3, 0.38, 0.235, 0.435, 0.14];
    const plates = (profile) =>
      [1, 3, 5].map((k) =>
        hull(
          revolve(THREE, profile, 4, {
            from: (k * TAU) / 6 - 0.62,
            span: 1.24,
          })
        )
      );
    // one strut along +x, trailing the spin (angle grows toward −z)
    const strut = loft(
      THREE,
      10,
      10,
      (s) => {
        const r = 0.36 + 0.54 * s;
        const a = 0.32 * (1 - s) ** 1.5;
        const k = (1 - s) ** 2;
        return {
          at: [Math.cos(a) * r, 0, -Math.sin(a) * r],
          w: 0.058 + 0.08 * k,
          top: 0.056 + 0.05 * k,
          bottom: 0.05 + 0.045 * k,
          e: 2.5,
          ridge: 0.02,
        };
      },
      { start: 'flat', end: 'flat' }
    );
    // a collar round the node's waist: from the side a dark band between
    // two caps of light, from above a dark ring round the node
    const collar = revolve(
      THREE,
      [0.15, 0.062, 0.19, 0.062, 0.208, 0, 0.19, -0.062, 0.15, -0.062],
      14
    );
    collar.translate(reach, 0, 0);
    return [
      dark(revolve(THREE, port, 16, { start: 'smooth' })),
      dark(revolve(THREE, dome, 24)),
      hull(revolve(THREE, belt, 24)),
      dark(revolve(THREE, flipY(dome), 24)),
      dark(revolve(THREE, flipY(port), 16, { end: 'smooth' })),
      hull(revolve(THREE, [0.14, 0.33, 0.17, 0.345, 0.2, 0.33, 0.2, 0.31], 16)),
      ...plates(plate),
      ...plates(flipY(plate)),
      ...angles.map((angle) => hull(strut, angle)),
      ...angles.map((angle) => dark(collar, angle)),
    ];
  };
  return { parts, tips, nodeSize };
}

/**
 * Ram: a heavy arrowhead in layered armour — a thick dark slab, a raised
 * hull plate with a crest, a battering head over the nose, two barbs out to
 * the arrow's points, hull belly plates and a keel under it, twin dark
 * nozzles at its back — the lens hooded on the crest.
 */
export function ramModel(kit) {
  const { THREE } = kit;
  const lens = new THREE.Vector3(0.52, 0.39, 0);
  const look = new THREE.Vector3(1, 0.75, 0).normalize();
  // the white-hot core shows ahead of the lens even at full charge
  const core = lens.clone().addScaledVector(look, 0.17);
  const y = 0.1;
  const baseW = spline([
    -0.45, 0.58, -0.2, 0.56, 0.2, 0.45, 0.6, 0.31, 0.9, 0.18, 1.1, 0.07, 1.2,
    0.015,
  ]);
  const baseTop = spline([-0.45, 0.13, 0.6, 0.13, 1, 0.09, 1.2, 0.03]);
  const baseBottom = spline([-0.45, 0.1, 0.6, 0.1, 1, 0.07, 1.2, 0.025]);
  const headW = spline([0.7, 0.2, 1, 0.18, 1.2, 0.11, 1.32, 0.02]);
  const headTop = spline([0.7, 0.26, 1, 0.22, 1.2, 0.14, 1.32, 0.04]);
  const headBottom = spline([0.7, 0.15, 1, 0.14, 1.2, 0.1, 1.32, 0.03]);
  const parts = () => {
    const { hull, dark } = toned(kit.tones);
    const v = (x, yy, z) => new THREE.Vector3(x, yy, z);
    const along = (from, to, count, n, shape, caps) =>
      loft(THREE, count, n, (s) => shape(from + (to - from) * s), caps);
    const slab = along(
      -0.45,
      1.2,
      14,
      20,
      (x) => ({
        at: [x, y, 0],
        w: baseW(x),
        top: baseTop(x),
        bottom: baseBottom(x),
        e: 2.8,
      }),
      { start: 'flat', end: 'smooth' }
    );
    const plateAt = (x) => ({
      at: [x, y + baseTop(x) * 0.5, 0],
      w: baseW(x) * 0.88 - 0.015,
      top: baseTop(x) + 0.07,
      bottom: 0.02,
      e: 2.6,
      ridge: 0.05,
    });
    const plate = along(-0.4, 1.08, 12, 18, plateAt, {
      start: 'flat',
      end: 'smooth',
    });
    // a seam splitting the plate, from beside the head back to its corner:
    // laid on the plate's face (its section's superellipse)
    const seamLine = Array.from({ length: 8 }, (_, i) => {
      const x = 0.62 - (0.98 * i) / 7;
      const z = 0.07 + (0.27 * i) / 7;
      const { at, w, top, e, ridge } = plateAt(x);
      const a = Math.min(1, z / w);
      const up =
        top * (1 - a ** e) ** (1 / e) + ridge * (1 - a ** (e / 2)) ** 2;
      return v(x, at[1] + up, z);
    });
    const plateSeam = seam(THREE, seamLine, 0.02, 0.012);
    const head = along(
      0.7,
      1.32,
      9,
      16,
      (x) => ({
        at: [x, 0.14, 0],
        w: headW(x),
        top: headTop(x),
        bottom: headBottom(x),
        e: 3,
        ridge: 0.03,
      }),
      { start: 'flat', end: 'smooth' }
    );
    const belly = along(
      -0.35,
      0.95,
      10,
      14,
      (x) => ({
        at: [x, y - baseBottom(x) * 0.55, 0],
        w: baseW(x) * 0.72,
        top: 0.01,
        bottom: baseBottom(x) * 0.45 + 0.03,
        e: 2.6,
      }),
      { start: 'smooth', end: 'smooth' }
    );
    const keel = along(
      -0.25,
      1,
      8,
      8,
      (x) => {
        const k = Math.sin((Math.PI * (x + 0.25)) / 1.25) ** 0.5;
        return {
          at: [x, y - baseBottom(x) - 0.02, 0],
          w: 0.06 * k + 0.01,
          top: 0.03,
          bottom: 0.035 * k + 0.005,
          e: 2.6,
        };
      },
      { start: 'smooth', end: 'smooth' }
    );
    // a barb: its rounded edge out and forward, the sharp one in, from
    // inside the slab's back corner to the arrow's point
    const barb = blade(
      THREE,
      [
        [-0.12, 0.57, -0.42, 0.36, 0.2],
        [-0.4, 0.69, -0.6, 0.55, 0.15],
        [-0.66, 0.8, -0.78, 0.7, 0.1],
        [-0.92, 0.89, -0.95, 0.86, 0.03],
      ].map(([lx, lz, tx, tz, thick], i) => {
        const h = 0.12 - 0.007 * i;
        return { le: v(lx, h, lz), te: v(tx, h, tz), thick, up: v(0, 1, 0) };
      }),
      14,
      0.7
    );
    return [
      dark(slab),
      hull(plate),
      dark(plateSeam),
      dark(mirrorZ(plateSeam)),
      dark(head),
      hull(belly),
      dark(keel),
      hull(barb),
      hull(mirrorZ(barb)),
      dark(socket(THREE, lens, look, 0.12, 14)),
      dark(nozzle(THREE, v(-0.47, 0.12, 0.2), v(-1, 0, 0), 0.1, 12)),
      dark(nozzle(THREE, v(-0.47, 0.12, -0.2), v(-1, 0, 0), 0.1, 12)),
    ];
  };
  // its outline at the waist: battering head, the slab's edge, out along a
  // barb to its point and back in past the nozzles
  const rim = outline(
    THREE,
    [
      1.37, 0, 1.2, 0.13, 0.95, 0.22, 0.6, 0.36, 0.2, 0.5, -0.2, 0.63, -0.55,
      0.79, -0.98, 0.92, -0.8, 0.66, -0.52, 0.5, -0.5, 0.33, -0.58, 0.3, -0.58,
      0.1, -0.5, 0,
    ],
    0.1
  );
  return { parts, lens, core, rim };
}

/**
 * Shade: a crescent blade — a slim body blended into two scythe wings that
 * droop to their points with a notch in the trailing edge, a swept dorsal
 * fin, a dark keel and two small exhausts — its eye in a socket on the
 * spine.
 */
export function shadeModel(kit) {
  const { THREE } = kit;
  const eye = new THREE.Vector3(0.54, 0.2, 0);
  const eyeSize = 0.105;
  const y = 0.1;
  const bodyW = spline([
    -0.76, 0.04, -0.5, 0.14, -0.2, 0.22, 0.15, 0.24, 0.5, 0.19, 0.85, 0.11, 1.1,
    0.05, 1.26, 0.008,
  ]);
  const bodyTop = spline([
    -0.76, 0.02, -0.5, 0.05, -0.2, 0.08, 0.15, 0.095, 0.5, 0.085, 0.85, 0.06,
    1.1, 0.03, 1.26, 0.008,
  ]);
  const le = spline([
    0.08, 0.95, 0.2, 0.68, 0.45, 0.2, 0.7, -0.3, 0.88, -0.7, 0.97, -0.95,
  ]);
  const te = spline([
    0.08, -0.62, 0.2, -0.47, 0.3, -0.45, 0.45, -0.55, 0.7, -0.76, 0.88, -0.9,
    0.97, -0.97,
  ]);
  const parts = () => {
    const { hull, dark } = toned(kit.tones);
    const v = (x, yy, z) => new THREE.Vector3(x, yy, z);
    const body = loft(
      THREE,
      16,
      16,
      (s) => {
        const x = -0.76 + 2.02 * s;
        return {
          at: [x, y, 0],
          w: bodyW(x),
          top: bodyTop(x),
          bottom: bodyTop(x) * 0.7,
          e: 2,
          ridge: 0.045,
        };
      },
      { start: 'smooth', end: 'smooth' }
    );
    const span = [0.08, 0.2, 0.32, 0.45, 0.58, 0.7, 0.8, 0.88, 0.94, 0.97];
    const wingStations = span.map((z) => {
      const t = z / 0.97;
      const h = y - 0.005 - 0.1 * t * t;
      return {
        le: v(le(z), h, z),
        te: v(te(z), h, z),
        thick: 0.12 * (1 - 0.88 * t),
        up: v(0, 1, 0),
      };
    });
    const wing = blade(THREE, wingStations, 14);
    // a dark line sweeping out along the blade, root to near the point
    const spar = seam(
      THREE,
      wingStations.slice(1, -2).map((station) => bladeTop(station, 0.3))
    );
    // a fin on the spine: rows of leading and trailing x, root to tip
    const fin = (rows, at) =>
      blade(
        THREE,
        pairs(rows).map(([front, back], i, all) => {
          const t = i / (all.length - 1);
          return {
            le: at(front, t),
            te: at(back, t),
            thick: 0.045 - 0.025 * t,
            up: v(0, 0, 1),
          };
        }),
        10,
        1
      );
    const dorsal = fin([-0.05, -0.72, -0.55, -0.84], (x, t) =>
      v(x, 0.17 + 0.17 * t, 0)
    );
    const keel = fin([0.45, -0.5, 0.15, -0.46], (x, t) =>
      v(x, y - 0.03 - 0.1 * t, 0)
    );
    const exhaust = nozzle(THREE, v(-0.5, y, 0.14), v(-1, 0, 0.1), 0.05, 10);
    return [
      hull(body),
      hull(wing),
      hull(mirrorZ(wing)),
      dark(spar),
      dark(mirrorZ(spar)),
      hull(dorsal),
      dark(keel),
      dark(exhaust),
      dark(mirrorZ(exhaust)),
      dark(socket(THREE, eye, v(1, 0.9, 0), eyeSize, 12)),
    ];
  };
  // its outline at the wings' root: nose, the leading edge out to the
  // point, back along the trailing edge's notch to the tail
  const rim = outline(
    THREE,
    [
      1.3, 0, 0.75, 0.22, 0.25, 0.44, -0.25, 0.68, -0.7, 0.88, -1.02, 1.02,
      -0.8, 0.72, -0.56, 0.46, -0.47, 0.27, -0.62, 0.1, -0.8, 0,
    ],
    0.06
  );
  return { parts, eye, eyeSize, rim };
}
