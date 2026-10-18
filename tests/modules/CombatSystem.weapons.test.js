import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import CombatSystem from '../../src/modules/CombatSystem.js';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import RandomService from '../../src/core/RandomService.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { ORB_VALUE } from '../../src/data/enemies/asteroid-configs.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

const DAMAGE = 10;
const NOSE = 16;

function makeEnemy(id, x, y, extra = {}) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 10,
    health: 100,
    type: 'drone',
    ...extra,
  };
}

function makeEnemies(list, orbsPerKill = 0) {
  return {
    list,
    forEachActiveEnemy(callback) {
      list.forEach(callback);
    },
    applyDamage(enemy, damage) {
      enemy.health = Math.max(0, enemy.health - damage);
      const killed = enemy.health <= 0;
      if (killed) {
        enemy.destroyed = true;
        if (this.rewardManager) {
          this.rewardManager.stats.totalOrbsDropped += orbsPerKill;
        }
      }
      return { killed, remainingHealth: enemy.health };
    },
  };
}

function makeCombat(enemyList = [], options = {}) {
  const eventBus = createEventBusMock();
  const player = {
    isDead: false,
    getPosition: () => ({ x: 100, y: 300 }),
    getAngle: () => 0,
    getRotation: () => 0,
    getNosePosition: (angle) => ({
      x: 100 + Math.cos(angle) * NOSE,
      y: 300 + Math.sin(angle) * NOSE,
    }),
    getStats: () => ({ multishot: 1, damage: DAMAGE }),
  };
  const enemies = options.enemies || makeEnemies(enemyList);
  const physics = { forEachBulletCollision: () => {} };
  const combat = new CombatSystem({ eventBus, player, enemies, physics });
  return { combat, eventBus, enemies };
}

const lance = (overrides = {}) => ({
  kind: 'lance',
  x: 0,
  y: 0,
  vx: 1,
  vy: 0,
  damage: DAMAGE,
  hit: false,
  ...overrides,
});

describe('Harmonic Plasma Lance', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });

  it('fires a beam on every 4th shot that hits everything in its 220 px segment for 2.2× damage', () => {
    const near = makeEnemy('near', 200, 300);
    const far = makeEnemy('far', 300, 304);
    const past = makeEnemy('past', 16 + 100 + 240, 300); // beyond 220 + radius
    const aside = makeEnemy('aside', 200, 320); // 20 px off-axis > 10 + 5
    const { combat, eventBus } = makeCombat([near, far, past, aside]);
    const beamFired = vi.fn();
    eventBus.on('weapon-beam-fired', beamFired);
    eventBus.emit('upgrade-weapon-harmonic', { weaponId: 'harmonic' });

    const stats = { multishot: 1, damage: DAMAGE };
    for (let shot = 0; shot < 3; shot += 1) combat.handleShooting(1, stats);
    expect(combat.bullets).toHaveLength(3);
    expect(combat.beams).toHaveLength(0);

    combat.handleShooting(1, stats);
    expect(combat.bullets).toHaveLength(3);
    expect(combat.beams).toHaveLength(1);
    expect(beamFired).toHaveBeenCalledTimes(1);
    const hit = 100 - DAMAGE * WEAPONS.harmonic.beam.damageMultiplier;
    expect(near.health).toBeCloseTo(hit, 6);
    expect(far.health).toBeCloseTo(hit, 6);
    expect(past.health).toBe(100);
    expect(aside.health).toBe(100);
    // The next shot waits the cooldown plus the beam penalty.
    expect(combat.lastShotTime).toBe(-WEAPONS.harmonic.beam.cooldownPenalty);
    expect(combat.getWeaponState()).toMatchObject({
      weaponId: 'harmonic',
      shotsToBeam: 4,
    });

    combat.updateWeaponEffects(WEAPONS.harmonic.beam.duration + 0.01);
    expect(combat.beams).toHaveLength(0);
  });

  it('splits a large rock it kills into one extra fragment', () => {
    const rock = makeEnemy('rock', 200, 300, {
      type: 'asteroid',
      size: 'large',
      health: 5,
      generateFragments: () => [
        { x: 210, y: 300, vx: 40, vy: 0, size: 'medium' },
        { x: 190, y: 300, vx: -40, vy: 0, size: 'medium' },
      ],
    });
    const enemies = makeEnemies([rock]);
    enemies.waveState = {
      current: 2,
      isActive: true,
      totalAsteroids: 4,
      asteroidsSpawned: 4,
    };
    enemies.assignVariantsToFragments = vi.fn(() => ['common']);
    enemies.acquireAsteroid = vi.fn((config) => ({ ...config }));
    enemies.registerActiveEnemy = vi.fn(() => ({ registered: true }));
    enemies.warnIfWaveManagerRegistrationFailed = vi.fn();
    enemies.createScopedRandom = vi.fn(() => ({ random: null }));
    const { combat } = makeCombat([], { enemies });

    combat.processBulletHit(lance({ kind: 'beam' }), rock, enemies);

    expect(enemies.acquireAsteroid).toHaveBeenCalledTimes(1);
    const fragment = enemies.acquireAsteroid.mock.calls[0][0];
    expect(fragment).toMatchObject({ size: 'medium', variant: 'common' });
    // Turned a quarter turn (π / 2 fragments) from the first seam.
    expect(fragment.x).toBeCloseTo(200, 6);
    expect(fragment.y).toBeCloseTo(310, 6);
    expect(enemies.waveState.totalAsteroids).toBe(5);

    // A lance kill splits normally.
    rock.destroyed = false;
    rock.health = 5;
    combat.processBulletHit(lance(), rock, enemies);
    expect(enemies.acquireAsteroid).toHaveBeenCalledTimes(1);
  });
});

