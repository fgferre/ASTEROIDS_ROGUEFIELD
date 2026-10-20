// The player hull's 3D model (docs/NORTE.md §3), built from its art data
// (shipModels.js `visual`, upgrades applied by player/hullArt.js): a
// fuselage lofted through the `form` stations (rounded deck, lighter spine,
// chines at the waist, dark keel, seams in the dark tone), airfoil wings cut
// from the fin panels (they grow with the RCS upgrade), tail fins from the
// braking panels, faired nacelles with dark bells round every nozzle (more
// and longer with the thruster upgrade), cheek intakes, wingtip RCS pods, a
// glass canopy in a dark socket and the thin edge lines (cyan prow chines
// and trailing edges; amber blade edges on the Solar Slicer, amber trim on
// the Bastion's stacked armour slabs). Normals average across edges under a
// crease angle: curves read smooth, designed edges stay crisp. The static
// parts merge into one vertex-coloured geometry (mergeStatic.js). Plus the
// dorsal turret (domed housing or the low hexagonal collar, mantlet, twin
// barrels, amber lens in a hood) and the nozzles' glowing throats. One way
// to build the ship: the game's render3d/playerMirror.js and the menu's
// MenuHullPreview.js both call it, with their own materials. Ship-local
// points are [x, height, y] in hull units (ship y → world z); the ship draws
// at VISUAL_SCALE, the turret unscaled.

import { PALETTE } from '../../data/constants/palette.js';
import {
  SHIP_SIZE,
  TURRET_BARREL_LENGTH,
  TURRET_PIVOT_X,
} from '../../data/constants/physics.js';
import { mergeStatic } from './mergeStatic.js';
import { colorOf } from './batches.js';

const S = SHIP_SIZE;
// Vertex tones (hullTones), darkest first; the profiles below use the numbers.
const [DEEP, BASE, FIN, SPINE] = [0, 1, 2, 3];
// Normals average over the faces round a corner within 40° of each other.
const CREASE = Math.cos((40 * Math.PI) / 180);
// Loft resolution: body ring points per quarter turn, Catmull-Rom samples
// per span between `form.body` stations, wing sections and airfoil points
// per side, ring segments of nacelles, pods and intakes, canopy rings.
const BODY_QUARTER = 6;
const BODY_STEPS = 3;
const WING_SPANS = 9;
const AIRFOIL = 7;
const NACELLE_SEGMENTS = 12;
const POD_SEGMENTS = 8;
const CANOPY_RINGS = 10;
const CANOPY_SEGMENTS = 12;
// SHIP_SIZE units: how far a wing root runs on into the fuselage, half the
// width of a seam band, the radius of a wingtip pod and of an intake.
const WING_ROOT = 0.12;
const SEAM_HALF = 0.018;
const POD_R = 0.034;
const INTAKE_R = 0.055;
// Extra thickness share at a wing root (the fillet), fading by a third out.
const ROOT_SWELL = 0.9;
// Profiles [along, radius, tone, ...] in units of their radius: a wingtip
// pod (nose forward, dark exhaust aft) and a cheek intake (dark duct, lip,
// skin tapering aft into the hull).
const POD = [
  3.8, 0, 2, 2.4, 0.75, 2, 0.6, 1, 1, -2.4, 0.9, 1, -3.2, 0.55, 0, -3.2, 0, 0,
];
const INTAKE = [
  -0.9, 0, 0, -0.9, 0.55, 0, 0, 0.62, 0, 0, 0.9, 2, -0.6, 1, 1, -3.5, 0.8, 1,
  -6, 0, 1,
];
// Armour (proposta 18/10): a lower slab inset like the others and a smaller
// upper slab stacked on it; the trim runs on the lower slab's top edge.
const BEVEL = 0.5;
const INSET = 0.8;
const ARMOR_DEPTH = 1.8;
const ARMOR_TOP_DEPTH = 0.9;
const ARMOR_TOP_INSET = 0.5;
// Height of every nozzle's axis (hull units): flames, throats and the trail.
export const NOZZLE_HEIGHT = 2.6;
// Visual only: collision keeps the 2D outline, and effects anchored on the
// nose (muzzle flash, lances) take their position from the simulation.
export const VISUAL_SCALE = 1.35;
// Turret, in field units (unscaled, so the barrel tips meet the sim muzzle):
// built up from y = 0 and seated per hull on its deck at TURRET_PIVOT_X;
// the barrels clear the canopy. Profiles as above, in field units.
const TURRET_BASE_H = 2;
const TURRET_BARREL_Y = TURRET_BASE_H + 0.9;
const TURRET_BARREL_Z = 1.3;
const HOUSING = [
  -0.8, 0, 1, -0.8, 4.1, 3, 0.5, 4.1, 2, 0.8, 3.7, 3, 1.6, 3.2, 3, 2, 2.4, 3,
  2.1, 0, 3,
];
// Low housing (Solar Slicer): wide hexagonal collar, barrels lowered onto it.
const TURRET_LOW_H = 1.2;
const TURRET_LOW_DROP = TURRET_BASE_H - TURRET_LOW_H;
const HOUSING_LOW = [
  -0.8, 0, 1, -0.8, 5.2, 3, 0.35, 5.2, 2, 0.9, 4.5, 3, 1.2, 3.5, 3, 1.2, 0, 3,
];
const MANTLET = [
  -2.3, 0, 1, -2.3, 1.7, 1, -1.7, 2.3, 1, 1.4, 2.3, 1, 2.3, 1.8, 2, 2.6, 1.2, 2,
  2.6, 0, 2,
];
// A barrel measured back from its muzzle, which sits on the sim muzzle point.
const BARREL = [
  -7.5, 0, 1, -7.5, 0.95, 1, -5.4, 0.95, 2, -5.4, 0.62, 2, -0.8, 0.62, 1, -0.8,
  0.82, 1, 0, 0.82, 1, 0, 0.42, 0, -0.6, 0.42, 0, -0.6, 0, 0,
];
const LENS_HOOD = [
  -0.6, 0, 1, -0.3, 0.7, 1, 1.6, 0.85, 1, 2.5, 0.85, 1, 2.5, 0.62, 0, 1.9, 0.62,
  0, 1.9, 0, 0,
];

