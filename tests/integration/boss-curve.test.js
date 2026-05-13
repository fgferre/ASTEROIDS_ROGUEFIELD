/**
 * Boss curve calibration (Phase 0 — FIX-04).
 *
 * Validates that boss effective stats scale with the player's cumulative
 * upgrade-level sum so that:
 *   - 6-upgrade-sum builds kill the boss in [60s, 90s] (calibration target)
 *   - 15-upgrade-sum builds survive ≥45s with ≥1 phase transition reached
 *
 * The combat stub used here is a DPS PROXY, NOT A SIMULATION (REVIEWS
 * Concern 2 (b)). It deliberately bypasses armor, damage-type modifiers,
 * projectile travel, miss rate, and real cooldowns. The one live mechanic
 * it DOES model is phase-transition invulnerability windows (Concern 2 (a)):
 * during `boss.invulnerable === true` ticks, damage is not applied, modeling
 * the 2.0s × N shield delay the live boss enforces.
 *
 * The BLOCKING live ±20% fun-check (Plan 04 Task 4 — Concern 2 (c)) is the
 * ground-truth gate that catches the residual idealization gap.
 *
 * Seed: 0xB055. Distinct from AIM_REGRESSION_SEED (0xA1A1) and
 * PROGRESSION_FIX03_SEED (0xF003) per D-05 / D-13 convention.
 */

import { describe, it, expect } from 'vitest';
import { createTestContainer } from '../__helpers__/setup.js';
import { createScriptedPlayer } from '../__helpers__/scriptedPlayer.js';
// ESM import shape verified in docs/esm-import-shapes-2026-05-12.md:
// BossEnemy is a NAMED export (not default).
import { BossEnemy } from '../../src/modules/enemies/types/BossEnemy.js';
import * as CONSTANTS from '../../src/core/GameConstants.js';
// BOSS_CONFIG is exported from src/data/enemies/boss.js (NOT GameConstants).
import { BOSS_CONFIG } from '../../src/data/enemies/boss.js';

// Concern 9 + D-23: surface determinism skips so they don't pass silently.
// Flip to true if a Math.random leak is discovered in the scripted-player or
// boss update path during this fight. Phase 0 expected value: false.
const MATH_RANDOM_LEAK_DETECTED = false;
if (MATH_RANDOM_LEAK_DETECTED) {
  // eslint-disable-next-line no-console
  console.warn(
    '[WARN] Determinism test skipped due to Math.random leak — see INFRA-05'
  );
}

const BOSS_CURVE_SEED = 0xB055;
const TICK = 1 / 60;
const HARD_TIMEOUT_SECONDS = 90;
const KILL_TIME_MIN = 60;
const KILL_TIME_MAX = 90;

const SIX_UPGRADE_SUM = new Map([
  ['plasma', 3],
  ['multishot', 2],
  ['braking_system', 1],
]); // sum = 6
const FIFTEEN_UPGRADE_SUM = new Map([
  ['plasma', 3],
  ['multishot', 3],
  ['braking_system', 3],
  ['propulsors', 3],
  ['rcs_system', 3],
]); // sum = 15

// ─── Stub factories (local — no require, ESM only) ──────────────────────────

/**
 * Minimal combat stub. Decrements boss health on each `handleShooting` call
 * by `damage * multishot`, EXCEPT during invulnerability windows.
 *
 * Concern 2 mitigation (a): when `attachedBoss.invulnerable === true`, the
 * stub records an `invulnerableSkipCount++` and applies NO damage. This
 * models the 2.0s × N phase-transition shield delay the live boss enforces.
 */
function createMinimalCombatStub() {
  let attachedBoss = null;
  let invulnerableSkipCount = 0;
  return {
    enemyBullets: [],
    attachBoss(boss) {
      attachedBoss = boss;
    },
    get invulnerableSkipCount() {
      return invulnerableSkipCount;
    },
    /**
     * Per-tick boss state advance. Must be called every tick (NOT only on fire)
     * so that:
     *   - `evaluatePhaseTransition` fires when health crosses a threshold,
     *     which sets `invulnerable = true` and starts the invulnerability timer.
     *   - `updateInvulnerability(dt)` decrements that timer and clears the flag
     *     when it expires.
     * Without these calls, the boss would never transition phases in this
     * headless test setup (no `boss.update()` is invoked because we don't have
     * a full EnemySystem context to satisfy it).
     */
    tickBoss(dt) {
      if (!attachedBoss) return;
      if (typeof attachedBoss.evaluatePhaseTransition === 'function') {
        attachedBoss.evaluatePhaseTransition();
      }
      if (typeof attachedBoss.updateInvulnerability === 'function') {
        attachedBoss.updateInvulnerability(dt);
      }
    },
    handleShooting(_dt, stats) {
      if (!attachedBoss) return;
      // Concern 2 mitigation (a): respect invulnerability.
      if (attachedBoss.invulnerable === true) {
        invulnerableSkipCount++;
        return;
      }
      const dmg = (stats?.damage ?? 25) * (stats?.multishot ?? 1);
      attachedBoss.health = Math.max(0, attachedBoss.health - dmg);
    },
  };
}

function createMinimalPlayer() {
  return {
    position: { x: CONSTANTS.GAME_WIDTH / 2, y: CONSTANTS.GAME_HEIGHT / 2 },
    velocity: { vx: 0, vy: 0 },
    damage: 25,
    multishot: 1,
    getStats() {
      return { damage: this.damage, multishot: this.multishot };
    },
    update() {
      /* no-op for the calibration test */
    },
  };
}

