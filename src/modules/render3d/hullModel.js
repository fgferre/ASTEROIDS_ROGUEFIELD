// The player hull's 3D model entry point (docs/NORTE.md §3): the vertex tones
// (hullTones) and the one geometry the static parts merge into, with the
// range the dash ghosts draw (mergeHull). The hull's shape itself, built from
// its art data (shipModels.js `visual`, upgrades applied by
// player/hullArt.js), is hullSlabModel.js; here are also the thin edge lines,
// the nozzles' glowing throats and the dorsal turret (domed housing or the
// low hexagonal collar, mantlet, twin barrels, amber lens in a hood) with its
// multi-lock layers (thin discs stacked on its axis, one thin barrel each).
// Each solid draws in three finishes (HULL_FINISHES: satin paint, glossier
// accent panels, polished steel), one draw group each in finish order.
// One way to build the ship: the game's render3d/playerMirror.js and the
// menu's MenuHullPreview.js both call it, with their own materials made
// from HULL_FINISHES.
// Ship-local points are [x, height, y] in hull units (ship y → world z); the
// ship draws at VISUAL_SCALE, the turret unscaled.

import { PALETTE } from '../../data/constants/palette.js';
import {
  TURRET_BARREL_LENGTH,
  TURRET_PIVOT_X,
} from '../../data/constants/physics.js';
import { FINISH, buildSlabHull } from './hullSlabModel.js';
import { mergeStatic } from './mergeStatic.js';
import { colorOf } from './batches.js';

// Normals average over the faces round a corner within 40° of each other.
const CREASE = Math.cos((40 * Math.PI) / 180);
// Height of every nozzle's axis (hull units): flames, throats and the trail.
export const NOZZLE_HEIGHT = 2.6;
// Visual only: collision keeps the 2D outline, and effects anchored on the
// nose (muzzle flash, lances) take their position from the simulation.
export const VISUAL_SCALE = 1.35;
// Turret, in field units (unscaled, so the barrel tips meet the sim muzzle):
// built up from y = 0 and seated per hull on its deck at TURRET_PIVOT_X;
// the barrels clear the canopy. Profiles [along, radius, tone, ...] in field
// units, tones as hullTones (0 darkest).
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
// Multi-lock layers (Targeting Matrix rank 3): thin discs stacked on the
// turret's axis above the lens hood, each a little narrower than the one
// under it, on a hub that reaches down to it; heights from the disc's
// underside, radii in units of its radius. Each has one thin barrel
// (measured back from its muzzle, on the sim muzzle point) at mid-disc.
const LAYER_BASE_Y = 5;
const LAYER_STEP = 0.75;
const LAYER_R = 2.1;
const LAYER_TAPER = 0.3;
const LAYER_DISC = [
  -0.45, 0, 0, -0.45, 0.3, 0, 0, 0.3, 0, 0, 0.92, 1, 0.12, 1, 2, 0.36, 1, 3,
  0.5, 0.92, 1, 0.5, 0, 1,
];
const LAYER_MID_Y = 0.25;
const LAYER_BARREL = [
  -7.6, 0, 1, -7.6, 0.45, 1, -6.3, 0.45, 2, -6.3, 0.3, 2, -0.6, 0.3, 3, -0.6,
  0.42, 3, 0, 0.42, 0, 0, 0.18, 0, -0.4, 0.18, 0, -0.4, 0, 0,
];

// The steel tone (hullTones).
const STEEL = 4;

/**
 * How each material the game builds with takes the light, one place for
 * every model (MeshStandardMaterial settings): a little shine by what a
 * thing is made of (the owner, 13/11: "aço inoxidável tem brilho, vidro tem
 * brilho... metais geralmente têm brilho"), the mass still matte enough to
 * read (docs/NORTE.md §2). proposta 13/11, set by eye on captures:
 * - paint: painted plate, satin (hulls, enemy plates, pickups);
 * - gloss: lacquered accent panels and shells;
 * - steel: polished or bare metal (barrels, blades, rails, claws, rams);
 * - glass: canopies and lens covers, a tight glint;
 * - crystal: cut crystal facets, a sharp highlight;
 * - worn: rust, soot, wrecks, broken plate, the Ring and the places' sets
 *   (seen under their haze, no finer shine shows), dull;
 * - rock: stone, dullest.
 */
export const SHINE = Object.freeze({
  paint: Object.freeze({ metalness: 0.2, roughness: 0.64, envMapIntensity: 1 }),
  gloss: Object.freeze({
    metalness: 0.2,
    roughness: 0.48,
    envMapIntensity: 1.2,
  }),
  steel: Object.freeze({
    metalness: 0.85,
    roughness: 0.3,
    envMapIntensity: 1.2,
  }),
  glass: Object.freeze({
    metalness: 0.1,
    roughness: 0.22,
    envMapIntensity: 1.2,
  }),
  crystal: Object.freeze({
    metalness: 0.1,
    roughness: 0.25,
    envMapIntensity: 2,
  }),
  worn: Object.freeze({ metalness: 0.15, roughness: 0.88, envMapIntensity: 1 }),
  rock: Object.freeze({ metalness: 0.04, roughness: 0.94, envMapIntensity: 1 }),
});

