// Weapon looks in 3D (docs/NORTE.md §7 pillar 4): evolved lances, beams,
// flak bolts and bursts, chain arcs, orbit blades, the aura's ring and
// pulses, seeker missiles, the thruster trails and the field's grip (the
// static on what it slows, what falls into a Singularity, what the Gravity
// Brake drags),
// drawn into the shared batches from CombatSystem's state. Beams, bolts,
// bursts, blades, rings and missiles carry the `colors` of the weapon that
// fired them; the lance's come from data/weapons.js. Light keeps its body
// from any angle: trails, bolts, arcs and beams are camera-facing tubes,
// rings are tori; blades and missile casings are matte (weaponBodies.js).

import { PALETTE } from '../../data/constants/palette.js';
import { ION_TRAIL_GAP } from '../../data/constants/gameplay.js';
import { WEAPON_APEX, WEAPON_EVOLUTIONS } from '../../data/weapons.js';
import { SHOT_SHAPES, rgbOf } from './batches.js';
import { hashId } from './enemyMirror.js';

const LANCE_H = 3;
const BEAM_H = 3.2;
const ARC_H = 8;
const TRAIL_H = 2;
const ION_KINK = 14; // px, the most an ion segment bends off its line
// proposta 18/10: Afterburn (the dash trail) band and core widths, point
// glow size, all when fresh.
const AFTERBURN_BAND = 7;
const AFTERBURN_CORE = 2;
const AFTERBURN_GLOW = 14;
// proposta 18/10: the flak look. The bolt: tracer and core ribbon
// widths, the head capsule's length/width, the head glow's size. The burst
// itself is Renderer3D's blast (blasts.js), on 'flak-burst'.
const FLAK_H = 4;
const FLAK_TRACER_WIDTH = 3.4;
const FLAK_CORE_WIDTH = 1.1;
const FLAK_HEAD_LENGTH = 4;
const FLAK_HEAD_WIDTH = 2;
const FLAK_HEAD_GLOW = 6;
// proposta 19/10: an evolved lance's arrowhead sits on the bolt's nose
// (centre and half length × headLength, half width × the lance width); an
// Apex's white needle runs through it and out the front.
const HEAD_REACH = 7;
const HEAD_LENGTH = 2.6;
const HEAD_WIDTH = 1.5;
const NEEDLE_LENGTH = 4.2;
const NEEDLE_WIDTH = 0.4;
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

// proposta 20/10: the field weapons' looks. A blade: matte shard (half
// length, half width × its cut radius) with a glowing edge along its outer
// side (BLADE_EDGE × the cut radius out), a wake of BLADE_WAKE rad along its
// ring and the ring's faint track.
const BLADE_H = 5;
const BLADE_LENGTH = 1.4;
const BLADE_WIDTH = 0.8;
const BLADE_EDGE = 0.5;
const BLADE_WAKE = 0.6;
const BLADE_WAKE_POINTS = 7;
// The aura: its ring between pulses (core and haze widths, gains cold → hot)
// and a pulse opening from PULSE_FROM × its radius.
const AURA_H = 2.5;
const AURA_CORE = 1.6;
const AURA_HAZE = 14;
const PULSE_FROM = 0.55;
// A weapon's bolt (the chain pattern): a thin white-hot core in a narrow
// glow of its colour kept under the bloom threshold, so only the core blooms
// and the field stays dark between bolts; the Apex's a little wider.
const BOLT_GLOW = 1.6;
const BOLT_GLOW_GAIN = 0.35;
const BOLT_CORE = 0.5;
const BOLT_CORE_GAIN = 1.1;
const BOLT_TIP = 5;
const BOLT_HEAVY = 1.3;
// proposta 17/11 (efeito/impacto, lote 4): the field family's grip, where
// rings were. Static crawling on a held hull: arcs per machine, kinks each,
// re-struck every STATIC_FRAMES frames; height over the plane (+ × radius),
// widths and gains. A Singularity's well: WELL_STREAKS bits of matter
// spiralling in (WELL_TURN rad over the pull), its dark core and a glint.
// A shot the Gravity Brake drags leaves a short violet wake (× its speed).
const STATIC_ARCS = 2;
const STATIC_KINKS = 4;
const STATIC_FRAMES = 4;
const STATIC_H = 3;
const STATIC_RISE = 0.35;
const STATIC_GLOW = 1.4;
const STATIC_CORE = 0.45;
const WELL_STREAKS = 12;
const WELL_TURN = 2.6;
const WELL_TAIL = 0.08; // of the pull
const WELL_CORE = 9;
const WELL_DARK = [0.012, 0.006, 0.02];
const DRAG_WAKE = 0.06; // s of travel
const DRAG_H = 4;
let staticFrame = 0;
// A seeker: casing half length and width, exhaust flame, nose light.
const SEEKER_H = 4;
const SEEKER_LENGTH = 6;
const SEEKER_WIDTH = 2;
const SEEKER_FLAME = 3;
const SEEKER_GLOW = 4;

