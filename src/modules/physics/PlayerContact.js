// src/modules/physics/PlayerContact.js
//
// The ship against enemies' bodies: who touches the ship this frame, how the
// two push apart and bounce, what the touch costs the hull or the shield,
// the shield's reflect, and the Ram Plating hit of a dashing ship.
// PhysicsSystem owns it; WorldSystem runs it each frame, and the Warden's
// charge reuses its single-contact resolution.

import { GameDebugLogger } from '../../utils/dev/GameDebugLogger.js';
import { SHIP_MASS } from '../../data/constants/physics.js';
import {
  SHIELD_COLLISION_BOUNCE,
  SHIELD_REFLECT_SPEED,
  SHIELD_HIT_GRACE_TIME,
} from '../../data/constants/gameplay.js';
import { isBossEnemy, resolveEnemyCollisionRadius } from './bossTuning.js';

export class PlayerContact {
  /**
   * `impacts`: the ImpactFeedback (boss contact feedback, screen shake).
   * `emit(name, payload)`: sends shield-deflected and player-took-damage.
   * `ensureSpatialIndex()`: brings the spatial index up to date before the query.
   * `getNearbyEnemies(x, y, radius)`: the boss-aware spatial query.
   * `maxEnemyRadius()`: the widest enemy radius seen, which pads the query.
   */
  constructor({
    impacts,
    emit,
    ensureSpatialIndex,
    getNearbyEnemies,
    maxEnemyRadius,
  }) {
    this.impacts = impacts;
    this.emit = emit;
    this.ensureSpatialIndex = ensureSpatialIndex;
    this.getNearbyEnemies = getNearbyEnemies;
    this.maxEnemyRadius = maxEnemyRadius;
  }

  buildPlayerCollisionContext(player) {
    const shieldState = player.getShieldState();
    const shieldActive =
      shieldState?.isActive &&
      shieldState.maxHits > 0 &&
      shieldState.currentHits > 0;
    const impactProfile = shieldActive
      ? player.getShieldImpactProfile()
      : { damage: 0, forceMultiplier: 1, level: shieldState?.level ?? 0 };

    const hullRadius = player.getHullBoundingRadius();
    const padding = shieldActive ? player.getShieldPadding() : 0;

    const collisionRadius = Math.max(0, hullRadius + padding);

    return {
      shieldState,
      shieldActive,
      impactProfile,
      hullRadius,
      padding,
      collisionRadius,
    };
  }

  handlePlayerAsteroidCollision(player, asteroid, enemiesSystem, options = {}) {
    const result = { collided: false, playerDied: false };

    if (!asteroid || asteroid.destroyed || !player) {
      return result;
    }

    const {
      damageOverride = null,
      extraKnockback = 0,
      bossVelocityDamp = 0,
      damageBonus = 0,
      collisionType = null,
      radiusOverride = null,
      screenShake = null,
    } = options || {};

    const isBoss = isBossEnemy(asteroid);
    const collisionLabel =
      collisionType || (isBoss ? 'boss-contact' : 'enemy-contact');

    result.collisionType = collisionLabel;
    result.enemy = asteroid || null;
    result.isBossCollision = isBoss;

    const position = player.position;
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return result;
    }

    const context = this.buildPlayerCollisionContext(player);
    result.playerContext = context;

    const collisionRadius = context.collisionRadius;
    let asteroidRadius = resolveEnemyCollisionRadius(asteroid);
    if (Number.isFinite(radiusOverride)) {
      asteroidRadius = Math.max(asteroidRadius, Math.max(0, radiusOverride));
    }

    if (collisionRadius <= 0) {
      return result;
    }

