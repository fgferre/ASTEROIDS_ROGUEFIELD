// src/modules/player/maneuvers.js
//
// The ship's maneuvers: the dash (its burst, cooldown, afterimages and
// invulnerability, Ghost Drive's spare charge and Blink, the Maneuver Apex),
// the emergency brake, and what the Maneuver cards change about them. PlayerSystem owns
// one and calls it in its update order; PhysicsSystem, the HUD and the 3D
// mirror read the dash's fields through the player.

import {
  DASH_COOLDOWN,
  DASH_DECAY_SECONDS,
  DASH_DURATION,
  DASH_GHOST_COUNT,
  DASH_GHOST_LIFE,
  DASH_IMPULSE,
  DASH_INVULNERABILITY,
} from '../../data/constants/gameplay.js';
import { getModernMove } from './movementInput.js';

// Emergency brake: how far off straight back a held direction may point and
// still brake, and how far it may wander (cosine) and still be the same press.
const BRAKE_AGAINST = Math.PI / 4; // proposta 20/10
const BRAKE_SAME_PRESS = 0.95;

export class PlayerManeuvers {
  /**
   * `ship`: the player's position, velocity, angle, controlScheme, invulnerableTimer and _quitExplosionHidden, read and set live.
   * `getEventBus()`: the player's event bus, read live; the dash and brake events go out on it.
   */
  constructor({ ship, getEventBus }) {
    this.ship = ship;
    this.getEventBus = getEventBus;
    this.dashCooldown = DASH_COOLDOWN;
    this.dashAfterInvulnerability = 0;
    this.resetManeuverStats();
    this.emergencyBrake = null;
    this.resetDashState();
  }

