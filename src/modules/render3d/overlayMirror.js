// The overlays (hit markers, the boss-transition border,
// the lock marks, the magnetism field), mirrored every frame into
// Renderer3D's WebGL kit (`t`) and its DOM boss flash.

import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';
import { PALETTE, withAlpha } from '../../data/constants/palette.js';
import { HALF_H, HALF_W } from './batches.js';

const OVERLAY_H = 9;

// The overlays as flat ribbons on the field plane and camera-facing
// sprites. `flashScale`: Reduce Flashing (0.3) or 1.
export function mirrorOverlays(t, player, effects, xpOrbs, combat, flashScale) {
  const { ribbons } = t;
  const alive =
    player &&
    !player.isDead &&
    !player.isRetrying &&
    !player._quitExplosionHidden &&
    player.position;

  if (effects) {
    mirrorBossTransitions(t, effects.bossTransitionEffects, flashScale);
  }

  if (!alive) return;
  const { x: px, y: py } = player.position;
  mirrorLocks(t, combat);

  const orbs = xpOrbs?.xpOrbs || [];
  const radius = player.getMagnetismRadius() || xpOrbs.getMagnetismRadius();
  const gain = magnetRingGain(orbs, px, py, radius);
  if (gain > 0) {
    const dashes = Math.max(12, Math.round((Math.PI * 2 * radius) / 6));
    ribbons.circle(px, py, radius, OVERLAY_H, t.accentRgb, 1, gain, dashes);
  }
}

// The pull ring fades out as the nearest orb is 1.5 pull radii away.
const MAGNET_RING_FADE = 1.5;
const MAGNET_RING_GAIN = 0.25;

// How strongly the pull ring shows: full while an uncollected orb is inside
// the pull radius, none once the nearest is MAGNET_RING_FADE radii away.
export function magnetRingGain(orbs, px, py, radius) {
  let nearest = Infinity;
  for (let i = 0; i < orbs.length; i += 1) {
    const orb = orbs[i];
    if (orb && !orb.collected) {
      nearest = Math.min(nearest, Math.hypot(orb.x - px, orb.y - py));
    }
  }
  const away = (nearest / radius - 1) / (MAGNET_RING_FADE - 1);
  return MAGNET_RING_GAIN * Math.min(1, Math.max(0, 1 - away));
}

// An Aegis's ward (behaviors/ward.js): a faint lime link to each machine it
// covers, as strong as its ward is whole. proposta 20/10.
const WARD_LINK_WIDTH = 1;
const WARD_LINK_GAIN = 0.3;
// proposta 18/11 (efeito/impacto): a link that drops (the ward breaks, the
// Aegis or the machine it covers dies or leaves its reach) snaps. It breaks
// at `cut` of its length and each half pulls back to its own end (following
// it while it lives) over `seconds`, fading from at least `floor` × the full
// link's gain, so a ward drained by its last hit still shows it; `sparks`
// short sparks spit from the break, either side, within `cone` rad of the
// link's normal, and fade.
const WARD_SNAP = {
  seconds: 0.3,
  floor: 0.5,
  cut: [0.4, 0.6],
  sparks: 4,
  speed: [70, 150], // px/s
  life: [0.12, 0.24], // s
  drag: 6,
  cone: 0.8,
  stretch: 0.04, // s of its travel a spark shows
  maxLength: 6, // px
  width: 0.8,
  gain: 1.2,
};
const WARD_LINKS_MAX = 64;
const WARD_SNAP_POOL = 24;
const WARD_SPARK_POOL = 64;

const within = ([lo, hi], k) => lo + (hi - lo) * k;

