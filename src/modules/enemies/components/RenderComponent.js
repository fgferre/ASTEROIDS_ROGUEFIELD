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
import { BULWARK_SHIELD_HALF_ARC } from '../../../data/enemies/bulwark.js';
import { CASTER_SHELL_RADIUS } from '../../../data/enemies/caster.js';
import { WARDEN_KINDS } from '../../../data/enemies/boss.js';
import { ELITE_AFFIXES } from '../../../data/enemies/affixes.js';
import { drawAffixBadge } from './affixGlyphs.js';

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

// An elite's energy burns gold instead of threat red (docs/NORTE.md §2).
const accentOf = (enemy) => (enemy?.elite ? PALETTE.xp : PALETTE.threat);

const threatRim = (ctx, color = PALETTE.threat) => {
  ctx.strokeStyle = color;
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
  glow(ctx, size, enemy) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.85 + 0.5, 0, TAU);
    threatRim(ctx, accentOf(enemy));
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
    ctx.fillStyle = accentOf(enemy);
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
  glow(ctx, size, enemy) {
    seekerHull(ctx, size);
    threatRim(ctx, accentOf(enemy));
  },
  live(ctx, size, enemy, emissive) {
    const half = size * 0.75;
    const w = size * 0.375;
    const charge = clamp01(enemy.telegraphRatio);
    const lens = w * 0.2;
    ctx.beginPath();
    ctx.arc(half * 0.48, 0, lens * (emissive ? 1 + charge * 1.6 : 1), 0, TAU);
    ctx.fillStyle = withAlpha(accentOf(enemy), 0.3 + charge * 0.7);
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
  glow(ctx, size, enemy) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42 + 0.5, 0, TAU);
    threatRim(ctx, accentOf(enemy));
    for (const angle of STRUT_ANGLES) {
      const tip = strutTip(size, angle);
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 2.4, 0, TAU);
      threatRim(ctx, accentOf(enemy));
    }
  },
  live(ctx, size, enemy, emissive) {
    const pulse = 0.5 + 0.5 * Math.sin(enemy.pulsePhase ?? 0);
    const armed = Boolean(enemy.armed);
    const accent = accentOf(enemy);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42 * 0.22, 0, TAU);
    ctx.fillStyle = withAlpha(accent, armed ? 0.6 + pulse * 0.4 : 0.25);
    ctx.fill();
    if (!armed) return;

    const frame = Math.floor(enemyTime(enemy) * 18);
    const seed = (enemy.id ? String(enemy.id).length * 7 : 0) + frame;
    ctx.strokeStyle = withAlpha(accent, 0.45 + pulse * 0.55);
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

// --- Husk: cracked matte shell, red seams brighten as it nears death -----

// Shell outline (radius factors) and seam polylines, in units of size.
const HUSK_SHELL = [1, 0.9, 0.97, 0.86, 0.95, 0.9, 1, 0.87, 0.94];
const HUSK_SEAMS = [
  [
    [0.05, -0.1],
    [0.32, -0.28],
    [0.48, -0.22],
    [0.8, -0.45],
  ],
  [
    [0.02, 0.05],
    [-0.25, 0.3],
    [-0.3, 0.55],
    [-0.52, 0.72],
  ],
  [
    [-0.05, -0.02],
    [-0.38, -0.12],
    [-0.62, -0.38],
  ],
  [
    [0.1, 0.12],
    [0.42, 0.34],
    [0.58, 0.66],
  ],
];

const huskShell = (ctx, size) => {
  const r = size * 0.95;
  ctx.beginPath();
  HUSK_SHELL.forEach((k, i) => {
    const a = (i / HUSK_SHELL.length) * TAU;
    const x = Math.cos(a) * r * k;
    const y = Math.sin(a) * r * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
};

const huskSeams = (ctx, size) => {
  ctx.beginPath();
  for (const seam of HUSK_SEAMS) {
    seam.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x * size, y * size);
      else ctx.lineTo(x * size, y * size);
    });
  }
};

const husk = {
  facing: () => 0,
  body(ctx, size) {
    huskShell(ctx, size);
    ctx.fillStyle = litFill(ctx, size);
    ctx.fill();
    darkEdge(ctx);
    bevel(ctx, size * 0.86, 0.5);
    huskSeams(ctx, size);
    ctx.strokeStyle = PALETTE.rockShadow;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  },
  glow(ctx, size, enemy) {
    huskShell(ctx, size);
    threatRim(ctx, accentOf(enemy));
  },
  live(ctx, size, enemy, emissive) {
    const heat = clamp01(enemy.damageRatio);
    huskSeams(ctx, size);
    ctx.strokeStyle = withAlpha(accentOf(enemy), 0.15 + heat * 0.85);
    ctx.lineWidth = emissive ? 1 + heat * 1.6 : 0.8;
    ctx.lineJoin = 'round';
    ctx.stroke();
  },
};

// --- Ram: arrowhead hull, one lens that brightens through the windup -----

const ramHull = (ctx, size) => {
  ctx.beginPath();
  ctx.moveTo(size * 1.1, 0);
  ctx.lineTo(-size * 0.8, size * 0.75);
  ctx.lineTo(-size * 0.42, 0);
  ctx.lineTo(-size * 0.8, -size * 0.75);
  ctx.closePath();
};

