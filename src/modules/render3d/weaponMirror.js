// Weapon looks in 3D (docs/NORTE.md §7 pillar 4): evolved lances, the
// Harmonic beam, Scatter Coil bolts and bursts, chain arcs, the thruster
// trails and the burn/slow marks, drawn into the shared
// batches from CombatSystem's state. Colours come from data/weapons.js, the
// same ones CombatSystem's 2D draw uses.

import { PALETTE } from '../../data/constants/palette.js';
import { ION_TRAIL_GAP } from '../../data/constants/gameplay.js';
import { WEAPONS, WEAPON_APEX, WEAPON_EVOLUTIONS } from '../../data/weapons.js';
import { rgbOf } from './batches.js';

const LANCE_H = 3;
const BEAM_H = 3.2;
const ARC_H = 8;
const MARK_H = 6;
const TRAIL_H = 2;
const ION_KINK = 14; // px, the most an ion segment bends off its line
// proposta 18/10: Scatter Coil looks. The bolt: tracer and core ribbon
// widths, the head capsule's length/width, the head glow's size. The burst:
// flash and core glow sizes, ring width at its start.
const FLAK_H = 4;
const FLAK_TRACER_WIDTH = 3.4;
const FLAK_CORE_WIDTH = 1.1;
const FLAK_HEAD_LENGTH = 4;
const FLAK_HEAD_WIDTH = 2;
const FLAK_HEAD_GLOW = 6;
const FLAK_FLASH_SIZE = 30;
const FLAK_CORE_SIZE = 12;
const FLAK_RING_WIDTH = 2.6;
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

/** A Scatter Coil bolt: amber tracer, white-hot core and head. */
export function pushFlakBolt(THREE, batches, bullet, pushTrail) {
  const { colors } = WEAPONS.scatter;
  const tracer = rgbOf(THREE, colors.tracer);
  const core = rgbOf(THREE, colors.core);
  pushTrail(bullet, tracer, FLAK_TRACER_WIDTH, 1.5);
  pushTrail(bullet, core, FLAK_CORE_WIDTH, 2);
  batches.lances.push(
    bullet.x,
    bullet.y,
    FLAK_H,
    Math.atan2(bullet.vy || 0, bullet.vx || 1),
    FLAK_HEAD_LENGTH,
    FLAK_HEAD_WIDTH,
    core,
    2
  );
  batches.glow.push(
    bullet.x,
    FLAK_H + 1,
    bullet.y,
    tracer,
    FLAK_HEAD_GLOW,
    0.45,
    1.2
  );
}

/**
 * Beams, flak bursts, arcs and marks; `flashes` lights each new beam once
 * and each flak volley's first burst once.
 */
export function mirrorWeaponEffects(THREE, combat, batches, flashes) {
  const { ribbons, glow } = batches;
  const white = rgbOf(THREE, PALETTE.text);
  const colors = WEAPONS.harmonic.colors;

  // Thruster trails: Cinder Trail embers, Ion Trail as a cyan ribbon.
  const cinderRgb = rgbOf(THREE, WEAPON_EVOLUTIONS.thermal.look.trail);
  combat.cinders.forEach((c) => {
    const k = c.life / c.maxLife;
    glow.push(c.x, TRAIL_H, c.y, cinderRgb, 6 + 6 * k, 0.6 * k);
  });
  // The ion trail crackles (a kinked bolt per segment, re-kinked as it
  // fades) so it reads apart from the cyan exhaust it sits on.
  const ionRgb = rgbOf(THREE, PALETTE.player);
  const ions = combat.ions;
  for (let i = 1; i < ions.length; i += 1) {
    const a = ions[i - 1];
    const b = ions[i];
    if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > ION_TRAIL_GAP ** 2) continue;
    const k = b.life / b.maxLife;
    const flicker = Math.floor(b.life * 20);
    const kink = (glint(b.x + flicker, b.y) - 0.5) * ION_KINK;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const mx = (a.x + b.x) / 2 - ((b.y - a.y) / len) * kink;
    const my = (a.y + b.y) / 2 + ((b.x - a.x) / len) * kink;
    [
      [a, { x: mx, y: my }],
      [{ x: mx, y: my }, b],
    ].forEach(([p, q]) => {
      ribbons.segment(p.x, p.y, q.x, q.y, ARC_H, ionRgb, 4, 0.7 * k);
      ribbons.segment(p.x, p.y, q.x, q.y, ARC_H, white, 1, 1.6 * k);
    });
    glow.push(b.x, ARC_H, b.y, ionRgb, 8 * k + 2, 0.5 * k, 1.4);
  }

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

  // Flak bursts: a hot flash and a ring opening to the burst radius; the
  // shrapnel sparks are Renderer3D's HitSparks, on 'flak-burst'.
  const flak = WEAPONS.scatter;
  const burstRgb = rgbOf(THREE, flak.colors.burst);
  const flakCore = rgbOf(THREE, flak.colors.core);
  combat.flakBursts.forEach((burst) => {
    const k = burst.life / burst.maxLife;
    const r = flak.flak.burstRadius * (0.35 + 0.65 * (1 - k));
    ribbons.circle(
      burst.x,
      burst.y,
      r,
      FLAK_H,
      burstRgb,
      FLAK_RING_WIDTH * k + 0.6,
      1.3 * k
    );
    glow.push(
      burst.x,
      FLAK_H + 1,
      burst.y,
      burstRgb,
      FLAK_FLASH_SIZE * (0.6 + 0.4 * k),
      0.8 * k,
      1.5
    );
    glow.push(burst.x, FLAK_H + 2, burst.y, flakCore, FLAK_CORE_SIZE * k, k, 2);
    if (burst.lit) flashes.observe(burst, burstRgb);
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
