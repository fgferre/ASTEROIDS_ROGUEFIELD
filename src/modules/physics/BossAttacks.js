// src/modules/physics/BossAttacks.js
//
// The Warden's body as a weapon: its charge slamming into the ship (the
// ship's contact resolution with the charge's knockback, slow and bonus
// damage) and its area blast hitting every enemy and the ship in range with
// falloff and knockback. EnemySystem asks PhysicsSystem for both when the
// boss emits them.

import { SHIP_MASS } from '../../data/constants/physics.js';
import {
  getBossAreaDamage,
  getBossAreaForce,
  getBossAreaRadius,
  getBossChargeBossSlow,
  getBossChargeDamageBonus,
  getBossChargeKnockback,
  resolveEnemyCollisionRadius,
} from './bossTuning.js';

export class BossAttacks {
  /**
   * `impacts`: the ImpactFeedback (cooldown-gated boss feedback and events).
   * `contact`: the PlayerContact (the ship's contact resolution and collision context).
   * `emit(name, payload)`: sends player-took-damage.
   * `resolveBossEntity(payload)`: the tracked boss a payload names.
   * `enemySystem()`: the enemy system, when the payload brings none.
   * `getNearbyEnemies(x, y, radius)`: the boss-aware spatial query.
   */
  constructor({
    impacts,
    contact,
    emit,
    resolveBossEntity,
    enemySystem,
    getNearbyEnemies,
  }) {
    this.impacts = impacts;
    this.contact = contact;
    this.emit = emit;
    this.resolveBossEntity = resolveBossEntity;
    this.enemySystem = enemySystem;
    this.getNearbyEnemies = getNearbyEnemies;
  }

  handleBossChargeCollision(payload = {}) {
    const boss = this.resolveBossEntity(payload);
    const player = payload?.player ?? payload?.target ?? null;
    const enemiesSystem = payload?.enemiesSystem ?? this.enemySystem() ?? null;

    const outcome = {
      type: 'boss-charge',
      boss,
      player,
      processed: false,
      processedBy: 'physics',
    };

    if (!boss || !player) {
      outcome.reason = 'missing-actor';
      return outcome;
    }

    const options = {
      damageOverride: Number.isFinite(payload.damage) ? payload.damage : null,
      extraKnockback: getBossChargeKnockback(payload.knockback),
      bossVelocityDamp: getBossChargeBossSlow(payload.bossSlow),
      damageBonus: getBossChargeDamageBonus(payload.damageBonus),
      collisionType: 'boss-charge',
      radiusOverride: Number.isFinite(payload.radius)
        ? payload.radius
        : Number.isFinite(payload.collisionRadius)
          ? payload.collisionRadius
          : null,
      screenShake: payload.screenShake || null,
    };

    const collision = this.contact.handlePlayerAsteroidCollision(
      player,
      boss,
      enemiesSystem,
      options
    );

    return {
      ...collision,
      ...outcome,
      processed: true,
    };
  }

