// Recipe views (PLAN.md 0a.5): an enemy whose content file names no
// hand-made `view` is built from its `visual`, so a new enemy needs no render
// code; with neither it gets DEFAULT_VISUAL. Same matte tones, outline and
// glow batch as the hand views (docs/NORTE.md §2: matte mass, light only where
// there is energy) and the same view record, so pooling, the Elite look,
// affixes and the burn treat it as any machine.
//
// visual: {
//   scale: × the enemy's radius (1),
//   parts: [{
//     shape: one of
//       body: { stations: [[x, half width, top, bottom, round?], …], round
//         (2: oval, higher: boxier), ridge (a spine, × the top) } — smooth
//         through its stations along x: fuselages, pods, carapaces, bellies;
//       turned: { profile: [[radius, height], …], axis: y | x, smooth (rows
//         per span) } — round y (domes, discs, turrets) or x (pods, barrels,
//         the profile's top the nose); ends off the axis are capped, a
//         profile that ends where it starts is a ring;
//       wing: { root, tip, span, sweep, thick, dihedral, under } — a thick
//         tapered blade out along +z from its root chord (centred on `at`),
//         its tip `sweep` back, raised `dihedral` radians (π/2: a fin);
//       tube: { points: [[x, y, z], …], radius: r or [from, to] } — swept
//         smooth through its points, tapering (arms, struts, pipes);
//       nozzle, socket: { dir } — a dark exhaust bell (mouth toward dir,
//         −x) and a dark eye housing (open toward dir, +x), radius 1;
//       sphere | box | octahedron | icosahedron | cone | cylinder | torus —
//         each 1 radius out from its centre (cone and cylinder stand along
//         y, the torus lies flat around y),
//     size: number or [x, y, z] (1), at: [x, y, z], rotate: [x, y, z] radians,
//       in radii, +x the nose and +y up,
//     mirror: also its twin across z (left/right), sides (and rings, for a
//       body or tube): how finely a designed shape is cut,
//     material: hull | trim | glow (hull; trim for nozzle and socket),
//     color: a PALETTE key (hull: hullLit, trim: hull, glow: threat),
//   }],
//   lights: [{ at, size (0.18), color (threat), pulse: getter, dir, housing }],
//   animate: { spin: [x, y, z] rad/s, bob: radii, pulse: getter },
// }
// Lights are the eyes, lenses and nodes (one glow batch); a getter is an enemy
// property read per frame as 0..1 (telegraphRatio, damageRatio, ...): a
// light's `pulse` lights it up, `animate.pulse` throbs the body and its glowing
// parts. Threat-red light burns gold on an Elite. Each light sits in a dark
// socket open away from the centre (or toward `dir`; `housing: false`: none).
// The outline follows the parts' top view (turning only about y; a tumbling
// body keeps a circle). Shapes from shapes.js, as the hand-made machines.

import { PALETTE } from '../../../data/constants/palette.js';
import { colorOf } from '../batches.js';
import { mergeStatic } from '../mergeStatic.js';
import { rimLoop } from '../rimBatch.js';
import {
  blade,
  loft,
  mirrorZ,
  nozzle,
  refine,
  revolve,
  socket,
  spline,
  sweep,
} from './shapes.js';

// proposta 19/10: a light's size (radii) and gain, steady (the Mote's eye) or
// from dim to lit with its getter, growing with it (the Ram's lens); a
// glowing part's gain (the Bulwark's edge); the outline's margin past the
// body; the bob's and the throb's rates (rad/s), how much a throb swells the
// body and brightens its glow.
const LIGHT_SIZE = 0.18;
const LIGHT_GAIN = 1.4;
const LIGHT_DIM = 0.4;
const LIGHT_LIT = 2.2;
const LIGHT_GROW = 0.8;
const GLOW_GAIN = 1.2;
const RIM_MARGIN = 1.04;
const BOB_RATE = 2.4;
const PULSE_RATE = 6;
const PULSE_SWELL = 0.1;
const PULSE_GAIN = 0.6;

