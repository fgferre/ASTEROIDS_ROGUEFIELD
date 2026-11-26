// src/modules/render3d/travel/wakeSurface.js
//
// The Wake's painted surfaces (wake.js): worn paint over steel, baked once
// from code into DataTextures (no canvas: the bake also runs in Node tests).
// Two sets — the hull's plating (tileable, laid on by wakeParts.js in model
// units) and the cargo containers (one container per texture) — each a
// colour map, a normal map and a roughness/metalness map.
// The colour map's alpha is the paint: where it is 1 the part's own vertex
// colour shows (grey, orange, yellow, a container's blue), shaded by the
// texel; where it is 0 the texel's own colour shows instead (bare steel,
// rust, white stencils). So one map wears every colour of paint.

import { createSeededRandom } from '../asteroidMesh.js';
import { patchShine } from '../hullModel.js';
import { addRimLight } from '../rimLight.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrap = (i, n) => ((i % n) + n) % n;
const mix = (a, b, t) => a + (b - a) * t;

// Periodic value noise in 0..1 over (u, v) in [0, 1): `cells`² seeded
// lattice points, wrapped.
function lattice(random, cells) {
  const grid = Float32Array.from({ length: cells * cells }, () => random());
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const i0 = wrap(x0, cells);
    const i1 = wrap(x0 + 1, cells);
    const j0 = wrap(y0, cells) * cells;
    const j1 = wrap(y0 + 1, cells) * cells;
    return mix(
      mix(grid[i0 + j0], grid[i1 + j0], sx),
      mix(grid[i0 + j1], grid[i1 + j1], sx),
      sy
    );
  };
}
function fbm(random, cells, octaves) {
  const layers = Array.from({ length: octaves }, (_, o) =>
    lattice(random, cells << o)
  );
  return (u, v) => {
    let sum = 0;
    let amp = 0.5;
    let total = 0;
    for (const layer of layers) {
      sum += layer(u, v) * amp;
      total += amp;
      amp *= 0.5;
    }
    return sum / total;
  };
}

// Bare surfaces under the paint (sRGB, 0..1).
const STEEL = [0.3, 0.31, 0.33];
const RUST = [0.37, 0.21, 0.14];
const STENCIL = [0.86, 0.86, 0.82];
// What a rust run does to the paint under it.
const RUN = [0.74, 0.55, 0.42];
const BRIGHT_STEEL = [0.46, 0.47, 0.49];

// A surface being painted: per texel, relief `height`, a `shade` on whatever
// shows, the `paint` left (1 → 0 bare), what the bare surface is (`bare`
// colour, `rust` 0..1 for its finish), extra `dirt` (roughness) and rust
// `stain` run over the paint.
function sheet(size) {
  const n = size * size;
  return {
    size,
    height: new Float32Array(n),
    shade: new Float32Array(n).fill(1),
    paint: new Float32Array(n).fill(1),
    bare: new Float32Array(n * 3),
    rust: new Float32Array(n),
    dirt: new Float32Array(n),
    stain: new Float32Array(n),
  };
}
const setBare = (s, i, rgb, rust = 0) => {
  s.bare[i * 3] = rgb[0];
  s.bare[i * 3 + 1] = rgb[1];
  s.bare[i * 3 + 2] = rgb[2];
  s.rust[i] = rust;
};

// Runs fn(i, x, y) over the texels of a rectangle (wrapped at the sheet's
// edges when `tile`).
function each(s, x0, y0, x1, y1, tile, fn) {
  const n = s.size;
  for (let y = Math.floor(y0); y < y1; y += 1) {
    if (!tile && (y < 0 || y >= n)) continue;
    const row = wrap(y, n) * n;
    for (let x = Math.floor(x0); x < x1; x += 1) {
      if (!tile && (x < 0 || x >= n)) continue;
      fn(wrap(x, n) + row, x, y);
    }
  }
}

// A stencilled label: rows of small blocks standing for letters, white on
// whatever paint is there.
function label(s, random, x, y, rows, width, glyph, tile) {
  const [gw, gh] = glyph;
  for (let r = 0; r < rows; r += 1) {
    const top = y - r * (gh + Math.ceil(gh * 0.6));
    let cx = x;
    const end = x + width * (0.6 + random() * 0.4);
    while (cx < end) {
      const w = Math.max(2, Math.round(gw * (0.6 + random() * 0.8)));
      if (random() < 0.82) {
        each(s, cx, top - gh, cx + w, top, tile, (i) => {
          s.paint[i] = 0;
          setBare(s, i, STENCIL);
        });
      }
      cx += w + Math.max(1, Math.round(gw * 0.35));
    }
  }
}