function setupBossFight(
  appliedUpgrades,
  seedScope = String(BOSS_CURVE_SEED)
) {
  const container = createTestContainer(seedScope);
  const eventBus = container.resolve('event-bus');
  const random = container.resolve('random');
  const progression = {
    appliedUpgrades,
    getAllUpgrades: () => new Map(appliedUpgrades),
  };
  const player = createMinimalPlayer();
  const combatStub = createMinimalCombatStub();
  const enemySystem = {
    dependencies: { progression, eventBus, random, player },
    progression,
    eventBus,
    random,
    player,
  };
  const boss = new BossEnemy(enemySystem, { wave: 1 });
  combatStub.attachBoss(boss);
  const enemies = { bosses: [boss] };
  const driver = createScriptedPlayer({
    player,
    combat: combatStub,
    enemies,
  });
  return { boss, driver, combat: combatStub, player, progression };
}

function setupBossFightAtWave(
  appliedUpgrades,
  waveNumber,
  seedScope = 'wave-axis-check'
) {
  const container = createTestContainer(seedScope);
  const eventBus = container.resolve('event-bus');
  const random = container.resolve('random');
  const progression = {
    appliedUpgrades,
    getAllUpgrades: () => new Map(appliedUpgrades),
  };
  const player = createMinimalPlayer();
  const enemySystem = {
    dependencies: { progression, eventBus, random, player },
    progression,
    eventBus,
    random,
    player,
  };
  const boss = new BossEnemy(enemySystem, { wave: waveNumber });
  return { boss };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Boss curve calibration (FIX-04)', () => {
  it('reports the upgrade-level sum it sees', () => {
    const { boss } = setupBossFight(SIX_UPGRADE_SUM);
    expect(boss.upgradeLevelSum).toBe(6);
  });

  it('per-wave healthScaling still applies with sum=0', () => {
    const { boss } = setupBossFight(new Map(), 'wave-axis-check-w1');
    const baseHealth = BOSS_CONFIG.health;
    // At wave 1 with sum=0, the scaling factor collapses to 1 and the
    // base health is used directly.
    expect(boss.maxHealth).toBe(baseHealth);

    const { boss: boss3 } = setupBossFightAtWave(new Map(), 3);
    const scaling = BOSS_CONFIG.healthScaling;
    // At wave 3 with sum=0, expect baseHealth * scaling^2 (allowing ceil rounding).
    expect(boss3.maxHealth).toBeGreaterThanOrEqual(
      Math.floor(baseHealth * scaling * scaling) - 1
    );
  });

  it('6-upgrade-sum player kills boss in 60-90 sim seconds (calibration target)', () => {
    const { driver, combat } = setupBossFight(SIX_UPGRADE_SUM);
    const maxTicks = Math.ceil(HARD_TIMEOUT_SECONDS / TICK);
    for (let t = 0; t < maxTicks && !driver.bossKilled; t++) {
      driver.update(TICK);
    }
    // eslint-disable-next-line no-console
    console.log(
      '[FIX-04] sum=6 killTime:',
      driver.killTime,
      'invulnSkipCount:',
      combat.invulnerableSkipCount,
      'scalars:',
      {
        H: CONSTANTS.UPGRADE_BOSS_HEALTH_SCALAR,
        D: CONSTANTS.UPGRADE_BOSS_DAMAGE_SCALAR,
      }
    );
    expect(driver.bossKilled).toBe(true);
    expect(driver.killTime).toBeGreaterThanOrEqual(KILL_TIME_MIN);
    expect(driver.killTime).toBeLessThanOrEqual(KILL_TIME_MAX);
  });

  it('Concern 2 (a): invulnerability windows are respected by the stub', () => {
    const { driver, combat } = setupBossFight(SIX_UPGRADE_SUM);
    const maxTicks = Math.ceil(HARD_TIMEOUT_SECONDS / TICK);
    for (let t = 0; t < maxTicks && !driver.bossKilled; t++) {
      driver.update(TICK);
    }
    // If at least one phase transition was reached, the stub MUST have skipped
    // some ticks due to invulnerability — otherwise the model gap is wider
    // than the test claims to cover.
    if (driver.phasesObserved >= 1) {
      expect(combat.invulnerableSkipCount).toBeGreaterThan(0);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        '[FIX-04] no phase transitions observed in 6-upgrade-sum fight; invulnerability gate not exercised'
      );
    }
  });

  it('15-upgrade-sum player survives ≥45s and reaches phase ≥1', () => {
    const { driver } = setupBossFight(FIFTEEN_UPGRADE_SUM, 'fifteen-sum');
    const ticksFor45s = Math.ceil(45 / TICK);
    for (let t = 0; t < ticksFor45s && !driver.bossKilled; t++) {
      driver.update(TICK);
    }
    // eslint-disable-next-line no-console
    console.log(
      '[FIX-04] sum=15 elapsed45s killed:',
      driver.bossKilled,
      'phases:',
      driver.phasesObserved
    );
    expect(driver.bossKilled).toBe(false);
    expect(driver.phasesObserved).toBeGreaterThanOrEqual(1);
  });

  (MATH_RANDOM_LEAK_DETECTED ? it.skip : it)(
    'determinism: two runs with the same seed produce the same killTime',
    () => {
      const runOnce = (scope) => {
        const { driver } = setupBossFight(SIX_UPGRADE_SUM, scope);
        const max = Math.ceil(HARD_TIMEOUT_SECONDS / TICK);
        for (let t = 0; t < max && !driver.bossKilled; t++) {
          driver.update(TICK);
        }
        return driver.killTime;
      };
      const a = runOnce('det-a');
      const b = runOnce('det-a');
      expect(a).toBe(b);
    }
  );
});
