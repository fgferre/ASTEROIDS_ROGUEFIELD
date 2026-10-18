// FROZEN (18/10/2026): the Canvas 2D gameplay renderer is an easter egg
// (`?renderer=2d`). No new features, no 2D/3D parity, no captures: new
// machines, weapons and effects are built in src/modules/render3d/ only.
// Touch this file only to keep it from breaking.
// tests/process/render2d-frozen.test.js pins its size.
import { GAME_HEIGHT, GAME_WIDTH, SHIP_SIZE } from '../core/GameConstants.js';
import CanvasStateManager from '../core/CanvasStateManager.js';
import RandomService from '../core/RandomService.js';
import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { GameDebugLogger } from '../utils/dev/GameDebugLogger.js';
import { MAGNETISM_RADIUS } from '../data/constants/gameplay.js';
import { normalize as normalizeVector } from '../utils/vectorHelpers.js';
import { applyBaseTransform, getRenderScale } from '../core/viewport.js';
import * as bloomLayer from '../core/bloomLayer.js';
import { BiomeTransition } from '../data/biomes.js';
import {
  createCamera,
  createCameraScene,
  readCameraScene,
  resolveCameraMode,
} from '../core/camera.js';
import {
  FILL_LIGHT,
  KEY_LIGHT_DIR,
  LINE,
  PALETTE,
  withAlpha,
} from '../data/constants/palette.js';
import { requireRandom } from '../utils/randomHelpers.js';

// Player shield: a field-generator barrier around the hull outline.
const SHIELD_SWEEP_SPEED = 0.35; // perimeters per second
const SHIELD_SWEEP_SHARE = 0.18; // fraction of the perimeter lit by the sweep
const SHIELD_IMPACT_FLASH_MS = 80;

const MAX_VISUAL_TILT = 0.3;
const TILT_MULTIPLIER = 0.12;
const MIN_OUTLINE_POINTS = 3;
const EPSILON = 1e-6;

// Graphics Settings Defaults
const DEFAULT_GRAPHICS_SETTINGS = {
  bloom: true,
  chromaticAberration: true,
  postProcessing: true,
  antialiasing: 'SMAA',
};

function computePolygonArea(points) {
  if (!Array.isArray(points) || points.length < MIN_OUTLINE_POINTS) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return area / 2;
}

function expandHullOutline(outline, padding) {
  if (!Array.isArray(outline) || outline.length < MIN_OUTLINE_POINTS) {
    return null;
  }

  if (!padding) {
    return outline.map((point) => ({ x: point.x, y: point.y }));
  }

  const orientation = computePolygonArea(outline) >= 0 ? 1 : -1;
  const expanded = [];

  for (let i = 0; i < outline.length; i += 1) {
    const prev = outline[(i - 1 + outline.length) % outline.length];
    const curr = outline[i];
    const next = outline[(i + 1) % outline.length];

    if (!curr) {
      expanded.push({ x: 0, y: 0 });
      continue;
    }

    const edgePrev = normalizeVector(curr.x - prev.x, curr.y - prev.y);
    const edgeNext = normalizeVector(next.x - curr.x, next.y - curr.y);

    const normalPrev = {
      x: -edgePrev.y * orientation,
      y: edgePrev.x * orientation,
    };
    const normalNext = {
      x: -edgeNext.y * orientation,
      y: edgeNext.x * orientation,
    };

    const normalSum = normalizeVector(
      normalPrev.x + normalNext.x,
      normalPrev.y + normalNext.y
    );

    const cross =
      (curr.x - prev.x) * (next.y - curr.y) -
      (curr.y - prev.y) * (next.x - curr.x);
    const isConcave = orientation > 0 ? cross < 0 : cross > 0;

    let offsetDir =
      normalSum.length > EPSILON
        ? normalSum
        : normalizeVector(normalPrev.x, normalPrev.y);

    if (isConcave) {
      const radial = normalizeVector(curr.x, curr.y);
      if (radial.length > EPSILON) {
        offsetDir = radial;
      }
    }

    const denom = offsetDir.x * normalPrev.x + offsetDir.y * normalPrev.y;
    const safeDenom =
      Math.abs(denom) > EPSILON ? denom : denom >= 0 ? EPSILON : -EPSILON;

    const scale = padding / safeDenom;

    expanded.push({
      x: curr.x + offsetDir.x * scale,
      y: curr.y + offsetDir.y * scale,
    });
  }

  return expanded;
}

function buildPathFromPoints(points) {
  if (!Array.isArray(points) || points.length < MIN_OUTLINE_POINTS) {
    return null;
  }

  const path = new Path2D();
  let moved = false;

  points.forEach((point) => {
    if (!point) return;
    if (!moved) {
      path.moveTo(point.x, point.y);
      moved = true;
    } else {
      path.lineTo(point.x, point.y);
    }
  });

  if (!moved) {
    return null;
  }

  path.closePath();
  return path;
}

function computeOutlineRadius(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return 0;
  }

  return points.reduce((max, point) => {
    if (!point) return max;
    const radius = Math.hypot(point.x, point.y);
    return radius > max ? radius : max;
  }, 0);
}

// Elongated hexagon around the padded hull: the box corners become its side
// vertices and the tips sit past the nose and the tail.
function hexagonAround(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const hx = (maxX - minX) / 2;
  const hy = (maxY - minY) / 2;
  const tip = hx + hy * 0.6;
  return [
    { x: cx + tip, y: cy },
    { x: cx + hx, y: cy + hy },
    { x: cx - hx, y: cy + hy },
    { x: cx - tip, y: cy },
    { x: cx - hx, y: cy - hy },
    { x: cx + hx, y: cy - hy },
  ];
}

