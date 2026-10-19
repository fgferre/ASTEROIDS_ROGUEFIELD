// Warden views, one kind each: Prime (a ring of plate segments around a hot
// core, shedding segments by phase), Choir (three singing cores on arms
// around a dark hub, breaking away) and Null (a dark core inside eight plates
// that open into an orbit and are shed, and the rings of its inverted pull),
// in the grooved plate material, with their telegraphs. Designed on every
// side for a camera that tilts: swept armour and solids of revolution in two
// tones (hull above, dark below and inside), the cores held in housings.

import { PALETTE } from '../../../data/constants/palette.js';
import { WARDEN_KINDS } from '../../../data/enemies/boss.js';
import { bakePlateMaps } from '../bakedMaps.js';
import { colorOf } from '../batches.js';
import { mergeStatic } from '../mergeStatic.js';
import { addRimLight } from '../rimLight.js';

const WARDEN_SEGMENTS = 6;
// Choir and Null views are drawn in field pixels (their bodies come from the
// boss: `cores`, `plates`); Prime is a unit model scaled by the radius.
const CHOIR_CORE_PX = 28;
const CHOIR_SHARDS = 5;
const NULL_CLOSED_PX = 70;
const BREAK_SECONDS = 1.6;
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Baked plate maps (bakedMaps.js) on the segments, arms and plates.
// proposta 18/10: strengths.
const PLATE_NORMAL_SCALE = 0.7;
const PLATE_AO = 0.8;
// Faces meeting within this angle share a smooth normal; past it, a crisp
// edge.
const CREASE_COS = Math.cos((30 * Math.PI) / 180);
// 1 across the middle of t (0..1), rounding to 0 at both ends.
const lens = (t, p) => Math.sqrt(Math.max(0, 1 - Math.abs(2 * t - 1) ** p));

