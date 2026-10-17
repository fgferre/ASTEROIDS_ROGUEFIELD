// Enemy looks (docs/NORTE.md §3): matte machines of the Ring, lit by the
// fixed key light, whose only light is energy — eyes, lenses, arcs, the
// Warden core — plus a 1 px threat rim drawn into the bloom layer only (the
// readability exception in NORTE §2).
//
// Each look bakes its matte body and its static light once per
// (shape, size, phase, render scale) into shared offscreen canvases; what
// moves (lens telegraph, arcs, core pulse, shield) is drawn live on top.

import { getRenderScale } from '../../../core/viewport.js';
import { getEmissive } from '../../../core/bloomLayer.js';
import {
  KEY_LIGHT_ANGLE,
  KEY_LIGHT_DIR,
  LINE,
  PALETTE,
  withAlpha,
} from '../../../data/constants/palette.js';

const TAU = Math.PI * 2;

const clamp01 = (value) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const enemyTime = (enemy) => enemy?.system?.time ?? performance.now() / 1000;

// Hit flash (docs/NORTE.md §2): the body goes white on damage and fades,
// with a fainter copy in the bloom layer. PROPOSAL 17/10 (was none).
export const HIT_FLASH_BODY_ALPHA = 0.85;
export const HIT_FLASH_EMISSIVE_ALPHA = 0.4;

// A white copy of a baked body, same size and alpha mask.
export const whiteSilhouette = (source) => {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = PALETTE.text;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
};

// Matte metal lit from the key light: bright toward it, dark opposite.
const litFill = (ctx, radius) => {
  const gradient = ctx.createRadialGradient(
    KEY_LIGHT_DIR.x * radius * 0.5,
    KEY_LIGHT_DIR.y * radius * 0.5,
    0,
    0,
    0,
    radius * 1.15
  );
  gradient.addColorStop(0, PALETTE.hullLit);
  gradient.addColorStop(0.55, PALETTE.hull);
  gradient.addColorStop(1, PALETTE.rockShadow);
  return gradient;
};

// Bevel: a lit arc on the key side of a round edge.
const bevel = (ctx, radius, alpha = 0.7) => {
  ctx.beginPath();
  ctx.arc(0, 0, radius, KEY_LIGHT_ANGLE - 1.1, KEY_LIGHT_ANGLE + 1.1);
  ctx.strokeStyle = withAlpha(PALETTE.rockLit, alpha);
  ctx.lineWidth = LINE.hair;
  ctx.stroke();
};

const darkEdge = (ctx) => {
  ctx.strokeStyle = PALETTE.rockShadow;
  ctx.lineWidth = LINE.hair;
  ctx.stroke();
};

const threatRim = (ctx) => {
  ctx.strokeStyle = PALETTE.threat;
  ctx.lineWidth = LINE.hair;
  ctx.stroke();
};

// Deterministic flicker without touching any gameplay random stream.
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// --- Mote (drone): matte disc with one red eye --------------------------

const mote = {
  facing: () => 0, // round body: keep the baked light fixed, turn the eye
  body(ctx, size) {
    const r = size * 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = litFill(ctx, r);
    ctx.fill();
    darkEdge(ctx);
    bevel(ctx, r - 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.58, 0, TAU);
    ctx.strokeStyle = withAlpha(PALETTE.rockShadow, 0.7);
    ctx.lineWidth = 0.75;
    ctx.stroke();
    bevel(ctx, r * 0.58 + 0.75, 0.35);
  },
  glow(ctx, size) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.85 + 0.5, 0, TAU);
    threatRim(ctx);
  },
  live(ctx, size, enemy, emissive) {
    const r = size * 0.85;
    const angle = enemy.rotation ?? 0;
    const ex = Math.cos(angle) * r * 0.38;
    const ey = Math.sin(angle) * r * 0.38;
    const eye = r * 0.2;
    if (!emissive) {
      ctx.beginPath();
      ctx.arc(ex, ey, eye * 1.5, 0, TAU);
      ctx.fillStyle = PALETTE.rockShadow;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(ex, ey, emissive ? eye * 1.4 : eye, 0, TAU);
    ctx.fillStyle = PALETTE.threat;
    ctx.fill();
  },
};

