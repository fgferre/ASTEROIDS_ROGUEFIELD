// src/modules/player/maneuvers.js
//
// The ship's maneuvers: the dash (its burst, cooldown, afterimages and
// invulnerability, and Blink, the Maneuver Apex), the hold-S emergency
// brake, and what the Maneuver cards change about them. PlayerSystem owns
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

  // Once per step, alive or not: the cooldown runs down and this step's dash
  // press is taken (true if there was one).
  takeDashRequest(deltaTime) {
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - deltaTime);
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
    this.dashGhosts = [];
    this.dashGhostsDropped = 0;
    this.dashRammed = new Set();
    if (this.blinkTimer > 0) this.ship._quitExplosionHidden = false;
    this.blinkTimer = 0;
    this.brakeHold = 0;
    this.brakeArmed = false;
    this.brakeCooldownTimer = 0;
    this.brakeTimer = 0;
    this.brakeFrom = null;
  }

  /**
   * Classic: forward along the nose, or backward while only S/↓ is held.
   * Modern: along the held WASD direction, else along the nose.
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
    this.dashCooldownTimer = this.dashCooldown;
    this.ship.invulnerableTimer = Math.max(
      this.ship.invulnerableTimer,
      DASH_INVULNERABILITY + this.dashInvulnerabilityBonus
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
   * Braking System 3: S held alone for `hold` s stops the ship over
   * `stopTime` s and sends a shove-only shockwave, once per press. Armed only
   * if S pushed against the motion when pressed, so flying down-screen with S
   * (modern) never brakes.
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
    const held =
      input.down &&
      !input.up &&
      !input.left &&
      !input.right &&
      !input.moveX &&
      !input.moveY;
    if (!held) {
      this.brakeHold = 0;
      this.brakeArmed = false;
    } else {
      if (this.brakeHold === 0) {
        // S pushes down the screen (modern) or against the nose (classic).
        const push =
          this.ship.controlScheme === 'modern'
            ? this.ship.velocity.vy
            : -(
                this.ship.velocity.vx * Math.cos(this.ship.angle) +
                this.ship.velocity.vy * Math.sin(this.ship.angle)
              );
        this.brakeArmed = push < -brake.minSpeed;
      }
      this.brakeHold += deltaTime;
      const due = this.brakeArmed && this.brakeHold >= brake.hold - 1e-9;
      if (due) this.brakeArmed = false; // one try per press
      if (due && this.brakeCooldownTimer <= 0 && this.dashTimer <= 0) {
        this.brakeCooldownTimer = brake.cooldown;
        this.brakeTimer = brake.stopTime;
        this.brakeFrom = { ...this.ship.velocity };
        const reactive = this.reactiveBrake;
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

  /** 0 when the dash is ready, 1 right after dashing. */
  getDashCooldownFraction() {
    return this.dashCooldownTimer / this.dashCooldown;
  }

  // What the Maneuver cards and their Apex change, back to none.
  resetManeuverStats() {
    this.dashContactDamage = 0;
    this.dashDistanceMultiplier = 1;
    this.dashInvulnerabilityBonus = 0;
    this.dashGhostLinger = 1;
    this.turretTurnMultiplier = 1;
    this.reactiveBrake = null;
    this.blink = null;
  }
}
