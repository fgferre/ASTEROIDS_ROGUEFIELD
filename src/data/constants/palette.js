// The game's palette — the only place a color should be born.
// Rule (docs/NORTE.md §2): surfaces are matte and dark; light exists only
// where there is energy. Information is light; everything else is mass.

export const PALETTE = Object.freeze({
  // mass
  background: '#020408',
  hull: '#1a1c1e',
  hullLit: '#3a3f46',
  rock: '#2a2c30',
  rockLit: '#5a606a',
  rockShadow: '#0c0d10',
  neutral: '#64748b',
  // light
  player: '#00f2ff', // thruster, player systems, player rim
  shot: '#ffb347', // player projectiles and exposed Ring crystal
  threat: '#ff3131', // enemy eyes, enemy shots, warnings, threat rim
  boss: '#8a2be2',
  xp: '#ffd700',
  status: '#bcff00',
  // field pickups (src/data/pickups.js), proposta 20/10
  repair: '#7dffb0', // green-white
  stasis: '#7fb2ff', // cold blue
  salvage: '#dce6f5', // scrap silver
  // text
  text: '#e6eef8',
  textDim: 'rgba(230, 238, 248, 0.62)',
});

// Fixed key light for every baked surface (upper-left, 35°), in radians.
const KEY_LIGHT_ANGLE = (-145 * Math.PI) / 180;
export const KEY_LIGHT_DIR = Object.freeze({
  x: Math.cos(KEY_LIGHT_ANGLE),
  y: Math.sin(KEY_LIGHT_ANGLE),
});

// Fill light from the field (cool blue) as an rgba string at low alpha.
export const FILL_LIGHT = 'rgba(80, 120, 200, 0.18)';

/** `#rrggbb` → `rgba(r, g, b, a)` */
export function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Line weights (logical px). One scale, used everywhere.
export const LINE = Object.freeze({ hair: 1, thin: 1.5, base: 2, bold: 3 });
