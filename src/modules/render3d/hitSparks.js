// Short-lived impact bursts the 3D renderer adds on top of the EffectsSystem
// particles, drawn into the shared batches (no extra draw calls):
// - HitSparks: what a hit knocks off the surface it struck, by material.
//   Metal throws a cone of hot streaks glancing along the ricochet and a few
//   drops of molten slag that cool as they fly (the Hit Markers setting); rock
//   spits a few slower molten droplets that cool from orange to dull red and
//   a puff of grey dust; the shield sheds cyan-white flecks. A burst
//   (flak, a missile) throws hot streaks all round and incandescent
//   fragments that cool as they fly; a burning hull sheds slow embers and
//   drips slag.
// - MuzzleFlashes: a 2-frame hot pulse at the nose for each player volley:
//   the shots fired between two frames (the Scatter Coil's five, Multishot's
//   lanes) light one, at their mean origin and along their mean heading.
// - KillPops: a machine that dies flashes white-hot at its own core (instead
//   of the whole screen), then the heat drops through orange.
// Plain typed arrays, filled from events and drained in render(); jitter is
// a hash of a running counter, so it never touches Math.random.

export const SPARK_KIND = Object.freeze({
  metal: 0,
  rock: 1,
  shield: 2,
  blast: 3,
  burn: 4,
});

// proposta 17/11 (efeito/impacto): per material, count / speed / life / drag.
const SPARK_POOL = 160;
const KINDS = [
  // metal: the cone of 17/10, a little longer-lived
  {
    hit: 8,
    kill: 10,
    speed: [170, 340],
    life: [0.09, 0.2],
    drag: 7,
    cone: 0.55,
    hot: 2,
    width: 1.3,
    gain: 2.2,
    maxLength: 13,
  },
  // rock: molten droplets, slower and longer, thick and short
  {
    hit: 5,
    kill: 7,
    speed: [70, 170],
    life: [0.28, 0.6],
    drag: 3.2,
    cone: 0.85,
    hot: 1,
    width: 1.9,
    gain: 1.9,
    maxLength: 6,
  },
  // shield: flecks off the hex shell
  {
    hit: 6,
    kill: 6,
    speed: [140, 260],
    life: [0.07, 0.15],
    drag: 8,
    cone: 0.9,
    hot: 2,
    width: 1.1,
    gain: 2.0,
    maxLength: 10,
  },
  // proposta 17/11 (lote 4) blast: hot streaks all round a burst; `kill`
  // is a missile's
  {
    hit: 14,
    kill: 22,
    speed: [180, 420],
    life: [0.12, 0.32],
    drag: 5,
    cone: Math.PI,
    hot: 5,
    width: 1.4,
    gain: 2.4,
    maxLength: 16,
  },
  // burn: slow embers off a burning hull, cooling like rock's droplets
  {
    hit: 4,
    kill: 7,
    speed: [35, 110],
    life: [0.35, 0.8],
    drag: 2,
    cone: 1.2,
    hot: 1,
    width: 1.5,
    gain: 1.8,
    maxLength: 5,
  },
];
const REFLECT_MIX = 0.6; // how much the cone leans along the ricochet
const SPARK_STRETCH = 0.035; // streak length per unit of speed
const SPARK_HEIGHT = 3;
// linear rgb: a droplet cools from yellow-orange to a dull red as it flies
const EMBER_HOT = [2.0, 0.78, 0.2];
const EMBER_COOL = [0.55, 0.06, 0.01];
const SHIELD_RGB = [0.35, 1.6, 1.9];
const SHIELD_HOT = [1.6, 2.0, 2.0];

