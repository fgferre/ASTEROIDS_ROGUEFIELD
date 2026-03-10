import { describe, expect, it, vi } from 'vitest';

import { BULLET_SIZE } from '../../src/core/GameConstants.js';
import CombatSystem from '../../src/modules/CombatSystem.js';
import PhysicsSystem from '../../src/modules/PhysicsSystem.js';
import BossEnemy from '../../src/modules/enemies/types/BossEnemy.js';
import { BOSS_PHYSICS_CONFIG } from '../../src/data/enemies/boss.js';
import { createEnemySystemHarness } from '../__helpers__/asteroid-helpers.js';

const ASTEROID_POOL_ID = Symbol.for('ASTEROIDS_ROGUEFIELD:asteroidPoolId');

const createEventBus = () => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
});

const createBoss = (overrides = {}) => {
  const eventBus = createEventBus();
  const system = {
    dependencies: { eventBus },
    time: 0,
  };
  const boss = new BossEnemy(system);
  boss.initialize({
    id: 'boss-test',
    x: 120,
    y: 160,
    wave: 1,
    ...overrides,
  });
  return { boss, eventBus, system };
};

describe('boss damage feedback', () => {
  it('tracks boss hit flash and invulnerability shield impact state', () => {
    const { boss } = createBoss();

    boss.onDamaged(72, 'laser');
    expect(boss.damageFlashTimer).toBeGreaterThan(0);
    expect(boss.damageFlashStrength).toBeGreaterThan(0);

    boss.invulnerable = true;
    boss.invulnerabilityTimer = 1;
    boss.registerInvulnerabilityHit({ x: boss.x + 30, y: boss.y });

    expect(boss.shieldImpactTimer).toBeGreaterThan(0);
    expect(boss.shieldImpactStrength).toBe(1);
    expect(boss.shieldImpactAngle).toBeCloseTo(0, 4);

    boss.onUpdate(0.05);

    expect(boss.damageFlashTimer).toBeLessThan(boss.damageFlashDuration);
    expect(boss.shieldImpactTimer).toBeLessThan(boss.shieldImpactDuration);
  });

  it('marks invulnerable boss bullet hits as blocked and triggers shield feedback', () => {
    const eventBus = createEventBus();
    const combat = new CombatSystem({ eventBus });
    const boss = {
      type: 'boss',
      currentPhase: 1,
      health: 900,
      maxHealth: 1500,
      invulnerable: true,
      registerInvulnerabilityHit: vi.fn(),
    };
    const bullet = {
      x: 320,
      y: 180,
      damage: 48,
      hit: false,
    };
    const enemiesSystem = {
      applyDamage: vi.fn(() => ({
        killed: false,
        remainingHealth: 900,
      })),
    };

    const result = combat.processBulletHit(bullet, boss, enemiesSystem);

    expect(result.blocked).toBe(true);
    expect(result.effectiveDamage).toBe(0);
    expect(boss.registerInvulnerabilityHit).toHaveBeenCalledWith({
      x: 320,
      y: 180,
    });
    expect(eventBus.emit).toHaveBeenCalledWith(
      'bullet-hit',
      expect.objectContaining({
        blocked: true,
        damage: 0,
        requestedDamage: 48,
        effectiveDamage: 0,
        invulnerable: true,
      })
    );
  });

  it('full phase transition cycle: damage -> phase change -> invulnerable -> blocked -> expires -> damage resumes', () => {
    const { boss, eventBus } = createBoss({
      health: 1500,
      phaseThresholds: [0.66, 0.33],
      invulnerabilityDuration: 1.0,
    });

    expect(boss.currentPhase).toBe(0);
    expect(boss.invulnerable).toBe(false);

    // Deal enough damage to cross first threshold (66% of 1500 = 990)
    // Need health to drop to 990 or below: 1500 - 510 = 990
    const killed = boss.takeDamage(510);
    expect(killed).toBe(false);
    expect(boss.health).toBe(990);
    expect(boss.currentPhase).toBe(1);
    expect(boss.invulnerable).toBe(true);
    expect(boss.invulnerabilityTimer).toBe(1.0);

    // Damage flash should have fired from onDamaged
    expect(boss.damageFlashTimer).toBeGreaterThan(0);

    // Verify boss-phase-changed event was emitted
    const phaseChangedCalls = eventBus.emit.mock.calls.filter(
      (call) => call[0] === 'boss-phase-changed'
    );
    expect(phaseChangedCalls).toHaveLength(1);
    expect(phaseChangedCalls[0][1].phase).toBe(1);

    // While invulnerable, takeDamage should be blocked
    const blockedResult = boss.takeDamage(200);
    expect(blockedResult).toBe(false);
    expect(boss.health).toBe(990); // unchanged

    // Shield impact should work while invulnerable
    boss.registerInvulnerabilityHit({ x: boss.x + 30, y: boss.y });
    expect(boss.shieldImpactStrength).toBe(1);

    // Tick down invulnerability timer fully
    boss.onUpdate(0.5);
    expect(boss.invulnerable).toBe(true);
    boss.onUpdate(0.5);
    expect(boss.invulnerable).toBe(false);
    expect(boss.invulnerabilityTimer).toBe(0);

    // Shield state should be cleared
    expect(boss.shieldImpactStrength).toBe(0);

    // Damage should work again after invulnerability expires
    const resumedResult = boss.takeDamage(100);
    expect(resumedResult).toBe(false);
    expect(boss.health).toBe(890);
    expect(boss.damageFlashTimer).toBeGreaterThan(0);
  });

  it('damage flash decays to zero over time', () => {
    const { boss } = createBoss();

    boss.onDamaged(50, 'laser');
    const initialTimer = boss.damageFlashTimer;
    expect(initialTimer).toBeGreaterThan(0);

    // Tick past the full duration
    boss.updateFeedbackState(initialTimer + 0.01);

    expect(boss.damageFlashTimer).toBe(0);
    expect(boss.damageFlashStrength).toBe(0);
  });

  it('buildRenderPayload reflects current feedback state', () => {
    const { boss } = createBoss();

    // Clean state
    let payload = boss.buildRenderPayload();
    expect(payload.damageFlash).toBe(0);
    expect(payload.shieldImpact).toBe(0);
    expect(payload.invulnerable).toBe(false);

    // After damage
    boss.onDamaged(100, 'laser');
    payload = boss.buildRenderPayload();
    expect(payload.damageFlash).toBeGreaterThan(0);
    expect(payload.damageFlashStrength).toBeGreaterThan(0);

    // After entering invulnerability with shield impact
    boss.invulnerable = true;
    boss.invulnerabilityTimer = 1;
    boss.registerInvulnerabilityHit({ x: boss.x, y: boss.y - 30 });
    payload = boss.buildRenderPayload();
    expect(payload.invulnerable).toBe(true);
    expect(payload.shieldImpact).toBeGreaterThan(0);
    expect(payload.shieldImpactStrength).toBe(1);
  });

  it('uses boss collision padding for bullet collision resolution', () => {
    const physics = new PhysicsSystem({ eventBus: createEventBus() });
    const boss = {
      type: 'boss',
      x: 0,
      y: 0,
      radius: 60,
      destroyed: false,
    };
    const bullet = {
      x: (BULLET_SIZE || 0) + 60 + BOSS_PHYSICS_CONFIG.collisionPadding - 1,
      y: 0,
      hit: false,
      damage: 20,
    };
    const collisions = [];

    physics.activeEnemies.add(boss);
    physics.spatialHash.query = vi.fn(() => [boss]);

    physics.forEachBulletCollision([bullet], (hitBullet, enemy) => {
      collisions.push({ hitBullet, enemy });
    });

    expect(collisions).toHaveLength(1);
    expect(collisions[0].enemy).toBe(boss);
  });

  it('still resolves boss bullet collisions when spatial hash query misses the boss', () => {
    const physics = new PhysicsSystem({ eventBus: createEventBus() });
    const boss = {
      type: 'boss',
      x: 0,
      y: 0,
      radius: 60,
      destroyed: false,
    };
    const bullet = {
      x: (BULLET_SIZE || 0) + 60 + BOSS_PHYSICS_CONFIG.collisionPadding - 1,
      y: 0,
      hit: false,
      damage: 20,
    };
    const collisions = [];

    physics.activeEnemies.add(boss);
    physics.activeBosses.add(boss);
    physics.spatialHash.query = vi.fn(() => []);

    physics.forEachBulletCollision([bullet], (hitBullet, enemy) => {
      collisions.push({ hitBullet, enemy });
    });

    expect(collisions).toHaveLength(1);
    expect(collisions[0].enemy).toBe(boss);
  });

  it('includes pool ids in boss/support snapshots and preserves them on enemy restore', () => {
    const { enemySystem } = createEnemySystemHarness();
    const boss = {
      id: 'boss-snapshot',
      type: 'boss',
      wave: 5,
      x: 320,
      y: 140,
      vx: 0,
      vy: 0,
      rotation: 0,
      rotationSpeed: 0,
      radius: 60,
      health: 900,
      maxHealth: 1500,
      currentPhase: 1,
      phaseCount: 3,
      invulnerable: true,
      invulnerabilityTimer: 1.5,
      destroyed: false,
    };
    const support = {
      id: 'drone-snapshot',
      type: 'drone',
      wave: 5,
      x: 400,
      y: 160,
      vx: 0,
      vy: 0,
      rotation: 0,
      rotationSpeed: 0,
      radius: 18,
      health: 30,
      maxHealth: 30,
      spawnedByBossId: boss.id,
      destroyed: false,
    };

    enemySystem.assignAsteroidPoolId(boss, 41);
    enemySystem.assignAsteroidPoolId(support, 42);
    enemySystem.asteroids = [boss, support];
    enemySystem.invalidateActiveEnemyCache();

    const snapshot = enemySystem.exportState();

    expect(snapshot.bosses[0].poolId).toBe(41);
    expect(snapshot.supportEnemies[0].poolId).toBe(42);

    const restored = enemySystem.importState(snapshot);
    expect(restored).toBe(true);

    const activeEnemies = enemySystem.getActiveEnemies();
    const restoredBoss = activeEnemies.find((enemy) => enemy.type === 'boss');
    const restoredSupport = activeEnemies.find((enemy) => enemy.type === 'drone');

    expect(restoredBoss?.[ASTEROID_POOL_ID]).toBe(41);
    expect(restoredSupport?.[ASTEROID_POOL_ID]).toBe(42);
  });

  it('clears stale boss tracking when physics bootstrap is forced', () => {
    const physics = new PhysicsSystem({ eventBus: createEventBus() });
    const staleBoss = {
      id: 'boss-bootstrap',
      type: 'boss',
      x: -320,
      y: -240,
      vx: 0,
      vy: 0,
      radius: 60,
      destroyed: false,
    };
    const restoredBoss = {
      id: 'boss-bootstrap',
      type: 'boss',
      x: 120,
      y: 80,
      vx: 0,
      vy: 0,
      radius: 60,
      destroyed: false,
    };
    restoredBoss[ASTEROID_POOL_ID] = 91;

    physics.registerEnemy(staleBoss);

    const roster = [restoredBoss];
    const enemySystem = {
      activeBosses: new Map([[restoredBoss.id, restoredBoss]]),
      getActiveEnemies: () => roster,
      getAllAsteroids: () => roster,
    };

    physics.attachEnemySystem(enemySystem, { force: true });

    expect(physics.activeEnemies.size).toBe(1);
    expect(physics.activeBosses.size).toBe(1);
    expect(physics.activeEnemies.has(staleBoss)).toBe(false);
    expect(physics.activeBosses.has(staleBoss)).toBe(false);
    expect(physics.spatialHash.objects.has(staleBoss)).toBe(false);
    expect(physics.activeEnemies.has(restoredBoss)).toBe(true);
    expect(physics.activeBosses.has(restoredBoss)).toBe(true);
    expect(physics.spatialHash.objects.has(restoredBoss)).toBe(true);
  });

  it('rebuilds boss/support collision membership from the enemy roster during physics restore', () => {
    const physics = new PhysicsSystem({ eventBus: createEventBus() });
    const combat = new CombatSystem({ eventBus: createEventBus() });
    const boss = {
      id: 'boss-restore',
      type: 'boss',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 60,
      health: 900,
      maxHealth: 1500,
      currentPhase: 1,
      invulnerable: true,
      destroyed: false,
      registerInvulnerabilityHit: vi.fn(),
    };
    const support = {
      id: 'drone-restore',
      type: 'drone',
      x: 140,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 18,
      destroyed: false,
    };
    boss[ASTEROID_POOL_ID] = 77;
    support[ASTEROID_POOL_ID] = 88;

    const roster = [boss, support];
    const enemySystem = {
      activeBosses: new Map([[boss.id, boss]]),
      getActiveEnemies: () => roster,
      getAllAsteroids: () => roster,
    };

    physics.attachEnemySystem(enemySystem);

    const restored = physics.restoreSnapshotState({
      asteroids: [
        { poolId: 1, x: 12, y: 18, vx: 1, vy: 2, radius: 40 },
        { poolId: 2, x: 22, y: 28, vx: 3, vy: 4, radius: 24 },
      ],
    });

    expect(restored).toBe(true);
    expect(physics.activeEnemies.has(boss)).toBe(true);
    expect(physics.activeEnemies.has(support)).toBe(true);
    expect(physics.activeBosses.has(boss)).toBe(true);
    expect(physics.spatialHash.objects.has(boss)).toBe(true);
    expect(physics.spatialHash.objects.has(support)).toBe(true);

    const nearby = physics.getNearbyEnemies(0, 0, 180);
    expect(nearby).toContain(boss);
    expect(nearby).toContain(support);

    const bullet = {
      x: (BULLET_SIZE || 0) + 60 + BOSS_PHYSICS_CONFIG.collisionPadding - 1,
      y: 0,
      hit: false,
      damage: 20,
    };
    const collisions = [];
    const enemiesSystem = {
      applyDamage: vi.fn(() => ({
        killed: false,
        remainingHealth: boss.health,
      })),
    };

    physics.forEachBulletCollision([bullet], (hitBullet, enemy) => {
      collisions.push({ hitBullet, enemy });
    });

    expect(collisions).toHaveLength(1);
    expect(collisions[0].enemy).toBe(boss);

    const result = combat.processBulletHit(bullet, boss, enemiesSystem);

    expect(result.blocked).toBe(true);
    expect(result.effectiveDamage).toBe(0);
    expect(boss.registerInvulnerabilityHit).toHaveBeenCalledWith({
      x: bullet.x,
      y: bullet.y,
    });
  });

  it('drops stale boss objects during restore and keeps only the restored roster', () => {
    const physics = new PhysicsSystem({ eventBus: createEventBus() });
    const staleBoss = {
      id: 'boss-restore-stale',
      type: 'boss',
      x: -260,
      y: -180,
      vx: 0,
      vy: 0,
      radius: 60,
      destroyed: false,
    };
    const boss = {
      id: 'boss-restore-stale',
      type: 'boss',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 60,
      destroyed: false,
    };
    const support = {
      id: 'drone-restore-stale',
      type: 'drone',
      x: 140,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 18,
      destroyed: false,
    };
    boss[ASTEROID_POOL_ID] = 177;
    support[ASTEROID_POOL_ID] = 188;

    let roster = [];
    const enemySystem = {
      activeBosses: new Map(),
      getActiveEnemies: () => roster,
      getAllAsteroids: () => roster,
    };

    physics.attachEnemySystem(enemySystem);
    physics.registerEnemy(staleBoss);
    roster = [boss, support];
    enemySystem.activeBosses = new Map([[boss.id, boss]]);

    expect(physics.activeEnemies.size).toBe(1);
    expect(physics.activeBosses.size).toBe(1);

    const restored = physics.restoreSnapshotState({
      asteroids: [
        { poolId: 177, x: 24, y: 36, vx: 1, vy: 2, radius: 60 },
        { poolId: 188, x: 150, y: 12, vx: 0, vy: 0, radius: 18 },
      ],
    });

    expect(restored).toBe(true);
    expect(physics.activeEnemies.size).toBe(2);
    expect(physics.activeBosses.size).toBe(1);
    expect(physics.activeEnemies.has(staleBoss)).toBe(false);
    expect(physics.activeBosses.has(staleBoss)).toBe(false);
    expect(physics.spatialHash.objects.has(staleBoss)).toBe(false);
    expect(physics.activeEnemies.has(boss)).toBe(true);
    expect(physics.activeEnemies.has(support)).toBe(true);
    expect(boss.x).toBe(24);
    expect(boss.y).toBe(36);
    expect(support.x).toBe(150);
    expect(support.y).toBe(12);
  });
});