// --- Seeker (hunter): elongated hull, frontal lens telegraphs the burst --

const seekerHull = (ctx, size) => {
  const half = size * 0.75; // 24 px long at the default radius of 16
  const w = size * 0.375; // 12 px wide
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.quadraticCurveTo(half * 0.55, w, half * 0.05, w);
  ctx.lineTo(-half, w * 0.62);
  ctx.lineTo(-half * 0.74, 0);
  ctx.lineTo(-half, -w * 0.62);
  ctx.lineTo(half * 0.05, -w);
  ctx.quadraticCurveTo(half * 0.55, -w, half, 0);
  ctx.closePath();
};

const seeker = {
  facing: (enemy) => enemy.aimAngle ?? enemy.rotation ?? 0,
  body(ctx, size) {
    const half = size * 0.75;
    const w = size * 0.375;
    seekerHull(ctx, size);
    ctx.fillStyle = litFill(ctx, half);
    ctx.fill();
    darkEdge(ctx);
    // spine and a lit dorsal panel
    ctx.beginPath();
    ctx.moveTo(-half * 0.7, 0);
    ctx.lineTo(half * 0.3, 0);
    ctx.strokeStyle = withAlpha(PALETTE.rockShadow, 0.8);
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-half * 0.85, -w * 0.5);
    ctx.lineTo(half * 0.05, -w * 0.82);
    ctx.strokeStyle = withAlpha(PALETTE.rockLit, 0.45);
    ctx.stroke();
    // lens socket
    ctx.beginPath();
    ctx.arc(half * 0.48, 0, w * 0.3, 0, TAU);
    ctx.fillStyle = PALETTE.rockShadow;
    ctx.fill();
  },
  glow(ctx, size) {
    seekerHull(ctx, size);
    threatRim(ctx);
  },
  live(ctx, size, enemy, emissive) {
    const half = size * 0.75;
    const w = size * 0.375;
    const charge = clamp01(enemy.telegraphRatio);
    const lens = w * 0.2;
    ctx.beginPath();
    ctx.arc(half * 0.48, 0, lens * (emissive ? 1 + charge * 1.6 : 1), 0, TAU);
    ctx.fillStyle = withAlpha(PALETTE.threat, 0.3 + charge * 0.7);
    ctx.fill();
    if (charge > 0.5) {
      ctx.beginPath();
      ctx.arc(half * 0.48, 0, lens * 0.5, 0, TAU);
      ctx.fillStyle = withAlpha(PALETTE.text, (charge - 0.5) * 1.6);
      ctx.fill();
    }
  },
};

// --- Tether (mine): dark core, three struts, arcs between tips when armed --

const STRUT_ANGLES = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];

const strutTip = (size, angle) => ({
  x: Math.cos(angle) * size * 0.95,
  y: Math.sin(angle) * size * 0.95,
});

