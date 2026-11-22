// Surface maps for the 3D materials (docs/NORTE.md §2 "pedra e metal
// fosco"): normal, roughness and ambient-occlusion textures baked once per
// seed from a tileable height field — pitted stone for the Ring rocks,
// machined panels for the ship hull, grooved segments for the Wardens. They
// add surface, not brightness: roughness stays high and AO only darkens.
// DataTextures (no canvas), so the bake also runs in Node tests.

import { SimplexNoise, createSeededRandom } from './asteroidMesh.js';
import { tileNoise } from './dustFloor.js';

const cache = new Map();

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrap = (i, n) => ((i % n) + n) % n;

// Box blur with wrap-around, two separable passes (local mean height).
function blur(src, size, radius) {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const span = radius * 2 + 1;
  for (let y = 0; y < size; y += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1)
      sum += src[wrap(k, size) + y * size];
    for (let x = 0; x < size; x += 1) {
      tmp[x + y * size] = sum / span;
      sum +=
        src[wrap(x + radius + 1, size) + y * size] -
        src[wrap(x - radius, size) + y * size];
    }
  }
  for (let x = 0; x < size; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1)
      sum += tmp[x + wrap(k, size) * size];
    for (let y = 0; y < size; y += 1) {
      out[x + y * size] = sum / span;
      sum +=
        tmp[x + wrap(y + radius + 1, size) * size] -
        tmp[x + wrap(y - radius, size) * size];
    }
  }
  return out;
}

function dataTexture(THREE, data, size, height = size) {
  const texture = new THREE.DataTexture(data, size, height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// Height (texel rows = +v) → the three maps. `strength` scales the Sobel
// slope; AO falls with cavity (local mean above the texel) times `occlusion`.
function bakeMaps(
  THREE,
  size,
  height,
  { strength, occlusion, aoRadius },
  roughnessAt
) {
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const ao = new Uint8Array(size * size * 4);
  const mean = blur(height, size, aoRadius);
  const h = (x, y) => height[wrap(x, size) + wrap(y, size) * size];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx =
        (h(x + 1, y - 1) +
          2 * h(x + 1, y) +
          h(x + 1, y + 1) -
          h(x - 1, y - 1) -
          2 * h(x - 1, y) -
          h(x - 1, y + 1)) /
        8;
      const dy =
        (h(x - 1, y + 1) +
          2 * h(x, y + 1) +
          h(x + 1, y + 1) -
          h(x - 1, y - 1) -
          2 * h(x, y - 1) -
          h(x + 1, y - 1)) /
        8;
      const nx = -dx * strength;
      const ny = -dy * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = x + y * size;
      const p = i * 4;
      normal[p] = Math.round(255 * (nx * inv * 0.5 + 0.5));
      normal[p + 1] = Math.round(255 * (ny * inv * 0.5 + 0.5));
      normal[p + 2] = Math.round(255 * (inv * 0.5 + 0.5));
      const cavity = Math.max(0, mean[i] - height[i]);
      const occluded = Math.max(0.2, 1 - cavity * occlusion);
      const r = Math.round(255 * Math.min(1, roughnessAt(i, cavity)));
      ao[p] = ao[p + 1] = ao[p + 2] = Math.round(255 * occluded);
      rough[p] = rough[p + 1] = rough[p + 2] = r;
      normal[p + 3] = rough[p + 3] = ao[p + 3] = 255;
    }
  }
  return {
    normalMap: dataTexture(THREE, normal, size),
    roughnessMap: dataTexture(THREE, rough, size),
    aoMap: dataTexture(THREE, ao, size),
  };
}

// Seeded grain in −0.5..0.5: white noise blurred twice by `radius` texels
// (small radius: grain; large: soft blotches).
function grainField(random, size, radius) {
  const white = Float32Array.from({ length: size * size }, () => random());
  const soft = blur(blur(white, size, radius), size, radius);
  const peak = soft.reduce((m, g) => Math.max(m, Math.abs(g - 0.5)), 1e-6);
  return soft.map((g) => (g - 0.5) / (2 * peak));
}

function cached(kind, seed, size, bake) {
  const key = `${kind}:${seed}:${size}`;
  if (!cache.has(key)) cache.set(key, bake());
  return cache.get(key);
}