/**
 * The hull's materials per finish (FINISH order): satin paint, glossier
 * accent panels, polished steel; the paint and the accents carry the baked
 * panel maps (their roughness map is about 1, so `roughness` is what the
 * surface gets).
 */
export const HULL_FINISHES = Object.freeze([
  SHINE.paint,
  SHINE.gloss,
  // The ship's own steel, not the table's: the owner saw its barrels in the
  // shared steel (13/11) and preferred them as they were.
  Object.freeze({ metalness: 1, roughness: 0.45, envMapIntensity: 2.5 }),
]);

/**
 * GLSL for after `#include <lights_fragment_end>`: caps the specular light
 * (direct and reflected) so the glossy finishes keep a tight sheen without
 * clipping to white and blooming on a face turned to the key light.
 * proposta 12/11.
 */
export const SPECULAR_CAP_GLSL = `
      reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(0.3));
      reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular, vec3(0.2));`;

/**
 * A MeshStandardMaterial's onBeforeCompile (set it before addRimLight, which
 * chains after it): the specular cap, and a part's own SHINE class where
 * its merged geometry carries one (mergeStatic `shine`: roughness and
 * metalness per vertex, 0 for the material's own), so a body's steel parts
 * gleam in the same draw as its painted plates. A geometry without the
 * attribute reads WebGL's constant for it (0, or 1 where a ShaderMaterial
 * left its default colour on that slot): both mean the material's own.
 */
export function patchShine(shader) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\nattribute vec2 shine;\nvarying vec2 vShine;'
    )
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvShine = shine;'
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vShine;')
    .replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
      if (vShine.x > 0.0 && vShine.x < 1.0) {
        roughnessFactor *= vShine.x / roughness;
        metalnessFactor = vShine.y;
      }`
    )
    .replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>${SPECULAR_CAP_GLSL}`
    );
}

/** Gives `material` patchShine (again after a clone(), which drops it). */
export function shiny(material) {
  material.onBeforeCompile = patchShine;
  return material;
}

/**
 * The canopy's dark glass: a tight highlight over a faint cyan glow.
 * proposta 12/11.
 */
export const CANOPY_GLASS = Object.freeze({ ...SHINE.glass, glow: 0.14 });

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
  // end.
  loft(rings, toneOf) {
    const n = rings[0].length;
    for (let i = 0; i < rings.length - 1; i += 1) {
      const [a, b] = [rings[i], rings[i + 1]];
      for (let j = 0; j < n; j += 1) {
        const k = (j + 1) % n;
        this.tri(a[j], b[j], b[k], toneOf(i, j));
        this.tri(a[j], b[k], a[k], toneOf(i, j));
      }
    }
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
  constructor(finish = FINISH.paint) {
    this.buckets = new Map();
    this.finish = finish;
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
      return { geometry, color: colors[tone], finish: this.finish };
    });
  }
}