// Dirt run down from (x, y): `length` texels toward −v, `width` across;
// `stain` (0..1) makes it a rust run.
function streak(s, x, y, length, width, strength, tile, stain = 0) {
  each(
    s,
    x - width * 2,
    y - length,
    x + width * 2 + 1,
    y + 1,
    tile,
    (i, px, py) => {
      const across = Math.exp(-(((px - x) / width) ** 2));
      const along = 1 - (y - py) / length;
      const k = strength * across * along * along;
      s.shade[i] *= 1 - k;
      s.dirt[i] = Math.max(s.dirt[i], k);
      s.stain[i] = Math.max(s.stain[i], stain * across * along);
    }
  );
}

// A scratch to bright steel from (x, y) along `angle`.
function scratch(s, x, y, length, angle, tile) {
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  for (let t = 0; t < length; t += 0.5) {
    each(
      s,
      x + dx * t,
      y + dy * t,
      x + dx * t + 1,
      y + dy * t + 1,
      tile,
      (i) => {
        s.paint[i] = Math.min(s.paint[i], 0.25);
        setBare(s, i, BRIGHT_STEEL);
        s.height[i] -= 0.04;
      }
    );
  }
}

// Chips the paint where `noise` (0..1 per texel) passes a threshold that
// `edge` (0..1, 1 on a seam or corner) lowers; the bare surface under it is
// steel going to rust by `rustAt`.
function chip(s, i, noise, edge, rustAt, level) {
  const threshold = level - edge;
  const gone = smoothstep(threshold, threshold + 0.035, noise);
  if (gone <= 0) return;
  const rust = smoothstep(0.42, 0.62, rustAt);
  if (s.paint[i] > 0.5) {
    setBare(
      s,
      i,
      [0, 1, 2].map((c) => mix(STEEL[c], RUST[c], rust)),
      rust
    );
  }
  s.paint[i] = Math.min(s.paint[i], 1 - gone);
  s.height[i] -= gone * 0.1;
}

// The three textures of a painted sheet.
function finish(THREE, s, { strength, tile }) {
  const { size } = s;
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const finishMap = new Uint8Array(size * size * 4);
  const at = tile
    ? (x, y) => s.height[wrap(x, size) + wrap(y, size) * size]
    : (x, y) =>
        s.height[
          Math.max(0, Math.min(size - 1, x)) +
            Math.max(0, Math.min(size - 1, y)) * size
        ];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = x + y * size;
      const p = i * 4;
      const paint = s.paint[i];
      const shade = clamp01(s.shade[i]);
      for (let c = 0; c < 3; c += 1) {
        const painted = mix(1, RUN[c], s.stain[i]);
        color[p + c] = Math.round(
          255 * clamp01(mix(s.bare[i * 3 + c], painted, paint) * shade)
        );
      }
      color[p + 3] = Math.round(255 * paint);
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const nx = -dx * strength;
      const ny = -dy * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      normal[p] = Math.round(255 * (nx * inv * 0.5 + 0.5));
      normal[p + 1] = Math.round(255 * (ny * inv * 0.5 + 0.5));
      normal[p + 2] = Math.round(255 * (inv * 0.5 + 0.5));
      normal[p + 3] = 255;
      // Satin paint; bare steel gleams, rust and dirt do not.
      const bareRough = mix(0.38, 0.9, s.rust[i]);
      const rough = mix(bareRough, 0.6, paint) + s.dirt[i] * 0.5;
      const metal = mix(mix(0.8, 0.2, s.rust[i]), 0.1, paint);
      finishMap[p + 1] = Math.round(255 * clamp01(rough));
      finishMap[p + 2] = Math.round(255 * clamp01(metal));
      finishMap[p + 3] = 255;
    }
  }
  const texture = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  };
  return {
    map: texture(color, true),
    normalMap: texture(normal, false),
    finishMap: texture(finishMap, false),
  };
}

// The tile split into plates of mixed sizes (texel rectangles).
function plates(random, size, min, max) {
  const out = [];
  const split = (x0, y0, x1, y1) => {
    const w = x1 - x0;
    const h = y1 - y0;
    const big = Math.max(w, h);
    if (big < min * 2 || (big < max && random() < 0.3)) {
      out.push({ x0, y0, x1, y1, w, h });
      return;
    }
    const t = 0.36 + random() * 0.28;
    if (w > h * (0.75 + random() * 0.5)) {
      const xm = Math.round(x0 + w * t);
      split(x0, y0, xm, y1);
      split(xm, y0, x1, y1);
    } else {
      const ym = Math.round(y0 + h * t);
      split(x0, y0, x1, ym);
      split(x0, ym, x1, y1);
    }
  };
  split(0, 0, size, size);
  return out;
}