// Periodic cellular field: `cells`² seeded points; returns F2 − F1 (≈0 on
// the walls between cells) at (u, v) in [0, 1).
function cellular(random, cells) {
  const points = Array.from({ length: cells * cells }, () => [
    random(),
    random(),
  ]);
  return (u, v) => {
    const fx = u * cells;
    const fy = v * cells;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    let d1 = 8;
    let d2 = 8;
    for (let j = -1; j <= 1; j += 1) {
      for (let i = -1; i <= 1; i += 1) {
        const point = points[wrap(cx + i, cells) + wrap(cy + j, cells) * cells];
        const d = Math.hypot(cx + i + point[0] - fx, cy + j + point[1] - fy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    }
    return d2 - d1;
  };
}

/**
 * Pitted stone: fbm relief, broken micro-fractures, craters and pits.
 * Sampled triplanar by the rock shader (the rock geometry has no UVs).
 */
export function bakeRockMaps(THREE, seed, size = 256) {
  return cached('rock', seed, size, () => {
    const random = createSeededRandom(seed);
    const relief = new SimplexNoise(createSeededRandom(seed + 1));
    const fractures = cellular(random, 5);
    const fine = cellular(random, 11);
    const height = new Float32Array(size * size);
    const grainAt = grainField(random, size, 1);
    // The fbm relief is smooth: bake it at half size, read it bilinear.
    const half = size / 2;
    const coarse = new Float32Array(half * half);
    for (let i = 0; i < coarse.length; i += 1)
      coarse[i] = tileNoise(
        relief,
        (i % half) / half,
        Math.floor(i / half) / half,
        4
      );
    const at = (x, y) => coarse[wrap(x, half) + wrap(y, half) * half];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        const i = x + y * size;
        const cx = x >> 1;
        const cy = y >> 1;
        const tx = (x & 1) * 0.5;
        const ty = (y & 1) * 0.5;
        const r =
          (at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx) * (1 - ty) +
          (at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx) * ty;
        // fractures run broken: only across the relief's higher half
        const gate = smoothstep(-0.1, 0.2, r);
        const crack =
          (1 - smoothstep(0.0, 0.07, fractures(u, v))) * (0.4 + 0.6 * gate) +
          (1 - smoothstep(0.0, 0.05, fine(u, v))) * gate * 0.5;
        height[i] = r * 0.9 + grainAt[i] * 0.25 - crack * 0.55;
      }
    }
    // Craters (bowl + raised rim) and small pits, splatted with wrap.
    const craters = 9 + Math.floor(random() * 5);
    for (let c = 0; c < craters + 70; c += 1) {
      const big = c < craters;
      const r =
        (big ? 0.035 + random() * 0.06 : 0.006 + random() * 0.014) * size;
      const depth = big ? 0.7 + random() * 0.5 : 0.35 + random() * 0.3;
      const cx = random() * size;
      const cy = random() * size;
      const reach = Math.ceil(r * 1.2);
      for (let y = Math.floor(cy) - reach; y <= cy + reach; y += 1) {
        for (let x = Math.floor(cx) - reach; x <= cx + reach; x += 1) {
          const t = Math.hypot(x - cx, y - cy) / r;
          if (t >= 1.2) continue;
          const bowl = t < 1 ? -(1 - t * t) * depth : 0;
          const rim =
            smoothstep(0.75, 1, t) * smoothstep(1.2, 1, t) * depth * 0.3;
          height[wrap(x, size) + wrap(y, size) * size] += bowl + rim;
        }
      }
    }
    return bakeMaps(
      THREE,
      size,
      height,
      { strength: size / 40, occlusion: 1.6, aoRadius: Math.round(size / 48) },
      (i, cavity) => 0.95 + grainAt[i] * 0.08 - Math.min(0.25, cavity * 0.6)
    );
  });
}

/**
 * Machined hull: four columns of panels split at seeded rows, bevelled
 * seams, rivet rows on some panels, slight wear. Mapped on the hull's UVs.
 */
