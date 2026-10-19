// Herald views, violet-rimmed officials of the Ring, shaped to be seen from
// any angle: Dust (a slow monolith of three blocks in a haze of motes, its
// slits lighting), Heat (a kiln crown whose seam glows, a warning ring around
// it) and Silence (a dark crystal blade with one hooded eye and the blink
// rings).

import { PALETTE } from '../../../data/constants/palette.js';
import { createSeededRandom } from '../asteroidMesh.js';
import { HALF_H, HALF_W, colorOf } from '../batches.js';
import { rimLoop } from '../rimBatch.js';
import { addRimLight } from '../rimLight.js';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Heralds: dust motes around the Dust slab; the Silence blink ring starts
// this many radii wide and closes to one.
const DUST_MOTES = 10;
const BLINK_RING_START = 2.2;

// A smooth curve through `keys` spread evenly over u = 0..1 (Catmull-Rom).
function spline(keys) {
  return (u) => {
    const f = clamp01(u) * (keys.length - 1);
    const i = Math.min(Math.floor(f), keys.length - 2);
    const t = f - i;
    const p0 = keys[Math.max(i - 1, 0)];
    const p1 = keys[i];
    const p2 = keys[i + 1];
    const p3 = keys[Math.min(i + 2, keys.length - 1)];
    return (
      p1 +
      0.5 *
        t *
        (p2 -
          p0 +
          t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
    );
  };
}

// `count` values from `from` to `to`, packed toward both ends (rounded tips).
const spaced = (from, to, count) =>
  Array.from(
    { length: count },
    (_, i) =>
      from + ((to - from) * (1 - Math.cos((Math.PI * i) / (count - 1)))) / 2
  );

// A cross-section point at angle `a` (from +x toward +y): a superellipse
// (`p` 1 diamond, 2 ellipse, 4 boxy) of half-width `front`, `top` and
// `bottom`, turned by `tilt` about its centre (x, y).
function sectionPoint(s, a) {
  const { x = 0, y = 0, front, top, bottom = top, p = 2, tilt = 0 } = s;
  const n = Math.sin(a);
  const e = 2 / p;
  const u = front * Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** e;
  const v = (n >= 0 ? top : bottom) * Math.sign(n) * Math.abs(n) ** e;
  return [
    x + u * Math.cos(tilt) - v * Math.sin(tilt),
    y + u * Math.sin(tilt) + v * Math.cos(tilt),
  ];
}

/**
 * Herald views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createHeraldViews(kit) {
  const { THREE } = kit;
  const { hull, dark } = kit.tones;
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // --- shaping ---------------------------------------------------------------
  // Skins run between rings of points, each ring turning right-handed about
  // the direction the next ring lies in (so faces point outward); normals
  // are smooth across a skin, a hard edge where two skins meet.
  function loft(rings, open = false) {
    const n = rings[0].length;
    const position = [];
    rings.forEach((ring) => ring.forEach((p) => position.push(p.x, p.y, p.z)));
    const index = [];
    for (let i = 0; i + 1 < rings.length; i += 1) {
      for (let j = 0; j < (open ? n - 1 : n); j += 1) {
        const a = i * n + j;
        const b = i * n + ((j + 1) % n);
        index.push(a, b, b + n, a, b + n, a + n);
      }
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

  // One ring of `n` points at depth z (sectionPoint).
  const ring = (z, s, n) =>
    Array.from({ length: n }, (_, j) => {
      const [x, y] = sectionPoint(s, (j / n) * TAU);
      return v3(x, y, z);
    });

  // A closed profile through corners [x, y, round, inner], counter-clockwise:
  // round 0 keeps a corner sharp (a crease column), else it is rounded over
  // that fraction of its two edges; the edge after it gets `inner` points
  // (default 1), bowed out by up to `bow` × its length. Returns the points,
  // the crease columns and each edge's columns.
  function profile(corners, bow = 0, steps = 4) {
    const points = [];
    const creases = [];
    const edges = [];
    const m = corners.length;
    const lerp = (a, b, t) => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
    ];
    corners.forEach((c, i) => {
      const b = corners[(i + 1) % m];
      if (c[2]) {
        const p = lerp(c, corners[(i + m - 1) % m], c[2]);
        const q = lerp(c, b, c[2]);
        for (let s = 0; s <= steps; s += 1) {
          const t = s / steps;
          points.push(lerp(lerp(p, c, t), lerp(c, q, t), t));
        }
      } else {
        creases.push(points.length);
        points.push([c[0], c[1]]);
      }
      const from = points[points.length - 1];
      const to = b[2] ? lerp(b, c, b[2]) : b;
      const inner = c[3] ?? 1;
      const edge = [];
      for (let s = 1; s <= inner; s += 1) {
        const t = s / (inner + 1);
        const out = 4 * t * (1 - t) * bow;
        const [x, y] = lerp(from, to, t);
        edge.push(points.length);
        points.push([x + (to[1] - from[1]) * out, y - (to[0] - from[0]) * out]);
      }
      edges.push(edge);
    });
    return { points, creases, edges };
  }

  // A hull along +z: at each of `zs` a ring, given or `section(z)`'s,
  // skinned whole or in strips split at the `creases` columns (hard edges).
  function hull3(zs, section, n, creases = null) {
    const rings = zs.map((z) => {
      const s = section(z);
      return Array.isArray(s) ? s : ring(z, s, n);
    });
    if (!creases) return [loft(rings)];
    const count = rings[0].length;
    return creases.map((from, k) => {
      const to = creases[(k + 1) % creases.length];
      const span = (to - from + count) % count || count;
      return loft(
        rings.map((r) =>
          Array.from({ length: span + 1 }, (_, j) => r[(from + j) % count])
        ),
        true
      );
    });
  }

  // A tube along `path`: at t (0..1) an ellipse `width(t)` along `side`
  // and `thick(t)` across it.
  function sweep(path, side, width, thick, n = 8) {
    const last = path.length - 1;
    return loft(
      path.map((p, i) => {
        const t = i / last;
        const along = path[Math.min(i + 1, last)]
          .clone()
          .sub(path[Math.max(i - 1, 0)])
          .normalize();
        const u = side.clone().addScaledVector(along, -side.dot(along));
        u.normalize();
        const w = along.clone().cross(u);
        return Array.from({ length: n }, (_, j) => {
          const a = (j / n) * TAU;
          return p
            .clone()
            .addScaledVector(u, Math.cos(a) * width(t))
            .addScaledVector(w, Math.sin(a) * thick(t));
        });
      })
    );
  }

  // Revolved about +y: profile [radius, height] pairs, walked so the solid
  // lies to the left (out along the bottom, up the outside, in over the top).
  const lathe = (points, segments = 48) =>
    new THREE.LatheGeometry(
      points.map(([r, y]) => new THREE.Vector2(r, y)),
      segments
    );

  // A lens (flattened sphere) lying on a surface whose normal is at angle
  // `normal` in the xy plane: `across` along the surface, `depth` along the
  // normal, `length` along z.
  function lens(across, depth, length, normal, segments = 12) {
    const geometry = new THREE.SphereGeometry(1, segments, 8);
    geometry.scale(across, depth, length);
    geometry.rotateZ(normal - Math.PI / 2);
    return geometry;
  }

  // A closed outline in the field plane at height y, from -length to
  // +length along z: `front(z)` its reach toward +x, `back(z)` toward -x.
  function outline(length, front, back, y, steps = 24) {
    const zs = spaced(-length, length, steps);
    return rimLoop([
      ...zs.map((z) => v3(front(z), y, z)),
      ...zs.reverse().map((z) => v3(-back(z), y, z)),
    ]);
  }

  // --- Dust ------------------------------------------------------------------
  // A slow monolith side-on to the ship (local +x), bowed toward it: one
  // wind-carved mass of a single wedge (a steep front face, a crest and a
  // terrace edge that catch the light, a rounded back) swelling into three
  // sections through shallow waists, the middle one raised like a keep, its
  // ends rounded off. Each section's slit lies in a dark socket in a scoop
  // of the front face, a vent on its back; a keel, two pods and five stones
  // under its lip.
  const DUST_HALF = 1.02;
  const DUST_SECTIONS = [-0.64, 0, 0.64];
  const DUST_WAIST = 0.33;
  const DUST_PROFILE = profile(
    [
      [0.34, -0.17, 0.35], // front lip
      [0.5, -0.01, 0, 3], // front edge, then the front face
      [0.2, 0.33, 0.3], // front shoulder
      [-0.03, 0.42, 0], // crest
      [-0.21, 0.36, 0], // terrace edge
      [-0.25, 0.26, 0.35], // terrace foot, then the terrace
      [-0.43, 0.05, 0.3], // back
      [-0.33, -0.14, 0.35], // back foot
      [0, -0.2, 0.4], // belly
    ],
    0.05,
    3
  );
  const DUST_FACE = DUST_PROFILE.edges[1];
  const DUST_TERRACE = DUST_PROFILE.edges[5];
  // the front face's outward normal (front edge to shoulder)
  const DUST_FACE_NORMAL = [0.75, 0.662];
  // stations: even along the middle, packed toward the rounded ends
  const dustTip = Array.from(
    { length: 10 },
    (_, i) => 0.8 + (DUST_HALF - 0.8) * (1 - (1 - (i + 1) / 10) ** 3)
  );
  const DUST_ZS = [
    ...dustTip.map((z) => -z).reverse(),
    ...Array.from({ length: 33 }, (_, i) => -0.8 + 0.05 * i),
    ...dustTip,
  ];
  const bump = (u) => Math.exp(-u * u);
  const dustWaist = (z) => bump((Math.abs(z) - DUST_WAIST) / 0.1);
  const dustEnds = (z) => Math.max(0, 1 - Math.abs(z / DUST_HALF) ** 4) ** 0.25;
  const dustWidth = (z) => dustEnds(z) * (1 - 0.05 * dustWaist(z));
  const dustHeight = (z) => Math.sqrt(dustEnds(z)) * (1 - 0.15 * z * z);
  // the upper half's rise: the keep in the middle, a dip at each waist
  const dustLift = (z) =>
    (0.9 + 0.28 * bump(z / 0.34)) * (1 - 0.08 * dustWaist(z));
  const dustBow = (z) => -0.08 * z * z;
  // how deep the front face is scooped at z (0..1), round each slit
  const dustScoop = (z) =>
    Math.max(
      ...DUST_SECTIONS.map((s) => Math.max(0, 1 - ((z - s) / 0.24) ** 2) ** 2)
    );
  // the profile's point `i` at z
  const dustPoint = (z, i) => {
    const f = DUST_FACE.indexOf(i);
    const dip =
      f < 0
        ? 0
        : 0.035 *
          dustScoop(z) *
          Math.sin((Math.PI * (f + 1)) / (DUST_FACE.length + 1));
    const x = DUST_PROFILE.points[i][0] - dip * DUST_FACE_NORMAL[0];
    const y = DUST_PROFILE.points[i][1] - dip * DUST_FACE_NORMAL[1];
    return [
      dustBow(z) + x * dustWidth(z),
      y * dustHeight(z) * (y > 0 ? dustLift(z) : 1),
    ];
  };
  const dustRing = (z) =>
    DUST_PROFILE.points.map((_, i) => v3(...dustPoint(z, i), z));
  // the point `i` at z and its face's normal angle (from the points either
  // side), pushed out along it by `out`
  const dustFace = (z, i, out = 0) => {
    const [[x0, y0], [x, y], [x1, y1]] = [i - 1, i, i + 1].map((j) =>
      dustPoint(z, j)
    );
    const normal = Math.atan2(-(x1 - x0), y1 - y0);
    return {
      normal,
      position: [x + out * Math.cos(normal), y + out * Math.sin(normal), z],
    };
  };
  const dustRim = outline(
    DUST_HALF + 0.02,
    (z) => 0.5 * dustWidth(z) + dustBow(z) + 0.035,
    (z) => 0.43 * dustWidth(z) - dustBow(z) + 0.035,
    0.0,
    32
  );

  function dustParts() {
    const parts = [];
    const add = (color) => (geometry) => parts.push({ geometry, color });
    // the mass: the front face and crest lit, the terrace, back and belly
    // dark
    hull3(DUST_ZS, dustRing, 0, DUST_PROFILE.creases).forEach((geometry, i) =>
      add(i < 2 ? hull : dark)(geometry)
    );
    // each slit's socket in its scoop, a vent on the terrace behind it
    DUST_SECTIONS.forEach((z) => {
      const socket = dustFace(z, DUST_FACE[1], -0.004);
      parts.push({
        geometry: lens(0.07, 0.022, 0.22, socket.normal, 10),
        color: dark,
        position: socket.position,
      });
      const vent = dustFace(z, DUST_TERRACE[0]);
      parts.push({
        geometry: lens(0.06, 0.02, 0.17, vent.normal, 8),
        color: hull,
        position: vent.position,
      });
    });
    // the keel, two pods under the belly, five stones under the front lip:
    // the wall it raises
    hull3(
      spaced(-0.82, 0.82, 16),
      (z) => {
        const k = Math.max(0, 1 - Math.abs(z / 0.82) ** 4) ** 0.25;
        return {
          x: 0.02 + dustBow(z),
          y: -0.19 * dustHeight(z),
          front: 0.08 * k,
          top: 0.03,
          bottom: 0.06 * k,
          p: 2.4,
        };
      },
      10
    ).forEach(add(dark));
    const pod = lathe(
      [
        [0.05, -0.04],
        [0.05, -0.07],
        [0.075, -0.075],
        [0.1, -0.05],
        [0.1, 0.02],
      ],
      16
    );
    [-0.55, 0.55].forEach((z) =>
      parts.push({
        geometry: pod,
        color: hull,
        position: [-0.14 + dustBow(z), -0.17 * dustHeight(z), z],
      })
    );
    const stone = new THREE.IcosahedronGeometry(1, 0);
    [-0.6, -0.3, 0, 0.3, 0.6].forEach((z, i) => {
      const size = 0.07 + 0.012 * ((i * 7) % 3);
      parts.push({
        geometry: stone,
        color: hull,
        flat: true,
        position: [0.33 * dustWidth(z) + dustBow(z), -0.16, z],
        scale: [size, size * 0.8, size * 1.1],
        rotationY: i * 1.3,
      });
    });
    return parts;
  }

  function dustSlitParts() {
    return DUST_SECTIONS.map((z) => {
      const { normal, position } = dustFace(z, DUST_FACE[1], 0.006);
      return { geometry: lens(0.028, 0.02, 0.2, normal), position };
    });
  }

  // --- Heat ------------------------------------------------------------------
  // A kiln crown: a matte ring, its belly dark and its waist ribbed with
  // radiator fins; six prongs arch over the glowing seam in the channel
  // around a dark stepped core; six nozzles underneath, hot inside.
  const HEAT_FINS = 12;
  const HEAT_LOUVRES = 12;
  const HEAT_PRONGS = 6;
  const HEAT_NOZZLES = 6;
  const HEAT_NOZZLE_RING = 0.62;
  const HEAT_SEAM = { radius: 0.49, tube: 0.036, y: 0.045 };

  function heatParts() {
    const parts = [
      // ring top, inner wall and channel floor, core, crown cap
      {
        geometry: lathe([
          [0.985, 0],
          [0.975, 0.06],
          [0.93, 0.13],
          [0.83, 0.19],
          [0.72, 0.215],
          [0.64, 0.2],
          [0.585, 0.16],
        ]),
        color: hull,
      },
      {
        geometry: lathe([
          [0.585, 0.16],
          [0.555, 0.1],
          [0.54, 0.045],
          [0.52, 0.018],
          [0.44, 0.015],
        ]),
        color: dark,
      },
      {
        geometry: lathe([
          [0.44, 0.015],
          [0.43, 0.075],
          [0.39, 0.125],
          [0.3, 0.155],
          [0.22, 0.165],
        ]),
        color: dark,
      },
      {
        geometry: lathe([
          [0.22, 0.165],
          [0.215, 0.205],
          [0.17, 0.225],
          [0.08, 0.24],
          [0, 0.243],
        ]),
        color: hull,
      },
      // belly up to the waist, keel bulb
      {
        geometry: lathe([
          [0.34, -0.205],
          [0.55, -0.215],
          [0.73, -0.2],
          [0.86, -0.15],
          [0.945, -0.08],
          [0.985, 0],
        ]),
        color: dark,
      },
      {
        geometry: lathe([
          [0, -0.3],
          [0.1, -0.292],
          [0.2, -0.265],
          [0.28, -0.23],
          [0.34, -0.205],
        ]),
        color: hull,
      },
    ];
    const fin = new THREE.BoxGeometry(0.12, 0.13, 0.032);
    for (let i = 0; i < HEAT_FINS; i += 1) {
      const a = (i / HEAT_FINS) * TAU;
      parts.push({
        geometry: fin,
        color: dark,
        flat: true,
        position: [Math.cos(a) * 0.965, 0, Math.sin(a) * 0.965],
        rotationY: -a,
      });
    }
    // louvres on the shoulder, between the prongs
    const louvre = new THREE.BoxGeometry(0.1, 0.03, 0.026);
    louvre.rotateZ(-0.55);
    for (let i = 0; i < HEAT_LOUVRES; i += 1) {
      const a = ((i + 0.25) / HEAT_LOUVRES) * TAU;
      parts.push({
        geometry: louvre,
        color: dark,
        flat: true,
        position: [Math.cos(a) * 0.875, 0.158, Math.sin(a) * 0.875],
        rotationY: -a,
      });
    }
    // ribs across the belly, between the nozzles
    const rib = [
      [0.3, -0.232],
      [0.45, -0.238],
      [0.6, -0.233],
      [0.75, -0.215],
      [0.86, -0.168],
      [0.93, -0.105],
    ];
    for (let i = 0; i < HEAT_NOZZLES; i += 1) {
      const a = (i / HEAT_NOZZLES) * TAU;
      const out = v3(Math.cos(a), 0, Math.sin(a));
      parts.push({
        geometry: sweep(
          new THREE.CatmullRomCurve3(
            rib.map(([r, y]) => out.clone().multiplyScalar(r).setY(y))
          ).getPoints(10),
          v3(-out.z, 0, out.x),
          (t) => 0.03 * (1 - 0.5 * t),
          (t) => 0.022 * Math.sin(Math.PI * Math.min(1, 0.15 + t)) + 0.004,
          6
        ),
        color: hull,
      });
    }
    const nozzle = lathe(
      [
        [0.05, -0.17],
        [0.05, -0.28],
        [0.072, -0.29],
        [0.08, -0.24],
        [0.072, -0.18],
      ],
      14
    );
    for (let i = 0; i < HEAT_NOZZLES; i += 1) {
      const a = ((i + 0.5) / HEAT_NOZZLES) * TAU;
      parts.push({
        geometry: nozzle,
        color: dark,
        position: [
          Math.cos(a) * HEAT_NOZZLE_RING,
          0,
          Math.sin(a) * HEAT_NOZZLE_RING,
        ],
      });
    }
    const prong = [
      [0.79, 0.17],
      [0.8, 0.3],
      [0.77, 0.42],
      [0.7, 0.5],
      [0.61, 0.53],
    ];
    for (let i = 0; i < HEAT_PRONGS; i += 1) {
      const a = ((i + 0.5) / HEAT_PRONGS) * TAU;
      const out = v3(Math.cos(a), 0, Math.sin(a));
      const path = new THREE.CatmullRomCurve3(
        prong.map(([r, y]) => out.clone().multiplyScalar(r).setY(y))
      ).getPoints(14);
      parts.push({
        geometry: sweep(
          path,
          v3(-out.z, 0, out.x),
          (t) => 0.006 + 0.085 * (1 - t) ** 0.8,
          (t) => 0.005 + 0.04 * (1 - t) ** 0.6
        ),
        color: hull,
      });
    }
    return parts;
  }

  function heatSeamParts() {
    const seam = new THREE.TorusGeometry(
      HEAT_SEAM.radius,
      HEAT_SEAM.tube,
      6,
      64
    );
    seam.rotateX(Math.PI / 2);
    seam.scale(1, 0.7, 1);
    const ember = new THREE.CircleGeometry(0.05, 12);
    ember.rotateX(Math.PI / 2);
    const parts = [{ geometry: seam, position: [0, HEAT_SEAM.y, 0] }];
    for (let i = 0; i < HEAT_NOZZLES; i += 1) {
      const a = ((i + 0.5) / HEAT_NOZZLES) * TAU;
      parts.push({
        geometry: ember,
        position: [
          Math.cos(a) * HEAT_NOZZLE_RING,
          -0.245,
          Math.sin(a) * HEAT_NOZZLE_RING,
        ],
      });
    }
    return parts;
  }

  // --- Silence ---------------------------------------------------------------
  // A dark crystal blade along z, head at -z: a curved-diamond spine, two
  // veils folded down its flanks like a cloak, the eye sunk in a hooded cup
  // at the head, the shards it hunts with along its back, a keel below.
  const SILENCE_HALF = 1.25;
  const SILENCE_EYE = v3(0, 0.26, -0.6);
  const silenceU = (z) => (z + SILENCE_HALF) / (2 * SILENCE_HALF);
  const spineWidth = spline([
    0, 0.1, 0.16, 0.19, 0.2, 0.19, 0.16, 0.12, 0.08, 0.04, 0,
  ]);
  const spineTop = spline([
    0, 0.1, 0.17, 0.2, 0.2, 0.19, 0.16, 0.12, 0.08, 0.04, 0,
  ]);
  const spineBottom = spline([
    0, 0.08, 0.13, 0.15, 0.15, 0.14, 0.12, 0.09, 0.06, 0.03, 0,
  ]);
  // the veils over their own u (0..1 from VEIL_FROM to VEIL_TO along z)
  const VEIL_FROM = -0.95;
  const VEIL_TO = 1.25;
  const veilX = spline([0.12, 0.2, 0.27, 0.31, 0.32, 0.31, 0.29, 0.27, 0.26]);
  const veilY = spline([0.16, 0.12, 0.07, 0.03, 0, -0.02, -0.03, -0.03, -0.03]);
  const veilHalf = spline([0, 0.1, 0.13, 0.14, 0.14, 0.13, 0.11, 0.08, 0]);
  const veilThick = spline([0, 0.025, 0.035, 0.04, 0.04, 0.035, 0.03, 0.02, 0]);
  const veilTilt = spline([0.5, 0.45, 0.4, 0.35, 0.3, 0.3, 0.3, 0.3, 0.3]);
  const veilU = (z) => (z - VEIL_FROM) / (VEIL_TO - VEIL_FROM);
  const veilSection = (side) => (z) => {
    const u = veilU(z);
    return {
      x: side * veilX(u),
      y: veilY(u),
      front: veilHalf(u),
      top: veilThick(u),
      p: 1.6,
      tilt: -side * veilTilt(u),
    };
  };
  const veilEdge = (z) => {
    const u = veilU(z);
    if (u <= 0 || u >= 1) return spineWidth(silenceU(z));
    return Math.max(
      spineWidth(silenceU(z)),
      veilX(u) + veilHalf(u) * Math.cos(veilTilt(u))
    );
  };
  const silenceRim = outline(
    SILENCE_HALF + 0.04,
    (z) => veilEdge(z) + 0.035,
    (z) => veilEdge(z) + 0.035,
    0.0,
    32
  );

  function silenceParts() {
    const shade = (k) => new THREE.Color(k, k, k);
    const parts = [
      ...hull3(
        spaced(-SILENCE_HALF, SILENCE_HALF, 36),
        (z) => {
          const u = silenceU(z);
          return {
            front: spineWidth(u),
            top: spineTop(u),
            bottom: spineBottom(u),
            p: 1.35,
          };
        },
        32,
        [0, 8, 16, 24]
      ).map((geometry) => ({ geometry, color: shade(0.7) })),
    ];
    [-1, 1].forEach((side) =>
      hull3(
        spaced(VEIL_FROM, VEIL_TO, 30),
        veilSection(side),
        12,
        [0, 6]
      ).forEach((geometry) => parts.push({ geometry, color: shade(1.3) }))
    );
    // the cowl the eye sits in: a hood round its front and sides, highest
    // at the brow, open toward the tail and running back along the spine
    const { y: eyeY, z: eyeZ } = SILENCE_EYE;
    const cowlBase = 0.15;
    const cowlTop = (t) => eyeY - 0.04 + 0.14 * Math.sin(Math.PI * t) ** 1.2;
    const cowlEnds = (t) => Math.min(1, 5 * Math.min(t, 1 - t)) ** 0.5;
    const cowl = new THREE.CatmullRomCurve3([
      v3(0.07, 0, eyeZ + 0.42),
      v3(0.165, 0, eyeZ + 0.06),
      v3(0, 0, eyeZ - 0.18),
      v3(-0.165, 0, eyeZ + 0.06),
      v3(-0.07, 0, eyeZ + 0.42),
    ])
      .getPoints(28)
      .map((p, i) => p.setY((cowlTop(i / 28) + cowlBase) / 2));
    parts.push({
      geometry: sweep(
        cowl,
        v3(0, 1, 0),
        (t) => (cowlTop(t) - cowlBase) / 2,
        (t) => (0.03 + 0.02 * Math.sin(Math.PI * t)) * cowlEnds(t),
        10
      ),
      color: shade(1.3),
    });
    // the shards along the back, leaning to the tail
    [
      [-0.2, 0.36, 0.065],
      [0.08, 0.3, 0.055],
      [0.34, 0.23, 0.045],
      [0.58, 0.16, 0.036],
    ].forEach(([z, height, radius]) => {
      const shard = new THREE.ConeGeometry(1, 1, 4, 1);
      shard.translate(0, 0.5, 0);
      shard.scale(radius, height, radius * 1.4);
      shard.rotateX(0.7);
      parts.push({
        geometry: shard,
        color: new THREE.Color(1.6, 1.1, 2.2),
        flat: true,
        position: [0, spineTop(silenceU(z)) - 0.03, z],
      });
    });
    // the keel
    hull3(
      spaced(-0.55, 0.9, 18),
      (z) => {
        const u = silenceU(z);
        const k = Math.max(0, 1 - Math.abs((z - 0.17) / 0.73) ** 2) ** 0.5;
        return {
          y: 0.02 - spineBottom(u),
          front: 0.025 * k,
          top: 0.02,
          bottom: 0.12 * k,
          p: 1.6,
        };
      },
      10
    ).forEach((geometry) => parts.push({ geometry, color: shade(0.45) }));
    return parts;
  }

  function createDust() {
    const group = new THREE.Group();
    const slab = kit.body('herald-dust', dustParts);
    const slitMaterial = kit.emissive(PALETTE.shot, 0.3);
    const slits = new THREE.Mesh(
      kit.merged('herald-dust-slits', dustSlitParts),
      slitMaterial
    );
    // the haze: a slow ring of faint dust motes, never in the bloom
    const haze = new THREE.Group();
    const hazeMaterial = new THREE.MeshBasicMaterial({
      color: colorOf(THREE, PALETTE.rockLit),
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    haze.add(
      new THREE.Mesh(
        kit.merged('herald-dust-haze', () => {
          const random = createSeededRandom(31.7);
          return Array.from({ length: DUST_MOTES }, (_, i) => {
            const angle = (i / DUST_MOTES) * TAU + random() * 0.5;
            const reach = 1.0 + random() * 0.5;
            const position = [
              Math.cos(angle) * reach,
              -0.1 + random() * 0.3,
              Math.sin(angle) * reach,
            ];
            const size = 0.08 + random() * 0.12;
            return {
              geometry: kit.smallSphere,
              position,
              scale: [size, size * 0.5, size],
            };
          });
        }),
        hazeMaterial
      )
    );
    group.add(slab, slits, haze);
    kit.scene.add(group);
    return kit.view('herald-dust', group, {
      slitMaterial,
      hazeMaterial,
      haze,
      accents: [slitMaterial],
      rims: [kit.rim(group, dustRim)],
      rimColor: kit.rimColors.boss,
    });
  }

  function createHeat() {
    const group = new THREE.Group();
    const shell = kit.body('herald-heat', heatParts);
    const seamMaterial = kit.emissive(PALETTE.shot, 0.8);
    const seam = new THREE.Mesh(
      kit.merged('herald-heat-seam', heatSeamParts),
      seamMaterial
    );
    const warnMaterial = new THREE.MeshBasicMaterial({
      color: colorOf(THREE, PALETTE.shot),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const warn = new THREE.Mesh(kit.warnRing, warnMaterial);
    warn.visible = false;
    group.add(shell, seam, warn);
    kit.scene.add(group);
    return kit.view('herald-heat', group, {
      seam,
      seamMaterial,
      warn,
      accents: [seamMaterial],
      rims: [kit.rim(group, kit.circleRim, 1.07)],
      rimColor: kit.rimColors.boss,
    });
  }

  function createSilence() {
    const group = new THREE.Group();
    const prismMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#120a1a'),
      emissive: colorOf(THREE, PALETTE.boss),
      emissiveIntensity: 0.06,
      metalness: 0.5,
      roughness: 0.38,
      vertexColors: true,
    });
    addRimLight(prismMaterial);
    const prism = new THREE.Mesh(
      kit.merged('herald-silence', silenceParts),
      prismMaterial
    );
    const eyeTone = kit.tone(PALETTE.text, 1);
    const eye = kit.glow(group, eyeTone, 0.08, SILENCE_EYE);
    group.add(prism);
    kit.scene.add(group);
    // the blink rings live in field pixels, outside the scaled body
    const ring = () =>
      new THREE.Mesh(
        kit.warnRing,
        new THREE.MeshBasicMaterial({
          color: colorOf(THREE, PALETTE.boss).multiplyScalar(1.4),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      );
    const telegraph = {
      group: new THREE.Group(),
      target: ring(),
      self: ring(),
    };
    telegraph.group.add(telegraph.target, telegraph.self);
    telegraph.group.visible = false;
    kit.scene.add(telegraph.group);
    return kit.view('herald-silence', group, {
      eye: eye.anchor,
      eyeTone,
      prismMaterial,
      telegraph,
      accents: [eyeTone],
      rims: [kit.rim(group, silenceRim)],
      rimColor: kit.rimColors.boss,
      glows: [eye],
    });
  }

  // `telegraphRatio` lights what acts: the Dust slits, the Heat seam (and a
  // ring), the Silence eye with the blink rings.
  function updateHerald(view, herald, time, flash) {
    const { object } = view;
    const radius = herald.radius || 30;
    const charge = clamp01(herald.telegraphRatio || 0);
    object.scale.setScalar(radius);
    if (view.kind === 'herald-dust') {
      object.rotation.y = -(herald.rotation || 0);
      kit.setGain(view.slitMaterial, 0.2 + 1.4 * charge + flash * 0.6);
      view.haze.rotation.y = time * 0.15 + (herald.rotation || 0);
      view.hazeMaterial.opacity = 0.08 + 0.1 * charge;
    } else if (view.kind === 'herald-heat') {
      object.rotation.y = 0;
      const breathe = 0.5 + 0.5 * Math.sin(time * 2.2);
      kit.setGain(
        view.seamMaterial,
        0.7 + 0.25 * breathe + 2.2 * charge + flash * 0.6
      );
      view.warn.visible = charge > 0;
      const ring = 1.25 + 0.2 * (1 - charge);
      view.warn.scale.set(ring, 1, ring);
      view.warn.material.opacity = 0.6 * charge;
    } else {
      object.rotation.y = 0;
      // a small, calm eye in its hood at rest; the blink swells it as before
      view.eye.scale.setScalar(0.08 + 0.08 * charge);
      kit.setGain(
        view.eyeTone,
        1 + 0.15 * Math.sin(time * 3) + flash * 0.8 + 1.5 * charge
      );
      const t = view.telegraph;
      const to = herald.blinkTarget;
      t.group.visible = Boolean(to);
      if (to) {
        t.group.position.set(herald.x - HALF_W, 1, herald.y - HALF_H);
        t.target.position.set(to.x - herald.x, 0, to.y - herald.y);
        const r = radius * (BLINK_RING_START - (BLINK_RING_START - 1) * charge);
        t.target.scale.set(r, 1, r);
        t.target.material.opacity = 0.3 + 0.6 * charge;
        const s = radius * (1.3 + 0.4 * charge);
        t.self.scale.set(s, 1, s);
        t.self.material.opacity = 0.3 * charge;
      }
    }
  }

  return { createDust, createHeat, createSilence, updateHerald };
}