// Deterministic 0..1 per trail point, for the Motherlode glints (render only).
const glint = (x, y) => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// Violet static over a hull a field holds (`strength` ~1): short kinked
// sparks laid across it, re-struck every few frames, in place of a ring.
function pushStatic(ribbons, enemy, rgb, white, strength) {
  const r = enemy.radius || 12;
  const h = STATIC_H + r * STATIC_RISE;
  const strike = Math.floor(staticFrame / STATIC_FRAMES);
  const id = (hashId(enemy.id) % 9973) * 0.37 + strike * 1.618;
  for (let a = 0; a < STATIC_ARCS; a += 1) {
    const seed = id + a * 5.3;
    const angle = glint(seed, 1) * Math.PI * 2;
    const from = r * (0.15 + 0.55 * glint(seed, 2));
    const run = angle + Math.PI * (0.35 + 0.3 * glint(seed, 3));
    const step = (r * (0.5 + 0.4 * glint(seed, 4))) / (STATIC_KINKS - 1);
    let x = enemy.x + Math.cos(angle) * from;
    let y = enemy.y + Math.sin(angle) * from;
    for (let k = 0; k < STATIC_KINKS; k += 1) {
      const kink = (glint(seed, 5 + k) - 0.5) * r * 0.35;
      ribbons.px[k] = x - Math.sin(run) * kink;
      ribbons.py[k] = y + Math.cos(run) * kink;
      x += Math.cos(run) * step;
      y += Math.sin(run) * step;
    }
    ribbons.path(STATIC_KINKS, h, rgb, STATIC_GLOW, 0.8 * strength, Infinity);
    ribbons.path(STATIC_KINKS, h, white, STATIC_CORE, strength, Infinity);
  }
}

/**
 * One evolved or base lance: body bolt, trail, and an arrowhead once evolved.
 * An Apex adds a wider `outer` ribbon, a white core ribbon and needle, a
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
    1.9,
    SHOT_SHAPES.bolt
  );
  if (!evolved) return;
  const reach = HEAD_REACH * look.headLength;
  const headWidth =
    HEAD_WIDTH * Math.max(0.8, look.width) * (look.apex ? 1.4 : 1);
  const hx = bullet.x + Math.cos(angle) * reach;
  const hy = bullet.y + Math.sin(angle) * reach;
  batches.lances.push(
    hx,
    hy,
    LANCE_H,
    angle,
    HEAD_LENGTH * look.headLength,
    headWidth,
    rgbOf(THREE, look.head),
    2.8,
    SHOT_SHAPES.head
  );
  if (!look.apex) return;
  batches.lances.push(
    hx,
    hy,
    LANCE_H,
    angle,
    NEEDLE_LENGTH * look.headLength,
    headWidth * NEEDLE_WIDTH,
    rgbOf(THREE, PALETTE.text),
    3.4,
    SHOT_SHAPES.needle
  );
  batches.glow.push(hx, LANCE_H + 1, hy, rgbOf(THREE, look.head), 9, 0.5, 1.4);
}

/**
 * A flak bolt: tracer and white-hot core trails, and a slug in the tracer's
 * colour that runs white-hot at its heart, in its weapon's colours.
 */
