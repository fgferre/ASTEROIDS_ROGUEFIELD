import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import {
  SHADE_COMPONENTS,
  SHADE_CONFIG,
  SHADE_FADE_SECONDS,
  SHADE_FAN_ARC,
  SHADE_FIELD_MARGIN,
  SHADE_FIRE_DELAY,
  SHADE_FLANK_DISTANCE,
  SHADE_FLANK_MIN_DISTANCE,
  SHADE_PHASED_SECONDS,
  SHADE_PHASE_SPEED,
  SHADE_SHOTS,
  SHADE_SHOT_DAMAGE,
  SHADE_SHOT_LIFETIME,
  SHADE_SHOT_SPEED,
  SHADE_SPEED,
  SHADE_STILL_SPEED,
  SHADE_VISIBLE_SECONDS,
} from '../../../data/enemies/shade.js';
import { resolvePlayerVelocity } from '../../../utils/combatHelpers.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

const TAU = Math.PI * 2;

const clampToField = (value, size) =>
  Math.min(size - SHADE_FIELD_MARGIN, Math.max(SHADE_FIELD_MARGIN, value));

// Each step of the cycle: how long it lasts and what follows.
const CYCLE = {
  'fade-in': { seconds: SHADE_FADE_SECONDS, next: 'visible' },
  visible: { seconds: SHADE_VISIBLE_SECONDS, next: 'fade-out' },
  'fade-out': { seconds: SHADE_FADE_SECONDS, next: 'phased' },
  phased: { seconds: SHADE_PHASED_SECONDS, next: 'fade-in' },
};
// The dissolves it announces, by the step that starts them.
const PHASE_EVENTS = {
  'fade-out': 'shade-phased-out',
  'fade-in': 'shade-phased-in',
};

/**
 * Phase flanker. Cycle: fade-in → visible (one fan of SHADE_SHOTS at the ship,
 * SHADE_FIRE_DELAY s in) → fade-out → phased → fade-in. Phased, it is
 * `intangible`: no collisions, no damage, no lock (PhysicsSystem and
 * CombatSystem skip it). It keeps to a flank point SHADE_FLANK_DISTANCE px
 * beside the ship — across the ship's heading on the side it is on, or a
 * seeded side while the ship is still — inside the field; phased, it glides
 * there to arrive as the window ends. A wall that clamps the point within
 * SHADE_FLANK_MIN_DISTANCE of the ship sends it to the other side, else
 * toward the field's centre. `visibility`: 0 phased … 1 solid.
 * Emits `shade-phased-out` / `shade-phased-in` as each dissolve starts.
 */