function computePerimeter(points) {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

const SPACE_SKY_RANDOM_SEED = 'rendering:starfield';

// 'rgba(r, g, b, a)' → [r, g, b, a], parsed once per string.
const tintCache = new Map();
function parseTint(css) {
  let rgba = tintCache.get(css);
  if (!rgba) {
    rgba = css.match(/[\d.]+/g).map(Number);
    tintCache.set(css, rgba);
  }
  return rgba;
}

// `?bloom=0` turns the post pass off for A/B and for slow machines.
function bloomDisabledByUrl() {
  try {
    return new URLSearchParams(window.location.search).get('bloom') === '0';
  } catch {
    return false;
  }
}

// The Field (docs/NORTE.md §2): two haze layers, drifting dust, ~120 white
// stars and the broken Ring far back. Everything is baked once (on resize or
// render-scale change) and drawn as wrapped tiles, so a frame costs ~31 draws.
const HAZE_SCALE = 0.25;
const HAZE_BLUR = 5;
const VIGNETTE_SCALE = 0.25;
const RING_MARGIN = 16;
const MAX_GLINTS = 8;

// Far fragments: dark Ring shards drifting between the haze and the stars,
// baked into one wrapped tile. PROPOSAL from 17/10 (was: none), judged by the
// owner playing.
const FAR_FRAGMENTS = Object.freeze({
  count: 14,
  speed: 0.15, // parallax factor
  verticesMin: 7,
  verticesMax: 10,
  radiusMin: 5, // logical px → 10–28 px across
  radiusMax: 14,
  driftMax: 2.5, // px/s of their own slow drift
  alphaMin: 0.55, // kept below the gameplay rocks so they never read as targets
  alphaMax: 0.85,
  rimAlpha: 0.3,
});

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

const COLD_BLUE = FILL_LIGHT.match(/\d+/g).slice(0, 3).map(Number);
const STAR_COOL = hexToRgb(PALETTE.text);
const STAR_WARM = mixRgb(STAR_COOL, hexToRgb(PALETTE.shot), 0.18);

class SpaceSkyBackground {
  constructor(randomGenerator = null) {
    this.random = this.resolveRandomGenerator(randomGenerator);
    this.width = 0;
    this.height = 0;

    // Star layers, far to near. `speed` is the parallax factor.
    this.layers = [
      { speed: 0.04, count: 60, sizeMin: 1, sizeMax: 1.3, alpha: 0.5 },
      { speed: 0.12, count: 40, sizeMin: 1.1, sizeMax: 1.6, alpha: 0.7 },
      { speed: 0.24, count: 20, sizeMin: 1.4, sizeMax: 2, alpha: 0.85 },
    ].map((layer) => ({
      ...layer,
      stars: [],
      phase: 0,
      breath: 0,
      offsetX: 0,
      offsetY: 0,
      tile: null,
    }));

    this.hazeLayers = [
      { speed: 0.02, grid: 2, octaves: 4, alpha: 0.16, threshold: 0.4 },
      { speed: 0.09, grid: 3, octaves: 4, alpha: 0.09, threshold: 0.48 },
    ].map((layer) => ({
      ...layer,
      lattices: [],
      tint: [],
      offsetX: 0,
      offsetY: 0,
      tile: null,
    }));

    this.dust = {
      speed: 0.16,
      count: 40,
      motes: [],
      driftX: 0,
      driftY: 0,
      offsetX: 0,
      offsetY: 0,
      tile: null,
    };

    this.fragments = {
      speed: FAR_FRAGMENTS.speed,
      shards: [],
      driftX: 0,
      driftY: 0,
      offsetX: 0,
      offsetY: 0,
      tile: null,
    };

    this.ring = {
      segments: [],
      debris: [],
      shiftX: 0,
      shiftY: 0,
      buffer: null,
    };
    this.vignette = null;
    this.cameraShiftX = 0;
    this.cameraShiftY = 0;
    this.bakedScale = 0;
    this.initialized = false;
  }

  resolveRandomGenerator(randomGenerator) {
    if (randomGenerator && typeof randomGenerator.float === 'function') {
      return randomGenerator;
    }
    return new RandomService(SPACE_SKY_RANDOM_SEED);
  }

  randomFloat() {
    return requireRandom(this.random, 'rendering.space-sky').float();
  }

  randomRange(min, max) {
    if (this.random && typeof this.random.range === 'function') {
      return this.random.range(min, max);
    }
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + this.randomFloat() * (high - low);
  }

  randomInt(min, max) {
    if (this.random && typeof this.random.int === 'function') {
      return this.random.int(min, max);
    }
    return Math.floor(this.randomRange(min, max + 1));
  }

  randomChance(probability) {
    if (this.random && typeof this.random.chance === 'function') {
      return this.random.chance(probability);
    }
    return this.randomFloat() < probability;
  }

  // Required by RenderingSystem.onReset() - reassigns random generator and rebuilds stars
  reseed(randomGenerator) {
    this.random = this.resolveRandomGenerator(randomGenerator);
    this.initialized = false; // Force rebuild on next render
    if (this.width > 0 && this.height > 0) {
      this.rebuild();
    }
  }

  resize(width, height) {
    // Rebuild if: not initialized, or dimensions changed significantly
    const dimensionsChanged =
      Math.abs(this.width - width) > 10 || Math.abs(this.height - height) > 10;

    if (!this.initialized || dimensionsChanged) {
      this.width = width;
      this.height = height;
      this.rebuild();
    }
  }

  // Generates the layout from the seeded RNG, then bakes it.
  rebuild() {
    const w = this.width > 0 ? this.width : 800;
    const h = this.height > 0 ? this.height : 600;

    let glints = 0;
    this.layers.forEach((layer, layerIndex) => {
      layer.phase = this.randomFloat() * Math.PI * 2;
      layer.breath = 0.15 + this.randomFloat() * 0.2;
      layer.stars = [];
      for (let i = 0; i < layer.count; i++) {
        const star = {
          x: this.randomRange(0, w),
          y: this.randomRange(0, h),
          size:
            layer.sizeMin +
            this.randomFloat() * (layer.sizeMax - layer.sizeMin),
          phase: this.randomFloat() * Math.PI * 2,
          jitter: this.randomFloat(),
          glint: false,
        };
        if (layerIndex > 0 && glints < MAX_GLINTS && this.randomChance(0.12)) {
          star.glint = true;
          glints += 1;
        }
        layer.stars.push(star);
      }
    });

    // Tileable value-noise lattices for the haze (base grid keeps 4:3).
    this.hazeLayers.forEach((layer) => {
      layer.lattices = [];
      for (let o = 0; o < layer.octaves; o++) {
        const gx = layer.grid * 4 * 2 ** o;
        const gy = layer.grid * 3 * 2 ** o;
        const values = new Float32Array(gx * gy);
        for (let i = 0; i < values.length; i++) values[i] = this.randomFloat();
        layer.lattices.push({ gx, gy, values });
      }
      const tint = new Float32Array(4 * 3);
      for (let i = 0; i < tint.length; i++) tint[i] = this.randomFloat();
      layer.tint = { gx: 4, gy: 3, values: tint };
    });

    this.dust.motes = [];
    for (let i = 0; i < this.dust.count; i++) {
      this.dust.motes.push({
        x: this.randomRange(0, w),
        y: this.randomRange(0, h),
        radius: this.randomRange(1, 2),
        alpha: this.randomRange(0.1, 0.25),
      });
    }
    this.dust.driftX = this.randomRange(-3, 3);
    this.dust.driftY = this.randomRange(-2, 2);

    this.buildRing();
    // Generated after everything else so the older layers keep their layout.
    this.buildFragments(w, h);
    this.bake();
    this.initialized = true;
  }

  // The far side of a huge ring seen almost edge-on, cracked into segments.
  buildRing() {
    const count = this.randomInt(3, 5);
    const start = Math.PI * 1.5 - 0.8;
    const end = Math.PI * 1.5 + 0.8;
    const span = (end - start) / count;
    this.ring.segments = [];
    this.ring.debris = [];
    for (let i = 0; i < count; i++) {
      const gapA = i === 0 ? 0 : this.randomRange(0.025, 0.06);
      const gapB = i === count - 1 ? 0 : this.randomRange(0.025, 0.06);
      const jag = () => [0, 1, 2].map(() => this.randomRange(-0.012, 0.012));
      this.ring.segments.push({
        a0: start + span * i + gapA,
        a1: start + span * (i + 1) - gapB,
        jag0: jag(),
        jag1: jag(),
      });
      if (i > 0) {
        for (let d = 0; d < 3; d++) {
          this.ring.debris.push({
            angle: start + span * i + this.randomRange(-0.05, 0.05),
            depth: this.randomRange(0.88, 1.02),
            size: this.randomRange(2, 5),
            rotation: this.randomRange(0, Math.PI * 2),
          });
        }
      }
    }
  }

  buildFragments(w, h) {
    const f = FAR_FRAGMENTS;
    this.fragments.shards = [];
    for (let i = 0; i < f.count; i++) {
      const radius = this.randomRange(f.radiusMin, f.radiusMax);
      const vertices = this.randomInt(f.verticesMin, f.verticesMax);
      const squash = this.randomRange(0.55, 1);
      const rotation = this.randomRange(0, Math.PI * 2);
      const points = [];
      for (let v = 0; v < vertices; v++) {
        const angle =
          ((v + this.randomRange(-0.3, 0.3)) / vertices) * Math.PI * 2;
        const r = radius * this.randomRange(0.6, 1);
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r * squash;
        points.push([
          px * Math.cos(rotation) - py * Math.sin(rotation),
          px * Math.sin(rotation) + py * Math.cos(rotation),
        ]);
      }
      this.fragments.shards.push({
        x: this.randomRange(0, w),
        y: this.randomRange(0, h),
        radius,
        points,
        alpha: this.randomRange(f.alphaMin, f.alphaMax),
      });
    }
    this.fragments.driftX = this.randomRange(-f.driftMax, f.driftMax);
    this.fragments.driftY = this.randomRange(-f.driftMax, f.driftMax);
  }

  // Matte silhouette, a faint lit face and a rim on the key-light side.
  paintFragment(ctx, x, y, shard) {
    const pts = shard.points;
    const r = shard.radius;
    ctx.globalAlpha = shard.alpha;
    ctx.beginPath();
    pts.forEach(([px, py], i) =>
      i === 0 ? ctx.moveTo(x + px, y + py) : ctx.lineTo(x + px, y + py)
    );
    ctx.closePath();
    ctx.fillStyle = PALETTE.rockShadow;
    ctx.fill();
    const face = ctx.createLinearGradient(
      x + KEY_LIGHT_DIR.x * r,
      y + KEY_LIGHT_DIR.y * r,
      x - KEY_LIGHT_DIR.x * r,
      y - KEY_LIGHT_DIR.y * r
    );
    face.addColorStop(0, withAlpha(PALETTE.rock, 0.75));
    face.addColorStop(0.6, withAlpha(PALETTE.rock, 0));
    ctx.fillStyle = face;
    ctx.fill();

    ctx.lineWidth = LINE.hair * 0.8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(PALETTE.rockLit, FAR_FRAGMENTS.rimAlpha);
    ctx.beginPath();
    pts.forEach(([ax, ay], i) => {
      const [bx, by] = pts[(i + 1) % pts.length];
      // outward edge normal (points sit around the origin)
      let nx = by - ay;
      let ny = ax - bx;
      if (nx * (ax + bx) + ny * (ay + by) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const len = Math.hypot(nx, ny) || 1;
      if ((nx * KEY_LIGHT_DIR.x + ny * KEY_LIGHT_DIR.y) / len > 0.25) {
        ctx.moveTo(x + ax, y + ay);
        ctx.lineTo(x + bx, y + by);
      }
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Paints every buffer from the generated layout at the current render scale.
  bake() {
    const w = this.width > 0 ? this.width : 800;
    const h = this.height > 0 ? this.height : 600;
    const scale = getRenderScale() || 1;
    this.bakedScale = scale;

    this.layers.forEach((layer) => {
      layer.tile = this.bakeLayer(w, h, scale, (ctx) => {
        layer.stars.forEach((star) =>
          this.forWrapped(star.x, star.y, 6, w, h, (x, y) =>
            this.paintStar(ctx, x, y, star, layer.alpha)
          )
        );
      });
    });

    this.dust.tile = this.bakeLayer(w, h, scale, (ctx) => {
      this.dust.motes.forEach((mote) =>
        this.forWrapped(mote.x, mote.y, 4, w, h, (x, y) => {
          const glow = ctx.createRadialGradient(x, y, 0, x, y, mote.radius);
          glow.addColorStop(0, withAlpha(PALETTE.text, mote.alpha));
          glow.addColorStop(1, withAlpha(PALETTE.neutral, 0));
          ctx.fillStyle = glow;
          ctx.fillRect(
            x - mote.radius,
            y - mote.radius,
            mote.radius * 2,
            mote.radius * 2
          );
        })
      );
    });

    this.fragments.tile = this.bakeLayer(w, h, scale, (ctx) => {
      this.fragments.shards.forEach((shard) =>
        this.forWrapped(shard.x, shard.y, shard.radius + 2, w, h, (x, y) =>
          this.paintFragment(ctx, x, y, shard)
        )
      );
    });

    this.hazeLayers.forEach((layer) => {
      layer.tile = this.bakeHaze(layer, w, h);
    });

    this.ring.buffer = this.bakeRing(w, h, scale);
    this.vignette = this.bakeVignette(w, h);
  }

  bakeLayer(w, h, scale, paint) {
    const canvas = this.createOffscreenCanvas(w, h, scale);
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    paint(ctx);
    return canvas;
  }

  forWrapped(x, y, margin, w, h, draw) {
    const xs = [x];
    const ys = [y];
    if (x < margin) xs.push(x + w);
    if (x > w - margin) xs.push(x - w);
    if (y < margin) ys.push(y + h);
    if (y > h - margin) ys.push(y - h);
    xs.forEach((px) => ys.forEach((py) => draw(px, py)));
  }

  paintStar(ctx, x, y, star, layerAlpha) {
    const rgb = star.jitter < 0.5 ? STAR_WARM : STAR_COOL;
    const alpha = layerAlpha * (0.55 + 0.45 * star.jitter);
    const r = star.size / 2;

    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    halo.addColorStop(0, rgba(rgb, alpha * 0.25));
    halo.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * 2.5, y - r * 2.5, r * 5, r * 5);

    ctx.fillStyle = rgba(rgb, alpha);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    if (!star.glint) return;
    const reach = 3 + star.size * 2;
    ctx.lineWidth = LINE.hair * 0.6;
    [
      [reach, 0],
      [0, reach],
    ].forEach(([dx, dy]) => {
      const spike = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
      spike.addColorStop(0, rgba(rgb, 0));
      spike.addColorStop(0.5, rgba(rgb, alpha * 0.7));
      spike.addColorStop(1, rgba(rgb, 0));
      ctx.strokeStyle = spike;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    });
  }

  sampleNoise(lattice, u, v) {
    const { gx, gy, values } = lattice;
    const fx = u * gx;
    const fy = v * gy;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const xa = ((x0 % gx) + gx) % gx;
    const xb = (xa + 1) % gx;
    const ya = ((y0 % gy) + gy) % gy;
    const yb = (ya + 1) % gy;
    const top = values[ya * gx + xa] * (1 - sx) + values[ya * gx + xb] * sx;
    const bottom = values[yb * gx + xa] * (1 - sx) + values[yb * gx + xb] * sx;
    return top * (1 - sy) + bottom * sy;
  }

  bakeHaze(layer, w, h) {
    const canvas = this.createOffscreenCanvas(w, h, HAZE_SCALE);
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return null;

    const cw = canvas.width;
    const ch = canvas.height;
    const image = ctx.createImageData(cw, ch);
    const data = image.data;
    const neutral = hexToRgb(PALETTE.neutral);
    let norm = 0;
    for (let o = 0; o < layer.octaves; o++) norm += 0.5 ** o;

    for (let py = 0; py < ch; py++) {
      const v = py / ch;
      for (let px = 0; px < cw; px++) {
        const u = px / cw;
        let n = 0;
        for (let o = 0; o < layer.octaves; o++) {
          n += this.sampleNoise(layer.lattices[o], u, v) * 0.5 ** o;
        }
        n /= norm;
        const d = Math.min(1, Math.max(0, (n - layer.threshold) / 0.35));
        const rgb = mixRgb(
          neutral,
          COLD_BLUE,
          this.sampleNoise(layer.tint, u, v)
        );
        const i = (py * cw + px) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = Math.round(d * d * layer.alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.blurTile(canvas, HAZE_BLUR);
  }

  // Softens a wrapped tile without seams: blur a 3×3 mosaic, keep the middle.
  blurTile(tile, radius) {
    const cw = tile.width;
    const ch = tile.height;
    const out = this.createOffscreenCanvas(cw, ch);
    const ctx = out?.getContext?.('2d');
    if (!ctx) return tile;
    ctx.filter = `blur(${radius}px)`;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) ctx.drawImage(tile, x * cw, y * ch);
    }
    ctx.filter = 'none';
    return out;
  }

  ringPoint(cx, cy, rx, ry, rot, k, angle) {
    const ex = Math.cos(angle) * rx * k;
    const ey = Math.sin(angle) * ry * k;
    return [
      cx + ex * Math.cos(rot) - ey * Math.sin(rot),
      cy + ex * Math.sin(rot) + ey * Math.cos(rot),
    ];
  }

  bakeRing(w, h, scale) {
    const m = RING_MARGIN;
    const canvas = this.createOffscreenCanvas(w + m * 2, h + m * 2, scale);
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.translate(m, m);

    const cx = w * 0.55;
    const cy = h * 1.45;
    const rx = w * 1.3;
    const ry = h * 1.22;
    const rot = -0.14;
    const inner = 0.95;
    const at = (k, a) => this.ringPoint(cx, cy, rx, ry, rot, k, a);
    const steps = 48;

    const band = new Path2D();
    const rim = new Path2D();
    this.ring.segments.forEach((seg) => {
      const crack = (angle, jag, fromOuter) =>
        jag.forEach((j, idx) => {
          const t = fromOuter ? (idx + 1) / 4 : 1 - (idx + 1) / 4;
          band.lineTo(...at(1 - (1 - inner) * t, angle + j));
        });
      band.moveTo(...at(1, seg.a0));
      rim.moveTo(...at(1, seg.a0));
      for (let s = 1; s <= steps; s++) {
        const a = seg.a0 + ((seg.a1 - seg.a0) * s) / steps;
        band.lineTo(...at(1, a));
        rim.lineTo(...at(1, a));
      }
      crack(seg.a1, seg.jag1, true);
      for (let s = steps; s >= 0; s--) {
        band.lineTo(...at(inner, seg.a0 + ((seg.a1 - seg.a0) * s) / steps));
      }
      crack(seg.a0, seg.jag0, false);
      band.closePath();
    });

    // Occlude what lies behind, then lift the mass just above the void.
    ctx.fillStyle = withAlpha(PALETTE.background, 0.65);
    ctx.fill(band);
    const topY = at(1, Math.PI * 1.5)[1];
    const mass = ctx.createLinearGradient(0, topY - h * 0.1, 0, h);
    mass.addColorStop(0, withAlpha(PALETTE.hull, 0.3));
    mass.addColorStop(1, withAlpha(PALETTE.hull, 0.12));
    ctx.fillStyle = mass;
    ctx.fill(band);

    // A dark lane inside the band reads as ring structure.
    ctx.lineWidth = LINE.thin;
    ctx.strokeStyle = withAlpha(PALETTE.background, 0.45);
    this.ring.segments.forEach((seg) => {
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const p = at(0.97, seg.a0 + ((seg.a1 - seg.a0) * s) / steps);
        if (s === 0) ctx.moveTo(...p);
        else ctx.lineTo(...p);
      }
      ctx.stroke();
    });

    // Key light from the upper left catches the outer edge.
    const light = ctx.createLinearGradient(0, 0, w, 0);
    light.addColorStop(0, withAlpha(PALETTE.rockLit, 0.2));
    light.addColorStop(0.5, withAlpha(PALETTE.rockLit, 0.1));
    light.addColorStop(1, withAlpha(PALETTE.rockLit, 0.04));
    ctx.lineWidth = LINE.hair;
    ctx.strokeStyle = light;
    ctx.stroke(rim);

    this.ring.debris.forEach((chunk) => {
      const [x, y] = at(chunk.depth, chunk.angle);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(chunk.rotation);
      ctx.fillStyle = withAlpha(PALETTE.hull, 0.45);
      ctx.fillRect(
        -chunk.size / 2,
        -chunk.size / 3,
        chunk.size,
        chunk.size / 1.5
      );
      ctx.restore();
    });

    return canvas;
  }

  bakeVignette(w, h) {
    const canvas = this.createOffscreenCanvas(w, h, VIGNETTE_SCALE);
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return null;
    ctx.scale(VIGNETTE_SCALE, VIGNETTE_SCALE);
    const gradient = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.62
    );
    gradient.addColorStop(0, withAlpha(PALETTE.background, 0));
    gradient.addColorStop(1, withAlpha(PALETTE.background, 0.7));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    return canvas;
  }

  render(ctx, options = {}) {
    if (!ctx) return;

    const width = options.width || ctx.canvas.width;
    const height = options.height || ctx.canvas.height;

    if (!this.initialized || this.width !== width || this.height !== height) {
      this.resize(width, height);
    }
    if (this.bakedScale !== (getRenderScale() || 1)) {
      this.bake();
    }

    // Safeguard against NaN velocity - check both {vx,vy} and {x,y} formats
    const rawVelocity = options.velocity || {};
    const vx = Number.isFinite(rawVelocity.vx)
      ? rawVelocity.vx
      : Number.isFinite(rawVelocity.x)
        ? rawVelocity.x
        : 0;
    const vy = Number.isFinite(rawVelocity.vy)
      ? rawVelocity.vy
      : Number.isFinite(rawVelocity.y)
        ? rawVelocity.y
        : 0;

    // The camera pans over the field; each layer follows at its parallax
    // rate (`speed`), so far layers barely move and dust moves most.
    this.cameraShiftX = Number.isFinite(options.cameraX)
      ? options.cameraX - width / 2
      : 0;
    this.cameraShiftY = Number.isFinite(options.cameraY)
      ? options.cameraY - height / 2
      : 0;

    const dt = 16 / 1000;
    const time = performance.now() / 1000;
    const scroll = (layer) => {
      layer.offsetX -= vx * layer.speed * dt;
      layer.offsetY -= vy * layer.speed * dt;
    };
    this.layers.forEach(scroll);
    this.hazeLayers.forEach(scroll);
    scroll(this.dust);
    scroll(this.fragments);

    // The Ring barely moves: it leans against the motion and settles back.
    const ring = this.ring;
    ring.shiftX += (-vx * 0.03 - ring.shiftX) * 0.02;
    ring.shiftY += (-vy * 0.03 - ring.shiftY) * 0.02;

    ctx.save();
    ctx.fillStyle = PALETTE.background;
    ctx.fillRect(0, 0, width, height);

    const [farHaze, nearHaze] = this.hazeLayers;
    const [farStars, midStars, nearStars] = this.layers;
    const breathe = (layer) =>
      0.85 + 0.15 * Math.sin(time * layer.breath + layer.phase);

    this.drawTiled(ctx, farHaze.tile, farHaze, width, height, 1);
    this.drawTiled(
      ctx,
      farStars.tile,
      farStars,
      width,
      height,
      breathe(farStars)
    );
    if (ring.buffer) {
      const m = RING_MARGIN;
      const sx = Math.max(
        -m,
        Math.min(m, ring.shiftX - this.cameraShiftX * 0.01)
      );
      const sy = Math.max(
        -m,
        Math.min(m, ring.shiftY - this.cameraShiftY * 0.01)
      );
      ctx.globalAlpha = 1;
      ctx.drawImage(ring.buffer, sx - m, sy - m, width + m * 2, height + m * 2);
    }
    this.drawTiled(ctx, nearHaze.tile, nearHaze, width, height, 1);
    this.drawTiled(
      ctx,
      this.fragments.tile,
      {
        speed: this.fragments.speed,
        offsetX: this.fragments.offsetX + this.fragments.driftX * time,
        offsetY: this.fragments.offsetY + this.fragments.driftY * time,
      },
      width,
      height,
      1
    );
    this.drawTiled(
      ctx,
      midStars.tile,
      midStars,
      width,
      height,
      breathe(midStars)
    );
    this.drawTiled(
      ctx,
      this.dust.tile,
      {
        speed: this.dust.speed,
        offsetX: this.dust.offsetX + this.dust.driftX * time,
        offsetY: this.dust.offsetY + this.dust.driftY * time,
      },
      width,
      height,
      1
    );
    this.drawTiled(
      ctx,
      nearStars.tile,
      nearStars,
      width,
      height,
      breathe(nearStars)
    );

    if (this.vignette) {
      ctx.globalAlpha = 1;
      ctx.drawImage(this.vignette, 0, 0, width, height);
    }
    ctx.restore();
  }

  // Draws a full-field tile scrolled by the layer offset (≤4 drawImage).
  drawTiled(ctx, tile, layer, width, height, alpha) {
    if (!tile) return;
    const scale = this.bakedScale;
    const offsetX = layer.offsetX - this.cameraShiftX * layer.speed;
    const offsetY = layer.offsetY - this.cameraShiftY * layer.speed;
    const ox =
      Math.round((((offsetX % width) + width) % width) * scale) / scale;
    const oy =
      Math.round((((offsetY % height) + height) % height) * scale) / scale;
    ctx.globalAlpha = alpha;
    for (const x of ox > 0 ? [ox - width, ox] : [0]) {
      for (const y of oy > 0 ? [oy - height, oy] : [0]) {
        ctx.drawImage(tile, x, y, width, height);
      }
    }
  }
  createOffscreenCanvas(width, height, scale = 1) {
    const safeWidth = Math.max(1, Math.ceil(Math.floor(width) * scale));
    const safeHeight = Math.max(1, Math.ceil(Math.floor(height) * scale));

    if (
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function'
    ) {
      const canvas = document.createElement('canvas');
      canvas.width = safeWidth;
      canvas.height = safeHeight;
      return canvas;
    }

    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(safeWidth, safeHeight);
    }

    return null;
  }
}

class RenderingSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      enableRandomManagement: true,
      systemName: 'RenderingSystem',
      serviceName: 'renderer',
      randomForkLabels: {
        base: 'rendering.base',
        starfield: 'rendering.starfield',
        assets: 'rendering.assets',
      },
    });

    this.spaceSky = new SpaceSkyBackground(this.getRandomFork('starfield'));
    // [NEO-ARCADE] New 3D Starfield does not require legacy parallax/velocity configuration

    // Canvas state transitions between render phases
    this.stateManager = new CanvasStateManager();

    // Performance tracking
    this.renderStats = {
      frameCount: 0,
      lastStatsTime: performance.now(),
      avgFrameTime: 0,
    };

    this.cachedPlayer = null;
    this.cachedProgression = null;
    this.cachedXPOrbs = null;
    this.cachedHealthHearts = null;
    this.cachedPickups = null;
    this.cachedEffects = null;
    this.cachedCombat = null;
    this.cachedEnemies = null;
    this.cachedUI = null;

    this._lastEnemyRenderLog = 0;
    this._loggedBossRenderIds = new Set();

    this._loggedBossRenderIds = new Set();

    this.shieldVisualCache = {
      signature: '',
      path: null,
      perimeter: 0,
      radius: SHIP_SIZE,
      padding: 0,
    };
    this.shieldImpactAt = -Infinity;

    // docs/NORTE.md §2 "Câmera"; `?camera=0` keeps the fixed full-field view.
    this.camera = createCamera();
    this.camera.setMode(resolveCameraMode());
    this.cameraScene = createCameraScene();
    this.lastRenderTime = null;

    // Initialize state manager with common presets
    this.stateManager.createPreset('starfield', {
      fillStyle: 'rgba(255, 255, 255, 0.8)',
      strokeStyle: 'transparent',
      globalAlpha: 1,
      shadowBlur: 0,
    });

    this.resolveCachedServices(
      {
        cachedPlayer: 'player',
        cachedProgression: 'progression',
        cachedXPOrbs: 'xp-orbs',
        cachedHealthHearts: 'healthHearts',
        cachedPickups: 'pickups',
        cachedEffects: 'effects',
        cachedCombat: 'combat',
        cachedEnemies: 'enemies',
        cachedUI: 'ui',
      },
      { force: true }
    );
    this.chromaticAberrationEnabled =
      DEFAULT_GRAPHICS_SETTINGS.chromaticAberration;
    this.bloomEnabled = DEFAULT_GRAPHICS_SETTINGS.bloom;
    this.postProcessingEnabled = DEFAULT_GRAPHICS_SETTINGS.postProcessing;

    this.setupSettingsIntegration();
    this.registerEventListener('shield-hit', () => {
      this.shieldImpactAt = performance.now();
    });
    this.registerEventListener('camera-zoom-pulse', ({ zoom, duration }) => {
      this.camera.pulseZoom(zoom, duration);
    });
    this.biome = new BiomeTransition();
    this.registerEventListener('wave-started', (payload = {}) => {
      this.biome.enterLayer(payload.wave);
    });
  }

  setupSettingsIntegration() {
    this.settings = resolveService('settings', this.dependencies);

    // Initial Load
    if (
      this.settings &&
      typeof this.settings.getCategoryValues === 'function'
    ) {
      this.applyGraphicsPreferences(
        this.settings.getCategoryValues('graphics')
      );
    }

    // Listener
    this.registerEventListener('settings-graphics-changed', (payload = {}) => {
      if (payload?.values) {
        this.applyGraphicsPreferences(payload.values);
      }
    });

    // SettingsSystem emits 'settings-graphics-changed' only at startup; live
    // edits arrive as 'settings-changed' with the category.
    this.registerEventListener('settings-changed', (change = {}) => {
      if (
        this.settings &&
        (change.category === 'graphics' || change.type === 'reset-all')
      ) {
        this.applyGraphicsPreferences(
          this.settings.getCategoryValues('graphics')
        );
      }
    });
  }

  applyGraphicsPreferences(values = {}) {
    this.chromaticAberrationEnabled = values.chromaticAberration !== false;
    this.bloomEnabled = values.bloom !== false;
    this.postProcessingEnabled = values.postProcessing !== false;
    bloomLayer.configure({
      enabled:
        this.bloomEnabled &&
        this.postProcessingEnabled &&
        !bloomDisabledByUrl(),
    });

    // Antialiasing: 'SMAA' (smoothed) vs 'None' (pixelated), per settingsSchema
    this.antialiasingMode = values.antialiasing !== 'None';
    this.camera.setMode(resolveCameraMode(values.cameraMode));
  }

  /** Logical field (x, y) → 800×600 screen point under the camera (HUD). */
  worldToScreen(x, y, out = { x: 0, y: 0 }) {
    const z = this.camera.effectiveZoom;
    out.x = GAME_WIDTH / 2 + (x - this.camera.x) * z;
    out.y = GAME_HEIGHT / 2 + (y - this.camera.y) * z;
    return out;
  }

  onReset() {
    if (this.spaceSky) {
      const starfieldRandom = this.getRandomFork('starfield');
      this.spaceSky.reseed(starfieldRandom);
    }
    this.camera.reset();
    this.lastRenderTime = null;
    this.biome.reset();
  }

  render(ctx) {
    if (!ctx) return;

    const frameStart = performance.now();

    // Logical 800×600 → native canvas pixels (see src/core/viewport.js).
    applyBaseTransform(ctx);

    // Initialize state manager if needed
    if (!this.stateManager.currentState.fillStyle) {
      this.stateManager.initialize(ctx);
    }

    // Apply Antialiasing Preference
    ctx.imageSmoothingEnabled =
      this.antialiasingMode !== undefined ? this.antialiasingMode : true;
    if (ctx.imageSmoothingEnabled) {
      ctx.imageSmoothingQuality = 'high';
    }

    ctx.save();
    try {
      this.resolveCachedServices({
        cachedPlayer: 'player',
        cachedProgression: 'progression',
        cachedXPOrbs: 'xp-orbs',
        cachedHealthHearts: 'healthHearts',
        cachedPickups: 'pickups',
        cachedEffects: 'effects',
        cachedCombat: 'combat',
        cachedEnemies: 'enemies',
        cachedUI: 'ui',
      });

      const effects = this.cachedEffects;
      if (effects && typeof effects.applyScreenShake === 'function') {
        effects.applyScreenShake(ctx);
      }

      const player = this.cachedPlayer;
      const playerVelocity =
        typeof player?.getVelocity === 'function'
          ? player.getVelocity()
          : player?.velocity || null;

      this.updateCamera(player, frameStart);

      // The sky is far away: drawn unzoomed, shifted by the camera at
      // parallax rates.
      this.stateManager.transitionToPhase(ctx, 'background');
      this.drawBackground(ctx, playerVelocity);

      this.camera.applyTransform(ctx);

      // Light sources drawn into the emissive layer this frame get bloomed
      // in composite() below (docs/NORTE.md §2).
      bloomLayer.beginFrame(ctx);

      // Optimized rendering with batching
      this.renderOptimized(ctx, player);
      bloomLayer.composite(ctx);
    } finally {
      ctx.restore();
    }
    this.drawBiomeTint(ctx);

    // Update performance stats
    this.updateRenderStats(frameStart);
  }

  // The biome's colour over the whole field, cross-faded with the biome;
  // screen, because soft-light and multiply vanish on a near-black field.
  drawBiomeTint(ctx) {
    const { from, to, mix } = this.biome;
    const a = parseTint(from.tint);
    const b = parseTint(to.tint);
    const alpha = a[3] + (b[3] - a[3]) * mix;
    if (alpha < 0.002) return;
    const rgb = [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * mix));
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(${rgb.join(', ')}, ${alpha})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.restore();
  }

  updateCamera(player, now) {
    const dt =
      this.lastRenderTime === null
        ? 0
        : Math.min(0.1, Math.max(0, (now - this.lastRenderTime) / 1000));
    const firstFrame = this.lastRenderTime === null;
    this.lastRenderTime = now;
    this.biome.update(dt);

    const position =
      typeof player?.getPosition === 'function'
        ? player.getPosition()
        : player?.position;
    if (!position) return;
    if (firstFrame) {
      this.camera.snapTo(position.x, position.y);
    } else {
      const scene = readCameraScene(
        this.cameraScene,
        player,
        this.cachedCombat,
        this.cachedEnemies?.getActiveEnemies() || []
      );
      this.camera.update(position.x, position.y, dt, scene);
    }
  }

  renderOptimized(ctx, player) {
    // Objects phase - batch similar objects
    this.stateManager.transitionToPhase(ctx, 'objects');

    // Ambient chips and motes sit under every entity, kept around the view.
    const effects = this.cachedEffects;
    if (effects && typeof effects.drawAmbient === 'function') {
      effects.drawAmbient(ctx, this.camera.getView());
    }

    // XP Orbs
    const xpOrbs = this.cachedXPOrbs;
    if (xpOrbs && typeof xpOrbs.render === 'function') {
      xpOrbs.render(ctx);
    }

    // Health Hearts
    const healthHearts = this.cachedHealthHearts;
    if (healthHearts && typeof healthHearts.render === 'function') {
      healthHearts.render(ctx);
    }

    // Field pickups
    this.cachedPickups?.render(ctx);

    // Combat (bullets)
    const combat = this.cachedCombat;
    if (combat && typeof combat.render === 'function') {
      combat.render(ctx);
    }

    // Enemies
    const enemies = this.cachedEnemies;
    if (enemies) {
      if (typeof enemies.render === 'function') {
        enemies.render(ctx);
      }

      this.logEnemyRenderLoop(enemies);
      this.renderBossEntities(ctx, enemies);
    }

    // Player
    if (player) {
      this.renderPlayer(ctx, player);
    }

    // UI Elements
    this.stateManager.transitionToPhase(ctx, 'ui');
    this.drawMagnetismField(ctx, player, xpOrbs);

    // Effects phase
    this.stateManager.transitionToPhase(ctx, 'effects');
    if (effects && typeof effects.draw === 'function') {
      effects.draw(ctx);
    }
  }

  logEnemyRenderLoop(enemies) {
    if (!enemies) {
      return;
    }

    const now = Date.now();
    if (this._lastEnemyRenderLog && now - this._lastEnemyRenderLog < 1000) {
      return;
    }

    const collection = this.resolveEnemyCollection(enemies);
    const enemyTypes = collection
      .filter((enemy) => enemy && !enemy.destroyed)
      .map((enemy) => enemy.type || 'unknown');

    const typeCounts = enemyTypes.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    GameDebugLogger.log('RENDER', 'Enemy render loop', {
      totalEnemies: enemyTypes.length,
      types: typeCounts,
    });

    this._lastEnemyRenderLog = now;
  }

  renderBossEntities(ctx, enemies) {
    if (!ctx || !enemies) {
      return;
    }

    const collection = this.resolveEnemyCollection(enemies);
    if (!Array.isArray(collection) || collection.length === 0) {
      this._loggedBossRenderIds.clear();
      return;
    }

    const activeBosses = collection.filter(
      (enemy) => enemy && !enemy.destroyed && enemy.type === 'boss'
    );

    if (activeBosses.length === 0) {
      if (this._loggedBossRenderIds.size > 0) {
        this._loggedBossRenderIds.clear();
      }
      return;
    }

    const activeIds = new Set(activeBosses.map((boss) => boss?.id));
    this._loggedBossRenderIds.forEach((id) => {
      if (!activeIds.has(id)) {
        this._loggedBossRenderIds.delete(id);
      }
    });

    activeBosses.forEach((boss) => {
      if (!boss) return;

      if (boss.id && !this._loggedBossRenderIds.has(boss.id)) {
        GameDebugLogger.log('RENDER', 'Boss first render', {
          id: boss.id,
          position: { x: boss.x, y: boss.y },
          radius: boss.radius,
          phase: boss.currentPhase,
          hasOnDraw: typeof boss.onDraw === 'function',
        });
        this._loggedBossRenderIds.add(boss.id);
      }

      if (typeof boss.onDraw === 'function') {
        boss.onDraw(ctx);
        return;
      }

      this.drawBossFallback(ctx, boss);
    });
  }

  resolveEnemyCollection(enemies) {
    if (!enemies) {
      return [];
    }

    try {
      if (typeof enemies.getAllEnemies === 'function') {
        const all = enemies.getAllEnemies();
        if (Array.isArray(all)) {
          return all;
        }
      }
    } catch (error) {
      // Ignore errors when accessing enemy collections
    }

    const candidates = [
      enemies.asteroids,
      enemies.enemies,
      enemies.activeEnemies,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  drawBossFallback(ctx, boss) {
    if (!ctx || !boss) {
      return;
    }

    ctx.save();
    ctx.translate(boss.x ?? 0, boss.y ?? 0);

    const phaseColors = Array.isArray(boss.phaseColors)
      ? boss.phaseColors
      : ['#ff6b6b', '#f9c74f', '#4d96ff'];
    const color = phaseColors[boss.currentPhase || 0] || '#ffffff';
    const radius = Number.isFinite(boss.radius) ? boss.radius : 60;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    this.drawBossFallbackShield(ctx, boss, radius, color);
    this.drawBossFallbackDamageFlash(ctx, boss, radius, color);

    ctx.restore();

    GameDebugLogger.log('RENDER', 'Boss rendered (fallback)', {
      id: boss.id,
      position: { x: boss.x, y: boss.y },
      phase: boss.currentPhase,
    });
  }

  drawBossFallbackShield(ctx, boss, radius, color) {
    if (!boss?.invulnerable) {
      return;
    }

    const time = boss.system?.time ?? performance.now() / 1000;
    const shellRadius = radius * (1.13 + Math.sin(time * 8.5) * 0.015);
    const invulnerabilityDuration =
      Number.isFinite(boss.invulnerabilityDuration) &&
      boss.invulnerabilityDuration > 0
        ? boss.invulnerabilityDuration
        : 1;
    const invulnerabilityTimer = Number.isFinite(boss.invulnerabilityTimer)
      ? boss.invulnerabilityTimer
      : invulnerabilityDuration;
    const shieldAlpha =
      0.1 +
      Math.min(
        0.18,
        (Math.max(0, invulnerabilityTimer) / invulnerabilityDuration) * 0.08
      );

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const shellGradient = ctx.createRadialGradient(
      0,
      0,
      radius * 0.72,
      0,
      0,
      shellRadius * 1.15
    );
    shellGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    shellGradient.addColorStop(0.78, color);
    shellGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.globalAlpha = shieldAlpha;
    ctx.fillStyle = shellGradient;
    ctx.beginPath();
    ctx.arc(0, 0, shellRadius * 1.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.38 + Math.sin(time * 12) * 0.05;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, radius * 0.055);
    ctx.beginPath();
    ctx.arc(0, 0, shellRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, radius * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, shellRadius * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    const shieldImpactTimer = Number.isFinite(boss.shieldImpactTimer)
      ? boss.shieldImpactTimer
      : 0;
    const shieldImpactDuration =
      Number.isFinite(boss.shieldImpactDuration) &&
      boss.shieldImpactDuration > 0
        ? boss.shieldImpactDuration
        : 0;

    if (shieldImpactTimer > 0 && shieldImpactDuration > 0) {
      const impactRatio = Math.min(
        1,
        Math.max(0, shieldImpactTimer / shieldImpactDuration)
      );
      const impactAngle = Number.isFinite(boss.shieldImpactAngle)
        ? boss.shieldImpactAngle
        : 0;
      const span = 0.22 + (1 - impactRatio) * 0.42;

      ctx.globalAlpha = 0.4 + impactRatio * 0.55;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(5, radius * 0.09);
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, shellRadius, impactAngle - span, impactAngle + span);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawBossFallbackDamageFlash(ctx, boss, radius, color) {
    const damageFlashTimer = Number.isFinite(boss?.damageFlashTimer)
      ? boss.damageFlashTimer
      : 0;
    const damageFlashDuration =
      Number.isFinite(boss?.damageFlashDuration) && boss.damageFlashDuration > 0
        ? boss.damageFlashDuration
        : 0;

    if (damageFlashTimer <= 0 || damageFlashDuration <= 0) {
      return;
    }

    const flashRatio = Math.min(
      1,
      Math.max(0, damageFlashTimer / damageFlashDuration)
    );
    const flashStrength = Math.min(
      1,
      Math.max(0, boss?.damageFlashStrength || 1)
    );
    const flashRadius = radius * (1.02 + (1 - flashRatio) * 0.08);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const flashGradient = ctx.createRadialGradient(
      0,
      0,
      radius * 0.18,
      0,
      0,
      flashRadius
    );
    flashGradient.addColorStop(0, '#ffffff');
    flashGradient.addColorStop(0.45, color);
    flashGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.globalAlpha = 0.12 + flashRatio * flashStrength * 0.28;
    ctx.fillStyle = flashGradient;
    ctx.beginPath();
    ctx.arc(0, 0, flashRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.18 + flashRatio * flashStrength * 0.2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, radius * 0.03);
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.96 + (1 - flashRatio) * 0.04), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  drawBackground(ctx, playerVelocity) {
    if (!ctx) return;

    // The background also clears the viewport, so it must ignore screen shake.
    ctx.save();
    try {
      applyBaseTransform(ctx);

      if (this.spaceSky) {
        this.spaceSky.render(ctx, {
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          velocity: playerVelocity,
          cameraX: this.camera.x,
          cameraY: this.camera.y,
        });
        return;
      }

      const gradient = ctx.createRadialGradient(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        0,
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        Math.max(GAME_WIDTH, GAME_HEIGHT)
      );
      gradient.addColorStop(0, '#0a0a1a');
      gradient.addColorStop(0.6, '#000510');
      gradient.addColorStop(1, '#000000');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    } finally {
      ctx.restore();
    }
  }

  drawMagnetismField(ctx, player, xpOrbs) {
    if (!player || !xpOrbs) return;

    // Don't render magnetism range when ship hull doesn't exist
    if (player.isDead || player.isRetrying || player._quitExplosionHidden) {
      return;
    }

    const orbs =
      typeof xpOrbs.getActiveOrbs === 'function' ? xpOrbs.getActiveOrbs() : [];
    const hasActiveOrb = orbs.some((orb) => !orb.collected);
    if (!hasActiveOrb) return;

    const playerPosition =
      typeof player.getPosition === 'function'
        ? player.getPosition()
        : player.position;
    if (!playerPosition) return;

    const magnetismRadius =
      (typeof player.getMagnetismRadius === 'function'
        ? player.getMagnetismRadius()
        : null) ||
      (typeof xpOrbs.getMagnetismRadius === 'function'
        ? xpOrbs.getMagnetismRadius()
        : MAGNETISM_RADIUS);

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 221, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(
      playerPosition.x,
      playerPosition.y,
      magnetismRadius,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }

  renderPlayer(ctx, player) {
    if (!player || typeof player.render !== 'function') return;

    const angularVelocity =
      typeof player.getAngularVelocity === 'function'
        ? player.getAngularVelocity()
        : player.angularVelocity || 0;

    const tilt = Math.max(
      -MAX_VISUAL_TILT,
      Math.min(MAX_VISUAL_TILT, angularVelocity * TILT_MULTIPLIER)
    );

    // Get recoil offset from player stats
    const playerStats =
      typeof player.getStats === 'function' ? player.getStats() : null;
    const recoilOffset = playerStats?.recoilOffset || { x: 0, y: 0 };

    // Apply recoil by translating the context
    ctx.save();
    ctx.translate(recoilOffset.x, recoilOffset.y);

    const shieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;

    // Only render shield when ship hull exists
    const hullExists =
      !player.isDead && !player.isRetrying && !player._quitExplosionHidden;
    if (hullExists && shieldState?.isActive && shieldState.maxHits > 0) {
      const ratio = Math.max(
        0,
        Math.min(1, shieldState.currentHits / shieldState.maxHits)
      );
      this.drawPlayerShield(ctx, player, ratio, tilt);
    }

    player.render(ctx, { tilt });

    // Restore context (remove recoil transform)
    ctx.restore();
  }

  // Field-generator barrier (docs/NORTE.md §2): a thin line following the
  // padded hull, a faint fill, and a brighter segment sweeping around it.
  // Lit by the hit ratio; flashes white for a moment when it absorbs a hit.
  drawPlayerShield(ctx, player, ratio, tilt) {
    const position =
      typeof player.getPosition === 'function'
        ? player.getPosition()
        : player.position;
    if (!position) return;

    const padding = Math.max(
      0,
      typeof player.getShieldPadding === 'function'
        ? player.getShieldPadding()
        : 0
    );
    const { path, perimeter } = this.resolveShieldVisual(player, padding);
    if (!path) return;

    const angle =
      typeof player.getAngle === 'function'
        ? player.getAngle()
        : player.angle || 0;
    const now = performance.now();
    const impact = now - this.shieldImpactAt < SHIELD_IMPACT_FLASH_MS;
    const strokeColor = impact
      ? PALETTE.text
      : withAlpha(PALETTE.player, 0.2 + 0.35 * ratio);
    const sweepLength = perimeter * SHIELD_SWEEP_SHARE;
    const sweepOffset = -((now / 1000) * SHIELD_SWEEP_SPEED * perimeter);

    // The emissive copy lights the sweep fully but the barrier line only
    // faintly, so the bloom does not thicken the 1.5 px line.
    const drawBarrier = (target, isMain) => {
      if (isMain) {
        target.fillStyle = withAlpha(PALETTE.player, 0.06);
        target.fill(path);
      }
      target.lineJoin = 'round';
      target.lineWidth = LINE.thin;
      target.strokeStyle =
        isMain || impact ? strokeColor : withAlpha(PALETTE.player, 0.15);
      target.stroke(path);
      if (perimeter > 0) {
        target.lineWidth = LINE.base;
        target.strokeStyle = withAlpha(PALETTE.player, 0.5 + 0.5 * ratio);
        target.setLineDash([sweepLength, perimeter - sweepLength]);
        target.lineDashOffset = sweepOffset;
        target.stroke(path);
        target.setLineDash([]);
      }
    };

    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(angle);
    if (tilt !== 0) {
      ctx.transform(1, 0, tilt, 1, 0, 0);
    }
    drawBarrier(ctx, true);

    const emissive = bloomLayer.getEmissive();
    if (emissive) {
      emissive.save();
      emissive.setTransform(ctx.getTransform());
      drawBarrier(emissive, false);
      emissive.restore();
    }
    ctx.restore();
  }

  resolveShieldVisual(player, padding) {
    const cache = this.shieldVisualCache;
    const hullOutline =
      typeof player.getHullOutline === 'function'
        ? player.getHullOutline()
        : null;

    let signature = `circle:${padding}`;
    if (
      Array.isArray(hullOutline) &&
      hullOutline.length >= MIN_OUTLINE_POINTS
    ) {
      const keyParts = [padding, hullOutline.length];
      for (let i = 0; i < Math.min(4, hullOutline.length); i += 1) {
        const vertex = hullOutline[i] || { x: 0, y: 0 };
        keyParts.push(Math.round((vertex.x ?? 0) * 100) / 100);
        keyParts.push(Math.round((vertex.y ?? 0) * 100) / 100);
      }
      signature = keyParts.join(':');
    }

    if (cache.signature !== signature) {
      const fallbackRadius = this.resolveShieldFallbackRadius(player, padding);

      if (
        Array.isArray(hullOutline) &&
        hullOutline.length >= MIN_OUTLINE_POINTS
      ) {
        const expanded = expandHullOutline(hullOutline, padding);
        const outlineToUse =
          expanded && expanded.length >= MIN_OUTLINE_POINTS
            ? expanded
            : hullOutline.map((vertex) => ({ ...vertex }));
        const barrier = hexagonAround(outlineToUse);
        const outlinePath = buildPathFromPoints(barrier);
        const outlineRadius = computeOutlineRadius(barrier);
        cache.path = outlinePath || null;
        cache.perimeter = computePerimeter(barrier);
        cache.radius = Math.max(outlineRadius, fallbackRadius);
      } else {
        const path = new Path2D();
        path.arc(0, 0, fallbackRadius, 0, Math.PI * 2);
        cache.path = path;
        cache.perimeter = Math.PI * 2 * fallbackRadius;
        cache.radius = fallbackRadius;
      }

      cache.signature = signature;
      cache.padding = padding;
    }

    if (!cache.path) {
      const fallbackRadius = this.resolveShieldFallbackRadius(player, padding);
      const path = new Path2D();
      path.arc(0, 0, fallbackRadius, 0, Math.PI * 2);
      cache.path = path;
      cache.perimeter = Math.PI * 2 * fallbackRadius;
      cache.radius = fallbackRadius;
    }

    return cache;
  }

  resolveShieldFallbackRadius(player, padding) {
    const hullRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : SHIP_SIZE;
    const fallback =
      typeof player.getShieldRadius === 'function'
        ? player.getShieldRadius()
        : hullRadius + padding;
    return Math.max(fallback, SHIP_SIZE);
  }

  /**
   * Update rendering performance statistics
   */
  updateRenderStats(frameStart) {
    const frameTime = performance.now() - frameStart;
    this.renderStats.frameCount++;

    // Calculate rolling average
    if (this.renderStats.frameCount === 1) {
      this.renderStats.avgFrameTime = frameTime;
    } else {
      const alpha = 0.1; // Smoothing factor
      this.renderStats.avgFrameTime =
        this.renderStats.avgFrameTime * (1 - alpha) + frameTime * alpha;
    }

    // Log stats every 5 seconds
    const now = performance.now();
    if (now - this.renderStats.lastStatsTime > 5000) {
      this.logPerformanceStats();
      this.renderStats.lastStatsTime = now;
    }
  }

  /**
   * Log comprehensive performance statistics
   */
  logPerformanceStats() {
    const renderStats = this.renderStats;
    const stateStats = this.stateManager.getStats();

    console.log(
      `[RenderingSystem] Performance Stats - Frames: ${renderStats.frameCount}`
    );
    console.log(`  Avg Frame Time: ${renderStats.avgFrameTime.toFixed(2)}ms`);
    console.log(`  State Efficiency: ${stateStats.efficiency}`);
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics() {
    return {
      frameTime: this.renderStats.avgFrameTime,
      frameCount: this.renderStats.frameCount,
      stateStats: this.stateManager.getStats(),
    };
  }

  /**
   * Reset all performance stats and caches
   */
  resetPerformanceTracking() {
    this.renderStats = {
      frameCount: 0,
      lastStatsTime: performance.now(),
      avgFrameTime: 0,
    };

    this.stateManager.resetStats();

    console.log('[RenderingSystem] Performance tracking reset');
  }
}

export default RenderingSystem;