// `points` shrunk toward their centroid by `k`.
function insetOf(points, k) {
  const cx = points.reduce((n, p) => n + p.x, 0) / points.length;
  const cy = points.reduce((n, p) => n + p.y, 0) / points.length;
  return points.map((p) => ({
    x: cx + (p.x - cx) * k,
    y: cy + (p.y - cy) * k,
  }));
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (u, v) => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];

// Triangles of one closed surface, a tone each. Points are ship-local
// [x, height, y] in hull units (ship y → world z).
class Surface {
  constructor() {
    this.pos = [];
    this.tones = [];
  }

  tri(a, b, c, tone) {
    if (Math.hypot(...cross(sub(b, a), sub(c, a))) < 1e-6) return;
    this.pos.push(...a, ...b, ...c);
    this.tones.push(tone);
  }

  // Bands between consecutive closed rings of one length; `toneOf(i, j)`
  // names the quad from ring i, point j. A ring shrunk to a point closes an
  // end; a `cap` tone closes the last ring with a flat fan.
  loft(rings, toneOf, cap) {
    const n = rings[0].length;
    for (let i = 0; i < rings.length - 1; i += 1) {
      const [a, b] = [rings[i], rings[i + 1]];
      for (let j = 0; j < n; j += 1) {
        const k = (j + 1) % n;
        this.tri(a[j], b[j], b[k], toneOf(i, j));
        this.tri(a[j], b[k], a[k], toneOf(i, j));
      }
    }
    if (cap === undefined) return this;
    const last = rings[rings.length - 1];
    const c = [0, 1, 2].map((k) => last.reduce((s, p) => s + p[k], 0) / n);
    last.forEach((p, j) => this.tri(c, last[(j + 1) % n], p, cap));
    return this;
  }

  // A non-indexed BufferGeometry's triangles, all of `tone`.
  addGeometry(geometry, tone) {
    const p = geometry.getAttribute('position');
    const at = (i) => [p.getX(i), p.getY(i), p.getZ(i)];
    for (let i = 0; i < p.count; i += 3) {
      this.tri(at(i), at(i + 1), at(i + 2), tone);
    }
    geometry.dispose();
    return this;
  }
}

