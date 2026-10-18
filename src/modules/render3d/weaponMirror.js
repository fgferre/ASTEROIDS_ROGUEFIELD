// Weapon looks in 3D (docs/NORTE.md §7 pillar 4): evolved lances, the
// Harmonic beam, chain arcs and the burn/slow marks, drawn into the shared
// batches from CombatSystem's state. Colours come from data/weapons.js, the
// same ones CombatSystem's 2D draw uses.

import { PALETTE } from '../../data/constants/palette.js';
import { WEAPONS, WEAPON_APEX, WEAPON_EVOLUTIONS } from '../../data/weapons.js';
import { rgbOf } from './batches.js';

const LANCE_H = 3;
const BEAM_H = 3.2;
const ARC_H = 8;
const MARK_H = 6;
// proposta 18/10: beam layers, outer glow → white core: [colour, width ×
// beam width, gain]. Additive, so the core reads hottest where they overlap.
// The fourth entry is the layer's length (× beam length): inner layers stop
// short so the tip tapers into the end glow instead of ending square.
const BEAM_LAYERS = [
  ['glow', 3.4, 0.1, 0.92],
  ['glow', 2, 0.22, 0.96],
  ['mid', 1, 0.85, 0.97],
  ['core', 0.35, 2.4, 0.93],
];

// Deterministic 0..1 per trail point, for the Motherlode glints (render only).
const glint = (x, y) => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * One evolved or base lance: body capsule, trail, and a head once evolved.
 * An Apex adds a wider `outer` ribbon, a white core ribbon and capsule, a
 * thicker head, and Motherlode's gold glints along the trail.
 */
export function pushLance(THREE, batches, look, evolved, bullet, pushTrail) {
  const angle = Math.atan2(bullet.vy || 0, bullet.vx || 1);
  if (look.outer) {
    pushTrail(bullet, rgbOf(THREE, look.outer), 6 * look.width, 0.45);
  }
  pushTrail(bullet, rgbOf(THREE, look.trail), 2.4 * look.width, 1.3);
  if (look.apex) {
    pushTrail(bullet, rgbOf(THREE, PALETTE.text), 0.9 * look.width, 1.7);
  }
  if (look.sparkle) {
    const rgb = rgbOf(THREE, look.sparkle);
    const trail = bullet.trail || [];
    for (let i = trail.length % 2; i < trail.length; i += 2) {
      const p = trail[i];
      const g = glint(p.x, p.y);
      if (g < 0.45) continue;
      batches.glow.push(p.x, LANCE_H + 1, p.y, rgb, 3 + 4 * g, 0.9 * g, 1.6);
    }
  }
  batches.lances.push(
    bullet.x,
    bullet.y,
    LANCE_H,
    angle,
    6.5 * look.headLength,
    1.5 * look.width,
    rgbOf(THREE, look.body),
    1.9
  );
  if (!evolved) return;
  const reach = 4.5 * look.headLength;
  const headWidth = 1.2 * Math.max(0.8, look.width) * (look.apex ? 1.6 : 1);
  const hx = bullet.x + Math.cos(angle) * reach;
  const hy = bullet.y + Math.sin(angle) * reach;
  batches.lances.push(
    hx,
    hy,
    LANCE_H + 0.2,
    angle,
    2.4 * look.headLength,
    headWidth,
    rgbOf(THREE, look.head),
    2.8
  );
  if (!look.apex) return;
  batches.lances.push(
    hx,
    hy,
    LANCE_H + 0.4,
    angle,
    1.6 * look.headLength,
    headWidth * 0.45,
    rgbOf(THREE, PALETTE.text),
    3.4
  );
  batches.glow.push(hx, LANCE_H + 1, hy, rgbOf(THREE, look.head), 9, 0.5, 1.4);
}

