/**
 * Scripted-player AI for headless boss/wave tests.
 *
 * Strategy:
 *   - Fire on every Nth tick (combat.handleShooting with the player's current
 *     stats; emulates a held trigger at ~15 Hz at 60 fps).
 *   - Dodge by computing the perpendicular vector to the nearest incoming
 *     enemy projectile and nudging player.velocity along it. Nudge magnitude
 *     is clamped to a fraction of SHIP_MAX_SPEED so the test is reproducible.
 *   - Keep the player inside game bounds (clamp).
 *   - Track elapsed time, boss kill time, and the set of boss phase transitions
 *     observed across the run.
 *
 * Intended for tests/integration/boss-curve.test.js (Phase 0 FIX-04) and
 * Phase 1 profiling-baseline reruns. Lives in tests/__helpers__/ alongside
 * setup.js, mocks.js, etc., per established project convention.
 * NOT intended for production simulation.
 *
 * Usage:
 *   import { createScriptedPlayer } from '../__helpers__/scriptedPlayer.js';
 *   const driver = createScriptedPlayer({ player, combat, enemies });
 *   for (let tick = 0; tick < 60 * 90; tick++) driver.update(1/60);
 *   // driver.bossKilled, driver.killTime, driver.phasesObserved
 *
 * FIX-04 dependencies (field shapes assumed — refresh if CombatSystem /
 * EnemySystem refactor changes the underlying containers):
 *   - combat.enemyBullets — active enemy projectile array
 *   - combat.handleShooting(dt, stats) — fire-this-frame entry point
 *   - player.position.{x, y}, player.velocity.{vx, vy}
 *   - player.getStats() — combat-ready stat snapshot
 *   - enemies.bosses (or .activeBosses) — array; bosses identified by type === 'boss'
 *   - boss.currentPhase, boss.health
 */

import {
  SHIP_MAX_SPEED,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../../src/core/GameConstants.js';

const DODGE_FRACTION = 0.5; // fraction of SHIP_MAX_SPEED applied as dodge nudge
const DODGE_DISTANCE_THRESHOLD = 220; // px — only dodge projectiles closer than this
// FIX-04 calibration: dropped from 4 ticks (15 Hz) to 30 ticks (2 Hz) to match
// realistic live player fire cadence under enforced weapon cooldowns. The 15 Hz
// rate proved an order of magnitude faster than live and broke the calibration
// math. See docs/balance-retune-2026-05-12.md FIX-04 calibration log.
const FIRE_INTERVAL_TICKS = 30; // ticks between forced fire events (~2 Hz at 60fps)

export function createScriptedPlayer({ player, combat, enemies } = {}) {
  if (!player || !combat) {
    throw new Error('[scriptedPlayer] requires { player, combat }');
  }

  let fireCounter = 0;
  let elapsed = 0;
  let bossKilled = false;
  let killTime = null;
  const phasesObserved = new Set();

  return {
    update(dt) {
      elapsed += dt;

      // 0) Per-tick boss state advance (phase transitions, invulnerability
      //    timer). Required because headless tests don't have a full
      //    EnemySystem.update() loop driving the boss. The combat stub
      //    exposes `tickBoss(dt)` for this; helper is a no-op if absent so
      //    non-FIX-04 callers don't have to provide it.
      if (typeof combat.tickBoss === 'function') {
        combat.tickBoss(dt);
      }

      // 1) Fire continuously.
      fireCounter++;
      if (fireCounter >= FIRE_INTERVAL_TICKS) {
        fireCounter = 0;
        const stats =
          typeof player.getStats === 'function' ? player.getStats() : null;
        if (stats && typeof combat.handleShooting === 'function') {
          combat.handleShooting(dt, stats);
        }
      }

      // 2) Dodge: find nearest incoming enemy projectile.
      let nearest = null;
      let nearestDist = Infinity;
      const proj = combat.enemyBullets ?? [];
      for (const p of proj) {
        if (!p) continue;
        const dx = (p.x ?? 0) - (player.position?.x ?? 0);
        const dy = (p.y ?? 0) - (player.position?.y ?? 0);
        const d = Math.hypot(dx, dy);
        if (d < nearestDist && d < DODGE_DISTANCE_THRESHOLD) {
          nearest = p;
          nearestDist = d;
        }
      }
      if (nearest && player.velocity) {
        const incDx = nearest.vx ?? nearest.dx ?? 0;
        const incDy = nearest.vy ?? nearest.dy ?? 0;
        const len = Math.hypot(incDx, incDy) || 1;
        // Perpendicular to incoming velocity (rotate 90°).
        const perpX = -incDy / len;
        const perpY = incDx / len;
        const nudge = SHIP_MAX_SPEED * DODGE_FRACTION;
        player.velocity.vx = (player.velocity.vx ?? 0) + perpX * nudge * dt;
        player.velocity.vy = (player.velocity.vy ?? 0) + perpY * nudge * dt;
      }

      // 3) Update player physics minimally (delegate to player.update if available).
      if (typeof player.update === 'function') {
        player.update(dt);
      }

      // 4) Clamp inside bounds.
      if (player.position) {
        if (player.position.x < 0) player.position.x = 0;
        if (player.position.x > GAME_WIDTH) player.position.x = GAME_WIDTH;
        if (player.position.y < 0) player.position.y = 0;
        if (player.position.y > GAME_HEIGHT) player.position.y = GAME_HEIGHT;
      }

      // 5) Observe boss state.
      const bossList =
        enemies?.bosses ?? enemies?.activeBosses ?? enemies?.boss
          ? Array.isArray(enemies?.bosses)
            ? enemies.bosses
            : Array.isArray(enemies?.activeBosses)
              ? enemies.activeBosses
              : enemies?.boss
                ? [enemies.boss]
                : []
          : [];
      const boss = bossList.find((b) => b && b.type === 'boss');
      if (boss) {
        if (Number.isFinite(boss.currentPhase)) {
          phasesObserved.add(boss.currentPhase);
        }
        if (boss.health <= 0 && !bossKilled) {
          bossKilled = true;
          killTime = elapsed;
        }
      }
    },

    get elapsedSeconds() {
      return elapsed;
    },
    get bossKilled() {
      return bossKilled;
    },
    get killTime() {
      return killTime;
    },
    get phasesObserved() {
      return phasesObserved.size;
    },
  };
}