const ram = {
  facing: (enemy) => enemy.rotation ?? 0,
  body(ctx, size) {
    ramHull(ctx, size);
    ctx.fillStyle = litFill(ctx, size);
    ctx.fill();
    darkEdge(ctx);
    // keel line and the lens socket
    ctx.beginPath();
    ctx.moveTo(-size * 0.42, 0);
    ctx.lineTo(size * 0.25, 0);
    ctx.strokeStyle = withAlpha(PALETTE.rockShadow, 0.8);
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size * 0.45, 0, size * 0.18, 0, TAU);
    ctx.fillStyle = PALETTE.rockShadow;
    ctx.fill();
  },
  glow(ctx, size, enemy) {
    ramHull(ctx, size);
    threatRim(ctx, accentOf(enemy));
  },
  live(ctx, size, enemy, emissive) {
    const charge = clamp01(enemy.telegraphRatio);
    const lens = size * 0.12;
    ctx.beginPath();
    ctx.arc(size * 0.45, 0, lens * (emissive ? 1 + charge * 1.8 : 1), 0, TAU);
    ctx.fillStyle = withAlpha(accentOf(enemy), 0.3 + charge * 0.7);
    ctx.fill();
    if (charge > 0.5) {
      ctx.beginPath();
      ctx.arc(size * 0.45, 0, lens * 0.5, 0, TAU);
      ctx.fillStyle = withAlpha(PALETTE.text, (charge - 0.5) * 1.6);
      ctx.fill();
    }
  },
};

// --- Weaver: small hub, three thin arms that spin; tips flare on laying --

const WEAVER_ARMS = 3;

const weaverArm = (ctx, size, angle) => {
  const bend = 0.55; // arms trail the spin a little
  ctx.beginPath();
  ctx.moveTo(Math.cos(angle) * size * 0.3, Math.sin(angle) * size * 0.3);
  ctx.quadraticCurveTo(
    Math.cos(angle - bend * 0.5) * size * 0.75,
    Math.sin(angle - bend * 0.5) * size * 0.75,
    Math.cos(angle - bend) * size,
    Math.sin(angle - bend) * size
  );
};

const weaver = {
  facing: () => 0, // the hub is round; the arms turn in live()
  body(ctx, size) {
    const hub = size * 0.34;
    ctx.beginPath();
    ctx.arc(0, 0, hub, 0, TAU);
    ctx.fillStyle = litFill(ctx, hub);
    ctx.fill();
    darkEdge(ctx);
    bevel(ctx, hub - 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, hub * 0.4, 0, TAU);
    ctx.fillStyle = PALETTE.rockShadow;
    ctx.fill();
  },
  glow(ctx, size, enemy) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.34 + 0.5, 0, TAU);
    threatRim(ctx, accentOf(enemy));
  },
  live(ctx, size, enemy, emissive) {
    const accent = accentOf(enemy);
    const lay = clamp01(enemy.layGlow);
    ctx.lineCap = 'round';
    for (let i = 0; i < WEAVER_ARMS; i += 1) {
      const angle = (enemy.spin ?? 0) + (i * TAU) / WEAVER_ARMS;
      const tipAngle = angle - 0.55;
      const tx = Math.cos(tipAngle) * size;
      const ty = Math.sin(tipAngle) * size;
      if (!emissive) {
        weaverArm(ctx, size, angle);
        ctx.strokeStyle = PALETTE.rockShadow;
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.strokeStyle = PALETTE.hullLit;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      if (lay > 0) {
        weaverArm(ctx, size, angle);
        ctx.strokeStyle = withAlpha(accent, lay * 0.85);
        ctx.lineWidth = emissive ? 1.6 : 0.8;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(tx, ty, emissive ? 1.8 + lay * 1.5 : 1.3, 0, TAU);
      ctx.fillStyle = withAlpha(accent, 0.4 + lay * 0.6);
      ctx.fill();
    }
  },
};

// --- Bulwark: squat hull behind a wide frontal plate; only the rim glows --

const bulwarkPlate = (ctx, size, halfArc) => {
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.02, -halfArc, halfArc);
  ctx.arc(0, 0, size * 0.8, halfArc, -halfArc, true);
  ctx.closePath();
};

const bulwark = {
  facing: () => 0, // the hull is round; the plate turns in live()
  body(ctx, size) {
    const r = size * 0.72;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = litFill(ctx, r);
    ctx.fill();
    darkEdge(ctx);
    bevel(ctx, r - 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, TAU);
    ctx.strokeStyle = withAlpha(PALETTE.rockShadow, 0.8);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },
  glow(ctx, size, enemy) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.72 + 0.5, 0, TAU);
    threatRim(ctx, accentOf(enemy));
  },
  live(ctx, size, enemy, emissive) {
    const broken = Boolean(enemy.shieldBroken);
    ctx.save();
    ctx.rotate(enemy.facing ?? 0);
    if (!emissive) {
      bulwarkPlate(ctx, size, BULWARK_SHIELD_HALF_ARC);
      ctx.fillStyle = broken ? PALETTE.hull : PALETTE.hullLit;
      ctx.fill();
      darkEdge(ctx);
      if (broken) {
        // the dead plate shows its fracture
        ctx.beginPath();
        ctx.moveTo(size * 1.0, -size * 0.18);
        ctx.lineTo(size * 0.88, size * 0.05);
        ctx.lineTo(size * 0.97, size * 0.3);
        ctx.strokeStyle = PALETTE.rockShadow;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    if (!broken) {
      const ratio =
        enemy.maxShieldHealth > 0
          ? clamp01(enemy.shieldHealth / enemy.maxShieldHealth)
          : 1;
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        size * 1.02,
        -BULWARK_SHIELD_HALF_ARC,
        BULWARK_SHIELD_HALF_ARC
      );
      ctx.strokeStyle = withAlpha(accentOf(enemy), 0.35 + ratio * 0.6);
      ctx.lineWidth = emissive ? LINE.base : LINE.hair;
      ctx.stroke();
    }
    ctx.restore();
  },
};