export function bakeHullMaps(THREE, seed, size = 256) {
  return cached('hull', seed, size, () => {
    const random = createSeededRandom(seed);
    const wear = grainField(random, size, Math.round(size / 40));
    const columns = 4;
    // Row cuts per column (v in [0, 1), the first at 0) and a tone per panel.
    const cuts = Array.from({ length: columns }, () => {
      const rows = [0];
      for (let v = 0.2 + random() * 0.25; v < 0.88; v += 0.18 + random() * 0.3)
        rows.push(v);
      return rows.map((v) => ({ v, tone: random(), rivets: random() > 0.35 }));
    });
    const colWidth = size / columns;
    const seam = 1.2;
    const bevel = size / 110;
    const rivetR = size / 190;
    const rivetInset = size / 48;
    const rivetStep = size / 22;
    const height = new Float32Array(size * size);
    const toneAt = new Float32Array(size * size);
    const wearAt = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const column = Math.floor(x / colWidth);
        const rows = cuts[column];
        const v = y / size;
        let row = rows.length - 1;
        while (rows[row].v > v) row -= 1;
        const top = rows[row].v * size;
        const bottom = (rows[row + 1]?.v ?? 1) * size;
        const left = column * colWidth;
        const right = left + colWidth;
        const du = Math.min(x + 0.5 - left, right - x - 0.5);
        const dv = Math.min(y + 0.5 - top, bottom - y - 0.5);
        const panel = smoothstep(seam, seam + bevel, Math.min(du, dv));
        const tone = rows[row].tone;
        let rivet = 0;
        if (rows[row].rivets && bottom - top > rivetInset * 3) {
          // Rivet rows just inside the panel's left and right edges.
          const ex = Math.min(
            Math.abs(x + 0.5 - left - rivetInset),
            Math.abs(right - rivetInset - x - 0.5)
          );
          const along = ((y + 0.5 - top) % rivetStep) - rivetStep / 2;
          const inside = dv > rivetInset * 0.6;
          const d = Math.hypot(ex, along) / rivetR;
          if (inside && d < 1) rivet = Math.sqrt(1 - d * d) * 0.35;
        }
        const w = wear[x + y * size];
        const i = x + y * size;
        toneAt[i] = tone;
        wearAt[i] = w;
        height[i] = panel * (1 + (tone - 0.5) * 0.12 + w * 0.03) + rivet;
      }
    }
    return bakeMaps(
      THREE,
      size,
      height,
      { strength: size / 90, occlusion: 3, aoRadius: Math.round(size / 100) },
      (i, cavity) =>
        Math.min(1, 0.9 + toneAt[i] * 0.06 + wearAt[i] * 0.06 + cavity * 1.5)
    );
  });
}

/**
 * Warden plate: four bands around v (one per facet of the diamond
 * cross-section), three segments along u, each with a seeded runic glyph cut
 * as grooves. Mapped on the segment's UVs.
 */
export function bakePlateMaps(THREE, seed, size = 256) {
  return cached('plate', seed, size, () => {
    const random = createSeededRandom(seed);
    const grain = grainField(random, size, 1);
    const segments = 3;
    const bands = 4;
    const cellW = size / segments;
    const cellH = size / bands;
    // Glyph strokes on a 3×3 node grid in the cell's middle.
    const node = (k) => [0.3 + (k % 3) * 0.2, 0.28 + Math.floor(k / 3) * 0.22];
    const glyphs = Array.from({ length: segments * bands }, () => {
      const strokes = [];
      let at = Math.floor(random() * 9);
      const count = 3 + Math.floor(random() * 3);
      for (let s = 0; s < count; s += 1) {
        const ax = at % 3;
        const ay = Math.floor(at / 3);
        const bx = Math.max(0, Math.min(2, ax + Math.floor(random() * 3) - 1));
        const by = Math.max(0, Math.min(2, ay + Math.floor(random() * 3) - 1));
        const to = bx + by * 3;
        if (to !== at) strokes.push([node(at), node(to)]);
        at = to;
      }
      return strokes;
    });
    const groove = size / 200;
    const edge = size / 85;
    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const cell = Math.floor(x / cellW) + Math.floor(y / cellH) * segments;
        const lx = (x + 0.5) % cellW;
        const ly = (y + 0.5) % cellH;
        const border = Math.min(lx, cellW - lx, ly, cellH - ly);
        let h = smoothstep(1, 1 + edge, border);
        let d = Infinity;
        for (const [[ax, ay], [bx, by]] of glyphs[cell]) {
          const px = lx - ax * cellW;
          const py = ly - ay * cellH;
          const sx = (bx - ax) * cellW;
          const sy = (by - ay) * cellH;
          const t = Math.max(
            0,
            Math.min(1, (px * sx + py * sy) / (sx * sx + sy * sy))
          );
          d = Math.min(d, Math.hypot(px - sx * t, py - sy * t));
        }
        h -= 0.6 * (1 - smoothstep(groove * 0.6, groove * 1.8, d));
        h += grain[x + y * size] * 0.025;
        height[x + y * size] = h;
      }
    }
    return bakeMaps(
      THREE,
      size,
      height,
      { strength: size / 80, occlusion: 3, aoRadius: Math.round(size / 90) },
      (i, cavity) => Math.min(1, 0.84 + cavity * 1.2)
    );
  });
}

/**
 * A planet's night side (places/quarantineGrid.js), equirectangular: u the
 * longitude, v the latitude, `size` × size/2. R: the ground's albedo (dark
 * basins, paler highlands); G: dead cities, specks along the coasts; B: the
 * glow of one great crack, a wandering great circle round most of the globe.
 * The relief is sampled on the sphere (no seam), baked at a quarter size and
 * read bilinear: it is smooth, and the bake runs as the game loads.
 */
