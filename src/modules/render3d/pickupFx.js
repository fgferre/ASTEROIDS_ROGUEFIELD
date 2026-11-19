// What a pickup taken shows (proposta 18/11, the owner's pick from a
// mock-up): no ring and no flash. The token's frame breaks into a few small
// bits of its colour that fly into the ship and go out as they reach it; then
// the hull answers, following the ship: repair and the health heart light
// small points of their green over it with a faint glow beneath, stasis
// frosts it with tiny four-point twinkles and a cool tint, overcharge runs a
// few orange sparks along its outline (held still under Reduced Motion).
// Salvage, magnet and pulse: the bits only. Drawn into the shared glow and
// ribbon batches; plain typed arrays, jitter from a hash of a running counter
// (never Math.random).

import { PICKUP_KINDS, PICKUP_TOKEN } from '../../data/pickups.js';
import { rgbOf } from './batches.js';
import { VISUAL_SCALE } from './hullModel.js';

// The kinds by index: the field pickups', then the health heart.
const KINDS = [...Object.keys(PICKUP_KINDS), 'heart'];
const LOOK = Object.freeze({ none: 0, mend: 1, frost: 2, sparks: 3 });
const HULL_LOOK = {
  repair: LOOK.mend,
  heart: LOOK.mend,
  stasis: LOOK.frost,
  overcharge: LOOK.sparks,
};

// The bits: how many a frame breaks into, where they start (× the token's
// radius), how far out they are flung before the ship pulls them in (px),
// their flight (s), size and hot core (world units), gains, the trail (share
// of the flight behind them) and height.
const BIT_POOL = 36;
const BIT_COUNT = [4, 6];
const BIT_FRAME = 0.85;
const BIT_FLING = 7;
const BIT_FLIGHT = [0.15, 0.25];
const BIT_SIZE = 3.6;
const BIT_CORE = 1.5;
const BIT_GAIN = 1.6;
const BIT_CORE_GAIN = 2.2;
const BIT_TRAIL = 0.12;
const BIT_HEIGHT = 7;

// The hull's answer starts as the first bits land (s after the take).
const HULL_POOL = 6;
const HULL_DELAY = BIT_FLIGHT[0];
// Points on the hull as (along, across) fractions of its reach: along + of
// the nose's, − of the tail's, across of the half span; read off the three
// hulls' outlines so each sits on the plating. In order from the nose back:
// nose, flanks, mid wings, wing tips, tail.
const HULL_POINTS = [
  0.7, 0, -0.1, 0.3, -0.1, -0.3, -0.35, 0.55, -0.35, -0.55, -0.6, 0.8, -0.6,
  -0.8, -0.55, 0,
];
const POINTS = HULL_POINTS.length / 2;
// The overcharge sparks' loop round the outline, as HULL_POINTS indices.
const LOOP = [0, 1, 3, 5, 7, 6, 4, 2];
// Above the deck, the wings' banked tips and the turret's barrels.
const HULL_HEIGHT = 9;
// The glow beneath the ship: size (× the hull's reach), alpha and gain.
const UNDER_SIZE = 1.3;
const UNDER_HEIGHT = -1;
const UNDER_ALPHA = 0.15;
const UNDER_GAIN = 0.6;
// A light's share of its life spent rising; it eases out over the rest.
const RISE = 0.15;

// Repair and the heart: the points light one after another from the nose
// back (s apart, plus jitter), each for MEND_LIFE s; all out by MEND_SPAN.
const MEND_SPAN = 0.8;
const MEND_STAGGER = 0.045;
const MEND_JITTER = 0.06;
const MEND_LIFE = 0.42;
const MEND_SIZE = 2.4;
const MEND_GAIN = 2.2;

// Stasis: a star per point, starting within FROST_SPREAD s, arms (px from
// the centre) that grow with the light; all out by FROST_SPAN.
const FROST_SPAN = 1.5;
const FROST_SPREAD = 0.85;
const FROST_LIFE = [0.45, 0.6];
const FROST_ARM = 3.4;
const FROST_WIDTH = 0.9;
const FROST_CORE = 1.6;
const FROST_GAIN = 1.6;
const FROST_RGB = [0.7, 0.88, 1.2]; // linear, pale blue-white
const FROST_HOT = [1.2, 1.35, 1.5];

