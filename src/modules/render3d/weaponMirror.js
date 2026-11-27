// Weapon looks in 3D (docs/NORTE.md §7 pillar 4): evolved lances, beams,
// flak bolts and bursts, chain arcs, orbit blades, the aura's ring and
// pulses, seeker missiles, the thruster trails and the field's grip (the
// static on what it slows, what falls into a Singularity),
// drawn into the shared batches from CombatSystem's state. Beams, bolts,
// bursts, blades, rings and missiles carry the `colors` of the weapon that
// fired them; the lance's come from data/weapons.js. Light keeps its body
// from any angle: trails, bolts, arcs and beams are camera-facing tubes,
// rings are tori; blades and missile casings are matte (weaponBodies.js).

import { PALETTE } from '../../data/constants/palette.js';
import { ION_TRAIL_GAP } from '../../data/constants/gameplay.js';
import { WEAPON_APEX, WEAPON_EVOLUTIONS } from '../../data/weapons.js';
import { SHOT_SHAPES, glint, rgbOf } from './batches.js';
import {
  mirrorGlances,
  mirrorKindled,
  mirrorScraps,
  pushBurningPiece,
} from './fanMirror.js';
import { mirrorLodged, mirrorThermite } from './missileMirror.js';
import { hashId } from './enemyMirror.js';
import { getContent } from '../../content/registry.js';

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
// short so the tip tapers into the end glow instead of ending square. Lot 5
// (efeito/impacto): the outer haze is narrower and fainter, and the nose glow
// sits a little ahead of the ship and smaller (BEAM_NOSE), so the strong
// beam no longer covers the ship as it fires.
const BEAM_LAYERS = [
  ['glow', 2.2, 0.045, 0.92],
  ['glow', 1.5, 0.16, 0.96],
  ['mid', 1, 0.85, 0.97],
  ['core', 0.35, 2.4, 0.93],
];
// The beam's nose glow: how far along the beam (× its length) and how wide
// (× beam width); the end glow's width.
const BEAM_NOSE = [0.08, 1.3];
const BEAM_END = 1.6;

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
// proposta 17/11 (efeito/impacto, approved as a mock-up): a weapon's bolt
// (the chain pattern) is lightning. A wide channel in its family's colour
// (BOLT_THERMAL, the field's violet, else its own) round a glow of its own
// colour and a white-hot core, [width, gain] each; it re-strikes
// BOLT_STRIKES times over its life, its kinks jumping up to BOLT_JITTER px.
// Short forks leave its kinks (a kink forks when its hash is under
// BOLT_FORK_CHANCE): three segments, [min, + up to] px long, each turning up
// to BOLT_FORK_BEND rad. Where it strikes the metal flares like a weld
// ([white-hot, family glow] sizes) and lights the hull once. The Apex's
// bolts are BOLT_HEAVY wider.
const BOLT_STRIKES = 5;
const BOLT_JITTER = 10;
const BOLT_CHANNEL = [4, 0.32];
const BOLT_GLOW = [2.2, 1];
const BOLT_CORE = [0.9, 2.4];
const BOLT_FORK_CHANCE = 0.75;
const BOLT_FORK_LENGTH = [14, 16];
const BOLT_FORK_BEND = 1.2;
const BOLT_FORK = [1.6, 0.9]; // the fork's channel; its core is white
const BOLT_FORK_CORE = [0.45, 1.4];
const BOLT_FLARE = [7, 10];
const BOLT_LIGHT = 0.6;
const BOLT_HEAVY = 1.3;
const BOLT_THERMAL = '#ff8a2a';
const BOLT_HOT = [2.4, 2.2, 2];
// With the kinetic family (Railshot, the Coilgun) the bolt is a rail:
// straight, thick and white-blue, [width, gain] per layer, and it goes
// through the hull, spraying RAIL_SPRAY streaks of molten metal out of the
// far side within RAIL_CONE rad at [min, + up to] px a life.
const RAIL_RGB = '#9ff6ff';
const RAIL_CHANNEL = [5, 0.35];
const RAIL_GLOW = [2.4, 1];
const RAIL_CORE = [1.3, 3.2];
const RAIL_SPRAY = 9;
const RAIL_CONE = 1.1;
const RAIL_SPEED = [18, 34];
const RAIL_FLARE = 9;
const RAIL_LIGHT = 0.6;
const RAIL_EMBER = [2.2, 0.9, 0.25];
const boltX = new Float32Array(64);
const boltY = new Float32Array(64);
const lit = new WeakSet(); // bolts whose strike already lit the hull
// proposta 17/11 (efeito/impacto, lote 4): the field family's grip, where
// rings were. Static crawling on a held hull: arcs per machine, kinks each,
// re-struck every STATIC_FRAMES frames; height over the plane (+ × radius),
// widths and gains. A Singularity's well: WELL_STREAKS bits of matter
// spiralling in (WELL_TURN rad over the pull), its dark core and a glint.
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
let staticFrame = 0;
// A seeker: casing half length and width, exhaust flame, nose light.
const SEEKER_H = 4;
const SEEKER_LENGTH = 6;
const SEEKER_WIDTH = 2;
const SEEKER_FLAME = 3;
const SEEKER_GLOW = 4;

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
 * The colour a player's shot is drawn in, which its hit lights and its burn
 * first glows in (21/11, 38: "o tiro é de uma cor e a ... iluminação que vai
 * é de outra"): a lance its look's trail, a weapon's own shots their
 * colours. Null for a bolt, which lights where it strikes in its own colour
 * (pushBolt, pushRail).
 */
export function shotColor(combat, bullet) {
  if (bullet.kind === 'arc' || bullet.kind === 'chain') return null;
  const colors =
    bullet.colors ||
    getContent('weapons', combat.weapons.weaponId)?.colors ||
    {};
  const own = {
    flak: colors.tracer,
    seeker: colors.burst,
    beam: colors.glow,
    heat: colors.heat,
    blade: colors.edge,
  }[bullet.kind];
  return own || combat.weapons.lanceLook?.trail || PALETTE.shot;
}

// The bolt's strike lights the hull round it, once.
function lightStrike(flashes, arc, x, y, rgb, intensity) {
  if (lit.has(arc)) return;
  lit.add(arc);
  flashes.light(x, y, rgb[0], rgb[1], rgb[2], intensity);
}

// Lightning through `arc`'s n points (see BOLT_*); `s` its width scale.
function pushBolt(batches, flashes, arc, n, k, s, rgb, familyRgb, white) {
  const { ribbons, glow } = batches;
  const { points } = arc;
  const { px, py } = ribbons;
  const strike = Math.floor((1 - k) * BOLT_STRIKES);
  for (let i = 0; i < n; i += 1) {
    const inner = i > 0 && i < n - 1;
    const { x, y } = points[i];
    px[i] = inner
      ? x + (glint(x * 0.37 + strike * 1.7, y + strike) - 0.5) * BOLT_JITTER
      : x;
    py[i] = inner
      ? y + (glint(y * 0.41 + strike * 2.3, x + strike) - 0.5) * BOLT_JITTER
      : y;
    boltX[i] = px[i];
    boltY[i] = py[i];
  }
  ribbons.path(
    n,
    ARC_H,
    familyRgb,
    BOLT_CHANNEL[0] * s,
    BOLT_CHANNEL[1] * k,
    Infinity
  );
  ribbons.path(n, ARC_H, rgb, BOLT_GLOW[0] * s, BOLT_GLOW[1] * k, Infinity);
  ribbons.path(n, ARC_H, white, BOLT_CORE[0] * s, BOLT_CORE[1] * k, Infinity);
  for (let i = 1; i < n - 1; i += 1) {
    if (glint(i * 3.1 + strike, boltX[i]) > BOLT_FORK_CHANCE) continue;
    const along = Math.atan2(
      boltY[i + 1] - boltY[i - 1],
      boltX[i + 1] - boltX[i - 1]
    );
    const side = glint(i, strike * 1.3) > 0.5 ? 1 : -1;
    let angle = along + side * (0.5 + 0.5 * glint(strike, i * 1.9));
    const step =
      ((BOLT_FORK_LENGTH[0] +
        BOLT_FORK_LENGTH[1] * glint(i * 7.7, strike * 3.3)) *
        s) /
      3;
    let x = boltX[i];
    let y = boltY[i];
    for (let q = 0; q < 3; q += 1) {
      const nx = x + Math.cos(angle) * step;
      const ny = y + Math.sin(angle) * step;
      const fade = k * (1 - q / 3);
      ribbons.tube(
        x,
        y,
        nx,
        ny,
        ARC_H,
        familyRgb,
        BOLT_FORK[0] * s,
        BOLT_FORK[1] * fade
      );
      ribbons.tube(
        x,
        y,
        nx,
        ny,
        ARC_H,
        white,
        BOLT_FORK_CORE[0] * s,
        BOLT_FORK_CORE[1] * fade
      );
      x = nx;
      y = ny;
      angle += (glint(q + i, strike) - 0.5) * BOLT_FORK_BEND;
    }
  }
  const end = points[points.length - 1];
  glow.push(end.x, ARC_H, end.y, BOLT_HOT, BOLT_FLARE[0] * s, k, 2.2);
  glow.push(end.x, ARC_H, end.y, familyRgb, BOLT_FLARE[1] * s, 0.35 * k, 1.4);
  lightStrike(flashes, arc, end.x, end.y, familyRgb, BOLT_LIGHT);
}

// A rail from `arc`'s first point to its last (see RAIL_*).
function pushRail(batches, flashes, arc, k, s, railRgb, white) {
  const { ribbons, glow } = batches;
  const from = arc.points[0];
  const end = arc.points[arc.points.length - 1];
  const length = Math.hypot(end.x - from.x, end.y - from.y) || 1;
  const ux = (end.x - from.x) / length;
  const uy = (end.y - from.y) / length;
  const rail = (rgb, [width, gain], fade) =>
    ribbons.tube(
      from.x,
      from.y,
      end.x,
      end.y,
      ARC_H,
      rgb,
      width * s,
      gain * fade
    );
  rail(railRgb, RAIL_CHANNEL, k);
  rail(railRgb, RAIL_GLOW, k);
  rail(white, RAIL_CORE, k * k);
  // through the hull: molten metal sprays out of the far side
  const t = 1 - k;
  for (let i = 0; i < RAIL_SPRAY; i += 1) {
    const angle =
      Math.atan2(uy, ux) + (glint(i * 2.7, end.x) - 0.5) * RAIL_CONE;
    const r0 = (RAIL_SPEED[0] + RAIL_SPEED[1] * glint(end.y, i * 1.3)) * t;
    const r1 = r0 + 4 + 8 * k;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    ribbons.streak(
      end.x + c * r0,
      end.y + sn * r0,
      end.x + c * r1,
      end.y + sn * r1,
      ARC_H,
      i % 3 === 0 ? BOLT_HOT : RAIL_EMBER,
      1.6,
      2 * k
    );
  }
  glow.push(end.x, ARC_H, end.y, BOLT_HOT, RAIL_FLARE * s * k, 1, 2.2);
  lightStrike(flashes, arc, end.x, end.y, railRgb, RAIL_LIGHT);
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
  const { blades } = combat.weapons;
  if (!blades.length) return;
  const { ribbons, glow, lances, bodies } = batches;
  const { colors } = combat.weapons.weapon;
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
  const { aura, pulses } = combat.weapons;
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

// Searing Beam's scar (approved 22/11): a ragged molten seam left in space,
// its pieces cooling unevenly (some already dark crust), slag beads where it
// glows hottest, embers lifting off it and a little soot. No ring or cross:
// what it burns shows its own burn marks.
const SCAR_H = 2.4;
const SCAR_PIECES = 22;
const SCAR_EMBERS = 28;
const SCAR_SOOT = [0.1, 0.085, 0.08];
const SCAR_COLORS = {
  red: '#b02a08',
  orange: '#ff5a12',
  hot: '#ffc98a',
  ember: '#ff8a2a',
};

function mirrorScars(THREE, scars, batches) {
  const { ribbons, glow, smoke } = batches;
  const red = rgbOf(THREE, SCAR_COLORS.red);
  const orange = rgbOf(THREE, SCAR_COLORS.orange);
  const hot = rgbOf(THREE, SCAR_COLORS.hot);
  const ember = rgbOf(THREE, SCAR_COLORS.ember);
  scars.forEach((scar) => {
    const k = scar.life / scar.maxLife;
    const age = scar.maxLife - scar.life;
    const dx = scar.ex - scar.x;
    const dy = scar.ey - scar.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const at = (t, i) => {
      // a gentle wander, not a zigzag
      const off =
        i === 0 || i === SCAR_PIECES
          ? 0
          : Math.sin(t * 9 + scar.seed * 2.3) * 2.2 +
            (glint(scar.seed, i) - 0.5) * 1.2;
      // the seam starts a little ahead of the muzzle, clear of the ship
      const u = 0.1 + 0.9 * t;
      return [scar.x + dx * u + nx * off, scar.y + dy * u + ny * off];
    };
    let [ax, ay] = at(0, 0);
    for (let i = 1; i <= SCAR_PIECES; i += 1) {
      const [bx, by] = at(i / SCAR_PIECES, i);
      // each piece cools at its own pace; some are already dark crust
      const lag = 0.45 * glint(scar.seed + 7, i);
      const ki = Math.max(0, Math.min(1, (k - lag) / (1 - lag)));
      const heat = 0.35 + 0.65 * glint(scar.seed + 3, i) ** 2;
      if (glint(scar.seed + 5, i) >= 0.22) {
        const w = scar.width;
        ribbons.tube(
          ax,
          ay,
          bx,
          by,
          SCAR_H,
          red,
          w * 1.6,
          0.28 * Math.min(1, k * 1.4)
        );
        if (ki > 0) {
          ribbons.tube(
            ax,
            ay,
            bx,
            by,
            SCAR_H,
            orange,
            w * 0.6,
            1.1 * heat * ki
          );
          ribbons.tube(
            ax,
            ay,
            bx,
            by,
            SCAR_H,
            hot,
            w * 0.22,
            1.8 * heat * ki ** 2
          );
          if (heat > 0.8)
            glow.push(bx, SCAR_H, by, orange, w * 1.6, 0.6 * ki, 1.4);
        }
      }
      ax = bx;
      ay = by;
    }
    for (let j = 0; j < SCAR_EMBERS; j += 1) {
      const t = 0.1 + 0.9 * glint(scar.seed + 11, j);
      const life = age - glint(scar.seed + 13, j) * 0.6 * scar.maxLife;
      if (life < 0) continue;
      const side = (glint(scar.seed + 17, j) - 0.5) * 2 * (2 + life * 22);
      const fade = Math.max(0, 1 - life / (0.55 * scar.maxLife + 0.3));
      const flicker = 0.6 + 0.4 * glint(j * 1.7, Math.floor(life * 14));
      glow.push(
        scar.x + dx * t + nx * side,
        SCAR_H + 1 + life * 14,
        scar.y + dy * t + ny * side,
        ember,
        3 + 3 * glint(j, scar.seed),
        fade * flicker,
        2.2
      );
    }
    for (let j = 0; j < 4; j += 1) {
      const t = (j + 0.5) / 4 + (glint(scar.seed, j + 30) - 0.5) * 0.15;
      smoke.push(
        scar.x + dx * t,
        SCAR_H + 3 + age * 8,
        scar.y + dy * t,
        SCAR_SOOT,
        7 + age * 10,
        0.35 * k
      );
    }
  });
}

// The Harmonic beam's Kinetic form (approved 22/11): ×5, a rock it killed
// bursts into SHARD_COUNT heavy shards, hot at the head, flying on along the
// beam within SHARD_SPREAD rad over SHARD_REACH px; ×3/×5, grit streaming
// off each fragment it flung.
const SHARD_COUNT = 11;
const SHARD_SPREAD = 0.7;
const SHARD_REACH = 175;
const SHARD_COLORS = { tail: '#ff5a14', head: '#ffd2a0' };

function mirrorShards(THREE, combat, batches) {
  const { ribbons, glow } = batches;
  const tail = rgbOf(THREE, SHARD_COLORS.tail);
  const head = rgbOf(THREE, SHARD_COLORS.head);
  combat.weapons.shards.forEach((burst) => {
    const k = burst.life / burst.maxLife;
    const gain = Math.min(1, k * 2);
    const t = Math.sqrt(1 - k);
    for (let i = 0; i < SHARD_COUNT; i += 1) {
      const angle = burst.angle + (glint(burst.seed, i) - 0.5) * SHARD_SPREAD;
      const r0 = 10 + SHARD_REACH * (0.55 + 0.45 * glint(i, burst.seed)) * t;
      const r1 = Math.max(0, r0 - (14 + 34 * k));
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const x = burst.x + c * r0;
      const y = burst.y + s * r0;
      ribbons.streak(
        burst.x + c * r1,
        burst.y + s * r1,
        x,
        y,
        ARC_H,
        tail,
        5,
        1.8 * gain
      );
      ribbons.streak(
        x - c * 8,
        y - s * 8,
        x,
        y,
        ARC_H + 0.2,
        head,
        3,
        2.4 * gain
      );
      glow.push(x, ARC_H + 0.4, y, tail, 6, 0.8 * gain, 1.6);
    }
  });
  combat.weapons.flung.forEach((flung) => {
    const { enemy } = flung;
    if (enemy.destroyed || enemy.id !== flung.id) return;
    const speed = Math.hypot(enemy.vx || 0, enemy.vy || 0);
    if (speed < 1) return;
    const k = 1 - flung.age / flung.trail;
    if (k <= 0) return;
    const ux = (enemy.vx || 0) / speed;
    const uy = (enemy.vy || 0) / speed;
    const r = (enemy.radius || 8) * 0.6;
    if (flung.fire) {
      pushBurningPiece(THREE, batches, flung, ux, uy, k);
      return;
    }
    // never longer than the way it has flown: it does not reach back to
    // the rock it came from
    const len = Math.min(14 + 26 * k, 0.6 * speed * flung.age);
    if (len < 2) return;
    ribbons.streak(
      enemy.x - ux * (r + len),
      enemy.y - uy * (r + len),
      enemy.x - ux * r,
      enemy.y - uy * r,
      ARC_H,
      tail,
      4,
      1.2 * k
    );
    for (let j = 0; j < 4; j += 1) {
      const back = r + len * (0.2 + 0.25 * j);
      const side = (glint(flung.seed, j) - 0.5) * 8;
      glow.push(
        enemy.x - ux * back - uy * side,
        ARC_H,
        enemy.y - uy * back + ux * side,
        head,
        2.5,
        0.7 * k * glint(j, flung.seed + 1),
        2
      );
    }
  });
}

// The Harmonic beam's Field ×5 trench (approved 22/11; Renderer3D bends
// space toward it): matter falling in from both sides onto a dark seam.
// TRENCH_MOTES motes a side, each falling square onto the seam from the
// reach over 1 / TRENCH_RATE s, faster and brighter as it nears (a streak
// TRENCH_TAIL of its fall long), then again from a new point along it; the
// seam a violet tube, a white core and dark smoke.
const TRENCH_MOTES = 15;
const TRENCH_RATE = 1.3;
const TRENCH_TAIL = 0.35; // of the fall
const TRENCH_SLANT = 0.15; // the most a fall leans along the seam, per px
const TRENCH_SMOKE = 7;

function mirrorTrench(THREE, trench, batches, white) {
  const { ribbons, smoke } = batches;
  const violet = rgbOf(THREE, WEAPON_APEX.field.look.outer);
  const k = trench.life / trench.maxLife;
  const age = trench.maxLife - trench.life;
  const grow = Math.min(1, (1 - k) * 8) * Math.min(1, k * 3);
  const dx = trench.ex - trench.x;
  const dy = trench.ey - trench.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // how far a mote is from the seam at `p` of its fall (accelerating in)
  const fall = (p) => trench.reach * (1 - Math.max(0, p) ** 2);
  for (let side = -1; side <= 1; side += 2) {
    for (let m = 0; m < TRENCH_MOTES; m += 1) {
      const clock = glint(m, side * 3.7) + age * TRENCH_RATE;
      const p = clock % 1;
      const fallSeed = m * 1.3 + side + Math.floor(clock) * 7.1;
      // the seam starts a little ahead of the muzzle
      const u = 0.1 + 0.88 * glint(fallSeed, 2.9);
      const lean = TRENCH_SLANT * (glint(fallSeed, 5.3) - 0.5) * 2;
      const px = trench.x + dx * u;
      const py = trench.y + dy * u;
      const ox = -uy * side + ux * lean;
      const oy = ux * side + uy * lean;
      const head = fall(p);
      const tail = fall(p - TRENCH_TAIL);
      const gain = grow * Math.min(1, p * 3) * (0.3 + p);
      ribbons.streak(
        px + ox * tail,
        py + oy * tail,
        px + ox * head,
        py + oy * head,
        ARC_H,
        violet,
        1.5,
        1.4 * gain
      );
    }
  }
  for (let j = 0; j < TRENCH_SMOKE; j += 1) {
    const t = (j + 0.5) / TRENCH_SMOKE;
    smoke.push(
      trench.x + dx * t,
      ARC_H,
      trench.y + dy * t,
      WELL_DARK,
      12,
      0.7 * grow
    );
  }
  const { x, y, ex, ey } = trench;
  ribbons.tube(x, y, ex, ey, ARC_H + 0.5, violet, 2.4, 0.7 * grow);
  ribbons.tube(x, y, ex, ey, ARC_H + 0.5, white, 0.4, 0.6 * grow);
}

// Implosion and the Gravity Warhead: what a burst drags in crackles in the
// Singularity's violet while it falls (the well spirals at the centre:
// CardEffects' wells).
function mirrorImplosions(THREE, implosions, ribbons, white) {
  const rgb = rgbOf(THREE, WEAPON_APEX.field.look.outer);
  implosions.forEach((imp) =>
    imp.caught.forEach(({ enemy, id }) => {
      if (!enemy.destroyed && enemy.id === id) {
        pushStatic(ribbons, enemy, rgb, white, 1.4);
      }
    })
  );
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
  if (combat.weapons.scars.length)
    mirrorScars(THREE, combat.weapons.scars, batches);
  if (combat.weapons.shards.length || combat.weapons.flung.length) {
    mirrorShards(THREE, combat, batches);
  }
  if (combat.weapons.trench)
    mirrorTrench(THREE, combat.weapons.trench, batches, white);
  if (combat.weapons.glances.length)
    mirrorGlances(THREE, combat.weapons.glances, ribbons);
  if (combat.weapons.kindled.length) {
    mirrorKindled(THREE, combat.weapons.kindled, batches, staticFrame / 60);
  }
  if (combat.weapons.scraps.length)
    mirrorScraps(THREE, combat.weapons.scraps, batches);
  if (combat.weapons.implosions.length) {
    mirrorImplosions(THREE, combat.weapons.implosions, ribbons, white);
  }
  if (combat.weapons.gravityWells.length) {
    mirrorImplosions(THREE, combat.weapons.gravityWells, ribbons, white);
  }
  if (combat.weapons.lodged.length)
    mirrorLodged(THREE, combat.weapons.lodged, batches);
  if (combat.weapons.thermite.length)
    mirrorThermite(THREE, combat.weapons.thermite, batches);

  // Thruster trails: Cinder Trail embers, Ion Trail as a cyan ribbon.
  const cinderRgb = rgbOf(THREE, WEAPON_EVOLUTIONS.thermal.look.trail);
  combat.cards.cinders.forEach((c) => {
    const k = c.life / c.maxLife;
    glow.push(c.x, TRAIL_H, c.y, cinderRgb, 6 + 6 * k, 0.6 * k);
  });
  // The ion trail crackles (a kinked bolt per segment, re-kinked as it
  // fades) so it reads apart from the cyan exhaust it sits on.
  const ionRgb = rgbOf(THREE, PALETTE.player);
  const ions = combat.cards.ions;
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
  const burnLine = combat.cards.afterburnTrail;
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
  combat.cards.slows.forEach((entry, enemy) => {
    pushStatic(ribbons, enemy, fieldRgb, white, 1);
  });
  // Singularity: each pulled machine crackles harder; at each hit point
  // matter spirals in to a dark core over the pull.
  const singularityRgb = rgbOf(THREE, WEAPON_APEX.field.look.outer);
  combat.cards.pulls.forEach((entry, enemy) => {
    pushStatic(ribbons, enemy, singularityRgb, white, 1.4);
  });
  const pull = WEAPON_APEX.field.pull;
  combat.cards.wells.forEach((well) => {
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

  // a bolt's forks wear its family's colour; the kinetic family's is a rail
  const familyRgb = combat.weapons.hasEvolution('thermal')
    ? rgbOf(THREE, BOLT_THERMAL)
    : combat.weapons.hasEvolution('field')
      ? rgbOf(THREE, WEAPON_EVOLUTIONS.field.look.trail)
      : null;
  const rail = combat.weapons.hasEvolution('kinetic');
  const railRgb = rgbOf(THREE, RAIL_RGB);
  const lanceArc = combat.weapons.lanceLook.arc || PALETTE.player;
  combat.cards.arcs.forEach((arc) => {
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
      if (rail) pushRail(batches, flashes, arc, k, s, railRgb, white);
      else
        pushBolt(
          batches,
          flashes,
          arc,
          n,
          k,
          s,
          arcRgb,
          familyRgb || arcRgb,
          white
        );
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
  combat.weapons.flakBursts.forEach((burst) => {
    if (burst.lit) flashes.observe(burst, rgbOf(THREE, burst.colors.burst));
  });

  combat.weapons.beams.forEach((beam) => {
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
    const [along, nose] = BEAM_NOSE;
    glow.push(
      beam.x + (beam.ex - beam.x) * along,
      BEAM_H + 1,
      beam.y + (beam.ey - beam.y) * along,
      glowRgb,
      beam.width * nose,
      k,
      1.6
    );
    glow.push(
      beam.ex,
      BEAM_H,
      beam.ey,
      glowRgb,
      beam.width * BEAM_END,
      0.7 * k
    );
    flashes.observe(beam, glowRgb);
  });
}
