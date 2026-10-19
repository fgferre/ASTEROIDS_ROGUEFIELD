// =============================================================================
// Plan 01.07 FIX-05 — centerline invariant + toggles
// =============================================================================
//
// New describe block introduced by plan 01.07 (Task 2 + Task 8). Each block
// names the specific must_have.truths claim it covers; assertions are
// geometric (vector / position math), not state-flag-only.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  setupGlobalMocks,
  cleanupGlobalState,
  createTestContainer,
} from '../../__helpers__/setup.js';
import { GamePools } from '../../../src/core/GamePools.js';
import CombatSystem from '../../../src/modules/CombatSystem.js';
import { BULLET_SIZE } from '../../../src/core/GameConstants.js';
import PlayerSystem from '../../../src/modules/PlayerSystem.js';
import {
  setupCombatHarness,
  MOVING_TARGET_POSITION,
  MOVING_TARGET_VELOCITY,
} from './aimHarness.js';

describe('FIX-05 centerline invariant + toggles', () => {
  beforeAll(() => {
    if (!GamePools.initialized) {
      GamePools.initialize();
    }
  });

  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());
  describe('aim mode toggle: auto default, manual opt-in', () => {
    it('default boot state: aimMode is "auto"', () => {
      const { combat } = setupCombatHarness();
      expect(combat.getAimMode()).toBe('auto');
    });

    it('setAimMode("manual") clears currentTarget + locks + predictedAimPoints', () => {
      const { combat } = setupCombatHarness({ multishot: 2 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.currentTarget).not.toBeNull();

      combat.setAimMode('manual');
      expect(combat.currentTarget).toBeNull();
      expect(combat.currentTargetLocks).toEqual([]);
      expect(combat.currentLockAssignments).toEqual([]);
    });

    it('manual mode: fireForward path used (no target lock); bullets fly in ship rotation direction', () => {
      const { combat, playerState } = setupCombatHarness({ multishot: 3 });
      playerState.multishot = 3;
      combat.setAimMode('manual');
      combat.setSpreadMode('concentrated');

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBe(3);
      // Fix-pass (F6): manual + concentrated now keeps every origin at the
      // nose and applies lane offset only to the aim point. So outer lanes
      // fly with a tiny angular divergence (atan2(parallelSpacing,
      // range=1000) ≈ 0.014 rad). The center lane still flies on-axis.
      // Tolerance: 0.02 rad accommodates the parallelSpacing=14, range=1000
      // geometry plus float-precision slack.
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a)).toBeLessThan(0.02);
      });
    });

    it('F7: manual mode early-returns from updateTargeting; locks stay null across multiple ticks', () => {
      // Codex review F7: setAimMode("manual") clears locks once, but
      // updateTargeting was not gated — every subsequent tick could
      // re-populate currentTarget/currentTargetLocks while still in manual
      // mode. Plan must_have: "no target lock / no multi-lock while manual."
      const { combat } = setupCombatHarness({ multishot: 2 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.currentTarget).not.toBeNull();

      combat.setAimMode('manual');
      // After entering manual mode the locks are cleared.
      expect(combat.currentTarget).toBeNull();
      expect(combat.currentTargetLocks).toEqual([]);

      // Advance several update ticks. Without the F7 gate, updateTargeting
      // re-runs findBestTarget every tick and repopulates currentTarget.
      for (let i = 0; i < 5; i += 1) {
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(combat.targetUpdateInterval + 0.01);
      }
      expect(combat.currentTarget).toBeNull();
      expect(combat.currentTargetLocks).toEqual([]);
      expect(combat.currentLockAssignments).toEqual([]);
    });

    it('F8: switching from manual back to auto forces fresh acquisition on the next tick (needsRetarget consumed)', () => {
      // Codex review F8: setAimMode("auto") sets `needsRetarget = true` but
      // nothing consumed the flag — updateTargeting decremented the timer
      // and delayed acquisition by one full interval. Fix: when needsRetarget
      // is set, the next update forces findBestTarget immediately.
      const { combat } = setupCombatHarness({ multishot: 2 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      const originalTarget = combat.currentTarget;
      expect(originalTarget).not.toBeNull();

      combat.setAimMode('manual');
      expect(combat.currentTarget).toBeNull();

      combat.setAimMode('auto');
      expect(combat.needsRetarget).toBe(true);

      // Advance ONE update tick. needsRetarget must force findBestTarget
      // immediately, regardless of targetUpdateTimer remaining.
      combat.updateTargeting(0.001);
      expect(combat.currentTarget).not.toBeNull();
      expect(combat.needsRetarget).toBe(false);
    });

    // Fix-pass-2 (C3): the _aimModeFlagSnapshot was captured on manual-on
    // and read verbatim on auto-switchback. If an upgrade-aiming-suite
    // event fired during manual mode (e.g. levelling up), the upgrade
    // bumped targetingUpgradeLevel and set the live behavioral flags, but
    // the snapshot stayed stale. On switchback the restore overwrote the
    // live flags with the pre-upgrade snapshot — silently dropping the
    // upgrade. Plan must-have: "rank-3 cooldownMultiplier preserved across
    // both aim modes" extends to behavioral flags too — upgrades acquired
    // during manual MUST survive switchback.
    it('C3: upgrade acquired during manual survives auto switchback (dangerScore + dynamicPrediction)', () => {
      const { combat, eventBus } = setupCombatHarness({ multishot: 2 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Start at rank 1: dangerScoreEnabled becomes true, dynamicPrediction false.
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      expect(combat.targetingUpgradeLevel).toBe(1);
      expect(combat.dangerScoreEnabled).toBe(true);
      expect(combat.dynamicPredictionEnabled).toBe(false);

      // Toggle to manual. Snapshot captured here:
      //   {dangerScoreEnabled: true, dynamicPredictionEnabled: false}.
      combat.setAimMode('manual');
      expect(combat.aimMode).toBe('manual');
      // Behavioral flags paused while manual.
      expect(combat.dangerScoreEnabled).toBe(false);
      expect(combat.dynamicPredictionEnabled).toBe(false);

      // Apply rank-2 upgrade WHILE in manual. dynamicPrediction should
      // be tracked so the restore on switchback re-enables it.
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      expect(combat.targetingUpgradeLevel).toBe(2);

      // Toggle back to auto. The restore MUST reflect rank 2's flags
      // (both true), not the pre-upgrade rank-1 snapshot.
      combat.setAimMode('auto');
      expect(combat.aimMode).toBe('auto');
      expect(combat.dangerScoreEnabled).toBe(true);
      // The C3 regression check — currently FAILS pre-fix because the
      // stale rank-1 snapshot restore overrides the rank-2 upgrade.
      expect(combat.dynamicPredictionEnabled).toBe(true);
    });

    it('C3: upgrade from rank 0 → rank 3 acquired during manual survives auto switchback', () => {
      // Stronger variant: bigger jump. rank-0 → manual → rank-3.
      const { combat, eventBus } = setupCombatHarness({ multishot: 4 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Start at rank 0: both flags false (default).
      expect(combat.targetingUpgradeLevel).toBe(0);
      expect(combat.dangerScoreEnabled).toBe(false);
      expect(combat.dynamicPredictionEnabled).toBe(false);

      // Toggle to manual. Snapshot = {false, false}.
      combat.setAimMode('manual');

      // Apply rank-3 upgrade while manual.
      eventBus.emit('upgrade-aiming-suite', { level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });

      // Toggle back to auto. Both flags must reflect rank-3 capabilities.
      combat.setAimMode('auto');
      expect(combat.dangerScoreEnabled).toBe(true);
      expect(combat.dynamicPredictionEnabled).toBe(true);
    });

    // Fix-pass-2 (C5): mode state must reset on run end. The first fix-pass
    // wired the toggles + manual path but did NOT reset spreadMode / aimMode
    // / _aimModeFlagSnapshot / needsRetarget on combat.reset() or on the
    // player-reset event. So a player who ended a run in manual+fan would
    // start the next run in manual+fan — wrong default.
    it('C5: combat.reset() restores spreadMode / aimMode / snapshot / needsRetarget to defaults', () => {
      const { combat } = setupCombatHarness({ multishot: 2 });
      // Dirty all four bits of mode state.
      combat.setSpreadMode('fan');
      combat.setAimMode('manual');
      combat.needsRetarget = true;
      // The setAimMode('manual') already populates _aimModeFlagSnapshot,
      // so dirty it further to make sure reset clears (not just overwrites).
      combat._aimModeFlagSnapshot = {
        dangerScoreEnabled: true,
        dynamicPredictionEnabled: true,
      };

      // Pre-condition: dirty state confirmed.
      expect(combat.getSpreadMode()).toBe('fan');
      expect(combat.getAimMode()).toBe('manual');
      expect(combat._aimModeFlagSnapshot).not.toBeNull();
      expect(combat.needsRetarget).toBe(true);

      combat.reset();

      // Post-condition: all four restored to defaults.
      expect(combat.getSpreadMode()).toBe('concentrated');
      expect(combat.getAimMode()).toBe('auto');
      expect(combat._aimModeFlagSnapshot).toBeNull();
      expect(combat.needsRetarget).toBe(false);
    });

    it('C5: player-reset event also restores spreadMode / aimMode / snapshot / needsRetarget', () => {
      const { combat, eventBus } = setupCombatHarness({ multishot: 2 });
      combat.setSpreadMode('fan');
      combat.setAimMode('manual');
      combat.needsRetarget = true;
      combat._aimModeFlagSnapshot = {
        dangerScoreEnabled: true,
        dynamicPredictionEnabled: true,
      };
      expect(combat.getSpreadMode()).toBe('fan');
      expect(combat.getAimMode()).toBe('manual');

      eventBus.emit('player-reset');

      expect(combat.getSpreadMode()).toBe('concentrated');
      expect(combat.getAimMode()).toBe('auto');
      expect(combat._aimModeFlagSnapshot).toBeNull();
      expect(combat.needsRetarget).toBe(false);
    });

    it('F6: manual + concentrated + N>1 → ALL shots leave from the same ship-nose origin (not nose ± perpendicular offset)', () => {
      // Codex review F6: the prior implementation passed originOverride = nose
      // to fireForward but applyConcentratedFire({kind: 'direction'}) STILL
      // offset each fireOrigin perpendicular to the rotation axis. So a
      // manual + concentrated multishot 3 burst produced 3 origins on a line
      // perpendicular to rotation (nose - spacing, nose, nose + spacing).
      // Plan must_have: "shots leave from the SHIP NOSE in the ship's
      // CURRENT rotation direction." The fix is option (a) from the brief:
      // all shots originate at the nose, fan out via aim-point perpendicular
      // offset only.
      const container = createTestContainer('manual-conc-nose-seed');
      const eventBus = container.resolve('event-bus');
      const random = container.resolve('random');
      const playerPos = { x: 400, y: 300 };
      const player = {
        isDead: false,
        isRetrying: false,
        _quitExplosionHidden: false,
        getPosition() {
          return { ...playerPos };
        },
        getVelocity() {
          return { x: 0, y: 0 };
        },
        getAngle() {
          return 0;
        },
        getRotation() {
          return 0;
        },
        getHullBoundingRadius() {
          return 16;
        },
        getShieldRadius() {
          return 16;
        },
        getTurretAngle() {
          return 0;
        },
        getMuzzlePoint() {
          return { x: playerPos.x + 16, y: playerPos.y };
        },
        getStats() {
          return { multishot: 3, damage: 10 };
        },
      };
      const enemies = { forEachActiveEnemy() {} };
      const physics = { forEachBulletCollision: () => {} };
      const combat = new CombatSystem({
        eventBus,
        random,
        player,
        enemies,
        physics,
      });
      combat.setSpreadMode('concentrated');
      combat.setAimMode('manual');

      const before = combat.bullets.length;
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBe(3);
      const noseExpected = { x: 416, y: 300 };
      fired.forEach((b) => {
        expect(b.x).toBeCloseTo(noseExpected.x, 0);
        expect(b.y).toBeCloseTo(noseExpected.y, 0);
      });
    });

    it('manual mode: bullets spawn at the turret muzzle, not the ship centre', () => {
      // getPosition() = (400, 300); the mock's muzzle sits at (416, 300).
      const container = createTestContainer('manual-nose-seed');
      const eventBus = container.resolve('event-bus');
      const random = container.resolve('random');
      const playerPos = { x: 400, y: 300 };
      const player = {
        isDead: false,
        isRetrying: false,
        _quitExplosionHidden: false,
        getPosition() {
          return { ...playerPos };
        },
        getVelocity() {
          return { x: 0, y: 0 };
        },
        getAngle() {
          return 0;
        },
        getRotation() {
          return 0;
        },
        getHullBoundingRadius() {
          return 16;
        },
        getShieldRadius() {
          return 16;
        },
        getTurretAngle() {
          return 0;
        },
        getMuzzlePoint() {
          return { x: playerPos.x + 16, y: playerPos.y };
        },
        getStats() {
          return { multishot: 1, damage: 10 };
        },
      };
      const enemies = { forEachActiveEnemy() {} };
      const physics = { forEachBulletCollision: () => {} };
      const combat = new CombatSystem({
        eventBus,
        random,
        player,
        enemies,
        physics,
      });
      combat.setAimMode('manual');

      const before = combat.bullets.length;
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBe(1);
      // Bullet should spawn at (416, 300) — the muzzle, not the ship center (400, 300).
      expect(fired[0].x).toBeCloseTo(416, 0);
      expect(fired[0].y).toBeCloseTo(300, 0);
    });

    it('manual mode: rank-3 cooldownMultiplier preserved across mode switch (decision a)', () => {
      const { combat, eventBus } = setupCombatHarness();
      // Apply rank 3: shootCooldown *= 0.92.
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });

      const cooldownBefore = combat.shootCooldown;
      const expectedReduction = combat.baseShootCooldown * 0.92;
      expect(cooldownBefore).toBeCloseTo(expectedReduction, 5);

      combat.setAimMode('manual');
      // Cooldown stat preserved — it's a weapon stat, not an aim behavior.
      expect(combat.shootCooldown).toBeCloseTo(cooldownBefore, 5);

      combat.setAimMode('auto');
      expect(combat.shootCooldown).toBeCloseTo(cooldownBefore, 5);
    });

    it('manual mode: behavioral flags paused; restored on switchback to auto', () => {
      const { combat, eventBus } = setupCombatHarness();
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 2,
        dynamicPrediction: {
          minLeadTime: 0.05,
          maxLeadTime: 1,
          fallbackLeadTime: 0.32,
        },
      });
      expect(combat.dangerScoreEnabled).toBe(true);
      expect(combat.dynamicPredictionEnabled).toBe(true);

      combat.setAimMode('manual');
      expect(combat.dangerScoreEnabled).toBe(false);
      expect(combat.dynamicPredictionEnabled).toBe(false);

      combat.setAimMode('auto');
      expect(combat.dangerScoreEnabled).toBe(true);
      expect(combat.dynamicPredictionEnabled).toBe(true);
    });

    it('switching auto → manual → auto sets needsRetarget flag', () => {
      const { combat } = setupCombatHarness();
      combat.setAimMode('manual');
      expect(combat.needsRetarget).toBeFalsy();
      combat.setAimMode('auto');
      expect(combat.needsRetarget).toBe(true);
    });

    it('toggle-aim-mode event with screen=playing flips aimMode', () => {
      const { combat, eventBus } = setupCombatHarness();
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode', { screen: 'playing' });
      expect(combat.getAimMode()).toBe('manual');

      eventBus.emit('toggle-aim-mode', { screen: 'playing' });
      expect(combat.getAimMode()).toBe('auto');
    });

    it('toggle-aim-mode no-ops when screen is not playing', () => {
      const { combat, eventBus } = setupCombatHarness();
      eventBus.emit('toggle-aim-mode', { screen: 'menu' });
      expect(combat.getAimMode()).toBe('auto');
    });
  });

  describe('lock feedback state by targetingUpgradeLevel + aimMode', () => {
    it('manual mode at rank 3: no lock or predicted point left to draw (no leak)', () => {
      const { combat, eventBus } = setupCombatHarness({ multishot: 2 });
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.currentTarget).not.toBeNull();

      combat.setAimMode('manual');
      // The lock feedback reads these: manual mode must leave none behind.
      expect(combat.currentTarget).toBeNull();
      expect(combat.currentLockAssignments).toEqual([]);
      expect(combat.predictedAimPoints).toEqual([]);
    });

    // Fix-pass (F11): Codex review noted rank-2 predicted-marker and rank-3
    // multi-lock indicator had no test coverage. These tests assert the
    // targeting state those markers are drawn from.
    it('F11 (rank 2): predicted-impact point leads the moving target', () => {
      // Rank 2 requires the predicted point to be different from the target
      // position, so we use a MOVING target (the harness's Concern-4 setup).
      const { combat, eventBus } = setupCombatHarness({
        targetPosition: MOVING_TARGET_POSITION,
        targetVelocity: MOVING_TARGET_VELOCITY,
      });
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 2,
        dynamicPrediction: {
          minLeadTime: 0.05,
          maxLeadTime: 1,
          fallbackLeadTime: 0.32,
        },
      });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(2);
      expect(combat.usingDynamicPrediction()).toBe(true);
      expect(combat.predictedAimPoints.length).toBeGreaterThan(0);
      const predicted = combat.predictedAimPoints[0].position;
      expect(predicted).toBeDefined();

      // The marker sits ahead of the target along its velocity, not on it.
      const target = combat.currentTarget;
      const lead =
        (predicted.x - target.x) * target.vx +
        (predicted.y - target.y) * target.vy;
      expect(lead).toBeGreaterThan(0);
    });

    it('F11 (rank 3): multi-lock assignments cover more than the primary enemy', () => {
      const extraEnemies = [
        { id: 'enemy-2', x: 650, y: 320 },
        { id: 'enemy-3', x: 620, y: 280 },
        { id: 'enemy-4', x: 580, y: 340 },
      ];
      const { combat, eventBus, playerState } = setupCombatHarness({
        multishot: 4,
        extraEnemies,
      });
      playerState.multishot = 4;
      // computeLockCount reads from this.lastKnownPlayerStats which is only
      // populated by `update()` (not `updateTargeting`). Seed it explicitly
      // so the rank-3 lock pipeline sees multishot=4 and allocates 4 locks.
      combat.lastKnownPlayerStats = { multishot: 4, damage: 10 };
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);

      const assignments = combat.currentLockAssignments;
      expect(assignments.length).toBeGreaterThanOrEqual(2);

      // At least 2 DISTINCT locked enemies (the rank-3 indicators mark every
      // assignment, not just the primary).
      const uniqueEnemyPositions = new Set();
      assignments.forEach((a) => {
        if (a && a.enemy) {
          uniqueEnemyPositions.add(
            `${Math.round(a.enemy.x)},${Math.round(a.enemy.y)}`
          );
        }
      });
      expect(uniqueEnemyPositions.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('4-combo matrix: auto/manual × concentrated/fan', () => {
    const combos = [
      { aim: 'auto', spread: 'concentrated' },
      { aim: 'auto', spread: 'fan' },
      { aim: 'manual', spread: 'concentrated' },
      { aim: 'manual', spread: 'fan' },
    ];

    combos.forEach(({ aim, spread }) => {
      it(`combo (aim=${aim}, spread=${spread}) produces N=2 bullets`, () => {
        const { combat, playerState } = setupCombatHarness({ multishot: 2 });
        playerState.multishot = 2;
        combat.setSpreadMode(spread);
        combat.setAimMode(aim);

        if (aim === 'auto') {
          combat.targetUpdateTimer = 0;
          combat.updateTargeting(0);
        }

        const before = combat.bullets.length;
        const player = combat.getCachedPlayer();
        combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
        const fired = combat.bullets.slice(before);

        expect(fired.length).toBe(2);
      });
    });
  });

  describe('centerline distance assertion (FIX-05 root invariant)', () => {
    // Phase 1 fun-check found: N=2 at distance 300, asteroid radius 16 → both
    // shots fly 44.8 px outside the target in legacy fan. Plan 01.07's
    // concentrated default fixes this. Tests assert the geometric distance from
    // each bullet's aim line to the target center.

    function aimLineDistance(bullet, targetX, targetY) {
      // Bullet aim line goes from (bullet.x, bullet.y) with direction (vx, vy).
      // Distance from point (targetX, targetY) to that line:
      const dx = bullet.vx;
      const dy = bullet.vy;
      const speed = Math.hypot(dx, dy);
      if (speed === 0) return Infinity;
      const nx = -dy / speed;
      const ny = dx / speed;
      // Signed distance from start to target projected on the perpendicular.
      return Math.abs((targetX - bullet.x) * nx + (targetY - bullet.y) * ny);
    }

    [2, 3, 4].forEach((n) => {
      it(`concentrated N=${n}: all bullets pass within (targetRadius + BULLET_SIZE) of target center`, () => {
        const { combat, playerState } = setupCombatHarness({ multishot: n });
        playerState.multishot = n;
        combat.setSpreadMode('concentrated');
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(0);

        const before = combat.bullets.length;
        const player = combat.getCachedPlayer();
        combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
        const fired = combat.bullets.slice(before);
        expect(fired.length).toBeGreaterThanOrEqual(n);

        const enemy = combat.currentTarget;
        const limit = (enemy.radius || 16) + BULLET_SIZE;
        fired.forEach((b) => {
          // In concentrated mode, lanes are parallel-translated by ≤ limit.
          // The aim line passes within `limit` of the target center.
          const d = aimLineDistance(b, enemy.x, enemy.y);
          expect(d).toBeLessThanOrEqual(limit + 0.5);
        });
      });
    });
  });

  describe('recoil follows centerlineTarget direction (Task 2 backward-compat invariant)', () => {
    it('PlayerSystem.recoilOffset matches centerlineTarget direction (not first projectile aim)', () => {
      const container = createTestContainer('recoil-seed');
      const eventBus = container.resolve('event-bus');
      const player = new PlayerSystem({
        position: { x: 100, y: 100 },
        dependencies: { eventBus },
      });

      // Centerline at (400, 100) — straight to the right of (100, 100).
      // Even if 'target' is offset perpendicular, recoil must point left
      // (opposite of the centerline direction).
      eventBus.emit('weapon-fired', {
        position: { x: 100, y: 100 },
        target: { x: 400, y: 130 }, // first projectile aim — offset
        centerlineTarget: { x: 400, y: 100 }, // logical center — exact axis
      });

      // Recoil should be opposite +x → recoilOffset.x is negative.
      expect(player.recoilOffset.x).toBeLessThan(0);
      // Recoil y should be near zero (centerline is on axis).
      expect(Math.abs(player.recoilOffset.y)).toBeLessThan(0.1);
    });

    it('PlayerSystem falls back to target when centerlineTarget is missing (backward compat)', () => {
      const container = createTestContainer('recoil-fallback-seed');
      const eventBus = container.resolve('event-bus');
      const player = new PlayerSystem({
        position: { x: 100, y: 100 },
        dependencies: { eventBus },
      });

      eventBus.emit('weapon-fired', {
        position: { x: 100, y: 100 },
        target: { x: 400, y: 100 },
        // centerlineTarget intentionally omitted
      });

      expect(player.recoilOffset.x).toBeLessThan(0);
    });
  });

  describe('debounce: InputSystem onKeyDown suppresses autorepeat (true contract test)', () => {
    // Fix-pass (F11 — debounce rewrite): the prior test emitted 5 events on
    // the bus and asserted 5 toggles. That tests "the listener has no
    // state," NOT "InputSystem debounces autorepeat." The real contract is
    // that pressing the bound key while still held generates 1 emit, not 5.
    // We exercise InputSystem.onKeyDown directly: 5 calls with the same key
    // (no onKeyUp in between) simulate auto-repeat → 1 toggle. Then onKeyUp
    // + onKeyDown simulates a release+repress → second toggle.

    // Minimal DOM/window stub so InputSystem.setupEventListeners doesn't
    // crash in the node-environment vitest run.
    function withDOMStub(fn) {
      const stub = {
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      const hadDocument = 'document' in globalThis;
      const hadWindow = 'window' in globalThis;
      const prevDocument = globalThis.document;
      const prevWindow = globalThis.window;
      globalThis.document = stub;
      globalThis.window = stub;
      try {
        return fn();
      } finally {
        if (hadDocument) {
          globalThis.document = prevDocument;
        } else {
          delete globalThis.document;
        }
        if (hadWindow) {
          globalThis.window = prevWindow;
        } else {
          delete globalThis.window;
        }
      }
    }

    it('autorepeat (5 keydown with no keyup) → 1 emit; release + repress → 1 more emit', async () => {
      const { default: InputSystem } = await import(
        '../../../src/modules/InputSystem.js'
      );
      const container = createTestContainer('debounce-seed');
      const eventBus = container.resolve('event-bus');

      let toggleSpreadEmits = 0;
      eventBus.on('toggle-spread-mode', () => {
        toggleSpreadEmits += 1;
      });

      withDOMStub(() => {
        const input = new InputSystem({ eventBus });
        // Stub resolveGameScreen so the toggle path emits without needing
        // a game-state service in the harness.
        input.resolveGameScreen = () => 'playing';

        // Build a fake keyboard event for the G key.
        const fakeEvent = (type) => ({
          type,
          key: 'g',
          code: 'KeyG',
          preventDefault: () => {},
          stopPropagation: () => {},
        });

        // 5 consecutive onKeyDown calls with NO onKeyUp in between simulate
        // auto-repeat (browsers fire keydown repeatedly while a key is held).
        for (let i = 0; i < 5; i += 1) {
          input.onKeyDown(fakeEvent('keydown'));
        }
        // Presses apply at the next fixed step.
        input.update();
        // Contract: only the FIRST keydown should have fired the action.
        expect(toggleSpreadEmits).toBe(1);

        // Release + repress = another emit.
        input.onKeyUp(fakeEvent('keyup'));
        input.onKeyDown(fakeEvent('keydown'));
        input.update();
        expect(toggleSpreadEmits).toBe(2);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Runtime-wiring regression (2026-05-16): browser-discovered bug where the
  // FIX-05 toggles (G/T) silently no-op'd despite all isolation tests passing.
  // Root cause: src/bootstrap/serviceManifest.js declared the InputSystem
  // dependencies as ['event-bus', 'settings', 'command-queue'] WITHOUT
  // 'game-state'. InputSystem.resolveGameScreen() called
  // resolveService('game-state', this.dependencies) and got null, so the
  // payload's `screen` field became null, and the strict gate
  // `screen !== 'playing'` (fix-pass-2 F9) blocked every dispatch.
  //
  // The 4 prior review rounds + 429 tests never caught this because every
  // CombatSystem toggle test constructs a mock and passes
  // `{screen: 'playing'}` directly — bypassing the InputSystem wiring.
  // This regression asserts the manifest wiring at the source level so a
  // future refactor that drops 'game-state' from the deps fails loudly here.
  // ---------------------------------------------------------------------------
  describe('FIX-05 manifest wiring (2026-05-16 runtime fix)', () => {
    it('InputSystem manifest declares game-state as a dependency (else toggles silently no-op)', async () => {
      const { createServiceManifest } = await import(
        '../../../src/bootstrap/serviceManifest.js'
      );
      const manifest = createServiceManifest({
        gameState: { screen: 'menu', isPaused: false },
      });
      const inputEntry = manifest.find((entry) => entry.name === 'input');
      expect(inputEntry).toBeDefined();
      expect(Array.isArray(inputEntry.dependencies)).toBe(true);
      expect(inputEntry.dependencies).toContain('game-state');
    });

    it('InputSystem factory passes the resolved game-state into the constructor (else resolveService returns null)', async () => {
      const { createServiceManifest } = await import(
        '../../../src/bootstrap/serviceManifest.js'
      );
      const manifest = createServiceManifest({
        gameState: { screen: 'menu', isPaused: false },
      });
      const inputEntry = manifest.find((entry) => entry.name === 'input');
      // Stub minimum resolved map: factory only reads what it needs.
      const stubEventBus = { emit: () => {}, on: () => {}, off: () => {} };
      const stubSettings = {
        getCategory: () => ({}),
        get: () => undefined,
        set: () => {},
        // Bare minimum surface the constructor pokes at; we are only proving
        // the resolved['game-state'] reference flows in, not exercising input.
      };
      const stubCommandQueue = { register: () => () => {}, push: () => {} };
      const sentinelGameState = { __sentinel: 'game-state-flowed-through' };
      let constructed = null;
      try {
        constructed = inputEntry.factory({
          resolved: {
            'event-bus': stubEventBus,
            settings: stubSettings,
            'command-queue': stubCommandQueue,
            'game-state': sentinelGameState,
          },
        });
      } catch (e) {
        // Constructor may throw if stubs miss a method — that's fine. What
        // matters is that the factory READ resolved['game-state'] BEFORE
        // throwing. We assert that by checking the constructor's signature
        // received the key. If the factory never reads it, this test still
        // passes vacuously — so back it up with a source-level grep below.
      }
      // Source-level guard: prove the factory body references game-state at
      // all. If a future refactor renames the kwarg, this assertion is the
      // canary even when the runtime test passes vacuously.
      const factorySrc = inputEntry.factory.toString();
      expect(factorySrc).toMatch(/['"]game-state['"]/);
      // And when construction succeeded, the instance should have stored
      // the dependency under the canonical key.
      if (constructed && constructed.dependencies) {
        expect(constructed.dependencies['game-state']).toBe(sentinelGameState);
      }
    });
  });
});