// --- Caster: squat round turret, a short mortar that turns; the lens lights
// through the telegraph. Its marks live on the field: the aim ring grows
// through the telegraph; in flight the blast ring holds while an inner ring
// closes on the landing, and the shell swells toward its apex and back.

const CASTER_SHELL_SWELL = 1.4; // proposta 18/10: × shell size at its apex

const casterField = (ctx, enemy, accent, emissive) => {
  const { aim, shell } = enemy;
  const radius = CASTER_SHELL_RADIUS;
  if (aim) {
    const charge = clamp01(enemy.telegraphRatio);
    ctx.beginPath();
    ctx.arc(aim.x - enemy.x, aim.y - enemy.y, radius * charge, 0, TAU);
    ctx.strokeStyle = withAlpha(accent, 0.25 + 0.5 * charge);
    ctx.lineWidth = emissive ? LINE.base : LINE.thin;
    ctx.stroke();
  }
  if (!shell) return;
  const progress = clamp01(enemy.shellProgress);
  const x = shell.x - enemy.x;
  const y = shell.y - enemy.y;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  if (!emissive) {
    ctx.fillStyle = withAlpha(accent, 0.05 + 0.1 * progress);
    ctx.fill();
  }
  ctx.strokeStyle = withAlpha(accent, 0.4 + 0.5 * progress);
  ctx.lineWidth = LINE.base;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, radius * (1 - progress)), 0, TAU);
  ctx.lineWidth = LINE.hair;
  ctx.stroke();
  const lift = 4 * progress * (1 - progress);
  const size = (enemy.radius ?? 15) * 0.22 * (1 + CASTER_SHELL_SWELL * lift);
  ctx.beginPath();
  ctx.arc(
    shell.fromX + (shell.x - shell.fromX) * progress - enemy.x,
    shell.fromY + (shell.y - shell.fromY) * progress - enemy.y,
    emissive ? size * 1.6 : size,
    0,
    TAU
  );
  ctx.fillStyle = emissive ? accent : PALETTE.text;
  ctx.fill();
};

const caster = {
  facing: () => 0, // the turret is round; the barrel turns in live()
  body(ctx, size) {
    const r = size * 0.78;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = litFill(ctx, r);
    ctx.fill();
    darkEdge(ctx);
    bevel(ctx, r - 0.9);
    // the breech
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, TAU);
    ctx.fillStyle = PALETTE.rockShadow;
    ctx.fill();
  },
  glow(ctx, size, enemy) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.78 + 0.5, 0, TAU);
    threatRim(ctx, accentOf(enemy));
  },
  live(ctx, size, enemy, emissive) {
    const accent = accentOf(enemy);
    const charge = clamp01(enemy.telegraphRatio);
    ctx.save();
    ctx.rotate(enemy.rotation ?? 0);
    if (!emissive) {
      ctx.beginPath();
      ctx.rect(size * 0.2, -size * 0.26, size * 0.95, size * 0.52);
      ctx.fillStyle = PALETTE.hullLit;
      ctx.fill();
      darkEdge(ctx);
    }
    ctx.beginPath();
    ctx.arc(
      size * 1.02,
      0,
      size * 0.15 * (emissive ? 1 + charge * 1.6 : 1),
      0,
      TAU
    );
    ctx.fillStyle = withAlpha(accent, 0.3 + charge * 0.7);
    ctx.fill();
    ctx.restore();
    casterField(ctx, enemy, accent, emissive);
  },
};

// --- Shade: a swept blade with one eye. It fades out of the Field
// (`alpha`); while it is out, only a dashed edge stays readable.

const SHADE_OUTLINE = [
  [1.2, 0],
  [0.1, -0.5],
  [-0.95, -0.95],
  [-0.5, -0.2],
  [-0.75, 0],
  [-0.5, 0.2],
  [-0.95, 0.95],
  [0.1, 0.5],
];

const shadeHull = (ctx, size) => {
  ctx.beginPath();
  SHADE_OUTLINE.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x * size, y * size);
    else ctx.lineTo(x * size, y * size);
  });
  ctx.closePath();
};