// Winds `surface` outward (positive volume round its centroid) and returns
// its normals: per corner, the area-weighted mean of the faces meeting at
// that point within the crease angle.
function bake(surface) {
  const { pos } = surface;
  const count = pos.length / 9;
  const point = (i) => [pos[i], pos[i + 1], pos[i + 2]];
  const centre = [0, 1, 2].map((k) => {
    let sum = 0;
    for (let i = k; i < pos.length; i += 3) sum += pos[i];
    return sum / (count * 3);
  });
  const faces = [];
  let volume = 0;
  for (let o = 0; o < pos.length; o += 9) {
    const [a, b, c] = [o, o + 3, o + 6].map((i) => sub(point(i), centre));
    const n = cross(sub(b, a), sub(c, a));
    faces.push(n);
    volume += a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
  }
  if (volume < 0) {
    for (let i = 0; i < pos.length; i += 1) {
      if (i % 9 >= 3 && i % 9 < 6) {
        [pos[i], pos[i + 3]] = [pos[i + 3], pos[i]];
      }
    }
    faces.forEach((n) => n.forEach((v, k) => (n[k] = -v)));
  }
  const units = faces.map((n) => n.map((v) => v / (Math.hypot(...n) || 1)));
  const corners = new Map();
  for (let k = 0; k < count * 3; k += 1) {
    const key = point(k * 3)
      .map((v) => Math.round(v * 1e3))
      .join();
    if (!corners.has(key)) corners.set(key, []);
    corners.get(key).push(k);
  }
  const normals = new Float32Array(count * 9);
  corners.forEach((list) =>
    list.forEach((k) => {
      const u = units[Math.floor(k / 3)];
      const n = [0, 0, 0];
      list.forEach((m) => {
        const f = Math.floor(m / 3);
        const w = units[f];
        if (u[0] * w[0] + u[1] * w[1] + u[2] * w[2] < CREASE) return;
        faces[f].forEach((v, c) => (n[c] += v));
      });
      const length = Math.hypot(...n) || 1;
      n.forEach((v, c) => (normals[k * 3 + c] = v / length));
    })
  );
  return normals;
}

// Baked surfaces bucketed by tone: one geometry per tone for mergeStatic,
// with planar UVs (hull units, on the face's dominant axis) for the maps.
class ToneParts {
  constructor() {
    this.buckets = new Map();
  }

  add(surface) {
    const normals = bake(surface);
    surface.tones.forEach((tone, f) => {
      if (!this.buckets.has(tone)) this.buckets.set(tone, [[], []]);
      const [pos, nor] = this.buckets.get(tone);
      for (let k = f * 9; k < f * 9 + 9; k += 1) {
        pos.push(surface.pos[k]);
        nor.push(normals[k]);
      }
    });
    return this;
  }

  parts(THREE, colors) {
    return [...this.buckets].map(([tone, [pos, nor]]) => {
      const uv = new Float32Array((pos.length / 3) * 2);
      for (let o = 0; o < pos.length; o += 9) {
        const at = (k) => pos.slice(o + k * 3, o + k * 3 + 3);
        const n = cross(sub(at(1), at(0)), sub(at(2), at(0))).map(Math.abs);
        const [a, b] =
          n[1] >= n[0] && n[1] >= n[2]
            ? [0, 2]
            : n[2] >= n[0]
              ? [0, 1]
              : [2, 1];
        for (let k = 0; k < 3; k += 1) {
          uv.set([at(k)[a], at(k)[b]], (o / 3 + k) * 2);
        }
      }
      const geometry = new THREE.BufferGeometry();
      const attribute = (array, size) =>
        new THREE.BufferAttribute(Float32Array.from(array), size);
      geometry.setAttribute('position', attribute(pos, 3));
      geometry.setAttribute('normal', attribute(nor, 3));
      geometry.setAttribute('uv', attribute(uv, 2));
      geometry.setAttribute('uv2', attribute(uv, 2));
      return { geometry, color: colors[tone] };
    });
  }
}