export class Shade extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'shade';
    this.random = null;
    this.resetShadeState();
    this.destroyed = false;
    this.movementStrategy = 'linear';
    this.renderStrategy = 'procedural';

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  resetShadeState() {
    this.phase = 'fade-in';
    this.phaseTimer = SHADE_FADE_SECONDS;
    this.fired = false;
    this.flankSide = 1;
    this.flankAngle = 0;
    this.intangible = false;
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    this.radius = config.radius ?? SHADE_CONFIG.radius;
    this.maxHealth = config.maxHealth ?? config.health ?? SHADE_CONFIG.health;
    this.health = this.maxHealth;
    this.contactDamage = config.contactDamage ?? SHADE_CONFIG.contactDamage;
    this.movementStrategy = (
      config.components ?? SHADE_COMPONENTS
    ).movement.strategy;
    this.random = this.resolveRandom({ ...config, id: this.id });
    this.flankSide = this.random.chance(0.5) ? 1 : -1;
    this.flankAngle = this.random.range(0, TAU);
    this.destroyed = false;
    return this;
  }

  get speed() {
    return this.movementConfig?.maxSpeed ?? SHADE_SPEED;
  }

  get phaseSpeed() {
    return this.movementConfig?.phaseSpeed ?? SHADE_PHASE_SPEED;
  }

  /** How solid it looks: 0 phased … 1 visible. */
  get visibility() {
    const left = Math.min(1, Math.max(0, this.phaseTimer / SHADE_FADE_SECONDS));
    if (this.phase === 'visible') return 1;
    if (this.phase === 'phased') return 0;
    return this.phase === 'fade-out' ? left : 1 - left;
  }

  takeDamage(amount, source = null) {
    if (this.intangible) return false;
    return super.takeDamage(amount, source);
  }

  onUpdate(deltaTime) {
    if (!(deltaTime > 0) || !this.alive) return;

    const player = this.system?.getCachedPlayer?.() ?? null;
    const target = player?.position ?? null;
    // a lit Volatile fuse holds it solid until it blows
    if (this.volatileFuse === null) this.advance(deltaTime, player, target);
    this.steer(player, target, deltaTime);

    if (
      this.phase === 'visible' &&
      !this.fired &&
      SHADE_VISIBLE_SECONDS - this.phaseTimer >= SHADE_FIRE_DELAY
    ) {
      this.fired = true;
      this.fireFan(target);
    }
  }

  advance(deltaTime, player, target) {
    this.phaseTimer -= deltaTime;
    while (this.phaseTimer <= 0) {
      this.phase = CYCLE[this.phase].next;
      this.phaseTimer += CYCLE[this.phase].seconds;
      if (this.phase === 'visible') this.fired = false;
      if (this.phase === 'phased') this.pickFlank(player, target);
      if (PHASE_EVENTS[this.phase]) {
        this.getEventBus()?.emit?.(PHASE_EVENTS[this.phase], {
          enemy: this,
          enemyId: this.id,
          position: { x: this.x, y: this.y },
        });
      }
    }
    this.intangible = this.phase === 'phased';
  }

  // The side of the ship's heading it is on now; a fresh seeded angle for a
  // ship standing still.
  pickFlank(player, target) {
    this.flankAngle = this.random.range(0, TAU);
    if (!target) return;
    const { vx, vy } = resolvePlayerVelocity(player);
    const across = vx * (this.y - target.y) - vy * (this.x - target.x);
    if (across !== 0) this.flankSide = Math.sign(across);
  }

  flankPoint(player, target) {
    const { vx, vy } = resolvePlayerVelocity(player);
    const speed = Math.hypot(vx, vy);
    const moving = speed >= SHADE_STILL_SPEED;
    const nx = moving
      ? (-vy / speed) * this.flankSide
      : Math.cos(this.flankAngle);
    const ny = moving
      ? (vx / speed) * this.flankSide
      : Math.sin(this.flankAngle);
    const toward = (dx, dy) => ({
      x: clampToField(target.x + dx * SHADE_FLANK_DISTANCE, GAME_WIDTH),
      y: clampToField(target.y + dy * SHADE_FLANK_DISTANCE, GAME_HEIGHT),
    });
    const clear = (point) =>
      Math.hypot(point.x - target.x, point.y - target.y) >=
      SHADE_FLANK_MIN_DISTANCE;
    const side = toward(nx, ny);
    if (clear(side)) return side;
    const other = toward(-nx, -ny);
    if (clear(other)) return other;
    const cx = GAME_WIDTH / 2 - target.x;
    const cy = GAME_HEIGHT / 2 - target.y;
    const span = Math.hypot(cx, cy) || 1;
    return toward(cx / span, cy / span);
  }

  steer(player, target, deltaTime) {
    if (!target) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const to = this.flankPoint(player, target);
    const dx = to.x - this.x;
    const dy = to.y - this.y;
    const distance = Math.hypot(dx, dy);
    const pace =
      this.phase === 'phased'
        ? Math.min(
            this.phaseSpeed,
            distance / Math.max(this.phaseTimer, deltaTime)
          )
        : Math.min(this.speed, distance / deltaTime);
    this.vx = distance > 0 ? (dx / distance) * pace : 0;
    this.vy = distance > 0 ? (dy / distance) * pace : 0;
    this.rotation = Math.atan2(target.y - this.y, target.x - this.x);
  }

  fireFan(target) {
    if (!target) return;
    const base = Math.atan2(target.y - this.y, target.x - this.x);
    for (let i = 0; i < SHADE_SHOTS; i += 1) {
      const angle = base + (i / (SHADE_SHOTS - 1) - 0.5) * SHADE_FAN_ARC;
      this.getEventBus()?.emit?.('enemy-fired', {
        enemy: this,
        enemyId: this.id,
        enemyType: this.type,
        wave: this.wave,
        position: { x: this.x, y: this.y },
        velocity: {
          x: Math.cos(angle) * SHADE_SHOT_SPEED,
          y: Math.sin(angle) * SHADE_SHOT_SPEED,
        },
        damage: SHADE_SHOT_DAMAGE,
        projectile: {
          speed: SHADE_SHOT_SPEED,
          angle,
          pattern: 'shade-fan',
          lifetime: SHADE_SHOT_LIFETIME,
        },
        source: { id: this.id, type: this.type, wave: this.wave },
      });
    }
  }

  onDestroyed(source, context = {}) {
    this.destroyed = true;
    this.intangible = false;
    super.onDestroyed(source, context);
  }

  resetForPool() {
    super.resetForPool();
    this.random = null;
    this.resetShadeState();
    this.destroyed = false;
  }
}

export default Shade;
