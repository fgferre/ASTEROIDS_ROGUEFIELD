// The Scatter Coil fan's own family forms in 3D (approved 23/11, see
// combat/fanForms.js): Grapeshot's glance lines, Kindling's flames, and the
// Scrap Rounds shard, drawn into Renderer3D's shared batches.

import { SHOT_SHAPES, glint, rgbOf } from './batches.js';

const ARC_H = 8; // as weaponMirror's arcs
const FLAK_H = 4; // as weaponMirror's flak bolts

// The Scatter fan's own forms (approved 23/11). Grapeshot: the line a bolt
// glances off along, a thin amber streak from where it glanced.
const GLANCE_RGB = '#ffb45a';

export function mirrorGlances(THREE, glances, ribbons) {
  const rgb = rgbOf(THREE, GLANCE_RGB);
  glances.forEach((g) => {
    const k = g.fade === null ? 1 : g.fade / g.maxFade;
    ribbons.streak(g.x0, g.y0, g.x, g.y, FLAK_H, rgb, 1.3, 0.9 * k);
  });
}

// Kindling: a rock or machine burning from inside throws flames off its
// rim, KINDLE_TONGUES of them, each licking out over 1 / KINDLE_RATE s
// (growing, then dying back) with a wavering tip: a dark orange-red tongue
// round a yellow core, a drift of soot over it; its pieces fly off trailing
// a flame (pushBurningPiece). No ring: the rock's own cracks run molten
// (rocks.js `kindled`).
const KINDLE_TONGUES = 6;
const KINDLE_RATE = 1.4;
const FLAME_OUTER = '#ff4a10';
const FLAME_CORE = '#ffc35a';
const KINDLE_SOOT = [0.07, 0.05, 0.045];

// One flame from its root (x, y) along (ux, uy), `length` long and `width`
// wide at its base; `wave` (0..1) bends its tip.
function pushFlame(THREE, batches, x, y, ux, uy, length, width, gain, wave) {
  const { ribbons, glow } = batches;
  const outer = rgbOf(THREE, FLAME_OUTER);
  const core = rgbOf(THREE, FLAME_CORE);
  const bend = (wave - 0.5) * length * 0.5;
  const tx = x + ux * length - uy * bend;
  const ty = y + uy * length + ux * bend;
  // a streak is full near its head: the head at the root, the tail the tip
  ribbons.streak(tx, ty, x, y, ARC_H, outer, width, 1.6 * gain);
  ribbons.streak(
    x + (tx - x) * 0.5,
    y + (ty - y) * 0.5,
    x,
    y,
    ARC_H + 0.2,
    core,
    width * 0.45,
    1.8 * gain
  );
  glow.push(x, ARC_H, y, outer, width * 1.6, 0.35 * gain, 1.4);
}

export function mirrorKindled(THREE, kindled, batches, time) {
  kindled.forEach((k) => {
    const { enemy } = k;
    if (enemy.destroyed || enemy.id !== k.id) return;
    const r = enemy.radius || 10;
    for (let i = 0; i < KINDLE_TONGUES; i += 1) {
      const clock = time * KINDLE_RATE + glint(k.seed, i);
      const p = clock % 1;
      const angle = glint(k.seed + Math.floor(clock), i * 3.1) * Math.PI * 2;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const grow = Math.sin(Math.PI * p);
      pushFlame(
        THREE,
        batches,
        enemy.x + ux * r * 0.8,
        enemy.y + uy * r * 0.8,
        ux,
        uy,
        r * (0.4 + 0.8 * grow),
        r * 0.45,
        grow,
        glint(k.seed + i, Math.floor(time * 12))
      );
    }
    const drift = (time * 0.7 + glint(k.seed, 9)) % 1;
    batches.smoke.push(
      enemy.x + r * 0.6 * drift,
      ARC_H + 4 + drift * 6,
      enemy.y - r * 0.8 * drift,
      KINDLE_SOOT,
      r * (1.1 + drift),
      0.35 * (1 - drift)
    );
  });
}