// A body of revolution: `rows` [along, radius, tone, ...] from one end to
// the other (radius 0 closes an end), times `scale`; `at(along, radius,
// angle)` places a point.
function revolve(rows, segments, at, scale = 1) {
  const rings = [];
  for (let i = 0; i < rows.length; i += 3) {
    rings.push(
      Array.from({ length: segments }, (_, k) =>
        at(rows[i] * scale, rows[i + 1] * scale, (2 * Math.PI * k) / segments)
      )
    );
  }
  return new Surface().loft(rings, (i) => rows[i * 3 + 2]);
}
// Round the x axis through (x, y, z), heights scaled by `squash`; round the
// vertical axis; a rounded box along x (superellipse exponent `p`).
const aroundX =
  (x, y, z, squash = 1) =>
  (along, r, a) => [
    x + along,
    y + r * Math.sin(a) * squash,
    z + r * Math.cos(a),
  ];
const aroundY = (along, r, a) => [r * Math.cos(a), along, r * Math.sin(a)];
const boxAlongX = (x, y, z, p, squash) => (along, r, a) => {
  const bend = (v) => Math.sign(v) * Math.abs(v) ** (2 / p);
  return [
    x + along,
    y + r * squash * bend(Math.sin(a)),
    z + r * bend(Math.cos(a)),
  ];
};

// Catmull-Rom through `rows` (arrays of numbers), `steps` samples a span.
function sampleRows(rows, steps) {
  const at = (i) => rows[Math.max(0, Math.min(rows.length - 1, i))];
  const out = [];
  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      out.push(
        p1.map(
          (b, k) =>
            b +
            0.5 * t * (p2[k] - p0[k]) +
            t * t * (p0[k] - 2.5 * b + 2 * p2[k] - 0.5 * p3[k]) +
            0.5 * t ** 3 * (3 * b - p0[k] - 3 * p2[k] + p3[k])
        )
      );
    }
  }
  out.push(rows[rows.length - 1].slice());
  return out;
}

// Station rows (descending x) with two more at x ± SEAM_HALF round each seam.
function withSeams(rows, seams) {
  seams.forEach((seam) =>
    [seam + SEAM_HALF, seam - SEAM_HALF].forEach((x) => {
      const i = rows.findIndex((row) => row[0] < x * S);
      if (i <= 0) return;
      const [a, b] = [rows[i - 1], rows[i]];
      const t = (a[0] - x * S) / (a[0] - b[0]);
      rows.splice(
        i,
        0,
        a.map((v, k) => v + (b[k] - v) * t)
      );
    })
  );
  return rows;
}

// Lateral fractions round a body ring: over the deck from one chine (t = 1)
// to the other, then back under the belly.
const RING_T = Array.from({ length: 4 * BODY_QUARTER }, (_, k) =>
  k <= 2 * BODY_QUARTER
    ? Math.cos((Math.PI * k) / (2 * BODY_QUARTER))
    : -Math.cos((Math.PI * (k - 2 * BODY_QUARTER)) / (2 * BODY_QUARTER))
);
// Deck or belly height share at lateral fraction t: (1 − |t|^m)^(1/n).
const arch = ([m, n], t) => Math.max(0, 1 - Math.abs(t) ** m) ** (1 / n);

// One body station [x, half-width, chine, deck rise, keel drop] as a ring.
function bodyRing([x, w, chine, rise, drop], form) {
  return RING_T.map((t, k) => [
    x,
    k <= 2 * BODY_QUARTER
      ? chine + Math.max(0, rise) * arch(form.deck, t)
      : chine - Math.max(0, drop) * arch(form.belly, t),
    Math.max(0, w) * t,
  ]);
}

// Leading (front) and trailing (back) x where |y| = u crosses `points`.
function chordAt(points, u) {
  let front = -Infinity;
  let back = Infinity;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const [ua, ub] = [Math.abs(a.y), Math.abs(b.y)];
    if (ua === ub || (u - ua) * (u - ub) > 0) return;
    const x = a.x + ((b.x - a.x) * (u - ua)) / (ub - ua);
    front = Math.max(front, x);
    back = Math.min(back, x);
  });
  return { front, back };
}