    const dx = position.x - asteroid.x;
    const dy = position.y - asteroid.y;
    const maxDistance = collisionRadius + asteroidRadius;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq >= maxDistance * maxDistance) {
      return result;
    }

    result.collided = true;
    result.enemyRadius = asteroidRadius;
    result.maxDistance = maxDistance;

    if (isBoss) {
      const contactDamage = Number.isFinite(asteroid.contactDamage)
        ? asteroid.contactDamage
        : 45;

      GameDebugLogger.log('COLLISION', 'Player collided with boss', {
        playerPosition: {
          x: Math.round(position.x ?? 0),
          y: Math.round(position.y ?? 0),
        },
        bossPosition: {
          x: Math.round(asteroid.x ?? 0),
          y: Math.round(asteroid.y ?? 0),
        },
        distance: Number.isFinite(distanceSq)
          ? Number(Math.sqrt(Math.max(0, distanceSq)).toFixed(2))
          : null,
        contactDamage,
      });
    }

    const distance = Math.sqrt(distanceSq);
    const nx = distance > 0 ? dx / distance : 0;
    const ny = distance > 0 ? dy / distance : 0;
    const overlap = maxDistance - distance;
    const overlapAmount = overlap > 0 ? overlap : 0;
    const impactX = asteroid.x + nx * asteroidRadius;
    const impactY = asteroid.y + ny * asteroidRadius;

    result.distance = distance;
    result.distanceSq = distanceSq;
    result.collisionNormal = { x: nx, y: ny };
    result.overlap = overlapAmount;
    result.impactPosition = { x: impactX, y: impactY };

    if (overlap > 0) {
      const playerPushRatio = context.shieldActive ? 0.18 : 0.5;
      const asteroidPushRatio = 1 - playerPushRatio;
      const playerShift = overlapAmount * playerPushRatio;
      const asteroidShift = overlapAmount * asteroidPushRatio;
      player.position.x += nx * playerShift;
      player.position.y += ny * playerShift;
      asteroid.x -= nx * asteroidShift;
      asteroid.y -= ny * asteroidShift;
      result.separationApplied = {
        player: playerShift,
        enemy: asteroidShift,
      };
    }

    const playerMass = context.shieldActive
      ? SHIP_MASS * Math.max(context.impactProfile.forceMultiplier, 1)
      : SHIP_MASS;
    const rvx = asteroid.vx - player.velocity.vx;
    const rvy = asteroid.vy - player.velocity.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal < 0) {
      const bounce = context.shieldActive ? SHIELD_COLLISION_BOUNCE : 0.2;
      const invMass1 = 1 / Math.max(playerMass, 1);
      const invMass2 = 1 / Math.max(asteroid.mass || 1, 1);
      let j = (-(1 + bounce) * velAlongNormal) / (invMass1 + invMass2);
      if (context.shieldActive) {
        j *= Math.max(context.impactProfile.forceMultiplier, 1);
      }

      const jx = j * nx;
      const jy = j * ny;

      player.velocity.vx -= jx * invMass1;
      player.velocity.vy -= jy * invMass1;
      asteroid.vx += jx * invMass2;
      asteroid.vy += jy * invMass2;
    }

    if (Number.isFinite(extraKnockback) && extraKnockback !== 0) {
      const impulse = extraKnockback / Math.max(playerMass, 1);
      player.velocity.vx += nx * impulse;
      player.velocity.vy += ny * impulse;
      result.extraKnockbackApplied = extraKnockback;
    }

    if (isBoss && Number.isFinite(bossVelocityDamp) && bossVelocityDamp !== 0) {
      const mass = Math.max(asteroid.mass || 1, 1);
      const damp = bossVelocityDamp / mass;
      asteroid.vx -= nx * damp;
      asteroid.vy -= ny * damp;
      result.bossVelocityDampApplied = bossVelocityDamp;
    }

    const relSpeed = Math.hypot(
      asteroid.vx - player.velocity.vx,
      asteroid.vy - player.velocity.vy
    );
    result.relativeSpeed = relSpeed;

    const finalizeBossFeedback = (damageValue) => {
      if (!isBoss) {
        return;
      }

      this.impacts.handleBossCollisionFeedback(collisionLabel, {
        boss: asteroid,
        player,
        damage: damageValue,
        overlap: overlapAmount,
        relativeSpeed: relSpeed,
        impactPosition: result.impactPosition,
        knockback: Number.isFinite(extraKnockback) ? extraKnockback : null,
        screenShake,
      });
    };

    if (player.invulnerableTimer > 0) {
      // Ram Plating: a dashing ship hits each enemy it touches once per dash.
      if (
        player.dashTimer > 0 &&
        player.dashContactDamage > 0 &&
        !player.dashRammed.has(asteroid)
      ) {
        player.dashRammed.add(asteroid);
        enemiesSystem.applyDamage(asteroid, player.dashContactDamage, {
          source: { hitPosition: result.impactPosition },
        });
      }
      finalizeBossFeedback(0);
      return result;
    }

    const previousShieldHits = context.shieldState?.currentHits ?? 0;
    const prevShieldActive = context.shieldActive;

    // Support enemies with a contactDamage (Husk, Ram, Bulwark, elites) hit
    // that hard; everything else keeps the base 12.
    const baseDamage =
      !isBoss && Number.isFinite(asteroid.contactDamage)
        ? asteroid.contactDamage
        : 12;
    const momentumFactor = (asteroid.mass * relSpeed) / 120;
    let rawDamage =
      baseDamage +
      momentumFactor +
      (Number.isFinite(damageBonus) ? damageBonus : 0);
    let damage = Math.max(3, Math.floor(rawDamage));
    if (Number.isFinite(damageOverride)) {
      damage = Math.max(0, Math.floor(damageOverride));
    }
    result.damage = damage;
    const remaining = player.takeDamage(damage, asteroid);
    result.remainingHealth = typeof remaining === 'number' ? remaining : null;

    const newShieldState = player.getShieldState();

    const shieldAbsorbedHit =
      prevShieldActive &&
      (!newShieldState?.isActive ||
        (typeof newShieldState.currentHits === 'number' &&
          newShieldState.currentHits < previousShieldHits));

    if (shieldAbsorbedHit) {
      const boost =
        SHIELD_REFLECT_SPEED *
        Math.max(context.impactProfile.forceMultiplier, 1);
      asteroid.vx -= nx * boost;
      asteroid.vy -= ny * boost;

      const cooldown = SHIELD_HIT_GRACE_TIME;
      if (
        asteroid.shieldHitCooldown === undefined ||
        !Number.isFinite(asteroid.shieldHitCooldown)
      ) {
        asteroid.shieldHitCooldown = 0;
      }

      if (asteroid.shieldHitCooldown <= 0) {
        enemiesSystem.applyDamage(asteroid, context.impactProfile.damage);
        asteroid.shieldHitCooldown = cooldown;
      }

      this.emit('shield-deflected', {
        position: { x: player.position.x, y: player.position.y },
        normal: { x: nx, y: ny },
        level: context.impactProfile.level || context.shieldState?.level || 0,
        intensity: Math.max(context.impactProfile.forceMultiplier, 1),
      });
    }

    if (typeof remaining !== 'number') {
      return result;
    }

    player.setInvulnerableTimer(0.5);

    finalizeBossFeedback(damage);

    if (
      !isBoss &&
      screenShake &&
      Number.isFinite(screenShake.intensity) &&
      Number.isFinite(screenShake.duration)
    ) {
      this.impacts.triggerScreenShake(
        screenShake.intensity,
        screenShake.duration,
        screenShake.reason || collisionLabel,
        {
          playerId: player?.id ?? null,
          enemyId: asteroid?.id ?? null,
          impactPosition: result.impactPosition,
        }
      );
    }

    this.emit('player-took-damage', {
      damage,
      remaining,
      max: player.maxHealth,
      position: { ...player.position },
      playerPosition: { x: player.position.x, y: player.position.y },
      damageSource: { x: asteroid.x, y: asteroid.y },
    });

    if (remaining <= 0) {
      result.playerDied = true;
    }

    return result;
  }

  processPlayerCollisions(player, enemiesSystem) {
    const summary = { collisions: 0, playerDied: false };

    if (!player) {
      return summary;
    }

    const position = player.position;
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return summary;
    }

    this.ensureSpatialIndex();

    const context = this.buildPlayerCollisionContext(player);
    const queryRadius = Math.max(
      0,
      context.collisionRadius + (this.maxEnemyRadius() || 0)
    );

    if (queryRadius <= 0) {
      return summary;
    }

    const candidates = this.getNearbyEnemies(
      position.x,
      position.y,
      queryRadius
    );

    if (!candidates.length) {
      return summary;
    }

    for (let i = 0; i < candidates.length; i += 1) {
      const asteroid = candidates[i];
      const collision = this.handlePlayerAsteroidCollision(
        player,
        asteroid,
        enemiesSystem
      );

      if (collision.collided) {
        summary.collisions += 1;
      }

      if (collision.playerDied) {
        summary.playerDied = true;
        break;
      }
    }

    return summary;
  }
}