// Energy orb: emissive brightest where the surface faces the camera, so the
// core reads as a volume of light instead of a flat disc.
function patchHotCore(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
    float facing = max(dot(normal, normalize(vViewPosition)), 0.0);
    totalEmissiveRadiance *= 0.15 + 1.1 * pow(facing, 1.6);`
  );
}

/**
 * Warden views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createWardenViews(kit) {
  const { THREE } = kit;
  const { hull, dark } = kit.tones;
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // Every matte Warden part: the plate look plus grooved surface maps on
  // their UVs, smooth-shaded, its two tones (hull, dark) in vertex colours.
  const plateMaps = bakePlateMaps(THREE, kit.mapSeed);
  // clone() drops the rim patch (and userData functions): add it again
  const wardenPlateMaterial = addRimLight(kit.plateMaterial.clone());
  Object.assign(wardenPlateMaterial, plateMaps, {
    normalScale: new THREE.Vector2(PLATE_NORMAL_SCALE, PLATE_NORMAL_SCALE),
    aoMapIntensity: PLATE_AO,
    flatShading: false,
    vertexColors: true,
  });
  wardenPlateMaterial.color.setRGB(1, 1, 1);

  // --- shapes (+X out from the centre, +Y up) ------------------------------

  // Non-indexed copy whose normals average the faces meeting at each point
  // within CREASE_COS of each other: smooth curves, crisp edges.
  function creased(geometry) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute('position').array;
    const count = pos.length / 3;
    const faces = new Float32Array(pos.length);
    const a = v3();
    const b = v3();
    const c = v3();
    for (let i = 0; i < count; i += 3) {
      a.fromArray(pos, i * 3);
      b.fromArray(pos, i * 3 + 3);
      c.fromArray(pos, i * 3 + 6);
      c.sub(b).cross(a.sub(b));
      for (let k = 0; k < 3; k += 1) c.toArray(faces, (i + k) * 3);
    }
    const shared = new Map();
    for (let i = 0; i < count; i += 1) {
      const key = [0, 1, 2].map((k) => Math.round(pos[i * 3 + k] * 1e4)).join();
      if (!shared.has(key)) shared.set(key, []);
      shared.get(key).push(i);
    }
    const normal = new Float32Array(pos.length);
    shared.forEach((list) =>
      list.forEach((i) => {
        a.fromArray(faces, i * 3);
        const own = a.length();
        c.set(0, 0, 0);
        list.forEach((j) => {
          b.fromArray(faces, j * 3);
          const other = b.length();
          if (other && (!own || a.dot(b) >= CREASE_COS * own * other)) c.add(b);
        });
        (c.lengthSq() ? c.normalize() : c.set(0, 1, 0)).toArray(normal, i * 3);
      })
    );
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    return g;
  }

  // Rows of points (the same count each) → a surface, u along the rows and
  // v across them (× repeats, for the plate maps); `closed` joins each row's
  // ends. It faces the side from which the rows advance to the right of the
  // way each row runs.
  function grid(rows, { closed = false, u = 1, v = 1 } = {}) {
    const m = rows[0].length;
    const cols = closed ? m + 1 : m;
    const position = [];
    const uv = [];
    const index = [];
    rows.forEach((row, i) => {
      for (let j = 0; j < cols; j += 1) {
        const p = row[j % m];
        position.push(p.x, p.y, p.z);
        uv.push((i / (rows.length - 1)) * u, (j / (cols - 1)) * v);
      }
    });
    for (let i = 0; i < rows.length - 1; i += 1) {
      for (let j = 0; j < cols - 1; j += 1) {
        const k = i * cols + j;
        index.push(k, k + cols, k + 1, k + 1, k + cols, k + cols + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    return creased(g);
  }

  // A solid of revolution about +Y from [radius, height] pairs traced out
  // along the bottom, up the side and in over the top (it faces out).
  function lathe(profile, segments, u = 1) {
    const rows = [];
    for (let i = 0; i <= segments; i += 1) {
      const a = -(i / segments) * TAU;
      rows.push(
        profile.map(([r, y]) => v3(Math.cos(a) * r, y, Math.sin(a) * r))
      );
    }
    return grid(rows, { u });
  }

  // `section` ([out, up], traced in, over the top and out) swept round +Y
  // at radius R over ±half about the angle `at`, round the centre [cx, cz];
  // each of `rows` ([t 0..1 along, kOut, kUp]) shrinks it toward `pivot`
  // (the strips of one body share it, so their ends meet).
  function arc(section, rows, { R, half, at = 0, cx = 0, cz = 0, pivot }) {
    const [ps, pl] = pivot || [0, 0];
    return rows.map(([t, ks, kl]) => {
      const a = at - half + 2 * half * t;
      return section.map(([s, l]) => {
        const r = R + ps + (s - ps) * ks;
        return v3(
          cx + Math.cos(a) * r,
          pl + (l - pl) * kl,
          cz + Math.sin(a) * r
        );
      });
    });
  }

  // Rows for arc(): full size, its ends cut square behind a chamfer `c`
  // long that insets them to `inset`.
  function capRows(steps, c, inset = 0.8) {
    const rows = [
      [0, 0, 0],
      [0, inset, inset],
    ];
    for (let i = 0; i <= steps; i += 1)
      rows.push([c + (1 - 2 * c) * (i / steps), 1, 1]);
    rows.push([1, inset, inset], [1, 0, 0]);
    return rows;
  }

  // A tube along `path`, its radius radiusAt(t) (0 closes it), its height
  // `flat` times its width.
  function tube(path, radiusAt, sides = 8, flat = 1) {
    const up = v3(0, 1, 0);
    const rows = path.map((p, i) => {
      const tangent = path[Math.min(path.length - 1, i + 1)]
        .clone()
        .sub(path[Math.max(0, i - 1)])
        .normalize();
      const side = tangent.clone().cross(up).normalize();
      const lift = side.clone().cross(tangent);
      const r = radiusAt(i / (path.length - 1));
      const row = [];
      for (let j = 0; j < sides; j += 1) {
        const a = (j / sides) * TAU;
        row.push(
          p
            .clone()
            .addScaledVector(side, Math.cos(a) * r)
            .addScaledVector(lift, Math.sin(a) * r * flat)
        );
      }
      return row;
    });
    return grid(rows, { closed: true });
  }

  // `steps` + 1 points along a smooth curve through `points` ([x, y, z]).
  const smooth = (points, steps) =>
    new THREE.CatmullRomCurve3(
      points.map(([x, y, z]) => v3(x, y, z))
    ).getPoints(steps);

  // Parts merged into one geometry with uv2 for the aoMap.
  function merge(parts) {
    const geometry = mergeStatic(THREE, parts);
    geometry.setAttribute('uv2', geometry.getAttribute('uv'));
    return geometry;
  }

  // The hot core of Prime and the Choir: an orb with a belt and two grooves,
  // so its facing glow reads in bands (unit radius).
  const ORB = [
    [-90, 1],
    [-74, 1],
    [-58, 1],
    [-44, 1],
    [-36, 0.99],
    [-32, 0.95],
    [-28, 0.99],
    [-20, 1],
    [-10, 1],
    [-5, 0.985],
    [-3, 0.955],
    [0, 0.97],
    [3, 0.955],
    [5, 0.985],
    [10, 1],
    [20, 1],
    [28, 0.99],
    [32, 0.95],
    [36, 0.99],
    [44, 1],
    [58, 1],
    [74, 1],
    [90, 1],
  ].map(([lat, r]) => {
    const a = (lat * Math.PI) / 180;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const orb = lathe(ORB, 24);
  // The Null's core: a seed, taller than wide, furrowed by the eight seams
  // of the shell it grew in.
  const seedRows = [];
  for (let i = 0; i <= 64; i += 1) {
    const a = -(i / 64) * TAU;
    const furrow = 1 - 0.07 * Math.abs(Math.cos(4 * a)) ** 4;
    const row = [];
    for (let j = 0; j <= 20; j += 1) {
      const lat = -Math.PI / 2 + (j / 20) * Math.PI;
      const r = Math.cos(lat) * (1 - (1 - furrow) * Math.cos(lat));
      row.push(v3(Math.cos(a) * r, Math.sin(lat) * 1.1, Math.sin(a) * r));
    }
    seedRows.push(row);
  }
  const seed = grid(seedRows);

  // --- Prime: six armour segments round a core in its cage (unit) ---------

  // A segment's armour (out from radius 1, up), cut square at its ends: a
  // wall facing the core (dark), its crest sloping down to the outer face
  // (hull), then under its belly back in (dark); the plate laid on its
  // slope, the ribs down its outer face and the fin hung below it.
  const PRIME_WALL = [
    [-0.16, -0.045],
    [-0.172, 0.12],
    [-0.15, 0.2],
  ];
  const PRIME_TOP = [
    [-0.15, 0.2],
    [-0.09, 0.218],
    [0, 0.19],
    [0.1, 0.15],
    [0.17, 0.105],
    [0.205, 0.05],
    [0.215, -0.005],
    [0.2, -0.055],
  ];
  const PRIME_BELLY = [
    [0.2, -0.055],
    [0.165, -0.095],
    [0.06, -0.135],
    [-0.06, -0.125],
    [-0.135, -0.095],
    [-0.16, -0.045],
  ];
  const PRIME_PLATE = [
    [-0.06, 0.2],
    [-0.05, 0.224],
    [0.1, 0.17],
    [0.118, 0.143],
    [0.02, 0.165],
  ];
  const PRIME_RIB = [
    [0.19, -0.06],
    [0.17, 0.12],
    [0.222, 0.075],
    [0.232, -0.045],
  ];
  const PRIME_FIN = [
    [-0.01, -0.2],
    [-0.06, -0.11],
    [0.12, -0.1],
    [0.135, -0.17],
    [0.07, -0.32],
  ];
  const segmentHalf = (TAU / WARDEN_SEGMENTS) * 0.4;
  const segmentRows = capRows(20, 0.035, 0.82);
  const primeSegment = [
    [PRIME_WALL, segmentRows, { half: segmentHalf }, dark],
    [PRIME_TOP, segmentRows, { half: segmentHalf }, hull],
    [PRIME_BELLY, segmentRows, { half: segmentHalf }, dark],
    [PRIME_PLATE, capRows(14, 0.05), { half: segmentHalf * 0.7 }, hull, true],
    ...[-0.6, 0.6].map((at) => [
      PRIME_RIB,
      capRows(1, 0.25, 0.7),
      { half: 0.025, at: at * segmentHalf, pivot: [0.2, 0.03] },
      dark,
      true,
    ]),
    [
      PRIME_FIN,
      capRows(1, 0.3, 0.75),
      { half: 0.035, pivot: [0.05, -0.15] },
      dark,
      true,
    ],
  ].map(([section, rows, opts, color, closed = false]) => ({
    geometry: grid(arc(section, rows, { R: 1, ...opts }), { closed }),
    color,
  }));
  // segment by segment, each the same run of vertices (the draw range sheds
  // them from the end)
  const primeRing = merge(
    Array.from({ length: WARDEN_SEGMENTS }, (_, i) =>
      primeSegment.map((part) => ({
        ...part,
        rotationY: (i / WARDEN_SEGMENTS) * TAU,
      }))
    ).flat()
  );
  // The cage the core hangs in: a collared spire (dark) under a wide bowl
  // (hull), three ribs running up the bowl into claws that curl over the
  // core to the seal ring on its crown. The core swells against it phase by
  // phase (0.45 → 0.61), never through it.
  const primeCradle = merge([
    {
      geometry: lathe(
        [
          [0, -1.04],
          [0.03, -0.96],
          [0.05, -0.84],
          [0.07, -0.76],
          [0.13, -0.74],
          [0.135, -0.69],
          [0.12, -0.66],
        ],
        32,
        3
      ),
      color: dark,
    },
    {
      geometry: lathe(
        [
          [0.12, -0.66],
          [0.22, -0.62],
          [0.34, -0.55],
          [0.46, -0.46],
          [0.55, -0.36],
          [0.62, -0.25],
          [0.655, -0.17],
          [0.635, -0.13],
          [0.57, -0.17],
          [0.42, -0.33],
          [0.22, -0.45],
          [0, -0.48],
        ],
        32,
        3
      ),
      color: hull,
    },
    ...[0, 1, 2].map((i) => ({
      geometry: tube(
        smooth(
          [
            [0.34, -0.565, 0],
            [0.5, -0.42, 0],
            [0.665, -0.17, 0],
            [0.73, 0.1, 0],
            [0.64, 0.38, 0],
            [0.36, 0.56, 0],
          ],
          24
        ),
        (t) => 0.07 * (1 - 0.45 * t),
        8,
        0.5
      ),
      color: dark,
      rotationY: (i / 3) * TAU + Math.PI / 6,
    })),
    {
      geometry: lathe(
        Array.from({ length: 11 }, (_, i) => {
          const a = -Math.PI / 2 + (i / 10) * TAU;
          return [0.36 + Math.cos(a) * 0.035, 0.56 + Math.sin(a) * 0.035];
        }),
        32
      ),
      color: dark,
    },
  ]);

  // --- Choir: three cores in yokes on arms round a hub of pipes (px) ------

  // The hub: a keel and skirt (dark) under the waist groove the arms ride
  // in, a stepped crown (hull) ringed by nine pipes in threes.
  const choirHub = merge([
    {
      geometry: lathe(
        [
          [0, -38],
          [3, -34],
          [5, -27],
          [7, -22],
          [12, -20.5],
          [13, -17.5],
          [19, -14.5],
          [26, -11.5],
          [31, -9],
          [33, -7.6],
          [33, -6.6],
          [25, -6.2],
          [24, 0],
          [25, 6.2],
        ],
        40,
        6
      ),
      color: dark,
    },
    {
      geometry: lathe(
        [
          [25, 6.2],
          [33, 6.6],
          [33, 7.6],
          [30.5, 10],
          [24.5, 12],
          [21, 12.5],
          [20.5, 15],
          [13, 15.5],
          [12.5, 18.5],
          [10, 22],
          [7, 26],
          [4, 30],
          [2, 37],
          [0, 40],
        ],
        40,
        6
      ),
      color: hull,
    },
    ...Array.from({ length: 9 }, (_, i) => {
      const top = 14 + [21, 14, 9][i % 3];
      const at = (i / 9) * TAU;
      const position = [Math.cos(at) * 16.5, 0, Math.sin(at) * 16.5];
      return [
        {
          geometry: lathe(
            [
              [0, 13],
              [2.8, 13],
              [2.8, top - 0.7],
              [2.4, top],
            ],
            10
          ),
          color: hull,
          position,
        },
        {
          geometry: lathe(
            [
              [2.4, top],
              [1.8, top],
              [1.8, top - 3],
              [0, top - 3],
            ],
            10
          ),
          color: dark,
          position,
        },
      ];
    }).flat(),
  ]);

  // An arm (along +X from inside the hub's groove): an arched beam, hull
  // above and dark below, waisted, a fin along its back, flaring into the
  // yoke that holds the core from behind.
  const CHOIR_ARM_END = 55;
  const superellipse = (c, p) => Math.sign(c) * Math.abs(c) ** p;
  // its height, its rise and where it is along the arm (t 0..1)
  const armHeight = (t) => 5 - 2 * t + 3.2 * t ** 4;
  const armRise = (t) => 2.2 * Math.sin(Math.PI * t);
  const armX = (t) => 20 + (CHOIR_ARM_END - 20) * t;
  function choirArmRows(from, to) {
    const rows = [];
    const steps = 22;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const k = i === 0 || i === steps ? 0 : 1;
      const w = (9.5 - 5 * t + 5 * t ** 4) * k;
      const h = armHeight(t) * k;
      const x = armX(t);
      const y = armRise(t);
      const row = [];
      for (let j = 0; j <= 8; j += 1) {
        const a = from + ((to - from) * j) / 8;
        row.push(
          v3(
            x,
            y + h * superellipse(Math.sin(a), 0.6),
            w * superellipse(Math.cos(a), 0.6)
          )
        );
      }
      rows.push(row);
    }
    return rows;
  }
  const finRows = [];
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    const arm = 0.36 + 0.46 * t;
    const x = armX(arm);
    const base = armRise(arm) + armHeight(arm) - 0.8;
    const lift = 4.5 * lens(t, 2) ** 1.5;
    finRows.push([
      v3(x, base, 1.1),
      v3(x, base + lift, 0.35),
      v3(x, base + lift, -0.35),
      v3(x, base, -1.1),
    ]);
  }
  // The yoke that cups the core from behind (round x 90): a band of the
  // sphere round it (latitudes ±28°), dark inside, hull outside and on its
  // rims, rounding off into two horns, four ribs down its back. From above
  // it is a crescent clear of the core and of its halo.
  const YOKE_R = 37;
  const yokeAt = (radius, lat) => {
    const a = (lat * Math.PI) / 180;
    return [radius * Math.cos(a) - YOKE_R, radius * Math.sin(a)];
  };
  const LATS = [-28, -20, -10, 0, 10, 20, 28];
  const YOKE_INSIDE = LATS.map((lat) => yokeAt(34, lat));
  const YOKE_OUTSIDE = [
    yokeAt(34, 28),
    ...LATS.map((lat) => yokeAt(40, -lat)),
    yokeAt(34, -28),
  ];
  const YOKE_RIB = [
    yokeAt(39.5, -25),
    yokeAt(39.5, 25),
    yokeAt(41.8, 22),
    yokeAt(42.3, 0),
    yokeAt(41.8, -22),
  ];
  const yokeArc = { R: YOKE_R, half: 2.25, at: Math.PI, cx: 90 };
  const yokeRows = Array.from({ length: 33 }, (_, i) => {
    const t = 0.5 - 0.5 * Math.cos((i / 32) * Math.PI);
    const k = lens(t, 6);
    return [t, k ** 0.6, k];
  });
  const choirArm = merge([
    { geometry: grid(choirArmRows(0, Math.PI), { u: 2 }), color: hull },
    { geometry: grid(choirArmRows(Math.PI, TAU), { u: 2 }), color: dark },
    { geometry: grid(finRows, { closed: true }), color: hull },
    {
      geometry: grid(arc(YOKE_INSIDE, yokeRows, yokeArc), { u: 3 }),
      color: dark,
    },
    {
      geometry: grid(arc(YOKE_OUTSIDE, yokeRows, yokeArc), { u: 3 }),
      color: hull,
    },
    ...[-1.4, -0.6, 0.6, 1.4].map((turn) => ({
      geometry: grid(
        arc(YOKE_RIB, capRows(1, 0.3, 0.7), {
          R: YOKE_R,
          half: 0.045,
          at: Math.PI + turn,
          cx: 90,
          pivot: yokeAt(40.5, 0),
        }),
        { closed: true }
      ),
      color: dark,
    })),
  ]);
  // A shard of a breaking arm: a flat splinter.
  const shardGeometry = merge([
    {
      geometry: new THREE.OctahedronGeometry(1, 0),
      color: hull,
      flat: true,
      scale: [1.5, 0.45, 0.8],
    },
  ]);

  // --- Null: eight shell petals round a dark core (unit, × px) ------------

  // One petal of the shell, on the sphere of radius 1 round (-1, 0, 0) (its
  // middle at its own origin): a lens from its lower to its upper tip,
  // across it out (hull, a spine down its middle), then back inside (dark).
  const PETAL_OUT = [
    [-1, 0.035],
    [-0.92, 0.008],
    [-0.7, 0],
    [-0.3, -0.004],
    [-0.14, -0.02],
    [0, -0.032],
    [0.14, -0.02],
    [0.3, -0.004],
    [0.7, 0],
    [0.92, 0.008],
    [1, 0.035],
  ];
  const PETAL_IN = [
    [1, 0.035],
    [0.9, 0.1],
    [0.5, 0.118],
    [0, 0.124],
    [-0.5, 0.118],
    [-0.9, 0.1],
    [-1, 0.035],
  ];
  const PETAL_HALF = (TAU / 16) * 0.88;
  function petalRows(section) {
    const rows = [];
    const steps = 26;
    for (let i = 0; i <= steps; i += 1) {
      const t = 0.5 - 0.5 * Math.cos((i / steps) * Math.PI);
      const theta = -0.8 + 1.74 * t;
      const k = lens(t, 3.2);
      rows.push(
        section.map(([w, d]) => {
          const phi = w * PETAL_HALF * k;
          const r = 1 - (0.06 + (d - 0.06) * Math.sqrt(k));
          return v3(
            -1 + r * Math.cos(theta) * Math.cos(phi),
            r * Math.sin(theta),
            r * Math.cos(theta) * Math.sin(phi)
          );
        })
      );
    }
    return rows;
  }
  // the stud on its spine, facing out
  const stud = lathe(
    [
      [0, 0],
      [0.05, 0],
      [0.05, 0.022],
      [0.032, 0.04],
      [0, 0.044],
    ],
    12
  );
  stud.rotateZ(-Math.PI / 2);
  stud.translate(0.015, 0.02, 0);
  const nullPlate = merge([
    { geometry: grid(petalRows(PETAL_OUT)), color: hull },
    { geometry: grid(petalRows(PETAL_IN)), color: dark },
    { geometry: stud, color: dark },
  ]);

  // One view kind per Warden: the boss's `bossKind` picks the body.
  function createWarden(kind) {
    if (kind === 'boss-choir') return createChoir();
    if (kind === 'boss-null') return createNull();
    return createPrime();
  }

  function wardenCoreMaterial(intensity) {
    const material = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#120a1a'),
      emissive: colorOf(THREE, PALETTE.boss),
      emissiveIntensity: intensity,
      roughness: 0.55,
      metalness: 0.2,
    });
    material.onBeforeCompile = patchHotCore;
    return material;
  }

  function createPrime() {
    const group = new THREE.Group();
    // one mesh; the phases shed segments by shortening its draw range, so
    // each Prime owns its geometry
    const ring = new THREE.Mesh(primeRing.clone(), wardenPlateMaterial);
    const cradle = new THREE.Mesh(primeCradle, wardenPlateMaterial);
    const coreMaterial = wardenCoreMaterial(1.3);
    const core = new THREE.Mesh(orb, coreMaterial);
    core.scale.setScalar(0.45);
    group.add(cradle, ring, core);
    kit.scene.add(group);

    return {
      kind: 'boss',
      object: group,
      ring,
      core,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, 1.24)],
      rimColor: kit.rimColors.boss,
      telegraph: kit.createTelegraph(),
      id: null,
    };
  }

  // Three cores on arms around a dark hub; each core owns its material so it
  // can sing (lit) or stay dim, and its arm and shards for the break.
  function createChoir() {
    const group = new THREE.Group();
    const hub = new THREE.Mesh(choirHub, wardenPlateMaterial);
    group.add(hub);
    const hubRim = kit.rim(group, kit.circleRim, 33.5);
    const halos = [];
    const cores = [];
    for (let i = 0; i < 3; i += 1) {
      const pivot = new THREE.Group();
      const arm = new THREE.Mesh(choirArm, wardenPlateMaterial);
      const coreMaterial = wardenCoreMaterial(0.2);
      const core = new THREE.Mesh(orb, coreMaterial);
      core.position.x = 90;
      core.scale.setScalar(CHOIR_CORE_PX);
      // the singing halo: a rim whose gain beats (it was its opacity)
      const haloTone = kit.tone(PALETTE.boss, 1.3);
      const halo = kit.rim(pivot, kit.circleRim, 1, haloTone.color);
      halo.anchor.position.x = 90;
      halos.push(halo);
      const shards = [];
      for (let k = 0; k < CHOIR_SHARDS; k += 1) {
        const shard = new THREE.Mesh(shardGeometry, wardenPlateMaterial);
        shard.visible = false;
        shards.push(shard);
        pivot.add(shard);
      }
      pivot.add(arm, core);
      group.add(pivot);
      cores.push({
        pivot,
        arm,
        core,
        coreMaterial,
        halo: halo.anchor,
        haloTone,
        shards,
      });
    }
    kit.scene.add(group);
    return {
      kind: 'boss-choir',
      object: group,
      cores,
      rims: [hubRim, ...halos],
      rimColor: kit.rimColors.boss,
      telegraph: kit.createTelegraph(3),
      id: null,
    };
  }

  // A dark core inside eight plates; the plates open into an orbit, then are
  // shed. Two rings announce and show the inverted XP pull.
  function createNull() {
    const group = new THREE.Group();
    const coreMaterial = wardenCoreMaterial(0.5);
    coreMaterial.color.copy(colorOf(THREE, '#05030a'));
    const core = new THREE.Mesh(seed, coreMaterial);
    const rim = kit.rim(group, kit.circleRim);
    const plates = [];
    for (let i = 0; i < 8; i += 1) {
      const mesh = new THREE.Mesh(nullPlate, wardenPlateMaterial);
      mesh.scale.setScalar(NULL_CLOSED_PX);
      plates.push({ mesh, shed: null });
      group.add(mesh);
    }
    const pullRings = [0, 1].map(() => {
      const ring = new THREE.Mesh(
        kit.warnRing,
        new THREE.MeshBasicMaterial({
          color: colorOf(THREE, PALETTE.xp),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      );
      ring.position.y = 1;
      ring.visible = false;
      group.add(ring);
      return ring;
    });
    group.add(core);
    kit.scene.add(group);
    return {
      kind: 'boss-null',
      object: group,
      core,
      coreMaterial,
      rim: rim.anchor,
      rims: [rim],
      rimColor: kit.rimColors.boss,
      plates,
      pullRings,
      shedAt: null,
      telegraph: kit.createTelegraph(),
      id: null,
    };
  }

  // A pooled Choir or Null comes back whole.
  function bindWarden(view) {
    if (view.kind === 'boss-choir') {
      view.cores.forEach((core) => {
        core.broken = null;
        core.pivot.visible = true;
        core.pivot.position.set(0, 0, 0);
        core.pivot.rotation.set(0, 0, 0);
        core.shards.forEach((shard) => (shard.visible = false));
      });
      return;
    }
    if (view.kind === 'boss-null') {
      view.shedAt = null;
      view.plates.forEach((plate) => {
        plate.shed = null;
        plate.mesh.visible = true;
        plate.mesh.rotation.set(0, 0, 0);
        plate.mesh.scale.setScalar(NULL_CLOSED_PX);
      });
    }
  }

  function updateWarden(view, boss, time) {
    if (view.kind === 'boss-choir') updateChoir(view, boss, time);
    else if (view.kind === 'boss-null') updateNull(view, boss, time);
    else updatePrime(view, boss, time);
  }

  function updatePrime(view, boss, time) {
    const radius = boss.radius || 60;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = -(boss.rotation || 0);
    view.ring.rotation.y = time * 0.35;
    const phase = Math.max(0, boss.currentPhase || 0);
    const intact = Math.max(1, WARDEN_SEGMENTS - phase * 2);
    const { geometry } = view.ring;
    const perSegment =
      geometry.getAttribute('position').count / WARDEN_SEGMENTS;
    geometry.setDrawRange(0, perSegment * intact);
    view.core.scale.setScalar(0.45 + phase * 0.08);
    const flash = boss.getHitFlash();
    view.coreMaterial.emissiveIntensity =
      1.25 + 0.25 * Math.sin(time * 3) + phase * 0.2 + flash * 0.8;
    kit.updateTelegraph(view.telegraph, boss, radius);
  }

  // The singing core is lit and haloed, the others dim. A broken core keeps
  // its last angle and drifts out with its arm, tumbling and going dark,
  // while shards fly from it.
  function updateChoir(view, boss, time) {
    const flash = boss.getHitFlash();
    const states = boss.cores || [];
    for (let i = 0; i < view.cores.length; i += 1) {
      const c = view.cores[i];
      const state = states[i];
      if (!state) {
        c.pivot.visible = false;
        continue;
      }
      if (state.alive) {
        const angle = Math.atan2(state.y - boss.y, state.x - boss.x);
        c.pivot.rotation.y = -angle;
        const singing = boss.singingIndex === i;
        const beat = Math.sin(time * 5 + i);
        c.coreMaterial.emissiveIntensity = singing
          ? 1.7 + 0.35 * beat + flash * 0.8
          : 0.16 + flash * 0.25;
        c.core.scale.setScalar(
          CHOIR_CORE_PX * (singing ? 1.06 + 0.04 * beat : 0.9)
        );
        c.halo.visible = singing;
        c.halo.scale.setScalar(CHOIR_CORE_PX * (1.62 + 0.08 * beat));
        kit.setGain(c.haloTone, 1.3 * (0.6 + 0.3 * beat));
        continue;
      }
      if (!c.broken) {
        c.broken = { start: time };
        c.halo.visible = false;
      }
      const age = time - c.broken.start;
      if (age > BREAK_SECONDS) {
        c.pivot.visible = false;
        continue;
      }
      const u = age / BREAK_SECONDS;
      // out along the arm, sinking and tipping as it goes
      c.pivot.position.set(0, -40 * u * u, 0);
      c.arm.position.x = 70 * u;
      c.core.position.x = 90 + 120 * u;
      c.arm.rotation.z = -1.2 * u;
      c.arm.rotation.x = 2.5 * u;
      c.core.rotation.y = 6 * u;
      c.coreMaterial.emissiveIntensity =
        (1 - u) * (1.2 + 1.2 * Math.abs(Math.sin(age * 31)));
      c.core.scale.setScalar(CHOIR_CORE_PX * (1 - 0.45 * u));
      const spray = 90 * Math.sqrt(u);
      c.shards.forEach((shard, k) => {
        const a = (k / CHOIR_SHARDS) * TAU + i;
        shard.visible = true;
        shard.position.set(
          90 + Math.cos(a) * spray + 60 * u,
          Math.sin(a * 2) * spray * 0.4 - 30 * u * u,
          Math.sin(a) * spray
        );
        shard.rotation.set(age * (3 + k), age * 2, age * (1 + k));
        shard.scale.setScalar(9 * (1 - u) + 2);
      });
    }
    const t = boss.telegraph;
    kit.updateTelegraph(
      view.telegraph,
      boss,
      t?.type === 'fan' ? CHOIR_CORE_PX * 1.3 : boss.radius || 118
    );
  }

  // Plates follow the boss's own positions (closed shell, then open orbit);
  // once shed they fly out, tumbling and shrinking. The core brightens when
  // exposed. The pull rings close in during the windup and ripple outward
  // while the XP pull is inverted.
  function updateNull(view, boss, time) {
    const flash = boss.getHitFlash();
    const phase = Math.max(0, boss.currentPhase || 0);
    const exposed = phase >= 2;
    const radius = boss.radius || NULL_CLOSED_PX;
    view.core.scale.setScalar(radius * (exposed ? 0.62 : 0.52));
    view.coreMaterial.emissiveIntensity = exposed
      ? 2.2 + 0.5 * Math.sin(time * 6) + flash * 0.8
      : 0.25 + 0.1 * Math.sin(time * 2) + flash * 0.6;
    view.rim.scale.setScalar(radius * (exposed ? 0.8 : 1.25));
    view.rim.visible = exposed || (boss.shellOpen || 0) > 0.2;

    const states = boss.plates || [];
    if (boss.shellShed && view.shedAt === null) view.shedAt = time;
    const shedAge = view.shedAt === null ? 0 : time - view.shedAt;
    for (let i = 0; i < view.plates.length; i += 1) {
      const plate = view.plates[i];
      const state = states[i];
      const { mesh } = plate;
      if (!state) {
        mesh.visible = false;
        continue;
      }
      const dx = state.x - boss.x;
      const dy = state.y - boss.y;
      const angle = Math.atan2(dy, dx);
      if (view.shedAt === null) {
        mesh.visible = true;
        mesh.position.set(dx, 0, dy);
        mesh.rotation.set(0, -angle, 0);
        // an open plate tilts up, so it reads as loose
        mesh.rotation.z = (boss.shellOpen || 0) * 0.3;
        continue;
      }
      if (!plate.shed) plate.shed = { x: dx, y: dy, angle };
      if (shedAge > BREAK_SECONDS) {
        mesh.visible = false;
        continue;
      }
      const u = shedAge / BREAK_SECONDS;
      const out = 260 * u;
      const a = plate.shed.angle;
      mesh.position.set(
        plate.shed.x + Math.cos(a) * out,
        30 * Math.sin(u * Math.PI) - 20 * u,
        plate.shed.y + Math.sin(a) * out
      );
      mesh.rotation.set(shedAge * (2 + (i % 3)), -a + shedAge, shedAge * 3);
      mesh.scale.setScalar(NULL_CLOSED_PX * (1 - 0.7 * u));
    }

    const state = boss.pullState;
    view.pullRings.forEach((ring, k) => {
      ring.visible = state === 'windup' || state === 'inverting';
      if (!ring.visible) return;
      let r;
      let opacity;
      if (state === 'windup') {
        const p = clamp01(
          1 - (boss.pullStateTimer || 0) / WARDEN_KINDS.null.pullWindup
        );
        r = 260 - 170 * p + k * 30;
        opacity = 0.2 + 0.6 * p;
      } else {
        const w = (time * 1.4 + k * 0.5) % 1;
        r = 90 + 300 * w;
        opacity = 0.75 * (1 - w);
      }
      ring.scale.set(r, 1, r);
      ring.material.opacity = opacity;
    });

    kit.updateTelegraph(view.telegraph, boss, radius);
  }

  // Quality preset flipped (EnemyMirror.setSurfaceMaps): the plate maps on
  // or off (one recompile).
  function refreshSurfaceMaps() {
    const enabled = kit.quality.surfaceMaps;
    const plate = wardenPlateMaterial;
    Object.keys(plateMaps).forEach((name) => {
      plate[name] = enabled ? plateMaps[name] : null;
    });
    plate.needsUpdate = true;
  }

  return { createWarden, bindWarden, updateWarden, refreshSurfaceMaps };
}