const tether = {
  facing: () => 0,
  body(ctx, size) {
    const core = size * 0.42;
    for (const angle of STRUT_ANGLES) {
      const tip = strutTip(size, angle);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * core * 0.8, Math.sin(angle) * core * 0.8);
      ctx.lineTo(tip.x, tip.y);
      ctx.strokeStyle = PALETTE.rockShadow;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = PALETTE.hullLit;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 1.9, 0, TAU);
      ctx.fillStyle = PALETTE.hull;
      ctx.fill();
      darkEdge(ctx);
    }
    ctx.beginPath();
    ctx.arc(0, 0, core, 0, TAU);
    ctx.fillStyle = litFill(ctx, core);
    ctx.fill();
    darkEdge(ctx);
    bevel(ctx, core - 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, core * 0.35, 0, TAU);
    ctx.fillStyle = PALETTE.rockShadow;
    ctx.fill();
  },
  glow(ctx, size) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42 + 0.5, 0, TAU);
    threatRim(ctx);
    for (const angle of STRUT_ANGLES) {
      const tip = strutTip(size, angle);
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 2.4, 0, TAU);
      threatRim(ctx);
    }
  },
  live(ctx, size, enemy, emissive) {
    const pulse = 0.5 + 0.5 * Math.sin(enemy.pulsePhase ?? 0);
    const armed = Boolean(enemy.armed);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42 * 0.22, 0, TAU);
    ctx.fillStyle = withAlpha(PALETTE.threat, armed ? 0.6 + pulse * 0.4 : 0.25);
    ctx.fill();
    if (!armed) return;

    const frame = Math.floor(enemyTime(enemy) * 18);
    const seed = (enemy.id ? String(enemy.id).length * 7 : 0) + frame;
    ctx.strokeStyle = withAlpha(PALETTE.threat, 0.45 + pulse * 0.55);
    ctx.lineWidth = emissive ? 1.4 : 0.9;
    ctx.lineJoin = 'round';
    for (let i = 0; i < STRUT_ANGLES.length; i += 1) {
      const a = strutTip(size, STRUT_ANGLES[i]);
      const b = strutTip(size, STRUT_ANGLES[(i + 1) % STRUT_ANGLES.length]);
      const nx = -(b.y - a.y);
      const ny = b.x - a.x;
      const len = Math.hypot(nx, ny) || 1;
      const segments = 2 + Math.floor(hash(seed + i * 13) * 2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      for (let s = 1; s < segments; s += 1) {
        const t = s / segments;
        // bow the arc outward a little, then jitter it
        const off = (0.12 + (hash(seed + i * 31 + s) - 0.5) * 0.35) * len;
        ctx.lineTo(
          a.x + (b.x - a.x) * t + (nx / len) * off * 0.5,
          a.y + (b.y - a.y) * t + (ny / len) * off * 0.5
        );
      }
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  },
};

// --- Warden Prime (boss): six matte segments around a violet core ---------

const WARDEN_SEGMENTS = 6;
// phase 0: all six, phase 1: four, phase 2: two — the core shows more each time
const WARDEN_VISIBLE = [
  [0, 1, 2, 3, 4, 5],
  [0, 1, 3, 4],
  [0, 3],
];

const wardenPhase = (enemy) => {
  const raw =
    typeof enemy?.getPhaseIndex === 'function'
      ? enemy.getPhaseIndex()
      : enemy?.currentPhase;
  return Math.max(
    0,
    Math.min(WARDEN_VISIBLE.length - 1, Math.round(Number(raw) || 0))
  );
};

const segmentPath = (ctx, size, index) => {
  const inner = size * 0.6;
  const outer = size;
  const span = TAU / WARDEN_SEGMENTS;
  const gap = 0.07;
  const a0 = index * span - Math.PI / 2 + gap;
  const a1 = (index + 1) * span - Math.PI / 2 - gap;
  ctx.beginPath();
  ctx.arc(0, 0, outer, a0 + 0.03, a1 - 0.03);
  ctx.lineTo(Math.cos(a1) * outer * 0.93, Math.sin(a1) * outer * 0.93);
  ctx.arc(0, 0, inner, a1, a0, true);
  ctx.lineTo(Math.cos(a0) * outer * 0.93, Math.sin(a0) * outer * 0.93);
  ctx.closePath();
  return (a0 + a1) / 2;
};