const shade = {
  facing: (enemy) => enemy.rotation ?? 0,
  alpha: (enemy) => clamp01(enemy.visibility ?? 1),
  body(ctx, size) {
    shadeHull(ctx, size);
    ctx.fillStyle = litFill(ctx, size);
    ctx.fill();
    darkEdge(ctx);
    ctx.beginPath();
    ctx.moveTo(-size * 0.75, 0);
    ctx.lineTo(size * 0.6, 0);
    ctx.strokeStyle = withAlpha(PALETTE.rockShadow, 0.8);
    ctx.lineWidth = 0.75;
    ctx.stroke();
  },
  glow(ctx, size, enemy) {
    shadeHull(ctx, size);
    threatRim(ctx, accentOf(enemy));
  },
  live(ctx, size, enemy, emissive) {
    const accent = accentOf(enemy);
    ctx.beginPath();
    ctx.arc(size * 0.45, 0, size * (emissive ? 0.16 : 0.11), 0, TAU);
    ctx.fillStyle = accent;
    ctx.fill();
    const ghost = 1 - clamp01(enemy.visibility ?? 1);
    if (ghost <= 0) return;
    ctx.save();
    ctx.globalAlpha = 1;
    shadeHull(ctx, size * 1.05);
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -enemyTime(enemy) * 12;
    ctx.strokeStyle = withAlpha(accent, (emissive ? 0.3 : 0.2) * ghost);
    ctx.lineWidth = LINE.hair;
    ctx.stroke();
    ctx.restore();
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

// --- Warden Choir / Null (bosses): drawn live, their parts move -----------

const CHOIR = WARDEN_KINDS.choir;
const NULL = WARDEN_KINDS.null;
// how long a broken core / its arm stays on screen while it drifts away
const CHOIR_BREAK_SECONDS = 1.6;
const NULL_PLATE_ARC = (TAU / NULL.plateCount) * 0.82;

// A matte disc lit from the key light, edge dark.
const matteDisc = (ctx, x, y, radius, tint = null) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fillStyle = litFill(ctx, radius);
  ctx.fill();
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fill();
  }
  darkEdge(ctx);
  bevel(ctx, radius, 0.45);
  ctx.restore();
};

// Lit violet-white core with a soft edge (the Prime core's recipe).
const litCore = (ctx, x, y, radius, alpha, emissive) => {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, withAlpha(PALETTE.text, 0.8));
  gradient.addColorStop(0.35, PALETTE.boss);
  gradient.addColorStop(1, withAlpha(PALETTE.boss, emissive ? 0 : 0.15));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
};

// A machined bar from `from` to `to` along +x, lit on its key-facing side.
const choirArm = (ctx, angle, from, to, halfWidth) => {
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(from, -halfWidth * 0.6);
  ctx.lineTo(from + halfWidth, -halfWidth);
  ctx.lineTo(to, -halfWidth);
  ctx.lineTo(to, halfWidth);
  ctx.lineTo(from + halfWidth, halfWidth);
  ctx.lineTo(from, halfWidth * 0.6);
  ctx.closePath();
  ctx.fillStyle = PALETTE.hull;
  ctx.fill();
  darkEdge(ctx);
  // the side facing the key light catches it
  const side = Math.sin(KEY_LIGHT_ANGLE - angle) >= 0 ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(from + halfWidth, side * halfWidth);
  ctx.lineTo(to, side * halfWidth);
  ctx.strokeStyle = withAlpha(PALETTE.rockLit, 0.55);
  ctx.lineWidth = LINE.hair;
  ctx.stroke();
  ctx.restore();
};

// When each core broke and at which angle (the class keeps orbiting it).
const CHOIR_BREAKS = new WeakMap();

const choirBreak = (core, angle, time) => {
  let broken = CHOIR_BREAKS.get(core);
  if (!broken) {
    broken = { start: time, angle };
    CHOIR_BREAKS.set(core, broken);
  }
  return broken;
};

