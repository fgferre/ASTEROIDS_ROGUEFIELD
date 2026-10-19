// src/modules/combat/HitResolution.js
//
// What a hit does: a lance, beam, flak bolt, shrapnel or chain hit lands its
// damage through the enemy service, then the knockback, the beam's extra
// split, the Prospector's orbs and the evolutions' burn, slow, pull and
// chain. CombatSystem owns it and resolves the collisions through it after
// the shots move; the weapons and the card effects land their hits here too.

import { GameDebugLogger } from '../../utils/dev/GameDebugLogger.js';
import {
  KNOCKBACK_BASE,
  KNOCKBACK_HEAVY_FACTOR,
  KNOCKBACK_MAX,
  KNOCKBACK_MIN,
  KNOCKBACK_REFERENCE_DAMAGE,
} from '../../data/constants/gameplay.js';
import { ORB_VALUE } from '../../data/enemies/asteroid-configs.js';
import { WEAPON_APEX, WEAPON_EVOLUTIONS } from '../../data/weapons.js';
import { spawnBeamFragments } from '../enemies/systems/EnemyDamageSystem.js';

/** Knockback speed (px/s) for a hit of `damage`, before the heavy factor. */
export function knockbackSpeed(damage) {
  const speed = KNOCKBACK_BASE * (damage / KNOCKBACK_REFERENCE_DAMAGE);
  return Math.min(KNOCKBACK_MAX, Math.max(KNOCKBACK_MIN, speed));
}

export class HitResolution {
  /**
   * `weapons()`: the Weapons instance (evolutions, Apexes, flak bursts).
   * `cards()`: the CardEffects instance (Chain Capacitor roll, burns, slows, pulls, chains).
   * `emit(name, payload)`: sends bullet-hit.
   */
  constructor({ weapons, cards, emit }) {
    this.weapons = weapons;
    this.cards = cards;
    this.emit = emit;

    this.resetProspectorCarry();
  }

  processBulletHit(bullet, enemy, enemiesSystem) {
    if (!bullet || !enemy || bullet.hit) {
      return;
    }
    // Railshot: a piercing lance skips what it already went through.
    if (bullet.pierced?.includes(enemy)) {
      return;
    }

    if (bullet.pierceLeft > 0) {
      bullet.pierceLeft -= 1;
      bullet.pierced.push(enemy);
    } else {
      bullet.hit = true;
    }
    const weapons = this.weapons();
    const cards = this.cards();
    const healthBefore = Number.isFinite(enemy.health) ? enemy.health : null;
    let requestedDamage = Number.isFinite(bullet.damage) ? bullet.damage : 0;
    // Chain Capacitor without the Chain Lance: some projectiles hit twice.
    const capacitor = cards.cardEffects.chainCapacitor;
    if (
      capacitor &&
      bullet.projectile &&
      !weapons.evolutions.includes('arc') &&
      cards.rollCardChance(capacitor.doubleHitChance)
    ) {
      requestedDamage *= 2;
    }
    // A beam's `extraFragments`: a large/medium rock it kills splits once
    // more per fragment, along the same seams (generateFragments is seeded by
    // the rock's crackSeed).
    const beamSplit =
      bullet.extraFragments > 0 &&
      enemy.type === 'asteroid' &&
      (enemy.size === 'large' || enemy.size === 'medium')
        ? {
            x: enemy.x,
            y: enemy.y,
            wave: enemy.wave,
            descriptors: enemy.generateFragments(),
          }
        : null;
    const rewards =
      bullet.kind !== 'chain' && weapons.evolutions.includes('salvage')
        ? enemiesSystem.rewardManager
        : null;
    const orbsBefore = rewards ? rewards.stats.totalOrbsDropped : 0;

    const damageResult = this.applyDamageToEnemy(
      enemiesSystem,
      enemy,
      requestedDamage,
      { hitPosition: { x: bullet.x, y: bullet.y } }
    );
    const remainingHealth = Number.isFinite(damageResult.remainingHealth)
      ? damageResult.remainingHealth
      : enemy.health ?? null;
    const effectiveDamage =
      Number.isFinite(healthBefore) && Number.isFinite(remainingHealth)
        ? Math.max(0, healthBefore - remainingHealth)
        : 0;
    const blockedByInvulnerability =
      enemy.type === 'boss' &&
      Boolean(enemy.invulnerable) &&
      effectiveDamage <= 0;

    damageResult.effectiveDamage = effectiveDamage;
    damageResult.blocked = blockedByInvulnerability;

    if (enemy.type === 'boss') {
      const maxHealth = Number.isFinite(enemy.maxHealth)
        ? enemy.maxHealth
        : null;
      const healthPercent =
        maxHealth && Number.isFinite(remainingHealth)
          ? Number(((remainingHealth / maxHealth) * 100).toFixed(1))
          : null;

      GameDebugLogger.log(
        'DAMAGE',
        blockedByInvulnerability
          ? 'Boss blocked bullet'
          : effectiveDamage > 0
            ? 'Boss took damage'
            : 'Boss bullet impact caused no damage',
        {
          requestedDamage,
          effectiveDamage,
          blocked: blockedByInvulnerability,
          killed: !!damageResult.killed,
          newHealth: remainingHealth,
          maxHealth,
          healthPercent,
          phase: enemy.currentPhase ?? null,
          invulnerable: !!enemy.invulnerable,
        }
      );
    }

    this.emit('bullet-hit', {
      bullet,
      enemy,
      position: { x: bullet.x, y: bullet.y },
      damage: effectiveDamage,
      requestedDamage,
      effectiveDamage,
      blocked: blockedByInvulnerability,
      killed: damageResult.killed,
      remainingHealth: damageResult.remainingHealth,
      invulnerable: !!enemy.invulnerable,
    });

    if (!blockedByInvulnerability) {
      if (!damageResult.killed && effectiveDamage > 0) {
        this.applyKnockback(bullet, enemy, effectiveDamage);
      }
      if (beamSplit && damageResult.killed) {
        spawnBeamFragments(
          enemiesSystem,
          enemy,
          beamSplit,
          bullet.extraFragments
        );
      }
      if (rewards && damageResult.killed) {
        this.dropProspectorOrbs(
          rewards,
          enemy,
          rewards.stats.totalOrbsDropped - orbsBefore
        );
      }
      if (bullet.kind !== 'chain') {
        this.applyEvolutionHit(enemy, requestedDamage, damageResult, bullet);
      }
    }
    // A projectile with a `burst` bursts on its first hit, blocked or not;
    // its shrapnel spares the enemy it struck.
    if (bullet.projectile?.burst) {
      bullet.volley.struck.push(enemy);
      weapons.burstFlak(bullet);
    }

    return damageResult;
  }

