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
} from '../../__helpers__/setup.js';
import { GamePools } from '../../../src/core/GamePools.js';
import { setupCombatHarness } from './aimHarness.js';

describe('FIX-05 centerline invariant + toggles', () => {
  beforeAll(() => {
    if (!GamePools.initialized) {
      GamePools.initialize();
    }
  });

  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());
  describe('recommendedShots damage-aware overkill cap', () => {
    // Fix-pass-2 (C2 REVERT): the OBSERVABLE behavior of the overkill cap is
    // measured in "bullets actually fired per burst". The caller spawns N
    // bullets, each dealing `damage`. Total burst damage = bullets × damage.
    // The cap exists to prevent OVERKILL — never to under-fire mid-HP targets.
    //
    // Wrong formula (first fix-pass F2): `damage * shotCount * hitRate` treats
    // multishot as a single mega-volley. Result: HP=500/dmg=100/multi=4 fires
    // 2 bullets (= 200 damage, under-fire) instead of 4 (= 400 damage, ≥ HP).
    //
    // Correct formula: `damage * hitRate` (per-bullet damage). Number of
    // bullets needed = ceil(HP / (damage * hitRate)), capped at multishot.
    //
    // Each test below asserts the OBSERVABLE bullet count from a real burst
    // (not the allocator's return value) so the test cannot be made to pass by
    // re-deriving the wrong formula in the assertion.

    // C2 test 1 (OVERKILL prevented): HP=50, damage=100, multishot=4.
    // One bullet (100 damage) already overkills the 50 HP enemy. Cap at 1.
    it('C2: HP=50/dmg=100/multi=4 burst → 1 bullet spawned (overkill cap)', () => {
      const { combat, playerState } = setupCombatHarness({
        multishot: 4,
        damage: 100,
        targetPosition: { x: 600, y: 300 },
      });
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 8;
      baseEnemy.health = 50;
      baseEnemy.maxHealth = 50;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      playerState.multishot = 4;
      playerState.damage = 100;

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;
      expect(fired).toBe(1);
    });

    // C2 test 2 (MID-HP — must NOT under-fire): HP=500, damage=100, multi=4.
    // ceil(500/100) = 5, capped at multishot 4 → exactly 4 bullets fired.
    // Total deliverable damage = 400 < 500 HP. Cap is the BULLET count, NOT a
    // single mega-volley damage value. The wrong F2 formula under-fired here
    // (returning 2 bullets), wasting half the burst the player paid multishot
    // for.
    it('C2: HP=500/dmg=100/multi=4 burst → 4 bullets spawned (no under-fire)', () => {
      const { combat, playerState } = setupCombatHarness({
        multishot: 4,
        damage: 100,
        targetPosition: { x: 600, y: 300 },
      });
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 18;
      baseEnemy.health = 500;
      baseEnemy.maxHealth = 500;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      playerState.multishot = 4;
      playerState.damage = 100;

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;
      expect(fired).toBe(4);
    });

    // C2 test 3 (HIGH-HP boss — full allocation): HP=1500, damage=10, multi=4.
    // ceil(1500/10) = 150, capped at multishot 4 → exactly 4 bullets fired.
    it('C2: HP=1500/dmg=10/multi=4 burst → 4 bullets spawned (full allocation)', () => {
      const { combat, playerState } = setupCombatHarness({
        multishot: 4,
        damage: 10,
        targetPosition: { x: 600, y: 300 },
      });
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 64;
      baseEnemy.health = 1500;
      baseEnemy.maxHealth = 1500;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      playerState.multishot = 4;
      playerState.damage = 10;

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;
      expect(fired).toBe(4);
    });

    // Additional defensive cases at the allocator level (paralleling the live
    // burst tests above so an allocator-only refactor still trips the cap).
    it('C2 allocator: HP=50/dmg=100/multi=4 → allocates 1 (matches burst count)', () => {
      const { combat } = setupCombatHarness({ multishot: 4, damage: 100 });
      const enemy = {
        id: 'tiny-1',
        x: 600,
        y: 300,
        radius: 8,
        health: 50,
        maxHealth: 50,
        variant: 'common',
        size: 'small',
      };
      const allocated = combat.computeAllocatedShots(enemy, {
        damage: 100,
        multishot: 4,
      });
      expect(allocated).toBe(1);
    });

    it('C2 allocator: HP=500/dmg=100/multi=4 → allocates 4 (does NOT under-fire mid-HP)', () => {
      const { combat } = setupCombatHarness({ multishot: 4, damage: 100 });
      const enemy = {
        id: 'mid-1',
        x: 600,
        y: 300,
        radius: 18,
        health: 500,
        maxHealth: 500,
        variant: 'common',
        size: 'medium',
      };
      const allocated = combat.computeAllocatedShots(enemy, {
        damage: 100,
        multishot: 4,
      });
      expect(allocated).toBe(4);
    });

    it('C2 allocator: HP=1500/dmg=10/multi=4 → allocates 4 (high-HP, full multishot)', () => {
      const { combat } = setupCombatHarness({ multishot: 4, damage: 10 });
      const enemy = {
        id: 'boss-1',
        x: 600,
        y: 300,
        radius: 64,
        health: 1500,
        maxHealth: 1500,
        variant: 'common',
        size: 'large',
        type: 'boss',
      };
      const allocated = combat.computeAllocatedShots(enemy, {
        damage: 10,
        multishot: 4,
      });
      expect(allocated).toBe(4);
    });
  });

  // Fix-pass-2 (C1): rank-3 advanced battery's overkill cap was not wired.
  // The first fix-pass gate `if (!usingAdvancedBattery && requestedShots > 1)`
  // intentionally excluded rank-3 — so a single low-HP enemy in the lock set
  // could absorb all 4 shots that 1 shot would kill. The plan must-have:
  // "Rank-3 multi-lock still allocates up to multiLockTargets DIFFERENT enemies;
  // overkill cap applies per-enemy (don't send 4 shots to 1 enemy that 1 shot
  // would kill)."
  describe('C1: rank-3 multi-lock per-enemy overkill cap', () => {
    // Helper: bring CombatSystem to rank-3 with multiLockTargets=4.
    // IMPORTANT: `lastKnownPlayerStats` is normally set inside `update()` —
    // tests that bypass `update()` and call `updateTargeting` directly must
    // wire it manually so `computeLockCount` sees the player's multishot
    // (otherwise it falls back to 1 and rank-3 collapses to 1 lock).
    function makeRank3Combat(extraEnemies = []) {
      const harness = setupCombatHarness({
        multishot: 4,
        damage: 100,
        extraEnemies,
      });
      const { combat, eventBus, playerState } = harness;
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      playerState.multishot = 4;
      playerState.damage = 100;
      combat.lastKnownPlayerStats = { multishot: 4, damage: 100 };
      return harness;
    }

    // 1 lock target, HP=50 (one-shot from dmg=100). Pre-fix: 4 bullets ALL go
    // to this one enemy (3 wasted). Post-fix: 1 bullet (per-enemy cap).
    it('C1: rank-3 + 1 enemy with HP=50/dmg=100/multi=4 → 1 bullet fired (NOT 4)', () => {
      const { combat, playerState } = makeRank3Combat();
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 8;
      baseEnemy.health = 50;
      baseEnemy.maxHealth = 50;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      // Sanity: rank-3 active, 4 multishot, ≥1 lock.
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);
      expect(playerState.multishot).toBe(4);
      expect(combat.currentTargetLocks.length).toBeGreaterThanOrEqual(1);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;

      // The lone target HP=50 only needs 1 shot at damage=100. The 3 extra
      // multishot slots have nowhere else to go (no other enemies in range),
      // so they MUST be dropped (overkill prevented) — they cannot pile onto
      // the same already-dead-on-arrival enemy.
      expect(fired).toBe(1);
    });

    // 4 lock targets, HP=50 each (each one-shot from dmg=100), multishot=4.
    // Pre-fix: still 4 bullets total (since the no-cap rank-3 path naturally
    // distributes to 4 distinct enemies via buildLockAssignments). Post-fix:
    // ALSO 4 bullets — but for the correct reason (1 per enemy after the
    // per-enemy cap reduces each to its needed shot count).
    it('C1: rank-3 + 4 enemies × HP=50 each → 4 bullets fired total (1 per enemy)', () => {
      const extraEnemies = [
        { id: 'enemy-2', x: 600, y: 320, variant: 'common', size: 'small' },
        { id: 'enemy-3', x: 620, y: 280, variant: 'common', size: 'small' },
        { id: 'enemy-4', x: 580, y: 340, variant: 'common', size: 'small' },
      ];
      const { combat } = makeRank3Combat(extraEnemies);
      // Mutate every enemy to tiny-low-HP.
      const enemies = [];
      combat.cachedEnemies.forEachActiveEnemy((e) => enemies.push(e));
      expect(enemies.length).toBe(4);
      enemies.forEach((e) => {
        e.radius = 8;
        e.health = 50;
        e.maxHealth = 50;
      });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);
      expect(combat.currentTargetLocks.length).toBeGreaterThanOrEqual(2);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;

      // Each enemy needs 1 bullet (dmg=100 vs HP=50). With 4 distinct enemies
      // and multishot=4 budget, exactly 4 bullets fired total (NOT 16).
      expect(fired).toBe(4);
    });

    // Fix-pass-3 Finding 3 (the canonical "vacuous test" rewrite). The
    // previous test read `b.targetX` / `b.targetY` from bullets — fields that
    // do NOT exist on bullets created by `createBullet` (CombatSystem.js:2369-
    // 2390). `dx = undefined - num = NaN` → `distTiny = NaN` → `NaN < NaN ===
    // false` → `aimedAtTiny.length === 0` → `expect(0).toBeLessThanOrEqual(1)`
    // PASSED regardless of whether the C1 cap actually worked. The cap could
    // be entirely broken and this would still go green — same class of bug
    // that masked F2.
    //
    // Rewrite: subscribe to the `bullet-created` event (the actual observable
    // surface) and capture each bullet's `to` field (the aim point passed
    // into `createBullet`). The chosen scenario — 1 tiny low-HP enemy alone —
    // forces buildLockAssignments to pile multiple slots onto the same tiny
    // enemy (the only valid target). Pre-fix-pass-3 (cap only in handleShooting):
    // 4 bullets fire, all 4 have `to` ≈ the tiny enemy. With the cap moved
    // upstream into buildLockAssignments: assignments has 1 entry, 1 bullet
    // fires, 1 has `to` ≈ tiny. The assertion uses bullet-to-enemy distance
    // (real observable from event payloads), and includes a payload-shape
    // sanity check so the same vacuous-test class of bug can't repeat.
    it('Finding 3: rank-3 + 1 tiny enemy (HP=50, dmg=100, multi=4) → ≤1 bullet aimed at tiny (via bullet-created event)', () => {
      const harness = makeRank3Combat();
      const { combat, eventBus } = harness;
      let tinyEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!tinyEnemy) tinyEnemy = e;
      });
      expect(tinyEnemy).not.toBeNull();
      tinyEnemy.radius = 8;
      tinyEnemy.health = 50;
      tinyEnemy.maxHealth = 50;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);

      // Subscribe to bullet-created BEFORE handleShooting. The event payload
      // is the real observable surface — read CombatSystem.js:2392-2396 to
      // confirm: `eventBus.emit('bullet-created', { bullet, from, to })`.
      const created = [];
      const off = eventBus.on('bullet-created', (payload) => {
        created.push(payload);
      });

      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());

      off?.();

      // Sanity: bullet-created event payload exposes `to` with `x` and `y`.
      // Without this guard a future regression where the payload shape
      // changes would silently turn this test vacuous again.
      expect(created.length).toBeGreaterThan(0);
      const sample = created[0];
      expect(sample).toHaveProperty('to');
      expect(sample.to).toHaveProperty('x');
      expect(sample.to).toHaveProperty('y');

      // The plan contract — the tiny enemy (HP=50, 1-shot at dmg=100) MUST
      // NOT receive more than 1 bullet, regardless of how many lock slots it
      // accumulated. Count bullets whose `to` point is within (radius +
      // bullet radius + lane spread) of the tiny enemy. With the cap broken,
      // buildLockAssignments piles 4 slots onto the tiny (only valid target);
      // 4 bullets fire, 4 are clearly aimed at it. With the cap correct:
      // 1 bullet, 1 aimed at it.
      const PROXIMITY = 30; // wider than any lane spread so we don't miss any
      const aimedAtTiny = created.filter((p) => {
        const dx = p.to.x - tinyEnemy.x;
        const dy = p.to.y - tinyEnemy.y;
        return Math.sqrt(dx * dx + dy * dy) <= PROXIMITY;
      });
      expect(aimedAtTiny.length).toBeLessThanOrEqual(1);
    });

    // Fix-pass-3 paranoia guard: lock the contract that bullets do NOT
    // expose `targetX`/`targetY` fields. If a future refactor adds these
    // back, the previous test will silently turn vacuous again. Asserting
    // their absence at the bullet-object level surfaces that drift loudly.
    it('bullets do NOT have targetX/targetY fields (asserts assumptions for Finding 3)', () => {
      const { combat } = setupCombatHarness({ multishot: 1, damage: 100 });
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      expect(combat.bullets.length).toBeGreaterThan(0);
      const b = combat.bullets[combat.bullets.length - 1];
      // If either of these flips, the fix-pass-3 Finding 3 test must be
      // re-audited to ensure it still reads observable fields.
      expect(b).not.toHaveProperty('targetX');
      expect(b).not.toHaveProperty('targetY');
    });
  });

  // Fix-pass-3 Finding 1: the per-enemy overkill cap was applied AFTER
  // buildLockAssignments returned, only inside handleShooting. So
  // `currentLockAssignments` (which is read by render, predictedAimPoints,
  // multi-lock indicators, and the weapon-fired event payload) carried the
  // un-capped 4-lock layout for a tiny enemy that will only receive 1 shot.
  // The fix moves the cap UPSTREAM into buildLockAssignments so the
  // assignments returned by it already reflect the correct cap, and the
  // downstream observers see the correct lock count.
  //
  // Observable contract: after updateTargeting (which calls buildLockAssignments
  // via rebuildLockSet), currentLockAssignments.length must equal the actual
  // bullet count that handleShooting will fire. This locks the invariant:
  // "render + predicted markers + multi-lock indicators reflect what fires".
  describe('Finding 1: buildLockAssignments per-enemy cap is upstream', () => {
    function makeRank3Combat(extraEnemies = []) {
      const harness = setupCombatHarness({
        multishot: 4,
        damage: 100,
        extraEnemies,
      });
      const { combat, eventBus, playerState } = harness;
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      playerState.multishot = 4;
      playerState.damage = 100;
      combat.lastKnownPlayerStats = { multishot: 4, damage: 100 };
      return harness;
    }

    it('Finding 1: rank-3 + 1 tiny enemy (HP=50, dmg=100, multi=4) → currentLockAssignments.length === fired count', () => {
      const harness = makeRank3Combat();
      const { combat, eventBus } = harness;
      let tinyEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!tinyEnemy) tinyEnemy = e;
      });
      expect(tinyEnemy).not.toBeNull();
      tinyEnemy.radius = 8;
      tinyEnemy.health = 50;
      tinyEnemy.maxHealth = 50;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);

      // PRE-FIX: currentLockAssignments.length is 4 (un-capped). Render,
      // multi-lock indicators, and weapon-fired all see 4 locks. But only 1
      // bullet fires. This mismatch is the bug.
      //
      // POST-FIX: assignments.length === 1 (cap applied upstream).
      const created = [];
      const off = eventBus.on('bullet-created', (p) => created.push(p));
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      off?.();

      const assignmentCount = combat.currentLockAssignments.length;
      const firedCount = created.length;

      // The invariant: the lock state the rest of the engine reads MUST
      // match what actually fires.
      expect(assignmentCount).toBe(firedCount);
    });

    it('Finding 1: rank-3 + 4 enemies × HP=50 each → currentLockAssignments has 4 (1 per enemy)', () => {
      const extraEnemies = [
        { id: 'enemy-2', x: 600, y: 320, variant: 'common', size: 'small' },
        { id: 'enemy-3', x: 620, y: 280, variant: 'common', size: 'small' },
        { id: 'enemy-4', x: 580, y: 340, variant: 'common', size: 'small' },
      ];
      const harness = makeRank3Combat(extraEnemies);
      const { combat, eventBus } = harness;
      const enemies = [];
      combat.cachedEnemies.forEachActiveEnemy((e) => enemies.push(e));
      enemies.forEach((e) => {
        e.radius = 8;
        e.health = 50;
        e.maxHealth = 50;
      });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const created = [];
      const off = eventBus.on('bullet-created', (p) => created.push(p));
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      off?.();

      // The 4 enemies each absorb 1 bullet. Assignment count matches.
      expect(combat.currentLockAssignments.length).toBe(created.length);
      expect(created.length).toBe(4);
    });
  });

  // Fix-pass-3 Finding 2: when the per-enemy cap filters assignments from
  // (e.g.) 4 lanes down to 2, the surviving lanes' geometry must match the
  // NEW 2-lane layout — not the old 4-lane geometry. The pre-fix-pass-3
  // re-keying spread the original `a` first, carrying forward stale
  // predictedAim / fireOffset / fireOrigin from the 4-lane layout.
  //
  // Observable contract: after the cap filters down to N lanes, the
  // perpendicular offsets of the surviving lanes match the expected N-lane
  // geometry from computeParallelOffset (e.g., N=2 → magnitudes at
  // ±parallelSpacing/2 OR within ±clampLimit, NOT the old 4-lane magnitudes
  // of ±parallelSpacing*1.5).
  //
  // If Finding 1 fix dissolves Finding 2 (no more cap-time re-key, because
  // buildLockAssignments returns correctly-sized assignments), this test
  // still locks the contract observable from outside.
  describe('Finding 2: filtered assignments use correct N-lane geometry', () => {
    function makeRank3Combat(extraEnemies = []) {
      const harness = setupCombatHarness({
        multishot: 4,
        damage: 100,
        extraEnemies,
      });
      const { combat, eventBus, playerState } = harness;
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      playerState.multishot = 4;
      playerState.damage = 100;
      combat.lastKnownPlayerStats = { multishot: 4, damage: 100 };
      return harness;
    }

    it('Finding 2: when 4 slots cap down to N, surviving lanes match N-lane perpendicular offsets', () => {
      // Scenario: rank-3 + 4 multishot + 1 mid-HP enemy where ceil(HP/dmg) = 2.
      // Pre-fix-pass-3: assignments has 4 slots, cap filter retains 2 but
      // carries stale 4-lane geometry. Post-fix: assignments has exactly 2
      // and the parallel-offset math runs on duplicateCount=2.
      const harness = makeRank3Combat();
      const { combat, eventBus } = harness;
      let enemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!enemy) enemy = e;
      });
      expect(enemy).not.toBeNull();
      // HP=150, damage=100 → ceil(150/100) = 2 shots allocated.
      enemy.radius = 12;
      enemy.health = 150;
      enemy.maxHealth = 150;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const created = [];
      const off = eventBus.on('bullet-created', (p) => created.push(p));
      const player = combat.getCachedPlayer();
      const playerPos = player.getPosition();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      off?.();

      // For 2 lanes (duplicateCount=2), the perpendicular offsets are at
      // offsetIndex = -0.5 and +0.5 → magnitudes = ±parallelSpacing/2.
      // For 4 lanes (the stale buggy state), magnitudes would be
      // ±parallelSpacing*1.5 and ±parallelSpacing*0.5 — and clamped to
      // the limit. The observable test: the SPREAD between the two `to`
      // points (perpendicular distance) reflects the 2-lane geometry (each
      // lane leaves the barrel of the turret layer aimed at it, so the lanes
      // part at the aim points, not at the origins).
      expect(created.length).toBe(2);
      const aimDx = created[0].to.x - playerPos.x;
      const aimDy = created[0].to.y - playerPos.y;
      const aimDist = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
      // Perpendicular unit vector to (aimDx, aimDy)
      const perpX = -aimDy / aimDist;
      const perpY = aimDx / aimDist;
      // Project each bullet aim point's offset from playerPos onto perp.
      const perp0 =
        (created[0].to.x - playerPos.x) * perpX +
        (created[0].to.y - playerPos.y) * perpY;
      const perp1 =
        (created[1].to.x - playerPos.x) * perpX +
        (created[1].to.y - playerPos.y) * perpY;
      const spread = Math.abs(perp1 - perp0);

      // Read spacing from the same source production code uses, so this
      // test does not bake in a magic number; only the layout INVARIANT.
      const spacing = combat.aimingConfig?.multiLock?.parallelSpacing ?? 10;
      // Clamp limit per fix-pass-2 C7b: min(spacing, targetRadius + bullet radius).
      // For radius=12 + bullet radius (3 by C7b naming) = 15, so clamp = min(spacing, 15).
      // For 2 lanes, expected spread = 2 * clamp(offsetIndex * spacing, ±clamp)
      // where offsetIndex = ±0.5, so magnitudes = clamp(±spacing/2, ±clamp).
      const clampLimit = Math.min(spacing, 12 + 3);
      const expectedMagnitude = Math.min(spacing / 2, clampLimit);
      const expectedSpread = 2 * expectedMagnitude;
      // Tight tolerance — geometry is deterministic; small float drift only.
      expect(Math.abs(spread - expectedSpread)).toBeLessThan(0.5);

      // The 4-lane buggy layout would have spread ≈ 2 * 1.5 * spacing
      // (offsetIndex ±1.5 * spacing), clamped. Assert we are NOT seeing
      // that magnitude — observable proof the layout is 2-lane, not 4-lane.
      const buggyOuterSpread = 2 * Math.min(spacing * 1.5, clampLimit);
      // Only meaningful when not clamped to same value.
      if (Math.abs(buggyOuterSpread - expectedSpread) > 0.5) {
        expect(Math.abs(spread - buggyOuterSpread)).toBeGreaterThan(0.5);
      }
    });
  });

  // Fix-pass-3 smoke check: a single-scenario integration test that fires
  // one burst against rank-3 + 1 tiny enemy + 1 boss and logs the observed
  // bullet count, lock-assignment count, and per-bullet `to` positions.
  // The brief requires this as final evidence that "the numbers match
  // what the fix promises". Asserts the headline contract observable
  // from the player's perspective: tiny ≤ 1 shot, boss ≤ remaining
  // multishot budget, total ≤ multishot, lock count === fired count.
  describe('Fix-pass-3 smoke check (rank 3, 1 tiny + 1 boss, 1 burst)', () => {
    function makeRank3Combat(extraEnemies = []) {
      const harness = setupCombatHarness({
        multishot: 4,
        damage: 100,
        extraEnemies,
      });
      const { combat, eventBus, playerState } = harness;
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      playerState.multishot = 4;
      playerState.damage = 100;
      combat.lastKnownPlayerStats = { multishot: 4, damage: 100 };
      return harness;
    }

    it('SMOKE: 1 boss(HP=4000, r=32) + 1 tiny(HP=50, r=8); fire one burst → tiny ≤1, total ≤4, locks === fired', () => {
      const extraEnemies = [
        { id: 'tiny-1', x: 620, y: 320, variant: 'common', size: 'small' },
      ];
      const harness = makeRank3Combat(extraEnemies);
      const { combat, eventBus } = harness;
      const enemies = [];
      combat.cachedEnemies.forEachActiveEnemy((e) => enemies.push(e));
      expect(enemies.length).toBe(2);
      const boss = enemies[0];
      const tiny = enemies[1];
      boss.radius = 32;
      boss.health = 4000;
      boss.maxHealth = 4000;
      tiny.radius = 8;
      tiny.health = 50;
      tiny.maxHealth = 50;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);

      const created = [];
      const off = eventBus.on('bullet-created', (p) => created.push(p));
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      off?.();

      // === Smoke-check observable report ===
      // eslint-disable-next-line no-console
      console.log('[SMOKE] fix-pass-3 final scenario');
      // eslint-disable-next-line no-console
      console.log('[SMOKE] scenario: rank 3, multishot=4, damage=100');
      // eslint-disable-next-line no-console
      console.log('[SMOKE] enemies:');
      enemies.forEach((e) => {
        // eslint-disable-next-line no-console
        console.log(
          `  ${e.id}: pos=(${e.x}, ${e.y}) r=${e.radius} hp=${e.health}/${e.maxHealth}`
        );
      });
      // eslint-disable-next-line no-console
      console.log(`[SMOKE] OBSERVED bullet count: ${created.length}`);
      // eslint-disable-next-line no-console
      console.log(
        `[SMOKE] OBSERVED currentLockAssignments.length: ${combat.currentLockAssignments.length}`
      );
      // eslint-disable-next-line no-console
      console.log(
        '[SMOKE] OBSERVED currentLockAssignments enemies:',
        combat.currentLockAssignments.map((a) => a.enemy?.id)
      );
      // eslint-disable-next-line no-console
      console.log('[SMOKE] OBSERVED per-bullet `to` positions:');
      created.forEach((p, i) => {
        // eslint-disable-next-line no-console
        console.log(
          `  bullet[${i}]: to=(${p.to.x.toFixed(2)}, ${p.to.y.toFixed(2)}) from=(${p.from.x.toFixed(2)}, ${p.from.y.toFixed(2)})`
        );
      });
      // Compute which enemy each bullet is closest to.
      created.forEach((p, i) => {
        const dxB = p.to.x - boss.x;
        const dyB = p.to.y - boss.y;
        const dxT = p.to.x - tiny.x;
        const dyT = p.to.y - tiny.y;
        const distBoss = Math.sqrt(dxB * dxB + dyB * dyB);
        const distTiny = Math.sqrt(dxT * dxT + dyT * dyT);
        const nearest = distBoss < distTiny ? 'boss' : 'tiny';
        // eslint-disable-next-line no-console
        console.log(
          `  bullet[${i}] nearest enemy: ${nearest} (boss=${distBoss.toFixed(2)} tiny=${distTiny.toFixed(2)})`
        );
      });

      // === Headline assertions ===
      // 1. Lock count matches fired count (Finding 1 invariant).
      expect(combat.currentLockAssignments.length).toBe(created.length);
      // 2. Total ≤ multishot.
      expect(created.length).toBeLessThanOrEqual(4);
      // 3. Tiny absorbs ≤ 1 bullet (per-enemy cap, Finding 3 contract).
      const aimedAtTiny = created.filter((p) => {
        const dxT = p.to.x - tiny.x;
        const dyT = p.to.y - tiny.y;
        const distT = Math.sqrt(dxT * dxT + dyT * dyT);
        const dxB = p.to.x - boss.x;
        const dyB = p.to.y - boss.y;
        const distB = Math.sqrt(dxB * dxB + dyB * dyB);
        return distT < distB;
      });
      expect(aimedAtTiny.length).toBeLessThanOrEqual(1);
      // 4. At least 1 bullet aimed at the boss (sanity).
      expect(created.length - aimedAtTiny.length).toBeGreaterThanOrEqual(1);
    });
  });
});