const wardenChoir = {
  facing: () => 0,
  bake: false,
  // the dark hub the arms meet at
  body(ctx) {
    matteDisc(ctx, 0, 0, 22, withAlpha(PALETTE.rockShadow, 0.55));
  },
  glow(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    threatRim(ctx, PALETTE.boss);
  },
  live(ctx, size, enemy, emissive) {
    const time = enemyTime(enemy);
    // a hit shows as the cores flaring, not as white mass (as in 3D)
    const flash = enemy.getHitFlash();
    const cores = enemy.cores || [];
    if (!emissive) {
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.strokeStyle = withAlpha(PALETTE.boss, 0.45);
      ctx.lineWidth = LINE.hair;
      ctx.stroke();
    }
    const orbit = CHOIR.coreOrbitRadius;
    const coreRadius = CHOIR.coreRadius;
    cores.forEach((core, i) => {
      const angle = Math.atan2(core.y - enemy.y, core.x - enemy.x);
      if (core.alive) {
        const singing = enemy.singingIndex === i;
        const beat = Math.sin(time * 5 + i);
        const x = Math.cos(angle) * orbit;
        const y = Math.sin(angle) * orbit;
        const r = coreRadius * (singing ? 1.06 + 0.04 * beat : 0.9);
        if (!emissive) choirArm(ctx, angle, 18, orbit - r * 0.7, 4.5);
        if (singing) {
          const alpha = emissive ? 0.75 + 0.2 * beat + flash * 0.35 : 1;
          litCore(ctx, x, y, r, Math.min(1, alpha), emissive);
          ctx.beginPath();
          ctx.arc(x, y, coreRadius * (1.3 + 0.08 * beat), 0, TAU);
          ctx.strokeStyle = withAlpha(PALETTE.boss, 0.6 + 0.3 * beat);
          ctx.lineWidth = LINE.thin;
          ctx.stroke();
        } else if (emissive) {
          litCore(ctx, x, y, r * 0.7, 0.16 + flash * 0.25, true);
        } else {
          matteDisc(ctx, x, y, r, withAlpha(PALETTE.boss, 0.18 + flash * 0.2));
        }
        return;
      }
      // broken: the stub drifts out along its last angle, shrinking, dark
      const broken = choirBreak(core, angle, time);
      const age = time - broken.start;
      if (age > CHOIR_BREAK_SECONDS) return;
      const u = age / CHOIR_BREAK_SECONDS;
      const fade = 1 - u;
      const reach = orbit + 120 * u;
      const x = Math.cos(broken.angle) * reach;
      const y = Math.sin(broken.angle) * reach;
      const r = coreRadius * (1 - 0.45 * u);
      ctx.globalAlpha = fade;
      if (!emissive) {
        choirArm(
          ctx,
          broken.angle + 0.6 * u,
          18 + 70 * u,
          orbit - coreRadius * 0.6 + 70 * u,
          4.5
        );
        matteDisc(ctx, x, y, r, withAlpha(PALETTE.rockShadow, 0.5));
      } else {
        const sputter = 0.5 + 0.5 * Math.abs(Math.sin(age * 31));
        litCore(ctx, x, y, r * 0.8, fade * sputter, true);
      }
      ctx.globalAlpha = 1;
    });

    if (enemy.invulnerable) {
      drawWardenBarrier(ctx, size, enemy, time, emissive);
    }
  },
};

// One curved plate of the Null's shell, centred on (distance, 0).
const nullPlatePath = (ctx, distance) => {
  const r = NULL.radius;
  const tube = r * 0.3;
  const cx = distance - r;
  const a0 = -NULL_PLATE_ARC / 2;
  const a1 = NULL_PLATE_ARC / 2;
  ctx.beginPath();
  ctx.arc(cx, 0, r + tube, a0, a1);
  ctx.arc(cx, 0, r - tube, a1, a0, true);
  ctx.closePath();
};

const wardenNull = {
  facing: () => 0,
  bake: false,
  body() {},
  glow() {},
  live(ctx, size, enemy, emissive) {
    const time = enemyTime(enemy);
    const exposed = (enemy.currentPhase || 0) >= 2;
    const open = enemy.shellOpen || 0;

    // the gold rings that announce and show the inverted XP pull
    const pull = enemy.pullState;
    if (pull === 'windup' || pull === 'inverting') {
      for (let k = 0; k < 2; k += 1) {
        let r;
        let alpha;
        if (pull === 'windup') {
          const p = clamp01(1 - (enemy.pullStateTimer || 0) / NULL.pullWindup);
          r = 260 - 170 * p + k * 30;
          alpha = 0.2 + 0.6 * p;
        } else {
          const w = (time * 1.4 + k * 0.5) % 1;
          r = 90 + 300 * w;
          alpha = 0.75 * (1 - w);
        }
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.strokeStyle = withAlpha(PALETTE.xp, alpha * (emissive ? 1 : 0.7));
        ctx.lineWidth = emissive ? LINE.base : LINE.thin;
        ctx.stroke();
      }
    }

    // the core: dark and barely breathing, bright once the shell is shed
    const core = size * (exposed ? 0.62 : 0.52);
    if (!emissive) {
      ctx.beginPath();
      ctx.arc(0, 0, core, 0, TAU);
      ctx.fillStyle = PALETTE.background;
      ctx.fill();
      darkEdge(ctx);
    }
    // a hit shows as the core flaring, not as white mass (as in 3D)
    const flash = enemy.getHitFlash();
    const glow = exposed
      ? 0.8 + 0.2 * Math.sin(time * 6) + flash * 0.3
      : 0.14 + 0.05 * Math.sin(time * 2) + flash * 0.3;
    litCore(ctx, 0, 0, core * (exposed ? 1 : 0.7), Math.min(1, glow), emissive);
    if (exposed || open > 0.2) {
      ctx.beginPath();
      ctx.arc(0, 0, size * (exposed ? 0.8 : 1.25), 0, TAU);
      ctx.strokeStyle = withAlpha(PALETTE.boss, emissive ? 0.8 : 0.5);
      ctx.lineWidth = LINE.hair;
      ctx.stroke();
    }

    if (!enemy.shellShed) {
      for (const plate of enemy.plates || []) {
        const dx = plate.x - enemy.x;
        const dy = plate.y - enemy.y;
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.rotate(angle);
        nullPlatePath(ctx, Math.hypot(dx, dy));
        if (emissive) {
          threatRim(ctx);
        } else {
          const facing = Math.cos(angle - KEY_LIGHT_ANGLE);
          ctx.fillStyle = PALETTE.hull;
          ctx.fill();
          ctx.fillStyle =
            facing >= 0
              ? withAlpha(PALETTE.hullLit, facing * 0.45)
              : withAlpha(PALETTE.rockShadow, -facing * 0.5);
          ctx.fill();
          darkEdge(ctx);
        }
        ctx.restore();
      }
    }

    if (enemy.invulnerable) {
      drawWardenBarrier(ctx, size, enemy, time, emissive);
    }
  },
};