// Half-thickness share along the chord (0 leading edge, 1 trailing): a
// rounded NACA nose, or a lens with two sharp edges for a blade.
function airfoil(s, blade) {
  if (blade) return 2 * s * (1 - s);
  const polynomial = 0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s;
  return 5 * (polynomial + 0.2843 * s ** 3 - 0.1036 * s ** 4);
}

// A wing panel lofted root to tip in airfoil sections cut along the flight
// axis, its span turned up `cant` degrees round the root. The root is the
// panel's second-innermost corner (full chord there), carried WING_ROOT on
// into the fuselage and swollen into a fillet over the inner third of the
// span. `wing`: { lift (root height), cant, tc: [root, tip]
// thickness/chord, belly (underside share) }. Returns the surface, its edge
// polylines (root to tip) and the tip point.
function wingOf(points, wing, blade) {
  const side = Math.sign(points.reduce((n, p) => n + p.y, 0)) || 1;
  const spans = points.map((p) => Math.abs(p.y)).sort((a, b) => a - b);
  const [u0, u1] = [spans[1], spans[spans.length - 1]];
  const angle = (wing.cant * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const rings = [];
  for (let i = -1; i <= WING_SPANS; i += 1) {
    const f = Math.max(0, Math.sin((Math.PI / 2) * (i / WING_SPANS)));
    const { front, back } = chordAt(points, u0 + (u1 - u0) * f);
    const swell = 1 + ROOT_SWELL * Math.max(0, 1 - f / 0.35) ** 2;
    const tc = (wing.tc[0] + (wing.tc[1] - wing.tc[0]) * f) * swell;
    const d = i < 0 ? -WING_ROOT * S : (u1 - u0) * f;
    const ring = [];
    for (let k = 0; k < 2 * AIRFOIL; k += 1) {
      const top = k <= AIRFOIL;
      const step = top ? k : 2 * AIRFOIL - k;
      const s = (1 - Math.cos((Math.PI * step) / AIRFOIL)) / 2;
      const dz =
        (front - back) * tc * airfoil(s, blade) * (top ? 1 : -wing.belly);
      ring.push([
        front - s * (front - back),
        wing.lift + d * sin + dz * cos,
        side * (u0 + d * cos - dz * sin),
      ]);
    }
    rings.push(ring);
  }
  // Fin tone on top with a dark control-surface band aft; dark below.
  const toneOf = (_, j) => (j >= AIRFOIL - 2 ? BASE : FIN);
  const outboard = rings.slice(1);
  return {
    surface: new Surface().loft(rings.slice().reverse(), toneOf, BASE),
    lead: outboard.map((ring) => ring[0]),
    trail: outboard.map((ring) => ring[AIRFOIL]),
    tip: rings[rings.length - 1][0],
  };
}

// Consecutive points of a polyline as line-segment pairs, nudged by `dx`.
function pushPolyline(THREE, segments, points, dx = 0) {
  const at = (p) => new THREE.Vector3(p[0] + dx, p[1], p[2]);
  for (let i = 0; i < points.length - 1; i += 1) {
    segments.push(at(points[i]), at(points[i + 1]));
  }
}

/** The hull tones by DEEP, BASE, FIN, SPINE (linear), before a hull's albedo. */
export function hullTones(THREE) {
  const tone = (from, to, t) =>
    colorOf(THREE, from).lerp(colorOf(THREE, to), t);
  return [
    tone(PALETTE.rockShadow, PALETTE.hull, 0.4),
    tone(PALETTE.hull, PALETTE.hullLit, 0.2),
    tone(PALETTE.hullLit, PALETTE.neutral, 0.15),
    tone(PALETTE.hullLit, PALETTE.neutral, 0.6),
  ];
}

/**
 * The turret, built up from y = 0: the housing (a domed ring) and the low
 * hexagonal collar, and the barrels group (mantlet with shrouded barrels,
 * muzzle brakes, dark bores and the lens hood, plus the amber lens), one
 * merged mesh per moving part in `material` (vertex `tones`). Returns
 * { group, housing, housingLow, barrels }; seatTurret() fits it to a hull.
 */
export function buildTurret(THREE, material, tones, lensMaterial) {
  const solid = (...surfaces) => {
    const parts = new ToneParts();
    surfaces.forEach((surface) => parts.add(surface));
    return new THREE.Mesh(
      mergeStatic(THREE, parts.parts(THREE, tones)),
      material
    );
  };
  const housing = solid(revolve(HOUSING, 16, aroundY));
  housing.name = 'turretHousing';
  const housingLow = solid(revolve(HOUSING_LOW, 6, aroundY));
  housingLow.name = 'turretHousingLow';
  // Barrels and their mantlet recoil together along the turret's axis.
  const barrels = new THREE.Group();
  const barrel = (z) =>
    revolve(BARREL, 8, aroundX(TURRET_BARREL_LENGTH, TURRET_BARREL_Y, z));
  const gun = solid(
    revolve(MANTLET, 16, boxAlongX(0, TURRET_BARREL_Y, 0, 5, 0.5)),
    barrel(-TURRET_BARREL_Z),
    barrel(TURRET_BARREL_Z),
    revolve(LENS_HOOD, 10, aroundX(0, TURRET_BARREL_Y + 1.1, 0, 0.8))
  );
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 8, 6).translate(
      2.1,
      TURRET_BARREL_Y + 1.1,
      0
    ),
    lensMaterial ??
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, PALETTE.shot).multiplyScalar(2),
        toneMapped: false,
      })
  );
  barrels.add(gun, lens);
  const group = new THREE.Group();
  group.add(housing, housingLow, barrels);
  return { group, housing, housingLow, barrels };
}