// proposta 17/11: molten slag off struck metal, white-hot to dull red.
const SLAG_POOL = 64;
const SLAG_PER_HIT = 3;
const SLAG_PER_KILL = 6;
const SLAG_SPEED = [60, 160];
const SLAG_LIFE = [0.35, 0.75]; // s
const SLAG_DRAG = 2.5; // 1/s
const SLAG_CONE = 1.0; // rad around the ricochet
const SLAG_SIZE = [1.4, 2.4];
const SLAG_HOT = [2.6, 2.0, 1.2];
const SLAG_HEIGHT = 3.5;
// proposta 17/11 (lote 4): incandescent fragments a burst throws (flak /
// missile) and the drips a burn tick sheds; never behind Hit Markers.
const BLAST_SLAG = [4, 8];
const BURN_SLAG = [2, 4];
const BLAST_RGB = [2.2, 0.85, 0.22];

// proposta 17/11: rock dust, matte grey puffs that drift off the hit.
const DUST_POOL = 48;
const DUST_PER_HIT = 2;
const DUST_LIFE = 0.7; // s
const DUST_SPEED = 26;
const DUST_SIZE = [5, 13]; // grows over its life
const DUST_ALPHA = 0.42;
const DUST_RGB = [0.16, 0.15, 0.14];

// proposta 17/10: muzzle pulse.
const MUZZLE_POOL = 8;
const MUZZLE_FRAMES = 2;
const MUZZLE_OFFSET = 20; // logical units ahead of the fire origin
const MUZZLE_SIZE = 16;
const MUZZLE_CORE = 6;
const MUZZLE_LENGTH = 12;
const MUZZLE_HEIGHT = 5;

// proposta 17/11: the kill pop at the machine's core.
const POP_POOL = 16;
const POP_TIME = 0.16; // s
const POP_SIZE = 2.6; // × the machine's radius
const POP_MAX = 34; // a big machine's pop stays a core flash, not a halo
const POP_HEIGHT = 6;
const POP_HOT = [2.4, 2.1, 1.7];
const POP_WARM = [2.0, 0.6, 0.12];