const warden = {
  facing: () => 0, // ring is symmetric: keep the key light where it belongs
  key: (enemy) => wardenPhase(enemy),
  body(ctx, size, enemy) {
    // the cavity the core sits in
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.62, 0, TAU);
    ctx.fillStyle = PALETTE.rockShadow;
    ctx.fill();

    for (const index of WARDEN_VISIBLE[wardenPhase(enemy)]) {
      const mid = segmentPath(ctx, size, index);
      const facing = Math.cos(mid - KEY_LIGHT_ANGLE);
      ctx.fillStyle = litFill(ctx, size);
      ctx.fill();
      ctx.fillStyle =
        facing >= 0
          ? withAlpha(PALETTE.hullLit, facing * 0.35)
          : withAlpha(PALETTE.rockShadow, -facing * 0.45);
      ctx.fill();
      darkEdge(ctx);

      // panel groove and two rivets
      const span = TAU / WARDEN_SEGMENTS;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.8, mid - span * 0.36, mid + span * 0.36);
      ctx.strokeStyle = withAlpha(PALETTE.rockShadow, 0.85);
      ctx.lineWidth = LINE.thin;
      ctx.stroke();
      for (const side of [-1, 1]) {
        const a = mid + side * span * 0.25;
        ctx.beginPath();
        ctx.arc(
          Math.cos(a) * size * 0.9,
          Math.sin(a) * size * 0.9,
          1.3,
          0,
          TAU
        );
        ctx.fillStyle = withAlpha(PALETTE.rockLit, 0.5 + facing * 0.3);
        ctx.fill();
      }
      // outer edge catches the key light
      if (facing > 0.1) {
        ctx.beginPath();
        ctx.arc(0, 0, size - 1, mid - span * 0.4, mid + span * 0.4);
        ctx.strokeStyle = withAlpha(PALETTE.rockLit, 0.6 * facing);
        ctx.lineWidth = LINE.thin;
        ctx.stroke();
      }
    }
  },
  glow(ctx, size, enemy) {
    for (const index of WARDEN_VISIBLE[wardenPhase(enemy)]) {
      segmentPath(ctx, size, index);
      threatRim(ctx);
    }
  },
  live(ctx, size, enemy, emissive) {
    const phase = wardenPhase(enemy);
    const time = enemyTime(enemy);
    const flash = enemy.getHitFlash();
    const pulse = 0.5 + 0.5 * Math.sin(time * (2 + phase));
    const core = size * (0.4 + phase * 0.06) * (1 + pulse * 0.04);

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, core);
    gradient.addColorStop(0, withAlpha(PALETTE.text, 0.75 + flash * 0.25));
    gradient.addColorStop(0.35, PALETTE.boss);
    gradient.addColorStop(1, withAlpha(PALETTE.boss, emissive ? 0 : 0.15));
    ctx.globalAlpha = emissive ? 0.65 + pulse * 0.25 + flash * 0.35 : 1;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, core, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (enemy.invulnerable) {
      drawWardenBarrier(ctx, size, enemy, time, emissive);
    }
  },
};

// Thin violet hexagonal barrier while the Warden is invulnerable.
const drawWardenBarrier = (ctx, size, enemy, time, emissive) => {
  const duration =
    enemy.invulnerabilityDuration > 0 ? enemy.invulnerabilityDuration : 1;
  const remaining = clamp01(
    (enemy.invulnerabilityTimer ?? duration) / duration
  );
  const impact =
    enemy.shieldImpactDuration > 0
      ? clamp01((enemy.shieldImpactTimer ?? 0) / enemy.shieldImpactDuration)
      : 0;
  const radius = size * 1.16;
  const spin = time * 0.35;

  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = spin + (i * TAU) / 6;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (!emissive) {
    ctx.fillStyle = withAlpha(PALETTE.boss, 0.05 + impact * 0.08);
    ctx.fill();
  }
  ctx.strokeStyle = withAlpha(
    PALETTE.boss,
    0.35 + remaining * 0.3 + impact * 0.35
  );
  ctx.lineWidth = LINE.thin + impact * 1.5;
  ctx.stroke();
};

const LOOKS = {
  triangle: mote,
  diamond: seeker,
  sphere: tether,
  boss: warden,
};

const lookSize = (enemy, shape) =>
  shape === 'boss' ? enemy.radius ?? 60 : enemy.radius ?? enemy.size ?? 16;

// Shared bakes: every Mote looks the same, so they share one canvas pair.
const BAKES = new Map();