describe('weapon evolutions', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });

  it('Incendiary: a hit burns for 3 ticks of 15% over 1.2 s', () => {
    const target = makeEnemy('t', 0, 0);
    const { combat, eventBus } = makeCombat([target]);
    eventBus.emit('synergy-unlocked', { family: 'thermal' });

    combat.processBulletHit(lance(), target, combat.cachedEnemies);
    expect(target.health).toBe(90);
    combat.updateWeaponEffects(0.39);
    expect(target.health).toBe(90);
    [0.01, 0.4, 0.4].forEach((dt, tick) => {
      combat.updateWeaponEffects(dt);
      expect(target.health).toBeCloseTo(90 - 1.5 * (tick + 1), 6);
    });
    combat.updateWeaponEffects(1);
    expect(target.health).toBeCloseTo(85.5, 6);
    expect(combat.burns.size).toBe(0);
  });

  it('Chain Lance: the arc jumps to the nearest enemy within 140 px for 50%', () => {
    const source = makeEnemy('a', 100, 100);
    const farther = makeEnemy('b', 180, 100); // 80 px
    const nearest = makeEnemy('c', 160, 140); // ~72 px
    const outOfRange = makeEnemy('d', 100, 250); // 150 px
    const { combat, eventBus } = makeCombat([
      source,
      farther,
      nearest,
      outOfRange,
    ]);
    eventBus.emit('synergy-unlocked', { family: 'arc' });

    combat.processBulletHit(lance(), source, combat.cachedEnemies);
    expect(source.health).toBe(90);
    expect(nearest.health).toBe(95);
    expect(farther.health).toBe(100);
    expect(combat.arcs).toHaveLength(1);

    // Only one jump, and nothing within range means no arc.
    const alone = makeEnemy('e', 400, 400);
    combat.cachedEnemies.list.push(alone);
    combat.processBulletHit(lance(), alone, combat.cachedEnemies);
    expect(combat.arcs).toHaveLength(1);
    expect(outOfRange.health).toBe(100);
  });

  it('Railshot: a lance pierces exactly one extra target', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((id) => makeEnemy(id, 0, 0));
    const { combat, eventBus } = makeCombat([a, b, c]);
    eventBus.emit('synergy-unlocked', { family: 'kinetic' });
    combat.createBullet({ x: 0, y: 0 }, { x: 10, y: 0 }, DAMAGE);
    const bullet = combat.bullets[0];

    combat.processBulletHit(bullet, a, combat.cachedEnemies);
    expect(bullet.hit).toBe(false);
    combat.processBulletHit(bullet, a, combat.cachedEnemies); // still inside a
    combat.processBulletHit(bullet, b, combat.cachedEnemies);
    combat.processBulletHit(bullet, c, combat.cachedEnemies);
    expect(bullet.hit).toBe(true);
    expect([a.health, b.health, c.health]).toEqual([90, 90, 100]);
  });

  it('Gravitic Lance: a hit slows the target to 60% for 0.4 s', () => {
    const target = makeEnemy('t', 0, 0, { vx: 100 });
    const { combat, eventBus } = makeCombat([target]);
    eventBus.emit('synergy-unlocked', { family: 'field' });
    combat.processBulletHit(lance(), target, combat.cachedEnemies);

    const step = (dt) => {
      target.x += target.vx * dt; // the enemy's own movement
      combat.updateWeaponEffects(dt);
    };
    for (let i = 0; i < 4; i += 1) step(0.1);
    expect(target.x).toBeCloseTo(24, 6); // 0.4 s at 60 px/s
    step(0.1);
    expect(target.x).toBeCloseTo(34, 6); // full speed again
    expect(target.vx).toBe(100);
  });

  it('Prospector Lance: lance kills drop 25% more orbs', () => {
    const enemies = makeEnemies([], 4);
    enemies.rewardManager = {
      stats: { totalOrbsDropped: 0 },
      createXPOrbs: vi.fn(),
    };
    const { combat, eventBus } = makeCombat([], { enemies });
    eventBus.emit('synergy-unlocked', { family: 'salvage' });

    const rock = makeEnemy('r', 0, 0, { health: 5 });
    combat.processBulletHit(lance(), rock, enemies);
    expect(enemies.rewardManager.createXPOrbs).toHaveBeenCalledWith(
      rock,
      1,
      ORB_VALUE
    );

    // Without the evolution there is no bonus.
    eventBus.emit('progression-reset');
    combat.processBulletHit(
      lance(),
      makeEnemy('s', 0, 0, { health: 5 }),
      enemies
    );
    expect(enemies.rewardManager.createXPOrbs).toHaveBeenCalledTimes(1);
  });

  it('three upgrades of a family evolve the lance; a new run resets weapon and evolutions', () => {
    const eventBus = createEventBusMock();
    const progression = new ProgressionSystem({
      random: new RandomService(7),
      eventBus,
      player: {},
      ui: {},
      effects: {},
      'xp-orbs': { attachProgression: () => {} },
    });
    progression.level = 10;
    const combat = new CombatSystem({
      eventBus,
      player: { getStats: () => ({}) },
      enemies: makeEnemies([]),
      physics: { forEachBulletCollision: () => {} },
    });
    const evolved = vi.fn();
    eventBus.on('weapon-evolved', evolved);

    ['plasma', 'heat_sink', 'harmonic_resonator'].forEach((id) =>
      progression.applyUpgrade(id)
    );
    progression.applyUpgrade('afterburn_lance');

    expect(evolved).toHaveBeenCalledTimes(1);
    expect(combat.getWeaponState()).toMatchObject({
      weaponId: 'harmonic',
      evolutions: [{ family: 'thermal', name: 'Incendiary Lance' }],
    });
    expect(combat.trailLength).toBeGreaterThan(6);

    combat.reset();
    expect(combat.getWeaponState()).toMatchObject({
      weaponId: 'lance',
      evolutions: [],
    });
    expect(combat.trailLength).toBe(6);
  });
});