/** Beams, arcs and marks; `flashes` lights each new beam once. */
export function mirrorWeaponEffects(THREE, combat, batches, flashes) {
  const { ribbons, glow } = batches;
  const white = rgbOf(THREE, PALETTE.text);
  const colors = WEAPONS.harmonic.colors;

  const flare = combat.apexes.includes('thermal');
  combat.burns.forEach((entry, enemy) => {
    const rgb = rgbOf(THREE, WEAPON_EVOLUTIONS.thermal.look.trail);
    const r = enemy.radius || 12;
    glow.push(enemy.x, r + MARK_H, enemy.y, rgb, r * 1.3, 0.45);
    if (flare) {
      const flareRgb = rgbOf(THREE, WEAPON_APEX.thermal.look.trail);
      glow.push(enemy.x, r + MARK_H + 1, enemy.y, flareRgb, r * 0.7, 0.6, 1.5);
    }
  });
  combat.slows.forEach((entry, enemy) => {
    ribbons.circle(
      enemy.x,
      enemy.y,
      (enemy.radius || 12) + 4,
      ARC_H,
      rgbOf(THREE, WEAPON_EVOLUTIONS.field.look.trail),
      1.4,
      0.7
    );
  });

  // Singularity: each pulled enemy wears a ring; each hit point is a ring
  // collapsing onto it over the pull.
  const singularityRgb = rgbOf(THREE, WEAPON_APEX.field.look.outer);
  combat.pulls.forEach((entry, enemy) => {
    const r = (enemy.radius || 12) + 3;
    ribbons.circle(enemy.x, enemy.y, r, ARC_H, singularityRgb, 1.6, 0.8);
  });
  const pull = WEAPON_APEX.field.pull;
  combat.wells.forEach((well) => {
    const k = well.life / well.maxLife;
    const r = 6 + (pull.radius - 6) * k;
    ribbons.circle(
      well.x,
      well.y,
      r,
      ARC_H,
      singularityRgb,
      3.2,
      0.9 * (1.2 - k)
    );
    ribbons.circle(well.x, well.y, r * 0.55, ARC_H, white, 1.2, 0.7 * k);
    glow.push(well.x, ARC_H, well.y, singularityRgb, 14, 1 - k * 0.5, 1.6);
  });

  const lanceArc = combat.lanceLook.arc || PALETTE.player;
  combat.arcs.forEach((arc) => {
    const k = arc.life / arc.maxLife;
    const { points } = arc;
    const arcRgb = rgbOf(THREE, arc.color || lanceArc);
    // Storm Lance bolts are thicker, with a wider halo.
    const scale = arc.heavy ? 1.7 : 1;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const seg = (rgb, width, gain) =>
        ribbons.segment(
          a.x,
          a.y,
          b.x,
          b.y,
          ARC_H,
          rgb,
          width * scale,
          gain * k
        );
      seg(arcRgb, 5, 0.5);
      seg(arcRgb, 2.2, 1.1);
      seg(white, 0.9, 1.8);
    }
    const tip = points[points.length - 1];
    glow.push(tip.x, ARC_H, tip.y, arcRgb, 16 * scale, 0.8 * k, 1.4);
  });

  combat.beams.forEach((beam) => {
    const k = beam.life / beam.maxLife;
    BEAM_LAYERS.forEach(([key, width, gain, length]) => {
      ribbons.segment(
        beam.x,
        beam.y,
        beam.x + (beam.ex - beam.x) * length,
        beam.y + (beam.ey - beam.y) * length,
        BEAM_H,
        rgbOf(THREE, colors[key]),
        beam.width * width,
        gain * k
      );
    });
    const glowRgb = rgbOf(THREE, colors.glow);
    glow.push(beam.x, BEAM_H + 1, beam.y, glowRgb, beam.width * 3.2, k, 1.6);
    glow.push(beam.ex, BEAM_H, beam.ey, glowRgb, beam.width * 3, 0.7 * k);
    flashes.observe(beam, glowRgb);
  });
}