function hash01(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function mix3(out, a, b, k) {
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
  return out;
}

export class HitSparks {
  constructor() {
    this.x = new Float32Array(SPARK_POOL);
    this.y = new Float32Array(SPARK_POOL);
    this.vx = new Float32Array(SPARK_POOL);
    this.vy = new Float32Array(SPARK_POOL);
    this.life = new Float32Array(SPARK_POOL);
    this.maxLife = new Float32Array(SPARK_POOL);
    this.hot = new Uint8Array(SPARK_POOL);
    this.kind = new Uint8Array(SPARK_POOL);
    this.next = 0;
    this.dustX = new Float32Array(DUST_POOL);
    this.dustY = new Float32Array(DUST_POOL);
    this.dustVx = new Float32Array(DUST_POOL);
    this.dustVy = new Float32Array(DUST_POOL);
    this.dustAge = new Float32Array(DUST_POOL).fill(DUST_LIFE);
    this.dustNext = 0;
    this.slagX = new Float32Array(SLAG_POOL);
    this.slagY = new Float32Array(SLAG_POOL);
    this.slagVx = new Float32Array(SLAG_POOL);
    this.slagVy = new Float32Array(SLAG_POOL);
    this.slagLife = new Float32Array(SLAG_POOL);
    this.slagMax = new Float32Array(SLAG_POOL);
    this.slagSize = new Float32Array(SLAG_POOL);
    this.slagNext = 0;
    // the Hit Markers setting: off, no slag (Renderer3D sets it)
    this.slagOn = true;
    this.roll = 0;
    this.scratch = [0, 0, 0];
  }

  rand() {
    this.roll += 1;
    return hash01(this.roll);
  }

  /**
   * A burst at (x, y) around the surface normal (nx, ny), leaning along the
   * ricochet of the incoming direction (dx, dy); `kind` a SPARK_KIND (the
   * material that was hit). Vectors need not be unit.
   */
  emit(x, y, nx, ny, dx, dy, killed, kind = SPARK_KIND.metal) {
    let nl = Math.hypot(nx, ny);
    const dl = Math.hypot(dx, dy);
    if (nl < 1e-3) {
      if (dl < 1e-3) return;
      nx = -dx;
      ny = -dy;
      nl = dl;
    }
    nx /= nl;
    ny /= nl;
    let ax = nx;
    let ay = ny;
    if (dl > 1e-3) {
      const ux = dx / dl;
      const uy = dy / dl;
      const dot = ux * nx + uy * ny;
      ax += (ux - 2 * dot * nx) * REFLECT_MIX;
      ay += (uy - 2 * dot * ny) * REFLECT_MIX;
    }
    const spec = KINDS[kind] || KINDS[0];
    const base = Math.atan2(ay, ax);
    const count = killed ? spec.kill : spec.hit;
    for (let k = 0; k < count; k += 1) {
      const i = this.next;
      this.next = (this.next + 1) % SPARK_POOL;
      const angle = base + (this.rand() * 2 - 1) * spec.cone;
      const speed =
        spec.speed[0] + (spec.speed[1] - spec.speed[0]) * this.rand();
      const life = spec.life[0] + (spec.life[1] - spec.life[0]) * this.rand();
      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.hot[i] = k < spec.hot ? 1 : 0;
      this.kind[i] = kind;
    }
    if (kind === SPARK_KIND.rock) this.puff(x, y, nx, ny);
    else if (kind === SPARK_KIND.metal && this.slagOn) {
      this.slag(x, y, base, killed ? SLAG_PER_KILL : SLAG_PER_HIT);
    } else if (kind === SPARK_KIND.blast) {
      this.slag(x, y, base, BLAST_SLAG[killed ? 1 : 0], Math.PI);
    } else if (kind === SPARK_KIND.burn) {
      this.slag(x, y, base, BURN_SLAG[killed ? 1 : 0]);
    }
  }

  // Molten drops thrown within `cone` rad of the direction `base` (rad).
  slag(x, y, base, count, cone = SLAG_CONE) {
    for (let k = 0; k < count; k += 1) {
      const i = this.slagNext;
      this.slagNext = (this.slagNext + 1) % SLAG_POOL;
      const a = base + (this.rand() * 2 - 1) * cone;
      const v = SLAG_SPEED[0] + (SLAG_SPEED[1] - SLAG_SPEED[0]) * this.rand();
      const life = SLAG_LIFE[0] + (SLAG_LIFE[1] - SLAG_LIFE[0]) * this.rand();
      this.slagX[i] = x;
      this.slagY[i] = y;
      this.slagVx[i] = Math.cos(a) * v;
      this.slagVy[i] = Math.sin(a) * v;
      this.slagLife[i] = life;
      this.slagMax[i] = life;
      this.slagSize[i] =
        SLAG_SIZE[0] + (SLAG_SIZE[1] - SLAG_SIZE[0]) * this.rand();
    }
  }

  // Grey dust drifting off the struck face.
  puff(x, y, nx, ny) {
    for (let k = 0; k < DUST_PER_HIT; k += 1) {
      const i = this.dustNext;
      this.dustNext = (this.dustNext + 1) % DUST_POOL;
      const a = Math.atan2(ny, nx) + (this.rand() * 2 - 1) * 0.9;
      const s = DUST_SPEED * (0.5 + this.rand());
      this.dustX[i] = x + nx * 2;
      this.dustY[i] = y + ny * 2;
      this.dustVx[i] = Math.cos(a) * s;
      this.dustVy[i] = Math.sin(a) * s;
      this.dustAge[i] = 0;
    }
  }

  /** Advances by `dt` s and draws into `ribbons` (and the dust into `smoke`). */
  update(dt, ribbons, rgb, hotRgb, smoke, glow) {
    for (let i = 0; i < SPARK_POOL; i += 1) {
      if (!(this.life[i] > 0)) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const spec = KINDS[this.kind[i]];
      const drag = Math.exp(-spec.drag * dt);
      this.vx[i] *= drag;
      this.vy[i] *= drag;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      const fade = this.life[i] / this.maxLife[i];
      const vx = this.vx[i];
      const vy = this.vy[i];
      const speed = Math.hypot(vx, vy);
      if (speed < 1) continue;
      const length = Math.max(
        1.2,
        Math.min(spec.maxLength, speed * SPARK_STRETCH)
      );
      const k = length / speed;
      let color;
      let gain = spec.gain * fade;
      const kind = this.kind[i];
      if (kind === SPARK_KIND.rock || kind === SPARK_KIND.burn) {
        // cools as it flies; the light dies with the heat, not linearly
        color = mix3(this.scratch, EMBER_COOL, EMBER_HOT, fade);
        gain = spec.gain * (0.35 + 0.65 * fade);
      } else if (kind === SPARK_KIND.shield) {
        color = this.hot[i] ? SHIELD_HOT : SHIELD_RGB;
      } else if (kind === SPARK_KIND.blast) {
        color = this.hot[i] ? SLAG_HOT : BLAST_RGB;
      } else color = this.hot[i] ? hotRgb : rgb;
      ribbons.streak(
        this.x[i] - vx * k,
        this.y[i] - vy * k,
        this.x[i],
        this.y[i],
        SPARK_HEIGHT,
        color,
        spec.width * (0.5 + 0.5 * fade),
        gain
      );
    }
    if (glow) {
      const drag = Math.exp(-SLAG_DRAG * dt);
      for (let i = 0; i < SLAG_POOL; i += 1) {
        if (!(this.slagLife[i] > 0)) continue;
        this.slagLife[i] -= dt;
        if (this.slagLife[i] <= 0) continue;
        this.slagVx[i] *= drag;
        this.slagVy[i] *= drag;
        const x = (this.slagX[i] += this.slagVx[i] * dt);
        const y = (this.slagY[i] += this.slagVy[i] * dt);
        const heat = this.slagLife[i] / this.slagMax[i];
        const color = mix3(this.scratch, EMBER_COOL, SLAG_HOT, heat ** 0.7);
        const size = this.slagSize[i] * (0.6 + 0.4 * heat);
        glow.push(x, SLAG_HEIGHT, y, color, size, 1, 1.4);
        ribbons.streak(
          x - this.slagVx[i] * 0.04,
          y - this.slagVy[i] * 0.04,
          x,
          y,
          SLAG_HEIGHT,
          color,
          size * 0.5,
          0.9 * heat
        );
      }
    }
    if (!smoke) return;
    for (let i = 0; i < DUST_POOL; i += 1) {
      if (!(this.dustAge[i] < DUST_LIFE)) continue;
      this.dustAge[i] += dt;
      const t = Math.min(1, this.dustAge[i] / DUST_LIFE);
      const slow = Math.exp(-2.5 * dt);
      this.dustVx[i] *= slow;
      this.dustVy[i] *= slow;
      this.dustX[i] += this.dustVx[i] * dt;
      this.dustY[i] += this.dustVy[i] * dt;
      smoke.push(
        this.dustX[i],
        4,
        this.dustY[i],
        DUST_RGB,
        DUST_SIZE[0] + (DUST_SIZE[1] - DUST_SIZE[0]) * t,
        DUST_ALPHA * (1 - t) * (1 - t)
      );
    }
  }

  clear() {
    this.life.fill(0);
    this.dustAge.fill(DUST_LIFE);
    this.slagLife.fill(0);
  }
}

export class MuzzleFlashes {
  constructor() {
    this.x = new Float32Array(MUZZLE_POOL);
    this.y = new Float32Array(MUZZLE_POOL);
    this.dx = new Float32Array(MUZZLE_POOL);
    this.dy = new Float32Array(MUZZLE_POOL);
    this.frames = new Uint8Array(MUZZLE_POOL);
    this.shots = new Uint8Array(MUZZLE_POOL);
    this.next = 0;
    this.volley = -1; // the slot this frame's shots add up in
  }

  /** A shot from (x, y) along the unit direction (dx, dy). */
  emit(x, y, dx, dy) {
    let i = this.volley;
    if (i < 0) {
      i = this.volley = this.next;
      this.next = (this.next + 1) % MUZZLE_POOL;
      this.x[i] = this.y[i] = this.dx[i] = this.dy[i] = 0;
      this.shots[i] = 0;
      this.frames[i] = MUZZLE_FRAMES;
    }
    this.x[i] += x + dx * MUZZLE_OFFSET;
    this.y[i] += y + dy * MUZZLE_OFFSET;
    this.dx[i] += dx;
    this.dy[i] += dy;
    this.shots[i] = Math.min(255, this.shots[i] + 1);
  }

  /** Draws the live pulses; returns how many were drawn this frame. */
  update(glow, ribbons, rgb, hotRgb) {
    // this frame's volley: its sums become its mean origin and heading
    const v = this.volley;
    if (v >= 0) {
      const n = this.shots[v];
      const length = Math.hypot(this.dx[v], this.dy[v]) || 1;
      this.x[v] /= n;
      this.y[v] /= n;
      this.dx[v] /= length;
      this.dy[v] /= length;
      this.volley = -1;
    }
    let drawn = 0;
    for (let i = 0; i < MUZZLE_POOL; i += 1) {
      const frames = this.frames[i];
      if (!frames) continue;
      this.frames[i] = frames - 1;
      const k = frames / MUZZLE_FRAMES;
      const x = this.x[i];
      const y = this.y[i];
      glow.push(x, MUZZLE_HEIGHT, y, rgb, MUZZLE_SIZE * k, 1, 2.2);
      glow.push(x, MUZZLE_HEIGHT + 0.5, y, hotRgb, MUZZLE_CORE * k, 1, 2.5);
      ribbons.streak(
        x - this.dx[i] * 3,
        y - this.dy[i] * 3,
        x + this.dx[i] * MUZZLE_LENGTH * k,
        y + this.dy[i] * MUZZLE_LENGTH * k,
        MUZZLE_HEIGHT,
        rgb,
        4 * k,
        2.4
      );
      drawn += 1;
    }
    return drawn;
  }

  clear() {
    this.frames.fill(0);
    this.volley = -1;
  }
}

export class KillPops {
  constructor() {
    this.x = new Float32Array(POP_POOL);
    this.y = new Float32Array(POP_POOL);
    this.size = new Float32Array(POP_POOL);
    this.age = new Float32Array(POP_POOL).fill(POP_TIME);
    this.next = 0;
    this.scratch = [0, 0, 0];
  }

  /** A machine of `radius` died at (x, y). */
  emit(x, y, radius) {
    const i = this.next;
    this.next = (this.next + 1) % POP_POOL;
    this.x[i] = x;
    this.y[i] = y;
    this.size[i] = Math.max(10, Math.min(POP_MAX, radius * POP_SIZE));
    this.age[i] = 0;
  }

  /** `scale`: Reduce Flashing's dimmer (1 normally). */
  update(dt, glow, scale = 1) {
    for (let i = 0; i < POP_POOL; i += 1) {
      if (!(this.age[i] < POP_TIME)) continue;
      const t = this.age[i] / POP_TIME;
      this.age[i] += dt;
      const color = mix3(this.scratch, POP_HOT, POP_WARM, t);
      const k = (1 - t) * scale;
      glow.push(
        this.x[i],
        POP_HEIGHT,
        this.y[i],
        color,
        this.size[i] * (0.7 + 0.5 * t),
        k,
        1.5
      );
      glow.push(
        this.x[i],
        POP_HEIGHT + 0.5,
        this.y[i],
        POP_HOT,
        this.size[i] * 0.35 * (1 - t),
        k,
        2
      );
    }
  }

  clear() {
    this.age.fill(POP_TIME);
  }
}
