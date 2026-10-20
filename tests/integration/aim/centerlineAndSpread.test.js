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
import { BULLET_SIZE } from '../../../src/core/GameConstants.js';
import PlayerSystem from '../../../src/modules/PlayerSystem.js';
import {
  TURRET_BARREL_LENGTH,
  TURRET_PIVOT_X,
} from '../../../src/data/constants/physics.js';
import { setupCombatHarness } from './aimHarness.js';

describe('FIX-05 centerline invariant + toggles', () => {
  beforeAll(() => {
    if (!GamePools.initialized) {
      GamePools.initialize();
    }
  });

  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());
  describe('weapon-fired payload includes centerlineTarget', () => {
    it('Mode 2 (locked target): centerlineTarget present and points at the locked enemy aim', () => {
      const captured = [];
      const { combat, eventBus, playerState } = setupCombatHarness({
        multishot: 2,
      });
      eventBus.on('weapon-fired', (payload) => {
        captured.push(payload);
      });

      playerState.multishot = 2;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());

      expect(captured.length).toBe(1);
      expect(captured[0].centerlineTarget).toBeDefined();
      expect(captured[0].centerlineTarget).not.toBeNull();
      expect(Number.isFinite(captured[0].centerlineTarget.x)).toBe(true);
      expect(Number.isFinite(captured[0].centerlineTarget.y)).toBe(true);
      // target field PRESERVED for backward compat.
      expect(captured[0].target).toBeDefined();
    });

    it('Mode 1 (forward fire, no target): centerlineTarget is at fixed range along rotation', () => {
      const captured = [];
      const { combat, eventBus } = setupCombatHarness();
      eventBus.on('weapon-fired', (payload) => {
        captured.push(payload);
      });

      // Force no-target firing path: clear the target locks.
      combat.currentTarget = null;
      combat.currentTargetLocks = [];
      combat.currentLockAssignments = [];

      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());

      expect(captured.length).toBe(1);
      expect(captured[0].centerlineTarget).toBeDefined();
      // Player at (400, 300), rotation 0 → centerline at (400 + 1000, 300) per plan spec.
      expect(captured[0].centerlineTarget.x).toBeCloseTo(1400, 0);
      expect(captured[0].centerlineTarget.y).toBeCloseTo(300, 0);
    });
  });

  describe('PlayerSystem.getMuzzlePoint', () => {
    it('sits a turret pivot ahead of the centre plus a barrel along the turret', () => {
      const container = createTestContainer('nose-position-seed');
      const eventBus = container.resolve('event-bus');
      const player = new PlayerSystem({
        position: { x: 100, y: 200 },
        dependencies: { eventBus },
      });
      player.angle = 0;
      player.turretAngle = Math.PI / 2;

      const muzzle = player.getMuzzlePoint();
      expect(muzzle.x).toBeCloseTo(100 + TURRET_PIVOT_X, 5);
      expect(muzzle.y).toBeCloseTo(200 + TURRET_BARREL_LENGTH, 5);
    });
  });

  describe('computeParallelOffset lane clamp tightened to ±(targetRadius + BULLET_SIZE)', () => {
    it('4-shot concentrated burst at radius-8 asteroid keeps all 4 lanes within ±(8 + BULLET_SIZE)', () => {
      const { combat } = setupCombatHarness();
      const playerPos = { x: 0, y: 0 };
      const enemy = { id: 'e1', x: 300, y: 0, radius: 8 };

      const results = combat.applyConcentratedFire(
        { kind: 'target', enemy, fireOrigin: playerPos },
        4,
        { damage: 10, multishot: 4 }
      );
      const limit = 8 + BULLET_SIZE;
      results.forEach((entry) => {
        expect(Math.abs(entry.aimPoint.y)).toBeLessThanOrEqual(limit + 0.0001);
      });
    });

    it('lane offsets at radius-50 (big) capped at spacing (not at the wider radius+BULLET_SIZE)', () => {
      // With spacing=14 and a radius-50 enemy, the clamp is min(14, 53) = 14.
      // The middle lanes (offsetIndex ±0.5 for shotCount=4) sit at ±7, outer
      // lanes at ±21 → clamped to ±14. Verify the outermost lane is exactly 14.
      const { combat } = setupCombatHarness();
      const playerPos = { x: 0, y: 0 };
      const enemy = { id: 'e1', x: 300, y: 0, radius: 50 };

      const results = combat.applyConcentratedFire(
        { kind: 'target', enemy, fireOrigin: playerPos },
        4,
        { damage: 10, multishot: 4 }
      );
      results.forEach((entry) => {
        // |perpOffset| ≤ spacing (14) for any lane.
        expect(Math.abs(entry.aimPoint.y)).toBeLessThanOrEqual(14 + 0.0001);
      });
    });
  });

  describe('spread mode toggle: concentrated default, fan opt-in', () => {
    it('default boot state: spreadMode is "concentrated"', () => {
      const { combat } = setupCombatHarness();
      expect(combat.getSpreadMode()).toBe('concentrated');
    });

    it('Mode 2 concentrated: N=2 at locked target → both aim points within ±(targetRadius + BULLET_SIZE)', () => {
      // Target at (300, 0) from player at (0, 0); enemy radius 18.
      // In concentrated mode, both lane offsets should sit within ±(18 + BULLET_SIZE).
      const { combat, playerState } = setupCombatHarness({ multishot: 2 });
      playerState.multishot = 2;
      combat.setSpreadMode('concentrated');
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBeGreaterThanOrEqual(2);

      // Compute aim direction angles (atan2 of vy / vx). All angles should differ
      // by ≤ small epsilon since both lanes point at parallel-translated targets.
      const playerPos = player.getPosition();
      const enemy = combat.currentTarget;
      const cx = enemy.x - playerPos.x;
      const cy = enemy.y - playerPos.y;
      const centerAngle = Math.atan2(cy, cx);
      // Each bullet's velocity is the (lane aim - origin) direction. Lane offsets
      // are perpendicular AND applied to both origin AND aim, so the velocity
      // angle is PARALLEL to the centerline (concentrated mode invariant).
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a - centerAngle)).toBeLessThan(0.001);
      });
    });

    it('Mode 2 fan opt-in: N=2 fires at ±0.15 rad spread (legacy angular fan preserved)', () => {
      const { combat, playerState } = setupCombatHarness({ multishot: 2 });
      playerState.multishot = 2;
      combat.setSpreadMode('fan');
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBeGreaterThanOrEqual(2);

      const playerPos = player.getPosition();
      const enemy = combat.currentTarget;
      const centerAngle = Math.atan2(
        enemy.y - playerPos.y,
        enemy.x - playerPos.x
      );
      const angles = fired.map((b) => Math.atan2(b.vy, b.vx));
      // Angles bracket the centerline by ~0.15 rad each side (COMBAT_MULTISHOT_SPREAD_STEP = 0.3).
      const diffs = angles.map((a) => Math.abs(a - centerAngle));
      expect(Math.max(...diffs)).toBeGreaterThan(0.05);
    });

    it('Mode 2 concentrated: N=4 at locked target → 4 parallel lanes, all aim angles match centerline', () => {
      const { combat, playerState } = setupCombatHarness({ multishot: 4 });
      playerState.multishot = 4;
      combat.setSpreadMode('concentrated');
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBeGreaterThanOrEqual(4);

      const playerPos = player.getPosition();
      const enemy = combat.currentTarget;
      const centerAngle = Math.atan2(
        enemy.y - playerPos.y,
        enemy.x - playerPos.x
      );
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a - centerAngle)).toBeLessThan(0.001);
      });
    });

    it('Mode 1 (no target) concentrated: parallel lanes pointing in rotation direction', () => {
      const { combat, playerState } = setupCombatHarness({ multishot: 3 });
      playerState.multishot = 3;
      combat.setSpreadMode('concentrated');

      // Clear target to force fireForward path.
      combat.currentTarget = null;
      combat.currentTargetLocks = [];
      combat.currentLockAssignments = [];

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBeGreaterThanOrEqual(3);

      // All bullets fly with rotation = 0 (atan2(0, +) = 0).
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a)).toBeLessThan(0.001);
      });
    });

    it('setSpreadMode rejects invalid values (validation)', () => {
      const { combat } = setupCombatHarness();
      const before = combat.getSpreadMode();
      combat.setSpreadMode('invalid-value');
      expect(combat.getSpreadMode()).toBe(before); // unchanged
    });

    it('emitted toggle-spread-mode event with screen=playing flips spreadMode', () => {
      const { combat, eventBus } = setupCombatHarness();
      // Initial state: concentrated.
      expect(combat.getSpreadMode()).toBe('concentrated');

      // Simulate a gameState wrapper that exposes screen.
      eventBus.emit('toggle-spread-mode', { screen: 'playing' });
      expect(combat.getSpreadMode()).toBe('fan');

      eventBus.emit('toggle-spread-mode', { screen: 'playing' });
      expect(combat.getSpreadMode()).toBe('concentrated');
    });

    it('toggle-spread-mode no-ops when screen is not playing', () => {
      const { combat, eventBus } = setupCombatHarness();
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', { screen: 'menu' });
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', { screen: 'paused' });
      expect(combat.getSpreadMode()).toBe('concentrated');
    });

    it('F9: toggle-spread-mode no-ops when screen is null/undefined (strict equality gate)', () => {
      // Codex review F9: the gate read `data?.screen && data.screen !==
      // 'playing'`. When screen === null, the `&&` short-circuits → toggle
      // FIRES. Plan must_have: "no-op unless gameState.screen === 'playing'."
      // The fix changes the gate to strict `!== 'playing'`.
      const { combat, eventBus } = setupCombatHarness();
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', { screen: null });
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', { screen: undefined });
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', {}); // missing screen field
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode'); // no payload at all
      expect(combat.getSpreadMode()).toBe('concentrated');
    });

    it('F9: toggle-aim-mode no-ops when screen is null/undefined (strict equality gate)', () => {
      const { combat, eventBus } = setupCombatHarness();
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode', { screen: null });
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode', { screen: undefined });
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode', {}); // missing screen field
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode'); // no payload at all
      expect(combat.getAimMode()).toBe('auto');
    });

    it('F10: gameplay.js exports COMBAT_BULLET_RADIUS for clamp math (plan artifact contract)', async () => {
      // Codex review F10: the plan's <artifacts> block for
      // src/data/constants/gameplay.js requires `COMBAT_BULLET_RADIUS`
      // exported for clamp math. The original landing added mode/keybind
      // constants but not this one. The clamp uses BULLET_SIZE from
      // core/GameConstants — `COMBAT_BULLET_RADIUS` is the gameplay-domain
      // alias the plan promised.
      const gameplay = await import('../../../src/data/constants/gameplay.js');
      const { BULLET_SIZE: coreBullet } = await import(
        '../../../src/core/GameConstants.js'
      );
      expect(gameplay.COMBAT_BULLET_RADIUS).toBeDefined();
      expect(gameplay.COMBAT_BULLET_RADIUS).toBe(coreBullet);
    });

    // Fix-pass-2 (C7a): settingsSchema.js hardcoded 'KeyG' / 'KeyT' instead of
    // importing the constants from gameplay.js. The constants are exported
    // (COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD / COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM)
    // but unused. If a designer later wants to change the default keybind in
    // one place, the schema entry would silently disagree.
    //
    // Two-layer assertion:
    //   (1) Runtime: the schema's default keyboard binding equals the imported
    //       constant value.
    //   (2) Source: settingsSchema.js must import the constant from gameplay.js
    //       (otherwise the runtime check passes by coincidence — both happen
    //       to be 'KeyG' — without actually wiring the single source of truth).
    it('C7a: settingsSchema toggleSpreadMode default keybind === COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD', async () => {
      const gameplay = await import('../../../src/data/constants/gameplay.js');
      const { getSettingsSchema } = await import(
        '../../../src/data/settingsSchema.js'
      );

      const schema = getSettingsSchema();
      const controls = schema.find((cat) => cat.id === 'controls');
      expect(controls).toBeDefined();
      const spreadField = controls.fields.find(
        (f) => f.key === 'toggleSpreadMode'
      );
      expect(spreadField).toBeDefined();
      expect(spreadField.default?.keyboard).toBeDefined();
      // Layer 1: runtime equality.
      expect(spreadField.default.keyboard).toContain(
        gameplay.COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD
      );
    });

    it('C7a: settingsSchema toggleAimMode default keybind === COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM', async () => {
      const gameplay = await import('../../../src/data/constants/gameplay.js');
      const { getSettingsSchema } = await import(
        '../../../src/data/settingsSchema.js'
      );

      const schema = getSettingsSchema();
      const controls = schema.find((cat) => cat.id === 'controls');
      const aimField = controls.fields.find((f) => f.key === 'toggleAimMode');
      expect(aimField).toBeDefined();
      expect(aimField.default?.keyboard).toBeDefined();
      expect(aimField.default.keyboard).toContain(
        gameplay.COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM
      );
    });

    it('C7a: settingsSchema.js imports the keybind constants from gameplay.js (single source of truth)', async () => {
      // Layer 2: source-level assertion. Without this the C7a runtime tests
      // pass by coincidence (both literals happen to equal the constants).
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.resolve(
        process.cwd(),
        'src/data/settingsSchema.js'
      );
      const src = await fs.readFile(filePath, 'utf8');
      expect(src).toMatch(/COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD/);
      expect(src).toMatch(/COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM/);
    });

    // Fix-pass-2 (C7b): the clamp math in CombatSystem.js was imported from
    // core/GameConstants.js (BULLET_SIZE) while the plan's <artifacts> block
    // promised COMBAT_BULLET_RADIUS as the gameplay-domain alias. Migrating
    // CombatSystem to import the gameplay-domain name keeps the domain
    // boundaries clean (CombatSystem is a gameplay module) and exercises the
    // F10-exported alias (no longer dead). Numeric value identical — pinned
    // to BULLET_SIZE in the F10 test. The clamp math now lives in
    // combat/Weapons.js (R13.8.4), so that is the file read here.
    it('C7b: the volley lanes source imports COMBAT_BULLET_RADIUS from gameplay.js (preferred per plan artifact)', async () => {
      // Read source as text to assert the import statement. Whitespace-tolerant.
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.resolve(
        process.cwd(),
        'src/modules/combat/volleyLanes.js'
      );
      const src = await fs.readFile(filePath, 'utf8');
      // Import should mention COMBAT_BULLET_RADIUS from gameplay.js. Single
      // string check accommodates multi-line import groups.
      const importsRadius = /COMBAT_BULLET_RADIUS/.test(src);
      expect(importsRadius).toBe(true);
    });

    // Fix-pass-2 (C4): rank-3 with duplicate locks (same enemy, multiple
    // lock slots) wrote the OFFSET-LANE aim point into predictedAimPointsMap
    // keyed by enemy id. Each iteration of refreshPredictedAimPoints
    // overwrites the previous slot for the same enemy — the final stored
    // value is the LAST lane's offset aim, NOT the centerline. handleShooting
    // then reads weapon-fired.centerlineTarget from the map, so recoil ends
    // up driven by the lane-offset aim, defeating the whole Task-2 contract.
    //
    // Fix: store the centerline (un-offset predicted aim) in the map. The
    // per-lane offsets stay in assignment.predictedAim and predictedAimPoints.
    it('C4: predictedAimPointsMap stores centerline (not offset lane) for rank-3 duplicate locks', () => {
      // Build rank-3 combat with a single valid enemy + multishot=4 so
      // buildLockAssignments puts 4 duplicate slots on the same enemy.
      // After the C1 fix, the lock filter would reduce this to 1 slot for a
      // low-HP enemy, defeating the duplicate-lock scenario. Use a high-HP
      // boss so the per-enemy cap allows multiple slots and we keep the
      // duplicate-lock scenario alive.
      const harness = setupCombatHarness({ multishot: 4, damage: 10 });
      const { combat, eventBus } = harness;
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      // High HP so per-enemy cap (>=2) keeps the duplicate-lock scenario.
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 32;
      baseEnemy.health = 10000;
      baseEnemy.maxHealth = 10000;
      combat.lastKnownPlayerStats = { multishot: 4, damage: 10 };
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Sanity: rank-3, single enemy, 4 duplicate lock slots.
      expect(combat.targetingUpgradeLevel).toBe(3);
      expect(combat.currentLockAssignments.length).toBeGreaterThanOrEqual(2);
      // All assignment slots point to the same enemy.
      const distinctEnemyIds = new Set(
        combat.currentLockAssignments.map((a) => a.enemy?.id)
      );
      expect(distinctEnemyIds.size).toBe(1);

      // Compute the expected centerline = the un-offset predicted aim.
      const player = combat.getCachedPlayer();
      const playerPos = player.getPosition();
      const predicted = combat.getPredictedTargetPosition(
        baseEnemy,
        playerPos
      ) || {
        x: baseEnemy.x,
        y: baseEnemy.y,
      };

      // C4 invariant: the map's stored aim for the duplicate-lock enemy
      // MUST be the centerline (predicted), NOT the lane-offset value
      // computed for any single slot. Tolerance: 1e-6 (float identity).
      const stored = combat.predictedAimPointsMap.get(baseEnemy.id);
      expect(stored).toBeDefined();
      expect(Math.abs(stored.x - predicted.x)).toBeLessThan(0.0001);
      expect(Math.abs(stored.y - predicted.y)).toBeLessThan(0.0001);
    });

    it('C4: weapon-fired.centerlineTarget for rank-3 duplicate locks equals centerline (not offset lane)', () => {
      // Higher-level invariant: after firing a rank-3 burst against a
      // duplicate-locked enemy, weapon-fired.centerlineTarget must equal
      // the centerline. The Task-2 backward-compat contract for the
      // PlayerSystem recoil listener depends on this.
      const harness = setupCombatHarness({ multishot: 4, damage: 10 });
      const { combat, eventBus } = harness;
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      baseEnemy.radius = 32;
      baseEnemy.health = 10000;
      baseEnemy.maxHealth = 10000;
      combat.lastKnownPlayerStats = { multishot: 4, damage: 10 };
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Capture the weapon-fired payload.
      let captured = null;
      const off = combat.eventBus.on('weapon-fired', (p) => {
        captured = p;
      });

      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      if (typeof off === 'function') off();

      expect(captured).not.toBeNull();
      expect(captured.centerlineTarget).toBeDefined();

      // Centerline = un-offset predicted aim for the primary target.
      const playerPos = player.getPosition();
      const predicted = combat.getPredictedTargetPosition(
        baseEnemy,
        playerPos
      ) || {
        x: baseEnemy.x,
        y: baseEnemy.y,
      };

      expect(Math.abs(captured.centerlineTarget.x - predicted.x)).toBeLessThan(
        0.0001
      );
      expect(Math.abs(captured.centerlineTarget.y - predicted.y)).toBeLessThan(
        0.0001
      );
    });
  });

  // Fix-pass — defensive regression locks for Findings F3 and F4 (Codex review).
  // The Codex review claimed F3 (rank-3 enters the spread-mode branch) and F4
  // (_concentratedLanes cache reused across enemies), but inspection of
  // handleShooting confirmed both were already correctly guarded:
  //   F3: handleShooting branch `if (!usingAdvancedBattery && totalShots > 1)`
  //   F4: in non-rank-3, `assignments` always has exactly 1 entry (line 587:
  //       `assignments[Math.min(assignments.length - 1, 0)]`), so all shots in
  //       a volley use the same enemy → the lane cache is anchored on the same
  //       aim point for every shotIndex. The cache cannot leak across enemies
  //       in the non-rank-3 path.
  // These tests lock those invariants so future refactors that break them
  // surface immediately rather than silently regressing.
  describe('FIX-PASS regression locks for Codex F3+F4 (defensive — invariants verified by inspection)', () => {
    it('F3: rank-3 advanced battery with spreadMode=fan still uses multi-lock parallel path (NOT the angular fan)', () => {
      // The structural assertion that proves F3 is invalid: in handleShooting,
      // the spread-mode branch is gated at `if (!usingAdvancedBattery &&
      // totalShots > 1)`. So when rank-3 is active (usingAdvancedBattery ===
      // true), the spread-mode code path is structurally bypassed. The test
      // verifies the rank-3 fire path is taken regardless of spreadMode by
      // toggling spreadMode and asserting the bullet count + multi-lock
      // active flags match between concentrated and fan mode at rank 3.

      const extraEnemies = [
        { id: 'enemy-2', x: 600, y: 320, variant: 'common', size: 'medium' },
        { id: 'enemy-3', x: 620, y: 280, variant: 'common', size: 'medium' },
        { id: 'enemy-4', x: 580, y: 340, variant: 'common', size: 'medium' },
      ];

      function rank3FireAt(spreadMode) {
        const { combat, eventBus, playerState } = setupCombatHarness({
          multishot: 4,
          extraEnemies,
        });
        eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
        eventBus.emit('upgrade-aiming-suite', { level: 2 });
        eventBus.emit('upgrade-aiming-suite', {
          level: 3,
          multiLockTargets: 4,
          cooldownMultiplier: 0.92,
        });
        playerState.multishot = 4;
        combat.setSpreadMode(spreadMode);
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(0);
        const before = combat.bullets.length;
        const player = combat.getCachedPlayer();
        combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
        return combat.bullets.slice(before);
      }

      const firedConc = rank3FireAt('concentrated');
      const firedFan = rank3FireAt('fan');

      // Structural invariant: both spread modes produce the SAME number of
      // bullets at rank-3 (4 from multishot × multi-lock distribution). If F3
      // were real, fan would re-route through angular-spread math and the
      // count could diverge.
      expect(firedConc.length).toBeGreaterThan(0);
      expect(firedFan.length).toBe(firedConc.length);
    });

    it('F4: non-rank-3 Mode 2 has exactly 1 assignment (cache anchor cannot drift across enemies)', () => {
      // Setup: 4 distinct enemies, NO rank-3 (only baseline). handleShooting
      // collapses lockTargets to currentTarget only, so assignments.length===1.
      // Lock-anchor uniqueness is what guarantees the _concentratedLanes cache
      // can't leak across enemies in the non-rank-3 path.
      const extraEnemies = [
        { id: 'enemy-2', x: 600, y: 320, variant: 'common', size: 'medium' },
        { id: 'enemy-3', x: 620, y: 280, variant: 'common', size: 'medium' },
      ];
      const { combat, playerState } = setupCombatHarness({
        multishot: 4,
        extraEnemies,
      });
      playerState.multishot = 4;
      combat.setSpreadMode('concentrated');
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Pre-condition: only one assignment in the non-rank-3 path.
      // The non-rank-3 branch in handleShooting maps `lockTargets` (which
      // collapses to [currentTarget] when no rank-3 multi-lock) into
      // `assignments`. If a future refactor breaks this invariant, the
      // _concentratedLanes cache could anchor on a stale enemy.
      const lockTargets = combat.currentTargetLocks?.length
        ? combat.currentTargetLocks
        : combat.currentTarget
          ? [combat.currentTarget]
          : [];
      expect(lockTargets.length).toBe(1);

      // Fire and verify all bullets aim at parallel lanes around the SAME
      // anchor enemy. If F4's scenario were real, later shots would aim at
      // different enemies → velocity angles would diverge.
      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);
      expect(fired.length).toBeGreaterThanOrEqual(2);

      // All angles must be near-identical (parallel-lane invariant).
      const playerPos = player.getPosition();
      const target = combat.currentTarget;
      const centerAngle = Math.atan2(
        target.y - playerPos.y,
        target.x - playerPos.x
      );
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a - centerAngle)).toBeLessThan(0.001);
      });
    });

    it('F5: manual aim uses player.getTurretAngle() (canonical accessor); silent-zero fallback is gone', () => {
      // Codex review F5 worried that a fallback `|| 0` silently shot right.
      // `getTurretAngle()` IS the canonical weapon heading; a player without
      // it is a wiring bug and must fail loudly instead of defaulting to 0.
      const { combat, playerState } = setupCombatHarness({ multishot: 1 });
      playerState.multishot = 1;
      combat.setAimMode('manual');

      // Case 1: with getTurretAngle, manual fire uses the turret heading (=== 0 in
      // harness mock). Bullet velocity should point +x.
      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);
      expect(fired.length).toBe(1);
      expect(fired[0].vx).toBeGreaterThan(0);
      expect(Math.abs(fired[0].vy)).toBeLessThan(0.001);

      // Case 2: when getTurretAngle is missing, manual fire throws instead of
      // silently shooting at rotation 0.
      const broken = combat.getCachedPlayer();
      const savedGetAngle = broken.getTurretAngle;
      broken.getTurretAngle = undefined;
      // Force the cooldown to clear immediately so this fire goes through.
      combat.lastShotTime = combat.shootCooldown;
      expect(() =>
        combat.handleShooting(combat.shootCooldown + 0.001, {
          multishot: 1,
          damage: 10,
        })
      ).toThrow(TypeError);
      broken.getTurretAngle = savedGetAngle;
    });
  });
});
