// Weapon looks in 3D (docs/NORTE.md §7 pillar 4): evolved lances, the
// Harmonic beam, chain arcs and the burn/slow marks, drawn into the shared
// batches from CombatSystem's state. Colours come from data/weapons.js, the
// same ones CombatSystem's 2D draw uses.

import { PALETTE } from '../../data/constants/palette.js';
import { WEAPONS, WEAPON_EVOLUTIONS } from '../../data/weapons.js';
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

/** One evolved or base lance: body capsule, trail, and a head once evolved. */
export function pushLance(THREE, batches, look, evolved, bullet, pushTrail) {
  const angle = Math.atan2(bullet.vy || 0, bullet.vx || 1);
  pushTrail(bullet, rgbOf(THREE, look.trail), 2.4 * look.width, 1.3);
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
  batches.lances.push(
    bullet.x + Math.cos(angle) * reach,
    bullet.y + Math.sin(angle) * reach,
    LANCE_H + 0.2,
    angle,
    2.4 * look.headLength,
    1.2 * Math.max(0.8, look.width),
    rgbOf(THREE, look.head),
    2.8
  );
}

/** Beams, arcs and marks; `flashes` lights each new beam once. */
export function mirrorWeaponEffects(THREE, combat, batches, flashes) {
  const { ribbons, glow } = batches;
  const colors = WEAPONS.harmonic.colors;

  combat.burns.forEach((entry, enemy) => {
    const rgb = rgbOf(THREE, WEAPON_EVOLUTIONS.thermal.look.trail);
    const r = enemy.radius || 12;
    glow.push(enemy.x, r + MARK_H, enemy.y, rgb, r * 1.3, 0.45);
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

  const arcRgb = rgbOf(THREE, combat.lanceLook.arc || PALETTE.player);
  const whiteRgb = rgbOf(THREE, PALETTE.text);
  combat.arcs.forEach((arc) => {
    const k = arc.life / arc.maxLife;
    const { points } = arc;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      ribbons.segment(a.x, a.y, b.x, b.y, ARC_H, arcRgb, 5, 0.5 * k);
      ribbons.segment(a.x, a.y, b.x, b.y, ARC_H, arcRgb, 2.2, 1.1 * k);
      ribbons.segment(a.x, a.y, b.x, b.y, ARC_H, whiteRgb, 0.9, 1.8 * k);
    }
    const tip = points[points.length - 1];
    glow.push(tip.x, ARC_H, tip.y, arcRgb, 16, 0.8 * k, 1.4);
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
