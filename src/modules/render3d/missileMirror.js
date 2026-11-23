// The Seeker Swarm missile's own family forms in 3D (picked 23/11, see
// combat/missileForms.js): Thermite's missile stuck in its hull and the
// pieces it throws, drawn into Renderer3D's shared batches. Its sparks are
// the renderer's hit sparks (`missile-sparks`), the Storm Warhead's bolt
// the arcs, the Gravity Warhead's well the wells and the static on what it
// holds (weaponMirror.js).

import { glint, rgbOf } from './batches.js';

const SEEKER_H = 4; // as weaponMirror's missile
const SEEKER_LENGTH = 6;
const SEEKER_WIDTH = 2;
const ORANGE = '#ff5a12';
const HOT = '#ffc98a';
const WHITE_HOT = '#fff6dc';

// Thermite: the casing stuck half out of the hull, tail out, and the glow
// of the hole heating to white as its burst nears.
export function mirrorLodged(THREE, lodged, batches) {
  const { glow, bodies } = batches;
  const orange = rgbOf(THREE, ORANGE);
  const hot = rgbOf(THREE, HOT);
  const white = rgbOf(THREE, WHITE_HOT);
  lodged.forEach((L) => {
    const t = Math.min(1, L.age / L.hold);
    const angle = Math.atan2(L.uy, L.ux);
    bodies.casing(
      L.x - L.ux * 2,
      L.y - L.uy * 2,
      SEEKER_H,
      angle,
      SEEKER_LENGTH,
      SEEKER_WIDTH
    );
    const f = 0.7 + 0.3 * glint(L.seed, Math.floor(L.age * 24));
    const core = t > 0.5 ? white : hot;
    glow.push(L.x, 4.5, L.y, core, 3 + 3.5 * t, (0.7 + 0.3 * t) * f, 2.2);
    glow.push(L.x, 4, L.y, orange, 7 + 5 * t, (0.35 + 0.35 * t) * f, 1.4);
  });
}

// A piece of thermite: a white-hot ember with a short flame behind it in
// flight, a smaller glow where it stuck.
export function mirrorThermite(THREE, pieces, batches) {
  const { glow, ribbons } = batches;
  const orange = rgbOf(THREE, ORANGE);
  const hot = rgbOf(THREE, HOT);
  pieces.forEach((p) => {
    const f = 0.7 + 0.3 * glint(p.seed, Math.floor(p.age * 24 + p.x));
    if (p.flying) {
      const dx = p.enemy.x - p.x;
      const dy = p.enemy.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const tx = p.x - (dx / d) * 9;
      const ty = p.y - (dy / d) * 9;
      ribbons.streak(tx, ty, p.x, p.y, SEEKER_H, orange, 1.8, 1.4);
      glow.push(p.x, 4.5, p.y, hot, 3, 0.9 * f, 2.2);
      glow.push(p.x, 4, p.y, orange, 6, 0.4 * f, 1.4);
      return;
    }
    glow.push(p.x, 4.5, p.y, hot, 2.5, 0.75 * f, 2.2);
    glow.push(p.x, 4, p.y, orange, 5, 0.35 * f, 1.4);
  });
}