/**
 * Shows the housing a hull's `visual` asks for (`turret: 'low'`: the collar,
 * barrels lowered onto it) and seats the turret on its `model`'s deck.
 */
export function seatTurret(turret, visual, model) {
  const low = visual.turret === 'low';
  turret.housing.visible = !low;
  turret.housingLow.visible = low;
  turret.barrels.position.y = low ? -TURRET_LOW_DROP : 0;
  turret.group.position.set(TURRET_PIVOT_X, model.deckY * VISUAL_SCALE, 0);
}

/** A nozzle's hot throat: a glowing lens in its bell's mouth. */
export function throatGeometry(THREE, nozzle) {
  return new THREE.SphereGeometry(nozzle.r * 0.8, 8, 6)
    .scale(0.55, 1, 1)
    .translate(nozzle.exitX + nozzle.r * 0.2, NOZZLE_HEIGHT, nozzle.y);
}

/** The model's edge lines, one LineSegments named per kind in `materials`. */
export function edgeLines(THREE, model, materials) {
  return Object.entries(model.edges)
    .filter(([, segments]) => segments.length)
    .map(([name, segments]) => {
      const lines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(segments),
        materials[name]
      );
      lines.name = name;
      return lines;
    });
}

/**
 * A hull's model from its geometry (hullArt.js: panels with the upgrades
 * applied, nozzles, cockpit, `form` in SHIP_SIZE units) and `tones`
 * (hullTones, scaled here by the hull's albedo). Returns { hull, ghost,
 * canopy, edges, tips, deckY }: the static parts as one vertex-coloured
 * geometry, fuselage and wings first, then the nacelles, intakes, pods,
 * tail fins, armour and canopy socket; `ghost` draws only the first range
 * of the same buffers (the dash afterimages); the canopy's glass; the edge
 * segments by kind ({ edge, bladeEdge }); the wingtip points (RCS ports) in
 * the panels' order; the deck height at the turret pivot.
 */