const bakeLook = (look, shape, size, enemy) => {
  if (typeof document === 'undefined') return null;
  const scale = getRenderScale();
  const variant = look.key ? look.key(enemy) : 0;
  const key = `${shape}|${size}|${variant}|${scale}`;
  const cached = BAKES.get(key);
  if (cached) return cached;

  const canvasSize = Math.ceil((size * 1.1 + 4) * 2);
  const offset = canvasSize / 2;
  const layer = (draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(canvasSize * scale);
    canvas.height = Math.ceil(canvasSize * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.translate(offset, offset);
    draw(ctx);
    return canvas;
  };

  const body = layer((ctx) => look.body(ctx, size, enemy));
  const glow = layer((ctx) => look.glow(ctx, size, enemy));
  if (!body || !glow) return null;
  const entry = { body, glow, offset, canvasSize };
  BAKES.set(key, entry);
  return entry;
};

const drawLayer = (ctx, enemy, angle, draw) => {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  if (angle) ctx.rotate(angle);
  draw();
  ctx.restore();
};

const proceduralStrategy = ({ enemy, ctx, config }) => {
  if (!ctx) return;

  const shape = config?.shape ?? enemy.renderShape ?? 'triangle';
  const look = LOOKS[shape];
  if (!look) {
    console.warn(`[RenderComponent] Unknown procedural shape: ${shape}`);
    return;
  }

  const size = lookSize(enemy, shape);
  const angle = look.facing(enemy);
  const sprite = bakeLook(look, shape, size, enemy);
  const blit = (target, canvas) =>
    target.drawImage(
      canvas,
      -sprite.offset,
      -sprite.offset,
      sprite.canvasSize,
      sprite.canvasSize
    );

  const flash = sprite ? enemy.getHitFlash() : 0;
  const blitFlash = (target, alpha) => {
    sprite.flash ??= whiteSilhouette(sprite.body);
    if (!sprite.flash) return;
    target.globalAlpha = alpha * flash;
    blit(target, sprite.flash);
    target.globalAlpha = 1;
  };

  drawLayer(ctx, enemy, angle, () => {
    if (sprite) blit(ctx, sprite.body);
    else look.body(ctx, size, enemy);
    look.live(ctx, size, enemy, false);
    if (flash > 0) blitFlash(ctx, HIT_FLASH_BODY_ALPHA);
  });

  const emissive = getEmissive();
  if (!emissive) return;
  drawLayer(emissive, enemy, angle, () => {
    if (sprite) blit(emissive, sprite.glow);
    else look.glow(emissive, size, enemy);
    look.live(emissive, size, enemy, true);
    if (flash > 0) blitFlash(emissive, HIT_FLASH_EMISSIVE_ALPHA);
  });
};

const delegateStrategy = ({ enemy, ctx }) => {
  if (typeof enemy?.onDraw === 'function') {
    enemy.onDraw(ctx);
  }
};

function createProceduralAlias(shape) {
  return ({ enemy, ctx, config }) => {
    const aliasConfig =
      config?.shape === undefined ? { ...(config || {}), shape } : config;

    return proceduralStrategy({ enemy, ctx, config: aliasConfig });
  };
}

const defaultStrategies = {
  procedural: proceduralStrategy,
  'procedural-triangle': createProceduralAlias('triangle'),
  'procedural-diamond': createProceduralAlias('diamond'),
  'procedural-sphere': createProceduralAlias('sphere'),
  'procedural-boss': createProceduralAlias('boss'),
  delegate: delegateStrategy,
};

export class RenderComponent {
  constructor(config = {}) {
    this.config = { ...config };
    this.strategy = config.strategy || 'delegate';
    this.strategies = new Map(Object.entries(defaultStrategies));
  }

  registerStrategy(name, handler) {
    if (!name || typeof handler !== 'function') {
      return;
    }
    this.strategies.set(name, handler);
  }

  setStrategy(name) {
    this.strategy = name;
  }

  draw(context) {
    const enemy = context?.enemy;
    const ctx = context?.ctx;
    if (!enemy || !ctx) {
      return;
    }

    const strategyName = enemy.renderStrategy || this.strategy;
    const handler =
      this.strategies.get(strategyName) || this.strategies.get('delegate');

    handler?.({ enemy, ctx, config: this.config });

    if (this.config.debug) {
      drawDebugInfo({ enemy, ctx });
    }
  }
}

const drawDebugInfo = ({ enemy, ctx }) => {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.strokeStyle = withAlpha(PALETTE.text, 0.35);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius ?? 16, 0, TAU);
  ctx.stroke();
  ctx.restore();
};