function hash01(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Room for `size` links: each one's Aegis and covered machine, their ids
// (enemies are pooled: the same object comes back as another machine), its
// two ends (ax, ay, bx, by) and its gain.
function linkSlots(size) {
  return {
    count: 0,
    owner: new Array(size).fill(null),
    other: new Array(size).fill(null),
    ownerId: new Array(size).fill(null),
    otherId: new Array(size).fill(null),
    ends: new Float32Array(size * 4),
    gain: new Float32Array(size),
  };
}

function sameLink(a, i, b, j) {
  return (
    a.owner[i] === b.owner[j] &&
    a.other[i] === b.other[j] &&
    a.ownerId[i] === b.ownerId[j] &&
    a.otherId[i] === b.otherId[j]
  );
}

function copyLink(from, i, to, j) {
  to.owner[j] = from.owner[i];
  to.other[j] = from.other[i];
  to.ownerId[j] = from.ownerId[i];
  to.otherId[j] = from.otherId[i];
  for (let k = 0; k < 4; k += 1) to.ends[j * 4 + k] = from.ends[i * 4 + k];
  to.gain[j] = from.gain[i];
}

// A snap's end keeps up with its machine while that machine lives on.
function follow(enemy, id, ends, o) {
  if (!enemy?.alive || enemy.id !== id) return;
  ends[o] = enemy.x;
  ends[o + 1] = enemy.y;
}

/**
 * The Aegis ward links, and their snap when one drops: last frame's links
 * are kept to see which are gone. Plain arrays, nothing allocated per
 * frame; jitter is a hash of a running counter (no Math.random).
 */
export class WardLinks {
  constructor() {
    this.drawn = linkSlots(WARD_LINKS_MAX);
    this.spare = linkSlots(WARD_LINKS_MAX);
    // a snap is the link it was, its age (s) and where it broke
    this.snaps = linkSlots(WARD_SNAP_POOL);
    this.snapAge = new Float32Array(WARD_SNAP_POOL).fill(WARD_SNAP.seconds);
    this.snapCut = new Float32Array(WARD_SNAP_POOL);
    this.nextSnap = 0;
    this.sparkX = new Float32Array(WARD_SPARK_POOL);
    this.sparkY = new Float32Array(WARD_SPARK_POOL);
    this.sparkVx = new Float32Array(WARD_SPARK_POOL);
    this.sparkVy = new Float32Array(WARD_SPARK_POOL);
    this.sparkLife = new Float32Array(WARD_SPARK_POOL);
    this.sparkMax = new Float32Array(WARD_SPARK_POOL);
    this.nextSpark = 0;
    this.roll = 0;
  }

  rand() {
    this.roll += 1;
    return hash01(this.roll);
  }

  clear() {
    this.drawn.count = 0;
    this.spare.count = 0;
    this.snapAge.fill(WARD_SNAP.seconds);
    this.sparkLife.fill(0);
  }

  /**
   * Draws the links `enemies` hold now into `t.ribbons`, snaps those drawn
   * last frame that are gone and ages the snaps by `dt` s; `flashScale`
   * (Reduce Flashing: 0.3) dims their sparks.
   */
  update(dt, t, enemies, flashScale) {
    const { ribbons, statusRgb } = t;
    const was = this.drawn;
    const now = this.spare;
    now.count = 0;
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      const links = enemy?.wardLinks;
      if (!links?.length || enemy.destroyed) continue;
      const gain = WARD_LINK_GAIN * (enemy.wardRatio || 0);
      for (let j = 0; j < links.length; j += 1) {
        const other = links[j];
        ribbons.segment(
          enemy.x,
          enemy.y,
          other.x,
          other.y,
          OVERLAY_H,
          statusRgb,
          WARD_LINK_WIDTH,
          gain
        );
        if (now.count === WARD_LINKS_MAX) continue;
        const n = now.count;
        now.owner[n] = enemy;
        now.other[n] = other;
        now.ownerId[n] = enemy.id;
        now.otherId[n] = other.id;
        now.ends[n * 4] = enemy.x;
        now.ends[n * 4 + 1] = enemy.y;
        now.ends[n * 4 + 2] = other.x;
        now.ends[n * 4 + 3] = other.y;
        now.gain[n] = gain;
        now.count = n + 1;
      }
    }
    for (let i = 0; i < was.count; i += 1) {
      let kept = false;
      for (let j = 0; j < now.count && !kept; j += 1) {
        kept = sameLink(was, i, now, j);
      }
      if (!kept) this.snap(was, i);
    }
    this.drawn = now;
    this.spare = was;
    this.drawSnaps(dt, ribbons, statusRgb);
    this.drawSparks(dt, ribbons, statusRgb, flashScale);
  }

  // Link `i` of `links` drops: it snaps (once, while a snap of it shows).
  snap(links, i) {
    const { snaps, snapAge } = this;
    for (let k = 0; k < WARD_SNAP_POOL; k += 1) {
      if (snapAge[k] < WARD_SNAP.seconds && sameLink(snaps, k, links, i)) {
        return;
      }
    }
    const k = this.nextSnap;
    this.nextSnap = (k + 1) % WARD_SNAP_POOL;
    copyLink(links, i, snaps, k);
    snaps.gain[k] = Math.max(snaps.gain[k], WARD_LINK_GAIN * WARD_SNAP.floor);
    snapAge[k] = 0;
    const cut = within(WARD_SNAP.cut, this.rand());
    this.snapCut[k] = cut;

    const e = snaps.ends;
    const o = k * 4;
    const x = e[o] + (e[o + 2] - e[o]) * cut;
    const y = e[o + 1] + (e[o + 3] - e[o + 1]) * cut;
    const normal =
      Math.atan2(e[o + 3] - e[o + 1], e[o + 2] - e[o]) + Math.PI / 2;
    for (let s = 0; s < WARD_SNAP.sparks; s += 1) {
      const n = this.nextSpark;
      this.nextSpark = (n + 1) % WARD_SPARK_POOL;
      const angle =
        normal + (s % 2) * Math.PI + (this.rand() * 2 - 1) * WARD_SNAP.cone;
      const speed = within(WARD_SNAP.speed, this.rand());
      const life = within(WARD_SNAP.life, this.rand());
      this.sparkX[n] = x;
      this.sparkY[n] = y;
      this.sparkVx[n] = Math.cos(angle) * speed;
      this.sparkVy[n] = Math.sin(angle) * speed;
      this.sparkLife[n] = life;
      this.sparkMax[n] = life;
    }
  }

  // Each half from its end to where the break has pulled back to, fading.
  drawSnaps(dt, ribbons, rgb) {
    const { snaps, snapAge, snapCut } = this;
    const { seconds } = WARD_SNAP;
    const e = snaps.ends;
    for (let k = 0; k < WARD_SNAP_POOL; k += 1) {
      if (!(snapAge[k] < seconds)) continue;
      snapAge[k] += dt;
      if (snapAge[k] >= seconds) continue;
      const o = k * 4;
      follow(snaps.owner[k], snaps.ownerId[k], e, o);
      follow(snaps.other[k], snaps.otherId[k], e, o + 2);
      const p = snapAge[k] / seconds;
      const left = (1 - p) ** 3; // of each half still out: it springs back
      const gain = snaps.gain[k] * (1 - p);
      const cx = e[o] + (e[o + 2] - e[o]) * snapCut[k];
      const cy = e[o + 1] + (e[o + 3] - e[o + 1]) * snapCut[k];
      for (let end = o; end <= o + 2; end += 2) {
        const ax = e[end];
        const ay = e[end + 1];
        ribbons.segment(
          ax,
          ay,
          ax + (cx - ax) * left,
          ay + (cy - ay) * left,
          OVERLAY_H,
          rgb,
          WARD_LINK_WIDTH,
          gain
        );
      }
    }
  }

  drawSparks(dt, ribbons, rgb, flashScale) {
    const drag = Math.exp(-WARD_SNAP.drag * dt);
    for (let n = 0; n < WARD_SPARK_POOL; n += 1) {
      if (!(this.sparkLife[n] > 0)) continue;
      this.sparkLife[n] -= dt;
      if (this.sparkLife[n] <= 0) continue;
      this.sparkVx[n] *= drag;
      this.sparkVy[n] *= drag;
      this.sparkX[n] += this.sparkVx[n] * dt;
      this.sparkY[n] += this.sparkVy[n] * dt;
      const vx = this.sparkVx[n];
      const vy = this.sparkVy[n];
      const x = this.sparkX[n];
      const y = this.sparkY[n];
      const speed = Math.hypot(vx, vy);
      if (speed < 1) continue;
      const k = Math.min(WARD_SNAP.stretch, WARD_SNAP.maxLength / speed);
      const fade = this.sparkLife[n] / this.sparkMax[n];
      ribbons.streak(
        x - vx * k,
        y - vy * k,
        x,
        y,
        OVERLAY_H,
        rgb,
        WARD_SNAP.width,
        WARD_SNAP.gain * fade * flashScale
      );
    }
  }
}