// A plain machine in layered armour: a dark slab under a raised hull plate
// with a dark spine, a hull belly and a dark keel under it, two swept wings,
// a dorsal fin, intakes at its shoulders, twin nozzles behind and one eye in
// its socket at the nose.
const DEFAULT_VISUAL = Object.freeze({
  parts: [
    {
      shape: 'body',
      stations: [
        [-0.72, 0.3, 0.11, 0.08],
        [-0.4, 0.5, 0.14, 0.1],
        [0.1, 0.52, 0.15, 0.1],
        [0.5, 0.36, 0.13, 0.08],
        [0.88, 0.08, 0.06, 0.04],
      ],
      round: 2.8,
      rings: 14,
      material: 'trim',
    },
    {
      shape: 'body',
      stations: [
        [-0.66, 0.17, 0.14, 0],
        [-0.36, 0.35, 0.22, 0],
        [0.1, 0.37, 0.25, 0],
        [0.5, 0.23, 0.18, 0],
        [0.82, 0.04, 0.08, 0],
      ],
      round: 2.4,
      ridge: 0.2,
      rings: 14,
      at: [0, 0.05, 0],
    },
    {
      shape: 'tube',
      points: [
        [-0.5, 0.29, 0],
        [0.1, 0.35, 0],
        [0.55, 0.27, 0],
      ],
      radius: [0.02, 0.016],
      sides: 6,
      material: 'trim',
    },
    {
      shape: 'body',
      stations: [
        [-0.52, 0.18, 0, 0.06],
        [-0.1, 0.34, 0, 0.1],
        [0.45, 0.2, 0, 0.06],
      ],
      round: 2.4,
      rings: 10,
      at: [0, -0.08, 0],
    },
    {
      shape: 'body',
      stations: [
        [-0.4, 0.04, 0, 0.03],
        [0, 0.07, 0, 0.06],
        [0.35, 0.04, 0, 0.03],
      ],
      sides: 8,
      rings: 8,
      at: [0, -0.16, 0],
      material: 'trim',
    },
    {
      shape: 'wing',
      root: 0.5,
      tip: 0.18,
      span: 0.4,
      sweep: 0.36,
      thick: 0.1,
      dihedral: -0.15,
      at: [-0.2, 0, 0.42],
      mirror: true,
    },
    {
      shape: 'wing',
      root: 0.3,
      tip: 0.12,
      span: 0.2,
      sweep: 0.2,
      thick: 0.06,
      dihedral: Math.PI / 2,
      under: 1,
      at: [-0.45, 0.26, 0],
      material: 'trim',
    },
    {
      shape: 'nozzle',
      at: [0.3, 0.1, 0.33],
      dir: [1, 0.1, 0.2],
      size: 0.06,
      sides: 10,
      mirror: true,
    },
    {
      shape: 'nozzle',
      at: [-0.7, 0.04, 0.14],
      dir: [-1, 0, 0.15],
      size: 0.1,
      mirror: true,
    },
  ],
  lights: [{ at: [0.8, 0.1, 0], dir: [1, 0.6, 0], size: 0.12 }],
});

// The matte materials' default tones (kit.tones); the shapes that are dark
// unless they say otherwise.
const MATTE = { hull: 'hull', trim: 'dark' };
const DARK_SHAPES = new Set(['nozzle', 'socket']);

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const level = (enemy, getter) => clamp01(Number(enemy[getter]) || 0);