// --- Heralds: drawn live; `telegraphRatio` lights the part that acts -----

// Matte fill lit from the key light, for a body turned by `angle`.
const turnedLitFill = (ctx, radius, angle) => {
  const kx = Math.cos(KEY_LIGHT_ANGLE - angle) * radius;
  const ky = Math.sin(KEY_LIGHT_ANGLE - angle) * radius;
  const gradient = ctx.createLinearGradient(kx, ky, -kx, -ky);
  gradient.addColorStop(0, PALETTE.hullLit);
  gradient.addColorStop(0.5, PALETTE.hull);
  gradient.addColorStop(1, PALETTE.rockShadow);
  return gradient;
};

const heraldRim = (ctx, emissive) => {
  ctx.strokeStyle = withAlpha(PALETTE.boss, emissive ? 0.9 : 0.55);
  ctx.lineWidth = LINE.hair;
  ctx.stroke();
};

// Dust: a chamfered slab turned broadside to the ship, in a haze of dust;
// three amber slits along its face light before the wall.
const DUST_MOTES = 10;

const dustSlab = (ctx, hx, hy) => {
  const c = Math.min(hx, hy) * 0.35;
  ctx.beginPath();
  ctx.moveTo(-hx + c, -hy);
  ctx.lineTo(hx - c, -hy);
  ctx.lineTo(hx, -hy + c);
  ctx.lineTo(hx, hy - c);
  ctx.lineTo(hx - c, hy);
  ctx.lineTo(-hx + c, hy);
  ctx.lineTo(-hx, hy - c);
  ctx.lineTo(-hx, -hy + c);
  ctx.closePath();
};

const heraldDust = {
  facing: () => 0,
  bake: false,
  body() {},
  glow() {},
  live(ctx, size, enemy, emissive) {
    const time = enemyTime(enemy);
    const charge = clamp01(enemy.telegraphRatio);
    if (!emissive) {
      for (let i = 0; i < DUST_MOTES; i += 1) {
        const a = hash(i) * TAU + time * (0.12 + 0.1 * hash(i + 11));
        const r = size * (0.9 + 0.55 * hash(i + 3));
        ctx.beginPath();
        ctx.arc(
          Math.cos(a) * r,
          Math.sin(a) * r * 0.8,
          size * (0.14 + 0.18 * hash(i + 7)),
          0,
          TAU
        );
        ctx.fillStyle = withAlpha(
          PALETTE.rockLit,
          (0.07 + 0.07 * hash(i + 5)) * (1 + charge)
        );
        ctx.fill();
      }
    }
    const angle = enemy.rotation ?? 0;
    const hx = size * 0.55;
    const hy = size * 1.0;
    ctx.save();
    ctx.rotate(angle);
    dustSlab(ctx, hx, hy);
    if (emissive) {
      heraldRim(ctx, true);
    } else {
      ctx.fillStyle = turnedLitFill(ctx, hy, angle);
      ctx.fill();
      darkEdge(ctx);
      dustSlab(ctx, hx * 0.72, hy * 0.86);
      ctx.strokeStyle = withAlpha(PALETTE.rockShadow, 0.8);
      ctx.lineWidth = LINE.hair;
      ctx.stroke();
      dustSlab(ctx, hx + 0.5, hy + 0.5);
      heraldRim(ctx, false);
    }
    const lit = 0.18 + 0.82 * charge;
    for (let i = -1; i <= 1; i += 1) {
      const y = i * hy * 0.55;
      ctx.beginPath();
      ctx.rect(hx * 0.22, y - hy * 0.18, hx * 0.18, hy * 0.36);
      ctx.fillStyle = withAlpha(
        PALETTE.shot,
        emissive ? lit : 0.15 + 0.85 * lit
      );
      ctx.fill();
    }
    ctx.restore();
    if (enemy.invulnerable) {
      drawWardenBarrier(ctx, size, enemy, time, emissive);
    }
  },
};

// Heat: a dark core inside a matte shell; the orange seam between them
// brightens before it ignites the rocks.
const heraldHeat = {
  facing: () => 0,
  bake: false,
  body() {},
  glow() {},
  live(ctx, size, enemy, emissive) {
    const time = enemyTime(enemy);
    const charge = clamp01(enemy.telegraphRatio);
    const shell = size * 0.95;
    const seam = size * 0.66;
    if (!emissive) {
      ctx.beginPath();
      ctx.arc(0, 0, shell, 0, TAU);
      ctx.fillStyle = litFill(ctx, shell);
      ctx.fill();
      darkEdge(ctx);
      bevel(ctx, shell - 0.9);
      ctx.beginPath();
      ctx.arc(0, 0, seam - 1.5, 0, TAU);
      ctx.fillStyle = PALETTE.background;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, shell + 0.5, 0, TAU);
    heraldRim(ctx, emissive);
    const breathe = 0.5 + 0.5 * Math.sin(time * 2.2);
    const heat = 0.35 + 0.15 * breathe + 0.5 * charge;
    ctx.beginPath();
    ctx.arc(0, 0, seam, 0, TAU);
    ctx.strokeStyle = withAlpha(PALETTE.shot, Math.min(1, heat));
    ctx.lineWidth = (emissive ? LINE.bold : LINE.base) + charge * 1.5;
    ctx.stroke();
    if (charge > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, size * (1.25 + 0.2 * (1 - charge)), 0, TAU);
      ctx.strokeStyle = withAlpha(PALETTE.shot, 0.5 * charge);
      ctx.lineWidth = LINE.hair;
      ctx.stroke();
    }
    if (enemy.invulnerable) {
      drawWardenBarrier(ctx, size, enemy, time, emissive);
    }
  },
};