// Gated by the aiming rank: rank 1 ring + line, rank 2 the predicted-aim
// marker, rank 3 every lock; nothing in manual aim. The lock line leaves the
// turret's axis at the height of the barrel aimed at that lock, so it reads
// as coming out of the turret from any camera angle.
export function mirrorLocks(t, combat) {
  if (!combat || combat.aimMode === 'manual') return;
  const rank = combat.targetingUpgradeLevel || 0;
  if (rank < 1) return;
  const { ribbons, accentRgb } = t;
  const multi = rank >= 3;
  const locks = combat.currentLockAssignments || [];
  const pulse = Math.max(
    0,
    Math.min(
      1,
      combat.targetIndicatorPulse / (combat.targetPulseDuration || 0.0001)
    )
  );
  const count = locks.length || (combat.currentTarget ? 1 : 0);
  for (let i = 0; i < count; i += 1) {
    if (!multi && i > 0) break;
    const lock = locks[i];
    const target = lock ? lock.enemy : combat.currentTarget;
    if (!target || target.destroyed) continue;
    const base = i === 0 ? combat.lockHighlightAlpha : combat.lockLineAlpha;
    const alpha = Math.min(1, (base || 0.6) + pulse * 0.25);
    const radius =
      (target.radius || 16) +
      6 +
      (lock?.duplicateIndex || 0) * 4 +
      pulse * (i === 0 ? 6 : 3.5);
    const dashes = Math.max(8, Math.round((Math.PI * 2 * radius) / 10));
    ribbons.circle(
      target.x,
      target.y,
      radius,
      OVERLAY_H,
      accentRgb,
      i === 0 ? 1.5 : 1,
      alpha * 0.8,
      dashes,
      0.6
    );
    const from = t.player.lockLineOrigin(i);
    ribbons.segment(
      from.x + HALF_W,
      from.z + HALF_H,
      target.x,
      target.y,
      OVERLAY_H,
      accentRgb,
      1,
      alpha * 0.3,
      from.y
    );
  }

  if (rank < 2 || !combat.usingDynamicPrediction()) return;
  const points = combat.predictedAimPoints || [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point?.position || (!multi && point.index > 0)) continue;
    const primary = point.index === 0;
    const alpha = primary ? 0.55 : 0.38;
    const radius =
      (combat.predictedMarkerRadius || 12) *
      (primary ? 1 : 0.82 + (point.duplicateIndex || 0) * 0.04);
    const { x, y } = point.position;
    ribbons.circle(x, y, radius, OVERLAY_H, accentRgb, 1, alpha);
    t.glow.push(x, OVERLAY_H, y, accentRgb, radius * 0.9, alpha * 0.3, 0.6);
  }
}