/**
 * Hull plating, tileable: plates of mixed sizes with fine seams, a few
 * access hatches, louvres and stencilled labels; paint chipped to steel and
 * rust along the seams, scratches, dirt run down from the seams.
 */
export function bakeWakeHull(THREE, seed, size = 1024) {
  const random = createSeededRandom(seed);
  const s = sheet(size);
  const k = size / 1024;
  const coarse = fbm(random, 28, 4);
  const fine = fbm(random, 72, 3);
  // Flaked, not dotted: ragged edges on the chips.
  const chips = (u, v) => coarse(u, v) * 0.62 + fine(u, v) * 0.38;
  const rustAt = fbm(random, 9, 3);
  const blotch = fbm(random, 5, 3);
  // Where the paint has had a hard life: chips gather there.
  const worn = fbm(random, 4, 2);
  const grain = fbm(random, 96, 2);
  const list = plates(random, size, size / 11, size / 2.6);
  list.forEach((plate) => {
    const { x0, y0, x1, y1, w, h } = plate;
    const tone = 0.88 + random() * 0.12;
    const roll = random();
    const kind =
      roll < 0.14 && w > 90 * k && h > 70 * k
        ? 'hatch'
        : roll < 0.24 && w > 80 * k && h > 60 * k
          ? 'louvre'
          : roll < 0.42
            ? 'label'
            : 'plain';
    const inset = Math.round((8 + random() * 10) * k);
    // The louvre block's rectangle inside the plate.
    const lw = Math.min(w - 30 * k, (50 + random() * 60) * k);
    const lh = Math.min(h - 26 * k, (30 + random() * 36) * k);
    const lx = x0 + 14 * k + random() * Math.max(1, w - lw - 28 * k);
    const ly = y0 + 12 * k + random() * Math.max(1, h - lh - 24 * k);
    each(s, x0, y0, x1, y1, true, (i, x, y) => {
      const d = Math.min(
        x + 0.5 - x0,
        x1 - x - 0.5,
        y + 0.5 - y0,
        y1 - y - 0.5
      );
      const seam = 1 - smoothstep(0.5 * k, 1.7 * k, d);
      // A pressed edge: the plate dips a little toward its seam.
      let height = -seam + 0.04 * smoothstep(0, 16 * k, d);
      let shade = tone * (1 - seam * 0.45);
      if (kind === 'hatch') {
        const di = Math.min(
          x + 0.5 - x0 - inset,
          x1 - inset - x - 0.5,
          y + 0.5 - y0 - inset,
          y1 - inset - y - 0.5
        );
        const frame = 1 - smoothstep(0.5 * k, 1.8 * k, Math.abs(di));
        height -= frame * 0.7;
        shade *= 1 - frame * 0.5;
        if (di > 0) {
          height += 0.1;
          shade *= 0.93;
        }
        // Bolts round the hatch.
        const step = 22 * k;
        const bx = ((x - x0 - inset + step / 2) % step) - step / 2;
        const by = ((y - y0 - inset + step / 2) % step) - step / 2;
        const near = Math.abs(di - 5 * k) < 3 * k;
        const r = Math.hypot(bx, by) / (2.4 * k);
        if (near && r < 1) {
          height += Math.sqrt(1 - r * r) * 0.5;
          shade *= 0.8;
        }
      }
      if (
        kind === 'louvre' &&
        x >= lx &&
        x < lx + lw &&
        y >= ly &&
        y < ly + lh
      ) {
        const slat = ((y - ly) % (7 * k)) / (7 * k);
        height += slat * 0.6 - 0.5;
        shade *= 0.45 + slat * 0.5;
      }
      s.height[i] = height;
      s.shade[i] = shade;
      const u = x / size;
      const v = y / size;
      const edge = 1 - smoothstep(1 * k, 14 * k, d);
      const zone = smoothstep(0.48, 0.7, worn(u, v));
      chip(
        s,
        i,
        chips(u, v),
        edge * (0.07 + zone * 0.15) + zone * 0.07,
        rustAt(u, v),
        0.745
      );
    });
    if (kind === 'label') {
      label(
        s,
        random,
        x0 + 12 * k + random() * w * 0.3,
        y1 - 12 * k - random() * h * 0.3,
        1 + Math.floor(random() * 2),
        Math.min(w - 30 * k, 70 * k),
        [6 * k, 9 * k],
        true
      );
    }
    // Dirt run down from the plate's lower seam and from its bolts.
    const runs = 2 + Math.floor(random() * 5);
    for (let n = 0; n < runs; n += 1) {
      const rusty = random() < 0.35;
      streak(
        s,
        x0 + random() * w,
        y0 + 1,
        (40 + random() * 200) * k,
        (1.5 + random() * 5) * k,
        rusty ? 0.14 + random() * 0.14 : 0.2 + random() * 0.32,
        true,
        rusty ? 0.5 + random() * 0.4 : 0
      );
    }
  });
  // Broad, soft dirt down the whole plating.
  for (let n = 0; n < 16; n += 1) {
    streak(
      s,
      random() * size,
      random() * size,
      (220 + random() * 320) * k,
      (14 + random() * 28) * k,
      0.1 + random() * 0.14,
      true
    );
  }
  for (let n = 0; n < 18; n += 1) {
    scratch(
      s,
      random() * size,
      random() * size,
      (14 + random() * 90) * k,
      (random() - 0.5) * 0.7 + (random() < 0.25 ? Math.PI / 2 : 0),
      true
    );
  }
  for (let i = 0; i < size * size; i += 1) {
    const u = (i % size) / size;
    const v = Math.floor(i / size) / size;
    s.shade[i] *= (0.76 + blotch(u, v) * 0.3) * (0.95 + grain(u, v) * 0.1);
    s.height[i] += (grain(u, v) - 0.5) * 0.05;
  }
  return finish(THREE, s, { strength: 2 * k, tile: true });
}

