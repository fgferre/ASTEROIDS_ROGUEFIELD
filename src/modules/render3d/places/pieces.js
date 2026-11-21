// Pieces more than one place's set is built from (places/kit.js parts).

import { gradientDisc } from './kit.js';

// The cold light in the second chapter's cracks (its three places share it).
export const SEAM_LIGHT = '#bfeeff';
// proposta 12/11: a star's disc as a share of its corona's radius.
const STAR_DISC = 0.4;

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

/**
 * A crack of light lying in the x-z plane: a jagged chain of thin strips
 * from x = -`length` / 2 to +`length` / 2 at `at`, each `width` across and
 * up to `jag` off the line, thinning to its ends, with `branches` short
 * ones leaving it. `parts` takes the crack as it rests, `gape` the same
 * line `GAPE` times as wide: what shows once it has opened (seams()).
 */
const GAPE = 5; // proposta 12/11
export function crack(kit, parts, gape, color, at, options) {
  const { length, width, jag, steps = 10, branches = 2 } = options;
  const { random } = kit;
  const strip = (x0, z0, x1, z1, w) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const middle = [at[0] + (x0 + x1) / 2, at[1], at[2] + (z0 + z1) / 2];
    const turn = [0, -Math.atan2(dz, dx), 0];
    const run = Math.hypot(dx, dz) * 1.04;
    kit.box(parts, color, middle, [run, 1, w], turn);
    kit.box(gape, color, middle, [run, 1, w * GAPE], turn);
  };
  let x = -length / 2;
  let z = 0;
  for (let i = 0; i < steps; i += 1) {
    const nx = x + length / steps;
    const nz = i === steps - 1 ? 0 : (random() - 0.5) * 2 * jag;
    const k = Math.sin(((i + 0.5) / steps) * Math.PI);
    strip(x, z, nx, nz, width * (0.35 + 0.65 * k));
    if (i > 0 && i < steps - 1 && random() < branches / steps) {
      const side = random() < 0.5 ? -1 : 1;
      const reach = (length / steps) * (0.6 + random() * 0.6);
      strip(x, z, x + reach * 0.6, z + side * reach, width * 0.4);
    }
    x = nx;
    z = nz;
  }
}

/**
 * A place's cracks (crack()'s `parts` and `gape`) as lights of their own,
 * `name`d: `rest` their brightness while the place holds, `open` once it
 * has given way (the victory shot's wake, 0..1), when the wide line shows
 * too. Returns { object, give(time, wake) }.
 */
export function seams(kit, parts, gape, name, { rest, open }) {
  const object = new kit.THREE.Group();
  object.add(
    kit.mesh(parts, 'glow', name),
    kit.mesh(gape, 'glow', `${name}-open`)
  );
  const line = kit.materials.get(name);
  const wide = kit.materials.get(`${name}-open`);
  return {
    object,
    give(time, wake) {
      const breath = 0.88 + 0.12 * Math.sin(time * 0.9);
      line.color.setScalar((rest + (open - rest) * wake) * breath);
      wide.color.setScalar(open * 0.55 * wake);
    },
  };
}

/**
 * A star (gradientDisc): its disc darkened `limb` toward its edge, its
 * corona falling off `falloff` fast over a faint `tail`.
 */
export function starGlow(THREE, { limb, falloff, tail, rings, sides }) {
  return gradientDisc(
    THREE,
    (r) =>
      r < STAR_DISC
        ? 1 - limb * (r / STAR_DISC) ** 3
        : 0.3 * Math.exp(-(r - STAR_DISC) * falloff) + tail * (1 - r),
    { rings, sides }
  );
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
  // Written out triangle by triangle (an open cylinder for the body, an open
  // cone for the point, as three lays them, less the cone's empty
  // triangles): the Crystal Choir makes hundreds of these as the game loads.
  const tip = Math.min(length * 0.3, radius * 2.2);
  const top = length - tip;
  const count = sides * 9;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let o = 0;
  const vertex = (x, y, z) => {
    positions[o] = x;
    positions[o + 1] = y;
    positions[o + 2] = z;
    o += 3;
  };
  for (let j = 0; j < sides; j += 1) {
    const a0 = (j / sides) * Math.PI * 2;
    const a1 = ((j + 1) / sides) * Math.PI * 2;
    const [s0, c0, s1, c1] = [
      Math.sin(a0),
      Math.cos(a0),
      Math.sin(a1),
      Math.cos(a1),
    ];
    const [upper, lower] = [radius * 0.9, radius];
    vertex(upper * s0, top, upper * c0);
    vertex(lower * s0, 0, lower * c0);
    vertex(upper * s1, top, upper * c1);
    vertex(lower * s0, 0, lower * c0);
    vertex(lower * s1, 0, lower * c1);
    vertex(upper * s1, top, upper * c1);
  }
  for (let j = 0; j < sides; j += 1) {
    const a0 = (j / sides) * Math.PI * 2;
    const a1 = ((j + 1) / sides) * Math.PI * 2;
    const upper = radius * 0.9;
    vertex(upper * Math.sin(a0), top, upper * Math.cos(a0));
    vertex(upper * Math.sin(a1), top, upper * Math.cos(a1));
    vertex(0, length, 0);
  }
  // Each facet a shade of its own, so the faces read; the colour runs up
  // from `foot` toward the point.
  const p = positions;
  for (let i = 0; i < count * 3; i += 9) {
    const [bx, by, bz] = [p[i + 3], p[i + 4], p[i + 5]];
    const [cbx, cby, cbz] = [p[i + 6] - bx, p[i + 7] - by, p[i + 8] - bz];
    const [abx, aby, abz] = [p[i] - bx, p[i + 1] - by, p[i + 2] - bz];
    let nx = cby * abz - cbz * aby;
    let ny = cbz * abx - cbx * abz;
    let nz = cbx * aby - cby * abx;
    const size = Math.hypot(nx, ny, nz) || 1;
    [nx, ny, nz] = [nx / size, ny / size, nz / size];
    const facet = 0.35 + 0.65 * Math.abs(nx * 0.8 + nz * 0.6);
    for (let v = 0; v < 9; v += 3) {
      normals[i + v] = nx;
      normals[i + v + 1] = ny;
      normals[i + v + 2] = nz;
      const k = (foot + (1 - foot) * (p[i + v + 1] / length) ** 1.5) * facet;
      colors.fill(k, i + v, i + v + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