// Silence: a tall, thin prism, nearly black, with one white eye. Before it
// blinks a ring closes on the point it will appear at.
const silencePrism = (ctx, size) => {
  const w = size * 0.36;
  const h = size * 1.25;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w, -h * 0.35);
  ctx.lineTo(w, h * 0.6);
  ctx.lineTo(0, h);
  ctx.lineTo(-w, h * 0.6);
  ctx.lineTo(-w, -h * 0.35);
  ctx.closePath();
};

const heraldSilence = {
  facing: () => 0,
  bake: false,
  body() {},
  glow() {},
  live(ctx, size, enemy, emissive) {
    const time = enemyTime(enemy);
    const charge = clamp01(enemy.telegraphRatio);
    const target = enemy.blinkTarget;
    if (target) {
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      ctx.beginPath();
      ctx.arc(dx, dy, size * (2.2 - 1.2 * charge), 0, TAU);
      ctx.strokeStyle = withAlpha(PALETTE.boss, 0.3 + 0.6 * charge);
      ctx.lineWidth = emissive ? LINE.base : LINE.thin;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, size * (1.3 + 0.4 * charge), 0, TAU);
      ctx.strokeStyle = withAlpha(PALETTE.text, 0.25 * charge);
      ctx.lineWidth = LINE.hair;
      ctx.stroke();
    }
    silencePrism(ctx, size);
    if (emissive) {
      heraldRim(ctx, true);
    } else {
      ctx.fillStyle = PALETTE.background;
      ctx.fill();
      ctx.fillStyle = withAlpha(PALETTE.boss, 0.16);
      ctx.fill();
      heraldRim(ctx, false);
      // the key-lit facet, upper left
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.25);
      ctx.lineTo(-size * 0.36, -size * 0.44);
      ctx.lineTo(-size * 0.36, size * 0.75);
      ctx.lineTo(0, size * 1.25);
      ctx.closePath();
      ctx.fillStyle = withAlpha(PALETTE.hullLit, 0.35);
      ctx.fill();
    }
    const flash = enemy.getHitFlash?.() ?? 0;
    const eye = size * (0.12 + 0.05 * charge);
    ctx.beginPath();
    ctx.arc(0, -size * 0.2, emissive ? eye * 1.6 : eye, 0, TAU);
    ctx.fillStyle = withAlpha(
      PALETTE.text,
      Math.min(1, 0.75 + 0.15 * Math.sin(time * 3) + flash * 0.3)
    );
    ctx.fill();
    if (enemy.invulnerable) {
      drawWardenBarrier(ctx, size, enemy, time, emissive);
    }
  },
};

const LOOKS = {
  triangle: mote,
  diamond: seeker,
  sphere: tether,
  husk,
  ram,
  weaver,
  bulwark,
  caster,
  shade,
  boss: warden,
  'warden-choir': wardenChoir,
  'warden-null': wardenNull,
  'herald-dust': heraldDust,
  'herald-heat': heraldHeat,
  'herald-silence': heraldSilence,
};

// The three Wardens share the 'boss' shape, the three Heralds 'herald'; the
// kind picks the look.
const BOSS_LOOKS = { choir: 'warden-choir', null: 'warden-null' };
const HERALD_LOOKS = {
  dust: 'herald-dust',
  heat: 'herald-heat',
  silence: 'herald-silence',
};

const lookSize = (enemy, shape) =>
  shape === 'boss' ? enemy.radius ?? 60 : enemy.radius ?? enemy.size ?? 16;

// Shared bakes: every Mote looks the same, so they share one canvas pair.
const BAKES = new Map();

const bakeLook = (look, shape, size, enemy) => {
  if (typeof document === 'undefined' || look.bake === false) return null;
  const scale = getRenderScale();
  const variant = look.key ? look.key(enemy) : 0;
  const key = `${shape}|${size}|${variant}|${scale}|${Boolean(enemy?.elite)}`;
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

// Thin gold ring just outside an elite's silhouette.
const eliteRing = (ctx, size, emissive) => {
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.18 + 2, 0, TAU);
  ctx.strokeStyle = withAlpha(PALETTE.xp, emissive ? 0.8 : 0.55);
  ctx.lineWidth = LINE.hair;
  ctx.stroke();
};

// --- Elite affixes (src/data/enemies/affixes.js) ---------------------------