/**
 * Recipe views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createRecipeViews(kit) {
  const { THREE } = kit;
  const torus = new THREE.TorusGeometry(1, 0.12, 8, 32);
  torus.rotateX(Math.PI / 2);
  const shapes = {
    sphere: kit.sphere,
    box: new THREE.BoxGeometry(2, 2, 2),
    octahedron: new THREE.OctahedronGeometry(1, 0),
    icosahedron: new THREE.IcosahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(1, 2, 12),
    cylinder: new THREE.CylinderGeometry(1, 1, 2, 12),
    torus,
  };
  const vector = (xyz) => new THREE.Vector3().fromArray(xyz);
  const origin = new THREE.Vector3();
  // The designed shapes, built from a part's own params in its radii.
  const built = {
    body({ stations, round = 2, ridge = 0, sides = 16, rings = 16 }) {
      if (!(stations?.length >= 2)) {
        throw new Error('[recipes] a body needs two stations or more');
      }
      const rows = [...stations].sort((a, b) => a[0] - b[0]);
      const along = (k, fallback) =>
        spline(rows.flatMap((row) => [row[0], row[k] ?? fallback]));
      const [w, top, bottom] = [1, 2, 3].map((k) => along(k));
      const e = along(4, round);
      const from = rows[0][0];
      const to = rows[rows.length - 1][0];
      const thin = (x) => Math.max(0.004, x);
      return loft(
        THREE,
        rings,
        sides,
        (s) => {
          const x = from + (to - from) * s;
          return {
            at: [x, 0, 0],
            w: thin(w(x)),
            top: thin(top(x)),
            bottom: thin(bottom(x)),
            e: Math.max(1, e(x)),
            ridge: ridge * thin(top(x)),
          };
        },
        { start: 'flat', end: 'flat' }
      );
    },
    turned({ profile, axis = 'y', sides = 24, smooth = 1 }) {
      if (!(profile?.length >= 2)) {
        throw new Error('[recipes] a turned part needs a profile');
      }
      let rows = smooth > 1 ? refine(profile, smooth) : profile;
      // listed clockwise in (radius, height) its faces point out
      const area = rows.reduce((sum, [r, y], i) => {
        const [r2, y2] = rows[(i + 1) % rows.length];
        return sum + r * y2 - r2 * y;
      }, 0);
      if (area > 0) rows = [...rows].reverse();
      const [first, last] = [rows[0], rows[rows.length - 1]];
      const ring = first[0] === last[0] && first[1] === last[1];
      const cap = ([r]) => (ring || r < 1e-3 ? undefined : 'flat');
      const geometry = revolve(THREE, rows.flat(), sides, {
        start: cap(first),
        end: cap(last),
      });
      if (axis === 'x') geometry.rotateZ(-Math.PI / 2);
      else if (axis !== 'y') throw new Error(`[recipes] no axis '${axis}'`);
      return geometry;
    },
    wing({
      root = 0.5,
      tip = 0.2,
      span = 0.6,
      sweep: back = 0.2,
      thick = 0.08,
      dihedral = 0,
      under = 0.6,
      sides = 10,
    }) {
      const out = new THREE.Vector3(0, Math.sin(dihedral), Math.cos(dihedral));
      const up = new THREE.Vector3(0, Math.cos(dihedral), -Math.sin(dihedral));
      // root to tip, the last station narrowed about its middle: a round tip
      const stations = [0, 0.3, 0.6, 0.85, 1].map((t) => {
        const chord = (root + (tip - root) * t) * (t === 1 ? 0.4 : 1);
        const middle = root / 2 - back * t - (root + (tip - root) * t) / 2;
        const at = out.clone().multiplyScalar(span * t);
        return {
          le: at.clone().setX(middle + chord / 2),
          te: at.clone().setX(middle - chord / 2),
          thick: (thick * chord) / root,
          up,
        };
      });
      return blade(THREE, stations, sides, under);
    },
    tube({ points, radius = 0.05, sides = 8, rings }) {
      if (!(points?.length >= 2)) {
        throw new Error('[recipes] a tube needs two points or more');
      }
      const curve = new THREE.CatmullRomCurve3(points.map(vector));
      const path = curve.getPoints((rings ?? (points.length > 2 ? 10 : 2)) - 1);
      const [from, to] = typeof radius === 'number' ? [radius, radius] : radius;
      return sweep(
        THREE,
        path,
        (i, a) => {
          const r = from + ((to - from) * i) / (path.length - 1);
          return [Math.cos(a) * r, Math.sin(a) * r];
        },
        sides,
        { capped: true }
      );
    },
    nozzle: ({ dir = [-1, 0, 0], sides = 12 }) =>
      nozzle(THREE, origin, vector(dir), 1, sides),
    socket: ({ dir = [1, 0, 0], sides = 12 }) =>
      socket(THREE, origin, vector(dir), 1, sides),
  };
  const looks = new Map();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  function paletteHex(role) {
    const hex = PALETTE[role];
    if (typeof hex !== 'string' || !hex.startsWith('#')) {
      throw new Error(`[recipes] no palette colour '${role}'`);
    }
    return hex;
  }

  function getter(name) {
    if (name !== undefined && typeof name !== 'string') {
      throw new Error(`[recipes] a pulse names a getter, not ${name}`);
    }
    return name ?? null;
  }

  // A part's own geometry, sized, turned and placed in the view's radii;
  // with `mirror`, its twin across z too.
  function place(part) {
    const { shape, size = 1, at = [0, 0, 0], rotate = [0, 0, 0] } = part;
    if (!shapes[shape] && !built[shape]) {
      throw new Error(`[recipes] no shape '${shape}'`);
    }
    const geometry = shapes[shape]?.clone() ?? built[shape](part);
    matrix.compose(
      position.fromArray(at),
      quaternion.setFromEuler(euler.set(rotate[0], rotate[1], rotate[2])),
      typeof size === 'number' ? scale.setScalar(size) : scale.fromArray(size)
    );
    geometry.applyMatrix4(matrix);
    if (!part.mirror) return [geometry];
    if (!geometry.index) {
      const count = geometry.getAttribute('position').count;
      geometry.setIndex(Array.from({ length: count }, (_, i) => i));
    }
    return [geometry, mirrorZ(geometry)];
  }

  // The parts' outline seen from above: the convex hull of their points on
  // the field plane, at the height where they reach farthest, RIM_MARGIN out;
  // `far` that reach.
  function outlineOf(geometries) {
    const points = [];
    let far = 0;
    let y = 0;
    geometries.forEach((geometry) => {
      const p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i += 1) {
        const [x, z] = [p.getX(i), p.getZ(i)];
        points.push([x, z]);
        if (Math.hypot(x, z) > far) [far, y] = [Math.hypot(x, z), p.getY(i)];
      }
    });
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (o, a, b) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const chain = (list) => {
      const out = [];
      list.forEach((p) => {
        while (
          out.length > 1 &&
          turn(out[out.length - 2], out[out.length - 1], p) <= 0
        ) {
          out.pop();
        }
        out.push(p);
      });
      return out.slice(0, -1);
    };
    const hull = [...chain(points), ...chain([...points].reverse())];
    // no two corners closer than a 40th of the reach
    const corners = [];
    hull.forEach((p) => {
      const last = corners[corners.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > far / 40) {
        corners.push(p);
      }
    });
    const loop = corners.map(
      ([x, z]) => new THREE.Vector3(x * RIM_MARGIN, y, z * RIM_MARGIN)
    );
    return { loop: rimLoop(loop), far };
  }

  // A visual's shared parts: the merged matte body (its lights' housings in
  // it), a merged geometry per glow colour, the outline, the lights and the
  // motion.
  function compile(visual) {
    const { parts = [], lights = [], animate = {} } = visual;
    const matte = [];
    const glows = new Map();
    parts.forEach((part) => {
      const geometries = place(part);
      const material =
        part.material ?? (DARK_SHAPES.has(part.shape) ? 'trim' : 'hull');
      if (material === 'glow') {
        const hex = paletteHex(part.color ?? 'threat');
        if (!glows.has(hex)) glows.set(hex, []);
        geometries.forEach((geometry) => glows.get(hex).push({ geometry }));
      } else if (MATTE[material]) {
        const color = part.color
          ? colorOf(THREE, paletteHex(part.color))
          : kit.tones[MATTE[material]];
        geometries.forEach((geometry) => matte.push({ geometry, color }));
      } else {
        throw new Error(`[recipes] no material '${material}'`);
      }
    });
    const lit = lights.map((light) => ({
      at: vector(light.at ?? [0, 0, 0]),
      size: light.size ?? LIGHT_SIZE,
      hex: paletteHex(light.color ?? 'threat'),
      pulse: getter(light.pulse),
    }));
    lights.forEach((light, i) => {
      if (light.housing === false) return;
      const { at, size } = lit[i];
      const dir = light.dir ? vector(light.dir) : at.clone();
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      const geometry = socket(THREE, at, dir, size, 10);
      matte.push({ geometry, color: kit.tones.dark });
    });
    const spin = animate.spin ?? null;
    const { loop, far } = outlineOf(
      [...matte, ...[...glows.values()].flat()].map((part) => part.geometry)
    );
    return {
      scale: visual.scale ?? 1,
      body: matte.length ? mergeStatic(THREE, matte) : null,
      glows: [...glows].map(([hex, list]) => ({
        hex,
        geometry: mergeStatic(THREE, list),
      })),
      // the outline turns with the body; tumbling, a circle round its reach
      outline: loop.length >= 9 && !spin?.[0] && !spin?.[2] ? loop : null,
      rim: far ? far * RIM_MARGIN : 1,
      lights: lit,
      spin,
      bob: animate.bob ?? 0,
      pulse: getter(animate.pulse),
    };
  }

  function create(kind, recipe) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    body.scale.setScalar(recipe.scale);
    if (recipe.body) body.add(new THREE.Mesh(recipe.body, kit.machineMaterial));
    const accents = [];
    const glowMaterials = recipe.glows.map(({ hex, geometry }) => {
      const material = kit.emissive(hex, GLOW_GAIN);
      if (hex === PALETTE.threat) accents.push(material);
      body.add(new THREE.Mesh(geometry, material));
      return material;
    });
    const lights = recipe.lights.map(({ at, size, hex, pulse }) => {
      const tone = kit.tone(hex, pulse ? LIGHT_DIM : LIGHT_GAIN);
      if (hex === PALETTE.threat) accents.push(tone);
      return { ...kit.glow(body, tone, size, at), size, pulse };
    });
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      recipe,
      body,
      glowMaterials,
      lights,
      accents,
      rims: [
        recipe.outline
          ? kit.rim(body, recipe.outline)
          : kit.rim(group, kit.circleRim, recipe.rim * recipe.scale),
      ],
      glows: lights,
    });
  }

  function update(view, enemy, time) {
    const { recipe, body } = view;
    const t = time + (view.seed % 7);
    const { spin, bob, pulse } = recipe;
    if (spin) body.rotation.set(spin[0] * t, spin[1] * t, spin[2] * t);
    if (bob) body.position.y = bob * Math.sin(t * BOB_RATE);
    if (pulse) {
      const throb =
        level(enemy, pulse) * (0.5 + 0.5 * Math.sin(t * PULSE_RATE));
      body.scale.setScalar(recipe.scale * (1 + PULSE_SWELL * throb));
      for (let i = 0; i < view.glowMaterials.length; i += 1) {
        kit.setGain(
          view.glowMaterials[i],
          GLOW_GAIN * (1 + PULSE_GAIN * throb)
        );
      }
    }
    for (let i = 0; i < view.lights.length; i += 1) {
      const light = view.lights[i];
      if (!light.pulse) continue;
      const lit = level(enemy, light.pulse);
      kit.setGain(light.tone, LIGHT_DIM + (LIGHT_LIT - LIGHT_DIM) * lit);
      light.anchor.scale.setScalar(light.size * (1 + LIGHT_GROW * lit));
    }
  }

  /**
   * The look built from `visual` (DEFAULT_VISUAL when there is none), once
   * per visual: `create(kind)` builds a view for that enemy kind, `update`
   * moves it per frame.
   */
  function lookOf(visual = DEFAULT_VISUAL) {
    let look = looks.get(visual);
    if (!look) {
      const recipe = compile(visual);
      look = { create: (kind) => create(kind, recipe), update };
      looks.set(visual, look);
    }
    return look;
  }

  return { lookOf };
}