/**
 * A Kindling piece flung burning (beamForms' `flung`, `fire`): a flame
 * streaming back from it along its flight (ux, uy), shorter as it settles
 * (`k` 1 → 0), and soot behind.
 */
export function pushBurningPiece(THREE, batches, flung, ux, uy, k) {
  const { enemy } = flung;
  const r = enemy.radius || 8;
  const length = r * (1 + 2.5 * k);
  const wave = glint(flung.seed, Math.floor(flung.age * 12));
  pushFlame(
    THREE,
    batches,
    enemy.x - ux * r * 0.5,
    enemy.y - uy * r * 0.5,
    -ux,
    -uy,
    length,
    r * 0.8,
    0.5 + 0.5 * k,
    wave
  );
  batches.smoke.push(
    enemy.x - ux * (r + length),
    ARC_H + 3,
    enemy.y - uy * (r + length),
    KINDLE_SOOT,
    r * 1.4,
    0.3 * k
  );
}

// A Scrap Rounds shard (approved 23/11): a torn piece of dull plate
// tumbling end over end (its width breathing as it turns), glinting when it
// faces the eye, one edge still hot, a thin cooling trail behind.
const SCRAP_STEEL = '#7d766f';
const SCRAP_HOT = '#ff6a1e';
const SCRAP_SPIN = 14; // rad/s in the plane
const SCRAP_TUMBLE = 9; // rad/s end over end
const SCRAP_LENGTH = 6;
const SCRAP_WIDTH = 4.5;
const SCRAP_GAIN = 1.3;

// The shard at (x, y), its flight along `heading`, `age` s since thrown.
function pushScrapBody(THREE, batches, x, y, heading, age) {
  const hot = rgbOf(THREE, SCRAP_HOT);
  const steel = rgbOf(THREE, SCRAP_STEEL);
  const turn = Math.abs(Math.cos(age * SCRAP_TUMBLE));
  const angle = heading + age * SCRAP_SPIN;
  batches.lances.push(
    x,
    y,
    FLAK_H,
    angle,
    SCRAP_LENGTH,
    SCRAP_WIDTH * (0.3 + 0.7 * turn),
    steel,
    SCRAP_GAIN,
    SHOT_SHAPES.scrap
  );
  // the torn edge, still hot, on its trailing end
  const ex = x - Math.cos(angle) * SCRAP_LENGTH * 0.8;
  const ey = y - Math.sin(angle) * SCRAP_LENGTH * 0.8;
  const sx = Math.sin(angle) * SCRAP_WIDTH * 0.7;
  const sy = Math.cos(angle) * SCRAP_WIDTH * 0.7;
  batches.ribbons.streak(
    ex - sx,
    ey + sy,
    ex + sx,
    ey - sy,
    FLAK_H + 0.3,
    hot,
    1.4,
    1.6
  );
  batches.glow.push(ex, FLAK_H + 0.5, ey, hot, 4, 0.5, 1.2);
  // a glint as a face turns to the eye
  if (turn > 0.9) {
    batches.glow.push(x, FLAK_H + 1, y, steel, 7, (turn - 0.9) * 8, 1.6);
  }
}

/** A Scrap Rounds shard in flight (a flak bolt of a `scrap` volley). */
export function pushScrap(THREE, batches, bullet, pushTrail) {
  pushTrail(bullet, rgbOf(THREE, SCRAP_HOT), 1.1, 0.6);
  const age = bullet.scrapAge + bullet.maxLife - bullet.life;
  const heading = Math.atan2(bullet.vy || 0, bullet.vx || 1);
  pushScrapBody(THREE, batches, bullet.x, bullet.y, heading, age);
}

/** The scrap a kill threw, tumbling before it fires (fanForms' `scraps`). */
export function mirrorScraps(THREE, scraps, batches) {
  scraps.forEach((s) => {
    const heading = Math.atan2(s.vy, s.vx) + glint(s.seed, 1) * Math.PI;
    pushScrapBody(THREE, batches, s.x, s.y, heading, s.age);
  });
}