export function bakePlanetMap(THREE, seed, size = 512) {
  return cached('planet', seed, size, () => {
    const W = size;
    const H = size / 2;
    const salt = Math.floor(createSeededRandom(seed)() * 2147483647);
    const relief = new SimplexNoise(createSeededRandom(seed + 1));
    const cw = W / 4;
    const ch = H / 4;
    const coarse = new Float32Array(cw * ch);
    const dir = (u, v) => {
      const lat = (v - 0.5) * Math.PI;
      const lon = u * Math.PI * 2 - Math.PI;
      return [
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        Math.cos(lat) * Math.sin(lon),
      ];
    };
    for (let j = 0; j < ch; j += 1) {
      for (let i = 0; i < cw; i += 1) {
        const [x, y, z] = dir((i + 0.5) / cw, (j + 0.5) / ch);
        coarse[i + j * cw] = relief.fbm(x * 1.6 + 3, y * 1.6, z * 1.6, 4);
      }
    }
    // the relief read bilinear from the coarse bake (wrapping in longitude)
    const coarseAt = (i, j) => coarse[wrap(i, cw) + j * cw];
    const land = (x, y) => {
      const fx = (x + 0.5) / 4 - 0.5;
      const fy = Math.max(0, Math.min(ch - 1, (y + 0.5) / 4 - 0.5));
      const ix = Math.floor(fx);
      const iy = Math.min(ch - 2, Math.floor(fy));
      const tx = fx - ix;
      const ty = fy - iy;
      return (
        (coarseAt(ix, iy) * (1 - tx) + coarseAt(ix + 1, iy) * tx) * (1 - ty) +
        (coarseAt(ix, iy + 1) * (1 - tx) + coarseAt(ix + 1, iy + 1) * tx) * ty
      );
    };
    // the crack's great circle (its pole `a`, its plane b, c) and its gap
    const a = [0.9, 0.25, 0.35];
    const an = Math.hypot(...a);
    a.forEach((k, i) => (a[i] = k / an));
    const b = [0, -a[2], a[1]];
    const bn = Math.hypot(...b);
    b.forEach((k, i) => (b[i] = k / bn));
    const c = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const reach = 5.6;
    // white grain from an integer hash of a texel (a seeded random per
    // texel cost more than the rest of the bake)
    const hash = (i, j) => {
      let h = Math.imul(i + 1, 374761393) + Math.imul(j + 1, 668265263) + salt;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const cosLon = new Float32Array(W);
    const sinLon = new Float32Array(W);
    for (let x = 0; x < W; x += 1) {
      const lon = ((x + 0.5) / W) * Math.PI * 2 - Math.PI;
      cosLon[x] = Math.cos(lon);
      sinLon[x] = Math.sin(lon);
    }
    const p = [0, 0, 0];
    const data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y += 1) {
      const lat = ((y + 0.5) / H - 0.5) * Math.PI;
      const cosLat = Math.cos(lat);
      p[1] = Math.sin(lat);
      const polar = Math.abs(p[1]) > 0.8;
      for (let x = 0; x < W; x += 1) {
        p[0] = cosLat * cosLon[x];
        p[2] = cosLat * sinLon[x];
        const l = land(x, y);
        const grain = hash(x, y);
        const albedo =
          0.35 + 0.65 * smoothstep(-0.15, 0.3, l) * (0.82 + 0.18 * grain);
        // cities: the brightest specks of grain, only on the coasts
        let city = 0;
        if (!polar && grain > 0.84 && Math.abs(l - 0.05) < 0.25) {
          city =
            Math.exp(-(((l - 0.05) / 0.1) ** 2)) *
            smoothstep(0.84, 0.97, grain);
        }
        // the crack: only texels near its circle carry any glow
        const pole = dot(p, a);
        let glow = 0;
        if (Math.abs(pole) < 0.3) {
          let t = Math.atan2(dot(p, c), dot(p, b));
          if (t < 0) t += Math.PI * 2;
          const off = pole - 0.06 * Math.sin(t * 9) - 0.03 * Math.sin(t * 23);
          const along =
            smoothstep(0, 0.08, t) * smoothstep(reach, reach - 0.08, t);
          glow =
            along *
            (Math.exp(-(off * off) / 0.0009) +
              0.25 * Math.exp(-(off * off) / 0.012));
        }
        const o = (x + y * W) * 4;
        data[o] = Math.round(255 * albedo);
        data[o + 1] = Math.round(255 * Math.min(1, city));
        data[o + 2] = Math.round(255 * Math.min(1, glow));
        data[o + 3] = 255;
      }
    }
    return dataTexture(THREE, data, W, H);
  });
}