// Where a container's faces sit in its texture (u0, v0, u1, v1).
export const CARGO_FACES = Object.freeze({
  side: [0, 0, 1, 0.5],
  end: [0, 0.5, 0.5, 1],
  top: [0.5, 0.5, 1, 1],
});

/**
 * One cargo container: its long corrugated side (the lower half), its door
 * end and its roof (the upper half, CARGO_FACES), framed in rails and corner
 * posts, with stencilled marks, chipped paint and rust run down.
 */
export function bakeWakeCargo(THREE, seed, size = 512) {
  const random = createSeededRandom(seed);
  const s = sheet(size);
  const k = size / 512;
  const chips = fbm(random, 30, 4);
  const rustAt = fbm(random, 8, 3);
  const blotch = fbm(random, 6, 3);
  const rect = ([u0, v0, u1, v1]) => [
    u0 * size,
    v0 * size,
    u1 * size,
    v1 * size,
  ];
  // A framed face; `ribs` runs its corrugation ('x': ribs side by side
  // along x, 'y': stacked), `period` texels apart.
  const face = (bounds, frame, ribs, period, depth) => {
    const [x0, y0, x1, y1] = rect(bounds);
    each(s, x0, y0, x1, y1, false, (i, x, y) => {
      const d = Math.min(
        x + 0.5 - x0,
        x1 - x - 0.5,
        y + 0.5 - y0,
        y1 - y - 0.5
      );
      const inside = smoothstep(frame - 1.5 * k, frame, d);
      const along = ribs === 'x' ? x - x0 : y - y0;
      const phase = (along % period) / period;
      // A trapezoid wave: flat crest, flat trough, sloped walls.
      const wave =
        smoothstep(0.08, 0.22, phase) - smoothstep(0.58, 0.72, phase);
      s.height[i] = mix(0.9, wave * depth, inside);
      s.shade[i] =
        mix(0.82, 0.86 + wave * 0.14, inside) *
        (1 - (1 - smoothstep(0, 1.6 * k, d)) * 0.5);
      const u = x / size;
      const v = y / size;
      // Paint goes first on the frame, the corners and low on the walls.
      const low = 1 - smoothstep(0, (y1 - y0) * 0.35, y - y0);
      const edge = Math.max(1 - inside, low * 0.6);
      chip(s, i, chips(u, v), edge * 0.16, rustAt(u, v) + 0.12, 0.76);
      s.shade[i] *= 0.86 + blotch(u, v) * 0.2;
    });
    return [x0, y0, x1, y1];
  };
  const frame = 9 * k;
  // --- The long side ---
  {
    const [x0, y0, x1, y1] = face(CARGO_FACES.side, frame, 'x', 17 * k, 0.8);
    const h = y1 - y0;
    label(
      s,
      random,
      x1 - 150 * k,
      y1 - 26 * k,
      3,
      110 * k,
      [7 * k, 11 * k],
      false
    );
    label(
      s,
      random,
      x0 + 30 * k,
      y0 + 60 * k,
      2,
      70 * k,
      [5 * k, 7 * k],
      false
    );
    // The shipper's mark: three slanted bars.
    const [mx, my] = [x0 + 70 * k, y0 + h * 0.62];
    each(s, mx, my - 26 * k, mx + 70 * k, my + 26 * k, false, (i, x, y) => {
      const slant = x - mx - (y - my + 26 * k) * 0.45;
      if (slant > 0 && slant < 44 * k && slant % (16 * k) < 10 * k) {
        s.paint[i] = Math.min(
          s.paint[i],
          chips(x / size, y / size) > 0.6 ? 1 : 0
        );
        if (s.paint[i] === 0) setBare(s, i, STENCIL);
      }
    });
    for (let n = 0; n < 34; n += 1) {
      streak(
        s,
        x0 + random() * (x1 - x0),
        y1 - frame,
        (30 + random() * 150) * k,
        (1.5 + random() * 4) * k,
        0.15 + random() * 0.3,
        false
      );
    }
  }
  // --- The door end: two leaves, four lock rods ---
  {
    const [x0, y0, x1, y1] = face(
      CARGO_FACES.end,
      frame + 2 * k,
      'y',
      26 * k,
      0.35
    );
    const mid = (x0 + x1) / 2;
    each(s, mid - 2 * k, y0 + frame, mid + 2 * k, y1 - frame, false, (i) => {
      s.height[i] = -1;
      s.shade[i] *= 0.4;
    });
    [0.2, 0.38, 0.62, 0.8].forEach((t) => {
      const rx = x0 + (x1 - x0) * t;
      each(s, rx - 3 * k, y0 + frame, rx + 3 * k, y1 - frame, false, (i, x) => {
        const r = Math.abs(x + 0.5 - rx) / (3 * k);
        s.height[i] = 1.2 * Math.sqrt(Math.max(0, 1 - r * r));
        s.paint[i] = 0;
        setBare(s, i, STEEL, 0.2);
      });
      // The rod's handle and keeper.
      each(s, rx - 9 * k, y0 + 96 * k, rx + 9 * k, y0 + 104 * k, false, (i) => {
        s.height[i] = 1;
        s.paint[i] = 0;
        setBare(s, i, STEEL, 0.4);
      });
    });
    label(
      s,
      random,
      mid + 18 * k,
      y1 - 30 * k,
      4,
      84 * k,
      [6 * k, 9 * k],
      false
    );
    for (let n = 0; n < 12; n += 1) {
      streak(
        s,
        x0 + random() * (x1 - x0),
        y1 - frame,
        (30 + random() * 120) * k,
        (1.5 + random() * 4) * k,
        0.15 + random() * 0.3,
        false
      );
    }
  }
  // --- The roof: shallow ribs, dirtier ---
  {
    const [x0, y0, x1, y1] = face(CARGO_FACES.top, frame, 'x', 22 * k, 0.4);
    each(s, x0, y0, x1, y1, false, (i, x, y) => {
      s.shade[i] *= 0.7 + blotch(y / size, x / size) * 0.35;
      s.dirt[i] = 0.3;
    });
  }
  return finish(THREE, s, { strength: 2.2 * k, tile: false });
}

/** A soft round glow (white, alpha falling from the centre): light pools. */
export function bakeWakeGlow(THREE, size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const g = Math.max(0, 1 - r) ** 2.2;
      const p = (x + y * size) * 4;
      data[p] = data[p + 1] = data[p + 2] = Math.round(255 * g);
      data[p + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// The colour map's alpha chooses between the part's paint and the texel's
// own bare colour (see the header).
function patchPaint(shader) {
  patchShine(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <map_fragment>',
      'vec4 wakeTexel = texture2D(map, vUv); // sRGB decoded on read'
    )
    .replace(
      '#include <color_fragment>',
      'diffuseColor.rgb *= wakeTexel.rgb * mix(vec3(1.0), vColor, wakeTexel.a);'
    );
}

/** The painted material of a baked set (bakeWakeHull, bakeWakeCargo). */
export function wakePaint(THREE, maps) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.finishMap,
    metalnessMap: maps.finishMap,
  });
  material.onBeforeCompile = patchPaint;
  return addRimLight(material);
}