  applyBossAreaDamage(payload = {}) {
    const boss = this.resolveBossEntity(payload);
    const basePosition =
      payload.position || (boss ? { x: boss.x ?? 0, y: boss.y ?? 0 } : null);

    const summary = {
      type: 'boss-area',
      boss,
      position: basePosition ? { ...basePosition } : null,
      radius: null,
      damage: null,
      hits: [],
      playerHit: null,
      processed: false,
      processedBy: 'physics',
    };

    if (
      !basePosition ||
      !Number.isFinite(basePosition.x) ||
      !Number.isFinite(basePosition.y)
    ) {
      summary.reason = 'invalid-position';
      return summary;
    }

    const radius = getBossAreaRadius(payload.radius, boss);
    if (!Number.isFinite(radius) || radius <= 0) {
      summary.reason = 'invalid-radius';
      return summary;
    }

    const damage = getBossAreaDamage(payload.damage, boss);
    const force = getBossAreaForce(payload.force);
    const disableFalloff = Boolean(payload.disableFalloff);
    const includePlayer = payload.includePlayer !== false;
    const player = includePlayer ? payload.player ?? null : null;
    const enemiesSystem = payload.enemiesSystem ?? this.enemySystem() ?? null;

    summary.radius = radius;
    summary.damage = damage;
    summary.processed = true;

    const originX = basePosition.x;
    const originY = basePosition.y;

    const candidates = this.getNearbyEnemies(originX, originY, radius);

    for (let i = 0; i < candidates.length; i += 1) {
      const enemy = candidates[i];
      if (!enemy || enemy.destroyed || enemy === boss) {
        continue;
      }

      if (!Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) {
        continue;
      }

      const dx = enemy.x - originX;
      const dy = enemy.y - originY;
      const distanceSq = dx * dx + dy * dy;
      const effectiveRadius = resolveEnemyCollisionRadius(enemy);
      const threshold = radius + effectiveRadius;
      if (distanceSq > threshold * threshold) {
        continue;
      }

      const distance = Math.sqrt(distanceSq);
      const falloffDistance = Math.max(0, distance - effectiveRadius);
      const falloff = disableFalloff
        ? 1
        : 1 - Math.min(falloffDistance / radius, 1);
      const scaledDamage = Math.max(0, damage * falloff);
      if (scaledDamage <= 0) {
        continue;
      }

      if (typeof enemy.takeDamage === 'function') {
        try {
          enemy.takeDamage(scaledDamage, { source: boss, type: 'boss-area' });
        } catch (error) {
          // ignore individual enemy damage errors
        }
      } else {
        enemiesSystem.applyDamage(enemy, scaledDamage);
      }

      let knockback = 0;
      if (Number.isFinite(force) && distance > 0) {
        const impulse = (force * falloff) / Math.max(enemy.mass || 1, 1);
        const nx = distance > 0 ? dx / Math.max(distance, 0.001) : 0;
        const ny = distance > 0 ? dy / Math.max(distance, 0.001) : 0;
        enemy.vx += nx * impulse;
        enemy.vy += ny * impulse;
        knockback = impulse;
      }

      summary.hits.push({
        enemy,
        damage: scaledDamage,
        distance,
        falloff,
        knockback,
      });
    }

    if (
      player &&
      player.position &&
      Number.isFinite(player.position.x) &&
      Number.isFinite(player.position.y)
    ) {
      const playerContext = this.contact.buildPlayerCollisionContext(player);
      const playerRadius = playerContext.collisionRadius;
      if (playerRadius > 0) {
        const dx = player.position.x - originX;
        const dy = player.position.y - originY;
        const distanceSq = dx * dx + dy * dy;
        const threshold = radius + playerRadius;

        if (distanceSq <= threshold * threshold) {
          const distance = Math.sqrt(distanceSq);
          const falloffDistance = Math.max(0, distance - playerRadius);
          const falloff = disableFalloff
            ? 1
            : 1 - Math.min(falloffDistance / radius, 1);
          const scaledDamage = Math.max(0, Math.floor(damage * falloff));
          const nx = distance > 0 ? dx / Math.max(distance, 0.001) : 0;
          const ny = distance > 0 ? dy / Math.max(distance, 0.001) : 0;
          const playerMass = playerContext.shieldActive
            ? SHIP_MASS *
              Math.max(playerContext.impactProfile.forceMultiplier, 1)
            : SHIP_MASS;

          const playerResult = {
            player,
            distance,
            falloff,
            damage: scaledDamage,
            knockback: 0,
          };

          if (Number.isFinite(force) && distance > 0) {
            const impulse = (force * falloff) / Math.max(playerMass, 1);
            player.velocity.vx += nx * impulse;
            player.velocity.vy += ny * impulse;
            playerResult.knockback = impulse;
          }

          if (
            scaledDamage > 0 &&
            (!player.invulnerableTimer || player.invulnerableTimer <= 0)
          ) {
            const remaining = player.takeDamage(scaledDamage, boss);
            playerResult.remainingHealth =
              typeof remaining === 'number' ? remaining : null;

            player.setInvulnerableTimer(0.4);

            this.emit('player-took-damage', {
              damage: scaledDamage,
              remaining,
              max: player.maxHealth,
              position: { ...player.position },
              playerPosition: { x: player.position.x, y: player.position.y },
              damageSource: { x: originX, y: originY },
            });

            if (typeof remaining === 'number' && remaining <= 0) {
              playerResult.playerDied = true;
            }
          } else {
            playerResult.skipped = true;
          }

          summary.playerHit = playerResult;
        }
      }
    }

    if (boss) {
      this.impacts.handleBossCollisionFeedback('boss-area', {
        boss,
        player: summary.playerHit?.player ?? player ?? null,
        damage,
        overlap: null,
        relativeSpeed: null,
        impactPosition: summary.position,
        screenShake: payload.screenShake || null,
      });
    } else {
      this.impacts.emitBossPhysicsEvent('boss-area-damage', {
        type: 'boss-area',
        position: summary.position,
        radius,
        damage,
        hits: summary.hits.length,
      });
    }

    return summary;
  }
}