export function pushFlakBolt(THREE, batches, bullet, pushTrail) {
  const { colors } = bullet;
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
    tracer,
    2,
    SHOT_SHAPES.flak
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
 * A seeker missile: a matte casing nosed along its flight, its exhaust trail
 * in the tracer colour over a hot core, a flame and glow at the tail and a
 * small light at the nose.
 */
export function pushSeeker(THREE, batches, bullet, pushTrail) {
  const { colors } = bullet;
  const tracer = rgbOf(THREE, colors.tracer);
  const core = rgbOf(THREE, colors.core);
  pushTrail(bullet, tracer, 2.2, 0.45);
  pushTrail(bullet, core, 0.7, 1.1);
  const angle = Math.atan2(bullet.vy || 0, bullet.vx || 1);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  batches.bodies.casing(
    bullet.x,
    bullet.y,
    SEEKER_H,
    angle,
    SEEKER_LENGTH,
    SEEKER_WIDTH
  );
  const tx = bullet.x - cos * (SEEKER_LENGTH + SEEKER_FLAME * 0.6);
  const ty = bullet.y - sin * (SEEKER_LENGTH + SEEKER_FLAME * 0.6);
  batches.lances.push(
    tx,
    ty,
    SEEKER_H,
    angle + Math.PI,
    SEEKER_FLAME,
    SEEKER_WIDTH * 0.6,
    core,
    2.2,
    SHOT_SHAPES.bolt
  );
  batches.glow.push(tx, SEEKER_H, ty, core, SEEKER_GLOW, 0.4, 1.2);
  const nx = bullet.x + cos * SEEKER_LENGTH;
  const ny = bullet.y + sin * SEEKER_LENGTH;
  batches.glow.push(nx, SEEKER_H + 0.5, ny, rgbOf(THREE, colors.burst), 2, 0.8);
}

// The Shard Halo: each blade a matte shard under its glowing edge, with a
// wake behind it along its ring; each ring's track, faint.
function mirrorBlades(THREE, combat, batches) {
  const { blades } = combat;
  if (!blades.length) return;
  const { ribbons, glow, lances, bodies } = batches;
  const { colors } = combat.weaponForm;
  const edge = rgbOf(THREE, colors.edge);
  const core = rgbOf(THREE, colors.core);
  blades.forEach((blade) => {
    const { x, y, angle, size, cx, cy, radius, around, spin } = blade;
    if (blade.index === 0) {
      ribbons.ring(cx, cy, radius, BLADE_H, edge, 0.8, 0.14);
    }
    const back = -Math.sign(spin) * BLADE_WAKE;
    for (let i = 0; i < BLADE_WAKE_POINTS; i += 1) {
      const a =
        around + (back * (BLADE_WAKE_POINTS - 1 - i)) / (BLADE_WAKE_POINTS - 1);
      ribbons.px[i] = cx + Math.cos(a) * radius;
      ribbons.py[i] = cy + Math.sin(a) * radius;
    }
    ribbons.path(BLADE_WAKE_POINTS, BLADE_H, edge, size * 0.5, 0.35);
    bodies.blade(x, y, BLADE_H, angle, size * BLADE_LENGTH, size * BLADE_WIDTH);
    const ex = x + Math.cos(around) * size * BLADE_EDGE;
    const ey = y + Math.sin(around) * size * BLADE_EDGE;
    lances.push(
      ex,
      ey,
      BLADE_H + 0.4,
      angle,
      size * BLADE_LENGTH,
      0.7,
      edge,
      2.2,
      SHOT_SHAPES.needle
    );
    glow.push(ex, BLADE_H + 1, ey, core, size * 0.7, 0.5, 1.5);
    glow.push(ex, BLADE_H, ey, edge, size * 1.6, 0.3, 1.1);
  });
}

// The Furnace Corona: its ring heating up between pulses (a thin core over
// a wide haze), and each pulse opening to the ring with a heat flash.
function mirrorAura(THREE, combat, batches, flashes) {
  const { aura, pulses } = combat;
  const { ribbons, glow } = batches;
  if (aura) {
    const heat = rgbOf(THREE, aura.colors.heat);
    const k = aura.heat;
    ribbons.ring(
      aura.x,
      aura.y,
      aura.radius,
      AURA_H,
      heat,
      AURA_HAZE,
      0.04 + 0.08 * k
    );
    ribbons.ring(
      aura.x,
      aura.y,
      aura.radius,
      AURA_H,
      heat,
      AURA_CORE,
      0.2 + 0.7 * k
    );
  }
  pulses.forEach((pulse) => {
    const heat = rgbOf(THREE, pulse.colors.heat);
    const core = rgbOf(THREE, pulse.colors.core);
    const k = pulse.life / pulse.maxLife;
    const r = pulse.maxRadius * (PULSE_FROM + (1 - PULSE_FROM) * (1 - k));
    ribbons.ring(pulse.x, pulse.y, r, AURA_H, heat, 2 + 9 * k, 1.1 * k);
    ribbons.ring(pulse.x, pulse.y, r * 0.96, AURA_H, core, 1.4, 1.6 * k);
    glow.push(pulse.x, AURA_H, pulse.y, heat, pulse.maxRadius * 1.1, 0.16 * k);
    flashes.observe(pulse, heat);
  });
}

/**
 * Beams, flak bursts, arcs, blades, the aura and marks; `flashes` lights each
 * new beam and aura pulse once and each flak volley's first burst once.
 */
export function mirrorWeaponEffects(THREE, combat, batches, flashes) {
  const { ribbons, glow, smoke } = batches;
  const white = rgbOf(THREE, PALETTE.text);
  mirrorBlades(THREE, combat, batches);
  mirrorAura(THREE, combat, batches, flashes);

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
    const { px, py } = ribbons;
    px[0] = a.x;
    py[0] = a.y;
    px[1] = mx;
    py[1] = my;
    px[2] = b.x;
    py[2] = b.y;
    ribbons.path(3, ARC_H, ionRgb, 4, 0.7 * k);
    ribbons.path(3, ARC_H, white, 1, 1.6 * k);
    glow.push(b.x, ARC_H, b.y, ionRgb, 8 * k + 2, 0.5 * k, 1.4);
  }
  // Afterburn: the dash's line, an amber band under a hot core that cools
  // first, so old segments read as embers.
  const amberRgb = rgbOf(THREE, PALETTE.shot);
  const burnLine = combat.afterburnTrail;
  for (let i = 0; i < burnLine.length; i += 1) {
    const b = burnLine[i];
    const k = b.life / b.maxLife;
    const fresh = 0.5 + 0.5 * k;
    glow.push(b.x, TRAIL_H, b.y, amberRgb, AFTERBURN_GLOW * fresh, 0.45 * k);
    if (i === 0 || !b.joined) continue;
    const a = burnLine[i - 1];
    ribbons.tube(
      a.x,
      a.y,
      b.x,
      b.y,
      TRAIL_H,
      amberRgb,
      AFTERBURN_BAND * fresh,
      0.7 * k
    );
    ribbons.tube(
      a.x,
      a.y,
      b.x,
      b.y,
      TRAIL_H,
      cinderRgb,
      AFTERBURN_CORE,
      1.4 * k * k
    );
  }

  // A burn is heat on the hull itself: Renderer3D marks each tick where it
  // bites and drips slag (lote 4), so nothing is drawn round it here.
  staticFrame += 1;
  const fieldRgb = rgbOf(THREE, WEAPON_EVOLUTIONS.field.look.trail);
  combat.slows.forEach((entry, enemy) => {
    pushStatic(ribbons, enemy, fieldRgb, white, 1);
  });
  // The Gravity Brake drags what is near the ship: the same static on the
  // machines, a violet wake behind the shots it holds back.
  combat.braked.forEach((enemy) => {
    if (!combat.slows.has(enemy))
      pushStatic(ribbons, enemy, fieldRgb, white, 0.6);
  });
  combat.brakedShots.forEach((shot) => {
    ribbons.tube(
      shot.x - (shot.vx || 0) * DRAG_WAKE,
      shot.y - (shot.vy || 0) * DRAG_WAKE,
      shot.x,
      shot.y,
      DRAG_H,
      fieldRgb,
      2.4,
      0.7
    );
  });

  // Singularity: each pulled machine crackles harder; at each hit point
  // matter spirals in to a dark core over the pull.
  const singularityRgb = rgbOf(THREE, WEAPON_APEX.field.look.outer);
  combat.pulls.forEach((entry, enemy) => {
    pushStatic(ribbons, enemy, singularityRgb, white, 1.4);
  });
  const pull = WEAPON_APEX.field.pull;
  combat.wells.forEach((well) => {
    const k = well.life / well.maxLife;
    const at = (seed, kk) => {
      const reach = pull.radius * (0.3 + 0.7 * glint(seed, 7)) * kk ** 0.8;
      const angle = glint(seed, 8) * Math.PI * 2 + (1 - kk) * WELL_TURN;
      return [
        well.x + Math.cos(angle) * reach,
        well.y + Math.sin(angle) * reach,
      ];
    };
    for (let i = 0; i < WELL_STREAKS; i += 1) {
      const seed = well.x * 0.13 + well.y * 0.07 + i * 3.1;
      const [hx, hy] = at(seed, k);
      const [tx, ty] = at(seed, Math.min(1, k + WELL_TAIL));
      ribbons.streak(
        tx,
        ty,
        hx,
        hy,
        ARC_H,
        singularityRgb,
        1.2,
        1.4 * (1.1 - k)
      );
    }
    smoke.push(well.x, ARC_H, well.y, WELL_DARK, WELL_CORE * (1.4 - k), 0.85);
    glow.push(
      well.x,
      ARC_H + 0.5,
      well.y,
      white,
      2 + 2 * (1 - k),
      0.5 * (1 - k * 0.5),
      1.4
    );
  });

  const lanceArc = combat.lanceLook.arc || PALETTE.player;
  combat.arcs.forEach((arc) => {
    const k = arc.life / arc.maxLife;
    const { points } = arc;
    const arcRgb = rgbOf(THREE, arc.color || lanceArc);
    // Storm Lance bolts are thicker, with a wider halo.
    const scale = arc.heavy ? 1.7 : 1;
    const n = Math.min(points.length, ribbons.px.length);
    for (let i = 0; i < n; i += 1) {
      ribbons.px[i] = points[i].x;
      ribbons.py[i] = points[i].y;
    }
    if (arc.bolt) {
      const s = arc.heavy ? BOLT_HEAVY : 1;
      ribbons.path(
        n,
        ARC_H,
        arcRgb,
        BOLT_GLOW * s,
        BOLT_GLOW_GAIN * k,
        Infinity
      );
      ribbons.path(
        n,
        ARC_H,
        white,
        BOLT_CORE * s,
        BOLT_CORE_GAIN * k,
        Infinity
      );
      const end = points[points.length - 1];
      glow.push(end.x, ARC_H, end.y, arcRgb, BOLT_TIP * s, 0.35 * k);
      return;
    }
    const layer = (rgb, width, gain) =>
      ribbons.path(n, ARC_H, rgb, width * scale, gain * k, Infinity);
    layer(arcRgb, 5, 0.5);
    layer(arcRgb, 2.2, 1.1);
    layer(white, 0.9, 1.8);
    const tip = points[points.length - 1];
    glow.push(tip.x, ARC_H, tip.y, arcRgb, 16 * scale, 0.8 * k, 1.4);
  });

  // Flak and missile bursts are Renderer3D's blasts (fire, soot, sparks);
  // here only the first of a volley lights the hulls round it.
  combat.flakBursts.forEach((burst) => {
    if (burst.lit) flashes.observe(burst, rgbOf(THREE, burst.colors.burst));
  });

  combat.beams.forEach((beam) => {
    const { colors } = beam;
    const k = beam.life / beam.maxLife;
    BEAM_LAYERS.forEach(([key, width, gain, length]) => {
      ribbons.tube(
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