// Overcharge: sparks starting within SPARK_SPREAD s, running round LOOP at
// SPARK_RATE points a second with a tail SPARK_LENGTH points long; all out
// by SPARK_SPAN.
const SPARK_SPAN = 1;
const SPARK_COUNT = 4;
const SPARK_SPREAD = 0.35;
const SPARK_LIFE = [0.45, 0.6];
const SPARK_RATE = [4, 6];
const SPARK_LENGTH = 0.45;
const SPARK_WIDTH = 1.4;
const SPARK_CORE = 1.6;
const SPARK_GAIN = 2.4;

const HULL_SPAN = [0, MEND_SPAN, FROST_SPAN, SPARK_SPAN];

function hash01(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 0 → 1 over the first RISE of a life `k` (0 → 1), then easing out to 0.
function envelope(k) {
  if (!(k > 0 && k < 1)) return 0;
  return k < RISE ? k / RISE : ((1 - k) / (1 - RISE)) ** 2;
}

export class PickupFx {
  constructor() {
    this.x = new Float32Array(BIT_POOL);
    this.y = new Float32Array(BIT_POOL);
    this.ox = new Float32Array(BIT_POOL);
    this.oy = new Float32Array(BIT_POOL);
    this.age = new Float32Array(BIT_POOL);
    this.flight = new Float32Array(BIT_POOL);
    this.kind = new Uint8Array(BIT_POOL);
    this.next = 0;
    this.hullKind = new Uint8Array(HULL_POOL);
    this.hullLook = new Uint8Array(HULL_POOL); // LOOK.none: a free slot
    this.hullAge = new Float32Array(HULL_POOL);
    this.hullSeed = new Uint32Array(HULL_POOL);
    this.hullNext = 0;
    this.roll = 0;
    // the posed ship (pose) and the last hull point (at)
    this.sx = this.sy = this.cos = this.sin = 0;
    this.nose = this.tail = this.span = this.reach = 0;
    this.px = this.py = 0;
    this.scratch = [0, 0, 0];
  }

  rand() {
    this.roll += 1;
    return hash01(this.roll);
  }

  /** A pickup of `kind` (a PICKUP_KINDS key, or 'heart') taken at (x, y). */
  emit(kind, x, y) {
    const k = KINDS.indexOf(kind);
    if (k < 0) return;
    const count =
      BIT_COUNT[0] +
      Math.floor(this.rand() * (BIT_COUNT[1] - BIT_COUNT[0] + 1));
    const base = this.rand() * Math.PI * 2;
    const radius = PICKUP_TOKEN.radius * BIT_FRAME;
    for (let b = 0; b < count; b += 1) {
      const i = this.next;
      this.next = (this.next + 1) % BIT_POOL;
      const angle =
        base + ((b + (this.rand() - 0.5) * 0.5) / count) * Math.PI * 2;
      this.ox[i] = Math.cos(angle);
      this.oy[i] = Math.sin(angle);
      this.x[i] = x + this.ox[i] * radius;
      this.y[i] = y + this.oy[i] * radius;
      this.age[i] = 0;
      this.flight[i] =
        BIT_FLIGHT[0] + (BIT_FLIGHT[1] - BIT_FLIGHT[0]) * this.rand();
      this.kind[i] = k;
    }
    const look = HULL_LOOK[kind];
    if (!look) return;
    const e = this.hullNext;
    this.hullNext = (this.hullNext + 1) % HULL_POOL;
    this.hullKind[e] = k;
    this.hullLook[e] = look;
    this.hullAge[e] = -HULL_DELAY;
    this.roll += 1;
    this.hullSeed[e] = this.roll << 6;
  }

  /**
   * Advances by `dt` s and draws into `t.glow` and `t.ribbons` on the ship
   * `player` as `t.player` draws it. `scale`: Reduce Flashing's dimmer (1
   * normally); `still`: Reduced Motion, the sparks hold their place.
   */
  update(dt, t, player, scale = 1, still = false) {
    const hull = t.player.geometry;
    const ship = t.player.group.visible && hull && player?.position;
    if (ship) this.pose(player, hull);
    for (let i = 0; i < BIT_POOL; i += 1) {
      if (!(this.age[i] < this.flight[i])) continue;
      this.age[i] += dt;
      const u = this.age[i] / this.flight[i];
      if (u >= 1 || !ship) continue;
      const rgb = this.rgbOf(t, this.kind[i]);
      this.bitAt(i, Math.max(0, u - BIT_TRAIL));
      const tx = this.px;
      const ty = this.py;
      this.bitAt(i, u);
      const size = BIT_SIZE * (1 - 0.35 * u);
      const { px, py } = this;
      t.ribbons.streak(
        tx,
        ty,
        px,
        py,
        BIT_HEIGHT,
        rgb,
        size * 0.4,
        BIT_GAIN * scale
      );
      t.glow.push(px, BIT_HEIGHT, py, rgb, size, 1, BIT_GAIN * scale);
      t.glow.push(
        px,
        BIT_HEIGHT + 0.5,
        py,
        this.hot(rgb),
        BIT_CORE * (1 - 0.35 * u),
        1,
        BIT_CORE_GAIN * scale
      );
    }
    for (let e = 0; e < HULL_POOL; e += 1) {
      const look = this.hullLook[e];
      if (!look) continue;
      const age = (this.hullAge[e] += dt);
      if (age >= HULL_SPAN[look]) {
        this.hullLook[e] = LOOK.none;
        continue;
      }
      if (age < 0 || !ship) continue;
      const rgb = this.rgbOf(t, this.hullKind[e]);
      const seed = this.hullSeed[e];
      if (look === LOOK.mend) this.mend(t, seed, age, rgb, scale);
      else if (look === LOOK.frost) this.frost(t, seed, age, rgb, scale);
      else this.sparks(t, seed, age, rgb, scale, still);
    }
  }

  rgbOf(t, k) {
    const kind = KINDS[k];
    return kind === 'heart'
      ? t.statusRgb
      : rgbOf(t.THREE, PICKUP_KINDS[kind].color);
  }

  // Toward white, for a light's hot core.
  hot(rgb) {
    const out = this.scratch;
    out[0] = rgb[0] * 0.4 + 0.6;
    out[1] = rgb[1] * 0.4 + 0.6;
    out[2] = rgb[2] * 0.4 + 0.6;
    return out;
  }

  pose(player, hull) {
    const angle = player.angle || 0;
    this.sx = player.position.x;
    this.sy = player.position.y;
    this.cos = Math.cos(angle);
    this.sin = Math.sin(angle);
    this.nose = hull.maxX * VISUAL_SCALE;
    this.tail = -hull.minX * VISUAL_SCALE;
    this.span = hull.maxY * VISUAL_SCALE;
    this.reach = hull.extent * VISUAL_SCALE;
  }

  // Bit `i` at `u` of its flight: flung off the frame, pulled into the ship.
  bitAt(i, u) {
    const pull = u * u;
    const fling = BIT_FLING * Math.sin(Math.PI * u);
    this.px = this.x[i] + (this.sx - this.x[i]) * pull + this.ox[i] * fling;
    this.py = this.y[i] + (this.sy - this.y[i]) * pull + this.oy[i] * fling;
  }

  // A hull point given as (along, across) fractions, on the posed ship.
  at(along, across) {
    const lx = along * (along > 0 ? this.nose : this.tail);
    const ly = across * this.span;
    this.px = this.sx + lx * this.cos - ly * this.sin;
    this.py = this.sy + lx * this.sin + ly * this.cos;
  }

  // HULL_POINTS index `j`.
  point(j) {
    this.at(HULL_POINTS[j * 2], HULL_POINTS[j * 2 + 1]);
  }

  // `u` points round LOOP (any real; it wraps).
  onLoop(u) {
    const n = LOOP.length;
    const w = ((u % n) + n) % n;
    const i = Math.floor(w);
    const f = w - i;
    const a = LOOP[i] * 2;
    const b = LOOP[(i + 1) % n] * 2;
    this.at(
      HULL_POINTS[a] + (HULL_POINTS[b] - HULL_POINTS[a]) * f,
      HULL_POINTS[a + 1] + (HULL_POINTS[b + 1] - HULL_POINTS[a + 1]) * f
    );
  }

  under(t, rgb, k, scale) {
    t.glow.push(
      this.sx,
      UNDER_HEIGHT,
      this.sy,
      rgb,
      this.reach * UNDER_SIZE,
      UNDER_ALPHA * k,
      UNDER_GAIN * scale
    );
  }

  mend(t, seed, age, rgb, scale) {
    this.under(t, rgb, envelope(age / MEND_SPAN), scale);
    for (let j = 0; j < POINTS; j += 1) {
      const start = j * MEND_STAGGER + hash01(seed + j) * MEND_JITTER;
      const k = envelope((age - start) / MEND_LIFE);
      if (!k) continue;
      this.point(j);
      t.glow.push(
        this.px,
        HULL_HEIGHT,
        this.py,
        rgb,
        MEND_SIZE,
        k,
        MEND_GAIN * scale
      );
      t.glow.push(
        this.px,
        HULL_HEIGHT + 0.5,
        this.py,
        this.hot(rgb),
        MEND_SIZE * 0.4,
        k,
        MEND_GAIN * 1.3 * scale
      );
    }
  }

  // Four arms per star, each from its tip (thin) into the centre (full).
  frost(t, seed, age, rgb, scale) {
    this.under(t, rgb, envelope(age / FROST_SPAN), scale);
    for (let j = 0; j < POINTS; j += 1) {
      const start = hash01(seed + j) * FROST_SPREAD;
      const life =
        FROST_LIFE[0] + (FROST_LIFE[1] - FROST_LIFE[0]) * hash01(seed + j + 16);
      const k = envelope((age - start) / life);
      if (!k) continue;
      this.point(j);
      const { px, py } = this;
      const arm = FROST_ARM * (0.5 + 0.5 * k);
      const gain = FROST_GAIN * k * scale;
      const r = t.ribbons;
      r.streak(px - arm, py, px, py, HULL_HEIGHT, FROST_RGB, FROST_WIDTH, gain);
      r.streak(px + arm, py, px, py, HULL_HEIGHT, FROST_RGB, FROST_WIDTH, gain);
      r.streak(px, py - arm, px, py, HULL_HEIGHT, FROST_RGB, FROST_WIDTH, gain);
      r.streak(px, py + arm, px, py, HULL_HEIGHT, FROST_RGB, FROST_WIDTH, gain);
      t.glow.push(
        px,
        HULL_HEIGHT + 0.5,
        py,
        FROST_HOT,
        FROST_CORE,
        k,
        FROST_GAIN * scale
      );
    }
  }

  sparks(t, seed, age, rgb, scale, still) {
    for (let j = 0; j < SPARK_COUNT; j += 1) {
      const start = hash01(seed + j) * SPARK_SPREAD;
      const life =
        SPARK_LIFE[0] + (SPARK_LIFE[1] - SPARK_LIFE[0]) * hash01(seed + j + 16);
      const run = age - start;
      const k = run > 0 && run < life ? Math.sin((Math.PI * run) / life) : 0;
      if (!k) continue;
      const from = hash01(seed + j + 32) * LOOP.length;
      const turn = hash01(seed + j + 48) < 0.5 ? -1 : 1;
      const rate =
        SPARK_RATE[0] + (SPARK_RATE[1] - SPARK_RATE[0]) * hash01(seed + j + 64);
      const gain = SPARK_GAIN * scale;
      if (still) {
        this.onLoop(from);
        t.glow.push(
          this.px,
          HULL_HEIGHT,
          this.py,
          rgb,
          SPARK_CORE * 2,
          k,
          gain
        );
      } else {
        const head = from + turn * rate * run;
        this.onLoop(head - turn * SPARK_LENGTH);
        const tx = this.px;
        const ty = this.py;
        this.onLoop(head);
        t.ribbons.streak(
          tx,
          ty,
          this.px,
          this.py,
          HULL_HEIGHT,
          rgb,
          SPARK_WIDTH,
          gain * k
        );
      }
      t.glow.push(
        this.px,
        HULL_HEIGHT + 0.5,
        this.py,
        this.hot(rgb),
        SPARK_CORE,
        k,
        gain
      );
    }
  }

  clear() {
    this.flight.fill(0);
    this.hullLook.fill(LOOK.none);
  }
}