  // Once per step, alive or not: the cooldown runs down (then Ghost Drive's
  // spare charge refills over one more) and this step's dash press is taken
  // (true if there was one).
  takeDashRequest(deltaTime) {
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - deltaTime);
    } else if (this.dashSpare < this.dashSpareMax) {
      this.dashSpareTimer += deltaTime;
      if (this.dashSpareTimer >= this.dashCooldown - 1e-9) {
        this.dashSpare += 1;
        this.dashSpareTimer = 0;
      }
    }
    const dashRequested = this.dashRequested;
    this.dashRequested = false;
    return dashRequested;
  }

  resetDashState() {
    this.dashRequested = false;
    this.dashTimer = 0;
    this.dashDecayTimer = 0;
    this.dashCooldownTimer = 0;
    this.dashSpare = this.dashSpareMax;
    this.dashSpareTimer = 0;
    this.dashGhosts = [];
    this.dashGhostsDropped = 0;
    this.dashRammed = new Set();
    if (this.blinkTimer > 0) this.ship._quitExplosionHidden = false;
    this.blinkTimer = 0;
    this.brakeHold = 0;
    this.brakeDir = null;
    this.brakeArmed = false;
    this.brakeCooldownTimer = 0;
    this.brakeTimer = 0;
    this.brakeFrom = null;
  }

  /** A charge is ready: the cooldown is over, or a spare is left. */
  canDash() {
    return this.dashCooldownTimer <= 0 || this.dashSpare > 0;
  }

  /**
   * Classic: forward along the nose, or backward while only S/↓ is held.
   * Modern: along the held WASD direction, else along the nose. Takes the
   * main charge if it is ready, else a spare.
   */
  startDash(movement) {
    const fwd = { x: Math.cos(this.ship.angle), y: Math.sin(this.ship.angle) };
    let direction;
    if (this.ship.controlScheme === 'modern') {
      direction = getModernMove(movement) || fwd;
    } else {
      const sign = movement.down && !movement.up ? -1 : 1;
      direction = { x: fwd.x * sign, y: fwd.y * sign };
    }
    const impulse = DASH_IMPULSE * this.dashDistanceMultiplier;
    this.ship.velocity.vx += direction.x * impulse;
    this.ship.velocity.vy += direction.y * impulse;
    this.dashTimer = DASH_DURATION;
    if (this.dashCooldownTimer <= 0) {
      this.dashCooldownTimer = this.dashCooldown;
    } else {
      this.dashSpare -= 1;
    }
    this.ship.invulnerableTimer = Math.max(
      this.ship.invulnerableTimer,
      DASH_INVULNERABILITY
    );
    this.dashRammed.clear();
    // Blink: the renderers' hide flag, so the ship is gone from both views.
    if (this.blink) {
      this.blinkTimer = this.blink.hide;
      this.ship._quitExplosionHidden = true;
    }
    this.dashGhostsDropped = 0;
    this.dropDashGhosts();
    this.getEventBus()?.emit?.('player-dashed', {
      position: { ...this.ship.position },
      direction,
    });
  }

  // Afterimages spread evenly over the dash, the first at its start.
  dropDashGhosts() {
    const elapsed = DASH_DURATION - this.dashTimer;
    const interval = DASH_DURATION / (DASH_GHOST_COUNT - 1);
    const due = Math.min(
      DASH_GHOST_COUNT,
      1 + Math.floor(elapsed / interval + 1e-6)
    );
    while (this.dashGhostsDropped < due) {
      this.dashGhosts.push({
        x: this.ship.position.x,
        y: this.ship.position.y,
        angle: this.ship.angle,
        age: 0,
      });
      this.dashGhostsDropped += 1;
    }
  }

  updateDash(deltaTime) {
    // Ghost Drive ages them slower, so every renderer's fade lasts longer.
    this.dashGhosts.forEach((ghost) => {
      ghost.age += deltaTime / this.dashGhostLinger;
    });
    this.dashGhosts = this.dashGhosts.filter(
      (ghost) => ghost.age < DASH_GHOST_LIFE
    );
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - deltaTime);
      this.dropDashGhosts();
      if (this.dashTimer === 0) {
        this.dashDecayTimer = DASH_DECAY_SECONDS;
        this.ship.invulnerableTimer = Math.max(
          this.ship.invulnerableTimer,
          this.dashAfterInvulnerability
        );
      }
    } else if (this.dashDecayTimer > 0) {
      this.dashDecayTimer = Math.max(0, this.dashDecayTimer - deltaTime);
    }
    if (this.blinkTimer > 0) {
      this.blinkTimer = Math.max(0, this.blinkTimer - deltaTime);
      if (this.blinkTimer === 0) {
        // Lands with the emergency brake's shockwave: ring, shove and thump.
        this.ship._quitExplosionHidden = false;
        this.getEventBus()?.emit?.('player-braked', {
          position: { ...this.ship.position },
          radius: this.blink.radius,
          knockback: this.blink.knockback,
        });
      }
    }
  }

  /**
   * The direction the held keys thrust along, or null. Modern: the WASD (or
   * stick) direction. Classic: along the nose with W alone, against it with S
   * alone, not while turning.
   */
  getThrustDirection(input) {
    if (this.ship.controlScheme === 'modern') return getModernMove(input);
    if (input.up === input.down || input.left || input.right) return null;
    const sign = input.up ? 1 : -1;
    return {
      x: Math.cos(this.ship.angle) * sign,
      y: Math.sin(this.ship.angle) * sign,
    };
  }

  /**
   * Braking System 3: a direction held against the motion for `hold` s stops
   * the ship over `stopTime` s and sends a shove-only shockwave, once per
   * press. Armed only if, when pressed, the direction pointed within
   * BRAKE_AGAINST of straight back and the ship flew faster than `minSpeed`
   * along it; turning onto a new direction is a new press.
   */
  updateEmergencyBrake(deltaTime, input) {
    const brake = this.emergencyBrake;
    if (!brake) return;
    if (this.brakeCooldownTimer > 0) {
      this.brakeCooldownTimer = Math.max(
        0,
        this.brakeCooldownTimer - deltaTime
      );
    }
    const dir = this.getThrustDirection(input);
    const held =
      dir &&
      this.brakeDir &&
      dir.x * this.brakeDir.x + dir.y * this.brakeDir.y >= BRAKE_SAME_PRESS;
    if (!held) {
      this.brakeHold = 0;
      this.brakeDir = dir;
      const { vx, vy } = this.ship.velocity;
      const along = dir ? vx * dir.x + vy * dir.y : 0;
      this.brakeArmed =
        along < -brake.minSpeed &&
        along <= -Math.hypot(vx, vy) * Math.cos(BRAKE_AGAINST);
    }
    if (dir) {
      this.brakeHold += deltaTime;
      const due = this.brakeArmed && this.brakeHold >= brake.hold - 1e-9;
      if (due) this.brakeArmed = false; // one try per press
      if (due && this.brakeCooldownTimer <= 0 && this.dashTimer <= 0) {
        const reactive = this.reactiveBrake;
        this.brakeCooldownTimer =
          brake.cooldown * (reactive?.cooldownMultiplier ?? 1);
        this.brakeTimer = brake.stopTime;
        this.brakeFrom = { ...this.ship.velocity };
        this.getEventBus()?.emit?.('player-braked', {
          position: { ...this.ship.position },
          radius: brake.radius,
          knockback: brake.knockback * (reactive?.knockbackMultiplier ?? 1),
        });
        // Reactive Brake: EnemySystem's area damage, full at the ship and
        // fading to the ring's edge.
        if (reactive) {
          this.getEventBus()?.emit?.('shield-explosion-damage', {
            position: { ...this.ship.position },
            radius: brake.radius,
            damage: reactive.damage,
          });
        }
      }
    }
    if (this.brakeTimer > 0) {
      this.brakeTimer = Math.max(0, this.brakeTimer - deltaTime);
      const k = this.brakeTimer / brake.stopTime;
      this.ship.velocity.vx = this.brakeFrom.vx * k;
      this.ship.velocity.vy = this.brakeFrom.vy * k;
    }
  }

  /** 0 when a dash is ready, 1 right after the last one. */
  getDashCooldownFraction() {
    return this.dashSpare > 0 ? 0 : this.dashCooldownTimer / this.dashCooldown;
  }

  // What the Maneuver cards and their Apex change, back to none.
  resetManeuverStats() {
    this.dashContactDamage = 0;
    this.dashDistanceMultiplier = 1;
    this.dashSpareMax = 0;
    this.dashSpare = 0;
    this.dashSpareTimer = 0;
    this.dashGhostLinger = 1;
    this.reactiveBrake = null;
    this.blink = null;
  }
}
