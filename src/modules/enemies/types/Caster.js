import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import {
  CASTER_COMPONENTS,
  CASTER_CONFIG,
  CASTER_FIELD_MARGIN,
  CASTER_FIRE_INTERVAL,
  CASTER_HOLD_MAX,
  CASTER_HOLD_MIN,
  CASTER_LEAD_SECONDS,
  CASTER_SHELL_DAMAGE,
  CASTER_SHELL_FLIGHT,
  CASTER_SHELL_RADIUS,
  CASTER_SPEED,
  CASTER_TELEGRAPH_SECONDS,
} from '../../../data/enemies/caster.js';
import { resolvePlayerVelocity } from '../../../utils/combatHelpers.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Artillery. Holds CASTER_HOLD_MIN–MAX px from the ship. Every
 * CASTER_FIRE_INTERVAL s it marks a point CASTER_LEAD_SECONDS ahead of the
 * ship (`aim`, lit by `telegraphRatio` over the telegraph), then lobs a
 * `shell` there: it flies CASTER_SHELL_FLIGHT s over the field, colliding with
 * nothing, and blows on landing — CASTER_SHELL_DAMAGE to the ship alone within
 * CASTER_SHELL_RADIUS. A shell in the air dies with it. Emits
 * `caster-telegraphed`, `caster-shell-fired` and `caster-shell-landed`.
 */
export class Caster extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'caster';
    this.random = null;
    this.fireTimer = CASTER_FIRE_INTERVAL;
    this.aim = null;
    this.shell = null;
    this.destroyed = false;
    this.movementStrategy = 'linear';
    this.renderStrategy = 'procedural';

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    this.radius = config.radius ?? CASTER_CONFIG.radius;
    this.maxHealth = config.maxHealth ?? config.health ?? CASTER_CONFIG.health;
    this.health = this.maxHealth;
    this.contactDamage = config.contactDamage ?? CASTER_CONFIG.contactDamage;
    this.movementStrategy = (
      config.components ?? CASTER_COMPONENTS
    ).movement.strategy;
    this.random = this.resolveRandom({ ...config, id: this.id });
    this.destroyed = false;
    return this;
  }

  get speed() {
    return this.movementConfig?.maxSpeed ?? CASTER_SPEED;
  }

  /** 0..1 over the telegraph before a lob: the lens and the aim ring. */
  get telegraphRatio() {
    if (!this.aim) return 0;
    return clamp(1 - this.fireTimer / CASTER_TELEGRAPH_SECONDS, 0, 1);
  }

  /** 0..1 through the shell's flight; null with none in the air. */
  get shellProgress() {
    return this.shell
      ? Math.min(1, this.shell.age / CASTER_SHELL_FLIGHT)
      : null;
  }

  onUpdate(deltaTime) {
    if (!(deltaTime > 0) || !this.alive) return;

    const player = this.system?.getCachedPlayer?.() ?? null;
    const target = player?.position ?? null;
    this.updateShell(deltaTime);
    this.steer(target);
    if (!target) return;

    this.fireTimer -= deltaTime;
    if (this.fireTimer <= CASTER_TELEGRAPH_SECONDS) {
      const charging = !this.aim;
      this.aim = this.leadPoint(player, target);
      this.rotation = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
      if (charging) this.emitEvent('caster-telegraphed', { target: this.aim });
    }
    if (this.fireTimer > 0) return;
    this.fireTimer += CASTER_FIRE_INTERVAL;
    this.shell = { fromX: this.x, fromY: this.y, ...this.aim, age: 0 };
    this.emitEvent('caster-shell-fired', { target: this.aim });
    this.aim = null;
  }

  // A Caster event at its own position, plus `extra`.
  emitEvent(name, extra) {
    this.getEventBus()?.emit?.(name, {
      enemy: this,
      enemyId: this.id,
      position: { x: this.x, y: this.y },
      ...extra,
    });
  }

  // Closes in beyond the band, backs off inside it, holds within; never backs
  // off the field.
  steer(target) {
    if (!target) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy) || 1;
    this.rotation = Math.atan2(dy, dx);
    const pace =
      distance > CASTER_HOLD_MAX
        ? this.speed
        : distance < CASTER_HOLD_MIN
          ? -this.speed
          : 0;
    this.vx = (dx / distance) * pace;
    this.vy = (dy / distance) * pace;
    const margin = CASTER_FIELD_MARGIN;
    if (
      (this.x < margin && this.vx < 0) ||
      (this.x > GAME_WIDTH - margin && this.vx > 0)
    ) {
      this.vx = 0;
    }
    if (
      (this.y < margin && this.vy < 0) ||
      (this.y > GAME_HEIGHT - margin && this.vy > 0)
    ) {
      this.vy = 0;
    }
  }

  // Where the ship will be CASTER_LEAD_SECONDS from now, on the field.
  leadPoint(player, target) {
    const { vx, vy } = resolvePlayerVelocity(player);
    return {
      x: clamp(target.x + vx * CASTER_LEAD_SECONDS, 0, GAME_WIDTH),
      y: clamp(target.y + vy * CASTER_LEAD_SECONDS, 0, GAME_HEIGHT),
    };
  }

  updateShell(deltaTime) {
    const { shell } = this;
    if (!shell) return;
    shell.age += deltaTime;
    if (shell.age < CASTER_SHELL_FLIGHT) return;
    this.shell = null;
    this.land(shell.x, shell.y);
  }

  // Hurts the ship only (the direct-damage path checks the radius); its own
  // impact look and sound, nothing left behind.
  land(x, y) {
    const position = { x, y };
    this.system?.applyDirectDamageToPlayer?.(CASTER_SHELL_DAMAGE, {
      cause: 'caster-shell',
      position,
      radius: CASTER_SHELL_RADIUS,
      source: this,
    });
    this.emitEvent('caster-shell-landed', {
      position,
      radius: CASTER_SHELL_RADIUS,
      damage: CASTER_SHELL_DAMAGE,
    });
  }

  onDestroyed(source, context = {}) {
    this.destroyed = true;
    this.aim = null;
    this.shell = null;
    super.onDestroyed(source, context);
  }

  resetForPool() {
    super.resetForPool();
    this.random = null;
    this.fireTimer = CASTER_FIRE_INTERVAL;
    this.aim = null;
    this.shell = null;
    this.destroyed = false;
  }
}

export default Caster;
