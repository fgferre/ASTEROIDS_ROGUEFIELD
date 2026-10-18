// Elite affix glyphs (src/data/enemies/affixes.js `glyph`): small vector
// marks drawn the same way in the 2D badges (RenderComponent) and the 3D
// badge textures (render3d/enemyMirror), centered on 0,0 within radius `r`.

import { PALETTE, withAlpha } from '../../../data/constants/palette.js';

const TAU = Math.PI * 2;

const GLYPHS = {
  shield(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.85, -r * 0.6);
    ctx.quadraticCurveTo(r * 0.8, r * 0.5, 0, r);
    ctx.quadraticCurveTo(-r * 0.8, r * 0.5, -r * 0.85, -r * 0.6);
    ctx.closePath();
    ctx.stroke();
  },
  chevrons(ctx, r) {
    ctx.beginPath();
    for (const x of [-0.55, 0.15]) {
      ctx.moveTo(r * x, -r * 0.7);
      ctx.lineTo(r * (x + 0.45), 0);
      ctx.lineTo(r * x, r * 0.7);
    }
    ctx.stroke();
  },
  burst(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i * TAU) / 8;
      const inner = i % 2 ? 0.3 : 0.2;
      const outer = i % 2 ? 0.7 : 1;
      ctx.moveTo(Math.cos(a) * r * inner, Math.sin(a) * r * inner);
      ctx.lineTo(Math.cos(a) * r * outer, Math.sin(a) * r * outer);
    }
    ctx.stroke();
  },
  fork(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.95);
    ctx.lineTo(0, 0);
    ctx.lineTo(-r * 0.7, -r * 0.75);
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.7, -r * 0.75);
    ctx.stroke();
  },
  ward(ctx, r) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, 0, TAU);
    ctx.moveTo(r * 0.38, 0);
    ctx.arc(0, 0, r * 0.38, 0, TAU);
    ctx.stroke();
  },
};

/**
 * One badge: dark disc (left out of a bloom layer), ring and glyph in the
 * affix color, radius `r`.
 */
export function drawAffixBadge(ctx, affix, r, lineWidth, disc = true) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  if (disc) {
    ctx.fillStyle = withAlpha(PALETTE.background, 0.8);
    ctx.fill();
  }
  ctx.strokeStyle = affix.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  GLYPHS[affix.glyph](ctx, r * 0.55);
}

export const AFFIX_GLYPH_NAMES = Object.keys(GLYPHS);