const BADGE_RADIUS = 5;
const BADGE_GAP = 2;
const SWIFT_GHOSTS = [0.05, 0.1, 0.15]; // seconds behind, along the velocity

// Swift: fading ghosts of the hull behind it, under the body.
const swiftTrail = (ctx, enemy, size, emissive) => {
  const speed = Math.hypot(enemy.vx, enemy.vy);
  if (speed < 20) return;
  const { color } = ELITE_AFFIXES.swift;
  SWIFT_GHOSTS.forEach((t, i) => {
    ctx.beginPath();
    ctx.arc(-enemy.vx * t, -enemy.vy * t, size * (0.7 - i * 0.15), 0, TAU);
    ctx.fillStyle = withAlpha(color, (emissive ? 0.3 : 0.16) * (1 - i / 3));
    ctx.fill();
  });
};

// Everything an affix shows on top of the body: the Shielded plate, Warded's
// pulsing ring while immune, the Volatile fuse's blast ring, the badges.
const affixOverlay = (ctx, enemy, size, emissive) => {
  const time = enemyTime(enemy);
  if (enemy.hasAffix('shielded') && !enemy.shieldBroken) {
    const { halfArc, color } = ELITE_AFFIXES.shielded;
    const ratio = clamp01(enemy.shieldHealth / enemy.maxShieldHealth);
    ctx.save();
    ctx.rotate(enemy.facing ?? 0);
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.12, -halfArc, halfArc);
    ctx.strokeStyle = withAlpha(color, 0.35 + ratio * 0.6);
    ctx.lineWidth = emissive ? LINE.bold : LINE.base;
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.age < enemy.wardedUntil) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 14);
    ctx.beginPath();
    ctx.arc(0, 0, size * (1.3 + 0.08 * pulse) + 2, 0, TAU);
    ctx.strokeStyle = withAlpha(ELITE_AFFIXES.warded.color, 0.4 + 0.5 * pulse);
    ctx.lineWidth = emissive ? LINE.base : LINE.thin;
    ctx.stroke();
  }
  if (enemy.volatileFuse !== null) {
    const { fuse, radius, color } = ELITE_AFFIXES.volatile;
    const progress = clamp01(1 - enemy.volatileFuse / fuse);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    if (!emissive) {
      ctx.fillStyle = withAlpha(color, 0.04 + 0.08 * progress);
      ctx.fill();
    }
    ctx.strokeStyle = withAlpha(color, 0.35 + 0.5 * progress);
    ctx.lineWidth = LINE.base;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * progress, 0, TAU);
    ctx.lineWidth = LINE.hair;
    ctx.stroke();
  }
  const count = enemy.affixes.length;
  const y = -(size * 1.18 + 4 + BADGE_RADIUS);
  for (let i = 0; i < count; i += 1) {
    const x = (i - (count - 1) / 2) * (BADGE_RADIUS * 2 + BADGE_GAP);
    ctx.save();
    ctx.translate(x, y);
    drawAffixBadge(
      ctx,
      ELITE_AFFIXES[enemy.affixes[i]],
      BADGE_RADIUS,
      emissive ? LINE.thin : LINE.hair,
      !emissive
    );
    ctx.restore();
  }
};

const proceduralStrategy = ({ enemy, ctx, config }) => {
  if (!ctx) return;

  const requested = config?.shape ?? enemy.renderShape ?? 'triangle';
  const shape =
    requested === 'boss'
      ? BOSS_LOOKS[enemy.bossKind] ?? requested
      : requested === 'herald'
        ? HERALD_LOOKS[enemy.heraldKind] ?? HERALD_LOOKS.dust
        : requested;
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

  const affixed = enemy.affixes.length > 0;
  const swift = affixed && enemy.hasAffix('swift');
  // a look may fade its whole body (the Shade leaving the Field)
  const fade = look.alpha ? look.alpha(enemy) : 1;
  if (swift)
    drawLayer(ctx, enemy, 0, () => swiftTrail(ctx, enemy, size, false));
  drawLayer(ctx, enemy, angle, () => {
    ctx.globalAlpha = fade;
    if (sprite) blit(ctx, sprite.body);
    else look.body(ctx, size, enemy);
    look.live(ctx, size, enemy, false);
    if (enemy.elite) eliteRing(ctx, size, false);
    if (flash > 0) blitFlash(ctx, HIT_FLASH_BODY_ALPHA);
  });
  if (affixed)
    drawLayer(ctx, enemy, 0, () => affixOverlay(ctx, enemy, size, false));

  const emissive = getEmissive();
  if (!emissive) return;
  if (swift) {
    drawLayer(emissive, enemy, 0, () =>
      swiftTrail(emissive, enemy, size, true)
    );
  }
  drawLayer(emissive, enemy, angle, () => {
    emissive.globalAlpha = fade;
    if (sprite) blit(emissive, sprite.glow);
    else look.glow(emissive, size, enemy);
    look.live(emissive, size, enemy, true);
    if (enemy.elite) eliteRing(emissive, size, true);
    if (flash > 0) blitFlash(emissive, HIT_FLASH_EMISSIVE_ALPHA);
  });
  if (affixed) {
    drawLayer(emissive, enemy, 0, () =>
      affixOverlay(emissive, enemy, size, true)
    );
  }
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