export function mirrorBossTransitions(t, list, flashScale) {
  let border = 0;
  let wash = 0;
  let width = 0;
  let color = PALETTE.boss;
  const effects = list || [];
  // Reduce Flashing: 30 % strength, a steady fade instead of the pulse, and
  // an effect starting under 0.34 s after another still showing is skipped.
  const reduced = flashScale < 1;
  for (let i = 0; i < effects.length; i += 1) {
    const e = effects[i];
    if (!e) continue;
    if (
      reduced &&
      effects.some((o) => o && o.timer > e.timer && o.timer - e.timer < 0.34)
    ) {
      continue;
    }
    const progress = Math.min(1, e.timer / e.duration);
    const fadePower = Number.isFinite(e.fadePower)
      ? Math.max(0.1, e.fadePower)
      : 1.5;
    const fade = Math.max(0, 1 - Math.pow(progress, fadePower));
    const frequency = Number.isFinite(e.pulseFrequency)
      ? e.pulseFrequency
      : 1.8;
    const pulse = reduced
      ? 1
      : 0.65 + 0.35 * Math.sin(progress * Math.PI * frequency);
    const b = e.maxAlpha * fade * pulse * flashScale;
    const w = e.overlayAlpha * fade * Math.min(1, pulse + 0.15) * flashScale;
    if (b > border) {
      border = b;
      width = e.borderWidth * (0.85 + 0.15 * pulse);
    }
    wash = Math.max(wash, w);
    if (e.color) color = e.color;
  }
  // quantized so the DOM is touched only when the look changes
  const key =
    border > 0.01 || wash > 0.01
      ? `${color}|${Math.round(border * 50)}|${Math.round(wash * 50)}|${Math.round(width)}`
      : '';
  if (key === t.bossFlashKey) return;
  t.bossFlashKey = key;
  const style = t.bossFlash.style;
  if (!key) {
    style.opacity = '0';
    return;
  }
  // canvas px are logical px × the scale of the 800×600 box that fits it
  const scale =
    Math.min(
      t.canvas.clientWidth / GAME_WIDTH,
      t.canvas.clientHeight / GAME_HEIGHT
    ) || 1;
  const px = Math.max(1, width * scale);
  style.opacity = '1';
  style.background = withAlpha(color, wash);
  style.boxShadow = `inset 0 0 ${px * 1.4}px ${px}px ${withAlpha(color, border)}`;
}