// Merges `parts` in finish order (stable) and adds one draw group per run
// of a finish, its material index the finish.
function mergeFinishes(THREE, parts) {
  const finishOf = (part) => part.finish ?? FINISH.paint;
  const ordered = [...parts].sort((a, b) => finishOf(a) - finishOf(b));
  const merged = mergeStatic(THREE, ordered);
  let start = 0;
  ordered.forEach((part, i) => {
    const { index } = part.geometry;
    const count = index
      ? index.count
      : part.geometry.getAttribute('position').count;
    const last = merged.groups[merged.groups.length - 1];
    if (i > 0 && last.materialIndex === finishOf(part)) last.count += count;
    else merged.addGroup(start, count, finishOf(part));
    start += count;
  });
  return merged;
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
// A barrel in steel: every tone but the bore's (0) turns STEEL.
function steel(surface) {
  surface.tones = surface.tones.map((tone) => (tone ? STEEL : tone));
  return surface;
}
const aroundY = (along, r, a) => [r * Math.cos(a), along, r * Math.sin(a)];
const boxAlongX = (x, y, z, p, squash) => (along, r, a) => {
  const bend = (v) => Math.sign(v) * Math.abs(v) ** (2 / p);
  return [
    x + along,
    y + r * squash * bend(Math.sin(a)),
    z + r * bend(Math.cos(a)),
  ];
};

/**
 * The hull tones by DEEP, BASE, FIN, SPINE and STEEL (linear), before a
 * hull's albedo.
 */
export function hullTones(THREE) {
  const tone = (from, to, t) =>
    colorOf(THREE, from).lerp(colorOf(THREE, to), t);
  return [
    tone(PALETTE.rockShadow, PALETTE.hull, 0.4),
    tone(PALETTE.hull, PALETTE.hullLit, 0.2),
    tone(PALETTE.hullLit, PALETTE.neutral, 0.15),
    tone(PALETTE.hullLit, PALETTE.neutral, 0.6),
    tone(PALETTE.neutral, PALETTE.salvage, 0.2),
  ];
}

/**
 * Bare steel's tone, the hull's STEEL: a metal's colour is what it
 * reflects, so a SHINE.steel part needs a light one to gleam.
 */
export const steelTone = (THREE) => hullTones(THREE)[STEEL];

/**
 * The turret, built up from y = 0: the housing (a domed ring) and the low
 * hexagonal collar, and the barrels group (mantlet with shrouded barrels,
 * muzzle brakes, dark bores and the lens hood, plus the amber lens), one
 * merged mesh per moving part in `material` (vertex `tones`; an array of
 * HULL_FINISHES materials: glossy housings, steel barrels). Returns
 * { group, housing, housingLow, barrels, barrelY } (the barrels' axis
 * height); seatTurret() fits it to a hull.
 */
export function buildTurret(THREE, material, tones, lensMaterial) {
  // [finish, surface] pairs → one mesh
  const solid = (...pairs) => {
    const parts = pairs.flatMap(([finish, surface]) =>
      new ToneParts(finish).add(surface).parts(THREE, tones)
    );
    return new THREE.Mesh(mergeFinishes(THREE, parts), material);
  };
  const housing = solid([FINISH.gloss, revolve(HOUSING, 16, aroundY)]);
  housing.name = 'turretHousing';
  const housingLow = solid([FINISH.gloss, revolve(HOUSING_LOW, 6, aroundY)]);
  housingLow.name = 'turretHousingLow';
  // Barrels and their mantlet recoil together along the turret's axis.
  const barrels = new THREE.Group();
  const barrel = (z) => [
    FINISH.metal,
    steel(
      revolve(BARREL, 8, aroundX(TURRET_BARREL_LENGTH, TURRET_BARREL_Y, z))
    ),
  ];
  const gun = solid(
    [
      FINISH.paint,
      revolve(MANTLET, 16, boxAlongX(0, TURRET_BARREL_Y, 0, 5, 0.5)),
    ],
    barrel(-TURRET_BARREL_Z),
    barrel(TURRET_BARREL_Z),
    [
      FINISH.paint,
      revolve(LENS_HOOD, 10, aroundX(0, TURRET_BARREL_Y + 1.1, 0, 0.8)),
    ]
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
  return { group, housing, housingLow, barrels, barrelY: TURRET_BARREL_Y };
}

/**
 * Multi-lock turret layer `level` (1 the lowest), built up from the turret's
 * seat like buildTurret: a thin disc on the turret's axis and its barrel,
 * one merged mesh each in `material` (vertex `tones`); the barrel recoils.
 * Returns { group, barrel, barrelY }; the group turns about y, its barrel's
 * axis at height barrelY.
 */
export function buildTurretLayer(THREE, material, tones, level) {
  const solid = (surface, finish) =>
    new THREE.Mesh(
      mergeFinishes(
        THREE,
        new ToneParts(finish).add(surface).parts(THREE, tones)
      ),
      material
    );
  const y = LAYER_BASE_Y + LAYER_STEP * (level - 1);
  const r = LAYER_R - LAYER_TAPER * (level - 1);
  const disc = solid(
    revolve(LAYER_DISC, 16, (along, radius, a) => [
      radius * r * Math.cos(a),
      y + along,
      radius * r * Math.sin(a),
    ]),
    FINISH.gloss
  );
  const barrel = solid(
    steel(
      revolve(
        LAYER_BARREL,
        8,
        aroundX(TURRET_BARREL_LENGTH, y + LAYER_MID_Y, 0)
      )
    ),
    FINISH.metal
  );
  const group = new THREE.Group();
  group.add(disc, barrel);
  return { group, barrel, barrelY: y + LAYER_MID_Y };
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
 * (hullTones, scaled here by the hull's albedo), shaped by hullSlabModel.js.
 * Returns { hull, ghost, canopy, edges, tips, deckY }: the static parts as
 * one vertex-coloured geometry with a draw group per finish (HULL_FINISHES
 * materials), fuselage and wings first, then the raised parts; `ghost`
 * draws only the first range of the same buffers (the dash
 * afterimages); the canopy's glass; the edge segments by kind ({ edge,
 * bladeEdge }); the wingtip points (RCS ports) in the panels' order; the
 * deck height at the turret pivot.
 */
export function buildHullModel(THREE, geometry, tones) {
  const colors = tones.map((c) => c.clone().multiplyScalar(geometry.albedo));
  const { plates, raised, ...rest } = buildSlabHull(
    THREE,
    geometry,
    colors,
    TURRET_PIVOT_X / VISUAL_SCALE
  );
  return { ...mergeHull(THREE, plates, raised), ...rest };
}

// The hull's parts as one vertex-coloured geometry, fuselage and wings
// first (all paint, so finish order keeps them first): the dash ghosts draw
// only that range of the same buffers.
function mergeHull(THREE, plates, raised) {
  const parts = [...plates, ...raised];
  const hull = mergeFinishes(THREE, parts);
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
