// Short-lived impact bursts the 3D renderer adds on top of the EffectsSystem
// particles, drawn into the shared batches (no extra draw calls):
// - HitSparks: a cone of streaks glancing off the surface a bullet hit (the
//   EffectsSystem burst is omnidirectional, so it reads as a puff, not a hit).
// - MuzzleFlashes: a 2-frame hot pulse at the nose for each player shot.
// Plain typed arrays, filled from events and drained in render(); jitter is
// a hash of a running counter, so it never touches Math.random.

// proposta 17/10: cone shape, speeds and lives of the hit sparks.
const SPARK_POOL = 120;
const SPARKS_PER_HIT = 8;
const SPARKS_PER_KILL = 10;
const CONE_HALF_ANGLE = 0.55; // rad
const REFLECT_MIX = 0.6; // how much the cone leans along the ricochet
const SPARK_SPEED_MIN = 170;
const SPARK_SPEED_MAX = 340;
const SPARK_LIFE_MIN = 0.08;
const SPARK_LIFE_MAX = 0.16;
const SPARK_DRAG = 7; // 1/s
const SPARK_STRETCH = 0.035; // streak length per unit of speed
const SPARK_MAX_LENGTH = 13;
const SPARK_WIDTH = 1.3;
const SPARK_GAIN = 2.2;
const SPARK_HEIGHT = 3;

// proposta 17/10: muzzle pulse.
const MUZZLE_POOL = 8;
const MUZZLE_FRAMES = 2;
const MUZZLE_OFFSET = 20; // logical units ahead of the fire origin
const MUZZLE_SIZE = 16;
const MUZZLE_CORE = 6;
const MUZZLE_LENGTH = 12;
const MUZZLE_HEIGHT = 5;

function hash01(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
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
    this.next = 0;
    this.roll = 0;
  }

  rand() {
    this.roll += 1;
    return hash01(this.roll);
  }

  /**
   * A cone at (x, y) around the surface normal (nx, ny), leaning along the
   * ricochet of the incoming direction (dx, dy). Vectors need not be unit.
   */
  emit(x, y, nx, ny, dx, dy, killed) {
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
    const base = Math.atan2(ay, ax);
    const count = killed ? SPARKS_PER_KILL : SPARKS_PER_HIT;
    for (let k = 0; k < count; k += 1) {
      const i = this.next;
      this.next = (this.next + 1) % SPARK_POOL;
      const angle = base + (this.rand() * 2 - 1) * CONE_HALF_ANGLE;
      const speed =
        SPARK_SPEED_MIN + (SPARK_SPEED_MAX - SPARK_SPEED_MIN) * this.rand();
      const life =
        SPARK_LIFE_MIN + (SPARK_LIFE_MAX - SPARK_LIFE_MIN) * this.rand();
      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.hot[i] = k < 2 ? 1 : 0;
    }
  }

  /** Advances by `dt` s and draws into `ribbons`. */
  update(dt, ribbons, rgb, hotRgb) {
    const drag = Math.exp(-SPARK_DRAG * dt);
    for (let i = 0; i < SPARK_POOL; i += 1) {
      if (!(this.life[i] > 0)) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      this.vx[i] *= drag;
      this.vy[i] *= drag;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      const fade = this.life[i] / this.maxLife[i];
      const vx = this.vx[i];
      const vy = this.vy[i];
      const speed = Math.hypot(vx, vy);
      if (speed < 1) continue;
      const length = Math.min(SPARK_MAX_LENGTH, speed * SPARK_STRETCH);
      const k = length / speed;
      ribbons.streak(
        this.x[i] - vx * k,
        this.y[i] - vy * k,
        this.x[i],
        this.y[i],
        SPARK_HEIGHT,
        this.hot[i] ? hotRgb : rgb,
        SPARK_WIDTH * (0.5 + 0.5 * fade),
        SPARK_GAIN * fade
      );
    }
  }

  clear() {
    this.life.fill(0);
  }
}

export class MuzzleFlashes {
  constructor() {
    this.x = new Float32Array(MUZZLE_POOL);
    this.y = new Float32Array(MUZZLE_POOL);
    this.dx = new Float32Array(MUZZLE_POOL);
    this.dy = new Float32Array(MUZZLE_POOL);
    this.frames = new Uint8Array(MUZZLE_POOL);
    this.next = 0;
  }

  /** A shot from (x, y) along the unit direction (dx, dy). */
  emit(x, y, dx, dy) {
    const i = this.next;
    this.next = (this.next + 1) % MUZZLE_POOL;
    this.x[i] = x + dx * MUZZLE_OFFSET;
    this.y[i] = y + dy * MUZZLE_OFFSET;
    this.dx[i] = dx;
    this.dy[i] = dy;
    this.frames[i] = MUZZLE_FRAMES;
  }

  /** Draws the live pulses; returns how many were drawn this frame. */
  update(glow, ribbons, rgb, hotRgb) {
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
  }
}