  // A shove along the bullet, heavier for bigger hits (PLAN.md R5.9). The AI
  // reasserts its own velocity, so it reads as a short stagger; asteroids
  // drift linearly and would keep it forever, so they are left alone.
  applyKnockback(bullet, enemy, damage) {
    this.pushEnemy(
      enemy,
      bullet.vx || 0,
      bullet.vy || 0,
      knockbackSpeed(damage)
    );
  }

  // Adds `speed` px/s along (dx, dy); bosses and heralds take a tenth, rocks
  // none (they would keep the drift forever).
  pushEnemy(enemy, dx, dy, speed) {
    if (enemy.type === 'asteroid') return;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const heavy = enemy.type === 'boss' || enemy.type === 'herald';
    const push = speed * (heavy ? KNOCKBACK_HEAVY_FACTOR : 1);
    const ix = (dx / length) * push;
    const iy = (dy / length) * push;
    enemy.vx = (enemy.vx ?? 0) + ix;
    enemy.vy = (enemy.vy ?? 0) + iy;
    // Steering strategies read `velocity` and write it back to vx/vy.
    if (enemy.velocity) {
      enemy.velocity.vx = (enemy.velocity.vx ?? 0) + ix;
      enemy.velocity.vy = (enemy.velocity.vy ?? 0) + iy;
    }
  }

  // A new run: the Prospector carry starts empty.
  resetProspectorCarry() {
    this.prospectorCarry = 0;
  }

  // Prospector: +25 % of the orbs a lance kill dropped (Motherlode: +100 %),
  // carried across kills so small rocks (1 orb) still pay out on average.
  dropProspectorOrbs(rewards, enemy, dropped) {
    const { orbBonus } = this.weapons().apexes.includes('salvage')
      ? WEAPON_APEX.salvage
      : WEAPON_EVOLUTIONS.salvage;
    this.prospectorCarry += Math.max(0, dropped) * orbBonus;
    const extra = Math.floor(this.prospectorCarry + 1e-9);
    if (extra <= 0) return;
    this.prospectorCarry -= extra;
    rewards.createXPOrbs(enemy, extra, ORB_VALUE);
  }

  // Burn, slow and chain on a lance or beam hit (chain hits do not chain);
  // an Apex replaces its family's first stage.
  applyEvolutionHit(enemy, damage, result, hit) {
    const weapons = this.weapons();
    const cards = this.cards();
    if (!weapons.evolutions.length) return;
    const alive = !result.killed && !enemy.destroyed;
    if (alive && weapons.evolutions.includes('thermal')) {
      const { burn } = WEAPON_EVOLUTIONS.thermal;
      cards.burns.set(enemy, {
        id: enemy.id,
        timer: 0,
        interval: burn.duration / burn.ticks,
        ticksLeft: burn.ticks,
        damage: damage * burn.damageFraction,
        spreadTo: weapons.apexes.includes('thermal') ? [] : null,
      });
    }
    // Bosses move on scripts, not on velocity: no slow and no pull.
    if (weapons.apexes.includes('field')) {
      cards.pullToward(enemy, alive, hit.x, hit.y);
    } else if (
      alive &&
      enemy.type !== 'boss' &&
      weapons.evolutions.includes('field')
    ) {
      cards.slows.set(enemy, {
        id: enemy.id,
        timer: WEAPON_EVOLUTIONS.field.slow.duration,
      });
    }
    if (weapons.evolutions.includes('arc')) {
      const { chain } = WEAPON_EVOLUTIONS.arc;
      const storm = weapons.apexes.includes('arc')
        ? WEAPON_APEX.arc.chain
        : null;
      cards.chainFrom(
        enemy,
        damage * chain.damageFraction,
        (storm ? storm.jumps : chain.jumps) +
          (cards.cardEffects.chainCapacitor?.extraJumps ?? 0),
        [enemy],
        storm ? storm.fork : 1
      );
    }
  }

  applyDamageToEnemy(enemiesSystem, enemy, damage, source) {
    const result = enemiesSystem.applyDamage(enemy, damage, { source });
    return {
      killed: !!result?.killed,
      remainingHealth: Math.max(
        0,
        result?.remainingHealth ?? enemy.health ?? 0
      ),
    };
  }
}