export function buildHullModel(THREE, geometry, tones) {
  const { form, cockpit } = geometry;
  const colors = tones.map((c) => c.clone().multiplyScalar(geometry.albedo));
  const [body, detail] = [new ToneParts(), new ToneParts()];
  const edges = { edge: [], bladeEdge: [] };
  const tips = [];

  // Light spine down the deck, fin-tone deck sides; under the chines a
  // dark belly, a fin-tone belly plate either side of a dark keel; dark
  // seam bands; a flat dark stern where the nozzles leave.
  const scaled = form.body.map((row) => row.map((v) => v * S));
  const stations = withSeams(sampleRows(scaled, BODY_STEPS), form.seams);
  const bodyTone = (i, j) => {
    const t = Math.abs((RING_T[j] + RING_T[(j + 1) % RING_T.length]) / 2);
    const x = (stations[i][0] + stations[i + 1][0]) / (2 * S);
    const seam = form.seams.some((at) => Math.abs(x - at) < SEAM_HALF);
    if (j < 2 * BODY_QUARTER) {
      return seam ? BASE : t < form.spine ? SPINE : FIN;
    }
    if (seam || t < form.keel) return DEEP;
    return t < 0.6 ? FIN : BASE;
  };
  const rings = stations.map((row) => bodyRing(row, form));
  body.add(new Surface().loft(rings, bodyTone, DEEP));
  // The station row at x, linearly between samples.
  const rowAt = (x) => {
    const found = stations.findIndex((row) => row[0] <= x);
    const i = found < 0 ? stations.length - 1 : Math.max(1, found);
    const [a, b] = [stations[i - 1], stations[i]];
    const t = Math.max(0, Math.min(1, (a[0] - x) / (a[0] - b[0] || 1)));
    return a.map((v, k) => v + (b[k] - v) * t);
  };
  const deckAt = (x) => rowAt(x)[2] + rowAt(x)[3];
  // Cyan line along the prow chines, just outside the waist.
  const prow = stations.filter((row) => row[0] >= form.prow * S);
  [-1, 1].forEach((side) =>
    pushPolyline(
      THREE,
      edges.edge,
      prow.map(([x, w, chine]) => [x, chine, side * (w + 0.06)])
    )
  );

  geometry.panels.forEach((panel) => {
    if (panel.armor) {
      detail.add(armorOf(THREE, edges, panel, form.armor * S));
    } else if (panel.rcsPort) {
      const wing = wingOf(panel.points, form.wing, geometry.blades);
      body.add(wing.surface);
      tips.push(wing.tip);
      const line = geometry.blades ? edges.bladeEdge : edges.edge;
      if (geometry.blades) pushPolyline(THREE, line, wing.lead, 0.08);
      pushPolyline(THREE, line, wing.trail.slice(1), -0.08);
      if (form.pods) {
        detail.add(revolve(POD, POD_SEGMENTS, aroundX(...wing.tip), POD_R * S));
      }
    } else if (panel.flap) {
      detail.add(wingOf(panel.points, form.flap, false).surface);
    }
  });

  // Cheek intakes at the chines, mouths forward, sunk a little into the
  // hull's side.
  if (form.intake) {
    const [x, w, chine] = rowAt(form.intake * S);
    [-1, 1].forEach((side) =>
      detail.add(
        revolve(
          INTAKE,
          POD_SEGMENTS,
          aroundX(x, chine - 0.2, side * (w - 0.3), 0.8),
          INTAKE_R * S
        )
      )
    );
  }

  // Nacelles: a fairing from inside the hull, a collar band, the bell to
  // the exit lip, then a dark throat inside it.
  geometry.nozzles.forEach(({ x, y, r, exitX }) => {
    const fore = form.nacelle * S;
    const exit = exitX - x;
    const rows = [
      ...[fore, 0, BASE, fore * 0.6, r * 0.9, BASE],
      ...[fore * 0.25, r * 1.22, BASE, 0, r * 1.3, FIN],
      ...[-r * 0.35, r * 1.3, DEEP, -r * 0.35, r * 1.16, BASE],
      ...[exit, r * 1.02, FIN, exit, r * 0.8, DEEP],
      ...[exit + r * 0.7, r * 0.62, DEEP, exit + r * 0.7, 0, DEEP],
    ];
    detail.add(revolve(rows, NACELLE_SEGMENTS, aroundX(x, NOZZLE_HEIGHT, y)));
  });

  // Canopy: a teardrop of glass, fuller toward the front, in a low dark
  // socket a size larger.
  const length = cockpit.to.x - cockpit.from.x;
  const front = cockpit.to.x + length * 0.2;
  const back = cockpit.from.x - length * 0.35;
  const canopyRings = (widen, lift) =>
    Array.from({ length: CANOPY_RINGS + 1 }, (_, i) => {
      const s = i / CANOPY_RINGS;
      const x = front - (front - back) * s;
      const bulge = Math.sin(Math.PI * s ** 0.7) ** 0.6;
      const w = cockpit.width * 1.3 * widen * bulge;
      const h = form.canopy * S * lift * bulge;
      return Array.from({ length: CANOPY_SEGMENTS }, (_, k) => {
        const a = (2 * Math.PI * k) / CANOPY_SEGMENTS;
        return [x, deckAt(x) - 0.35 + h * Math.sin(a), w * Math.cos(a)];
      });
    });
  detail.add(new Surface().loft(canopyRings(1.25, 0.5), () => DEEP));
  const glass = new Surface().loft(canopyRings(1, 1), () => DEEP);
  const glassNormals = bake(glass);
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute(
    'position',
    new THREE.BufferAttribute(Float32Array.from(glass.pos), 3)
  );
  canopy.setAttribute('normal', new THREE.BufferAttribute(glassNormals, 3));
  canopy.computeBoundingSphere();

  const merged = mergeHull(
    THREE,
    body.parts(THREE, colors),
    detail.parts(THREE, colors)
  );
  const deckY = deckAt(TURRET_PIVOT_X / VISUAL_SCALE);
  return { ...merged, canopy, edges, tips, deckY };
}

// Shoulder armour: a lower slab over the wing root and a smaller one on
// it, chamfered; the trim runs on the lower slab's outboard edges.
function armorOf(THREE, edges, panel, lift) {
  const lower = insetOf(panel.points, INSET);
  const upper = insetOf(panel.points, ARMOR_TOP_INSET);
  const top = lift + ARMOR_DEPTH + BEVEL;
  const cx = lower.reduce((n, p) => n + p.x, 0) / lower.length;
  const cy = lower.reduce((n, p) => n + p.y, 0) / lower.length;
  lower.forEach((a, i) => {
    const b = lower[(i + 1) % lower.length];
    const [nx, ny] = [b.y - a.y, a.x - b.x];
    const outward = nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy);
    const outboard =
      (Math.sign(outward) * ny * Math.sign(cy)) / Math.hypot(nx, ny);
    if (outboard > 0.3) {
      edges.bladeEdge.push(
        new THREE.Vector3(a.x, top + 0.05, a.y),
        new THREE.Vector3(b.x, top + 0.05, b.y)
      );
    }
  });
  return new Surface()
    .addGeometry(plate(THREE, lower, ARMOR_DEPTH, lift), FIN)
    .addGeometry(plate(THREE, upper, ARMOR_TOP_DEPTH, top), SPINE);
}

// One matte slab: `points` (ship-local, y → world z) extruded `depth` up
// from `lift`, its top edge chamfered.
function plate(THREE, points, depth, lift) {
  // Shape in (x, −y) so rotateX(−π/2) puts height up and keeps y → z.
  const shape = new THREE.Shape();
  points.forEach((p, i) =>
    i ? shape.lineTo(p.x, -p.y) : shape.moveTo(p.x, -p.y)
  );
  shape.closePath();
  const solid = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 1,
  });
  const position = solid.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    position.setZ(i, lift + Math.max(0, position.getZ(i)));
  }
  return solid.rotateX(-Math.PI / 2);
}

// The hull's parts as one vertex-coloured geometry, fuselage and wings
// first: the dash ghosts draw only that range of the same buffers.
function mergeHull(THREE, plates, raised) {
  const parts = [...plates, ...raised];
  const hull = mergeStatic(THREE, parts);
  parts.forEach((part) => part.geometry.dispose());
  const ghost = new THREE.BufferGeometry();
  ghost.setAttribute('position', hull.getAttribute('position'));
  ghost.setDrawRange(
    0,
    plates.reduce(
      (n, part) => n + part.geometry.getAttribute('position').count,
      0
    )
  );
  ghost.boundingSphere = hull.boundingSphere;
  return { hull, ghost };
}
