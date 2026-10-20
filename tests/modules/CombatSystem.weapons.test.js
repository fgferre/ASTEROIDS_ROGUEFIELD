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
import { WEAPONS, WEAPON_APEX, firePattern } from '../../src/data/weapons.js';
import { ORB_VALUE } from '../../src/data/enemies/asteroid-configs.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

const DAMAGE = 10;
const NOSE = 16;
const BEAM = firePattern(WEAPONS.harmonic, 'beam');

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
    getVelocity: () => ({ x: 0, y: 0 }),
    getShieldRadius: () => 16,
    getTurretAngle: () => 0,
    getMuzzlePoint: () => ({ x: 100 + NOSE, y: 300 }),
    getStats: () => ({ multishot: 1, damage: DAMAGE }),
  };
  const enemies = options.enemies || makeEnemies(enemyList);
  const physics = { forEachBulletCollision: () => {} };
  const combat = new CombatSystem({ eventBus, player, enemies, physics });
  return { combat, eventBus, enemies };
}

// Targeting Matrix at rank 3 with `multishot` locks on the listed enemies.
function lockOnMany(combat, eventBus, multishot) {
  eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
  eventBus.emit('upgrade-aiming-suite', { level: 2 });
  eventBus.emit('upgrade-aiming-suite', { level: 3, multiLockTargets: 4 });
  combat.lastKnownPlayerStats = { multishot, damage: DAMAGE };
  combat.targetUpdateTimer = 0;
  combat.updateTargeting(0);
  expect(combat.currentTargetLocks).toHaveLength(multishot);
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
    eventBus.emit('upgrade-weapon', { weaponId: 'harmonic' });

    const stats = { multishot: 1, damage: DAMAGE };
    for (let shot = 0; shot < 3; shot += 1) combat.handleShooting(1, stats);
    expect(combat.bullets).toHaveLength(3);
    expect(combat.beams).toHaveLength(0);

    combat.handleShooting(1, stats);
    expect(combat.bullets).toHaveLength(3);
    expect(combat.beams).toHaveLength(1);
    expect(beamFired).toHaveBeenCalledTimes(1);
    const hit = 100 - DAMAGE * BEAM.damageMultiplier;
    expect(near.health).toBeCloseTo(hit, 6);
    expect(far.health).toBeCloseTo(hit, 6);
    expect(past.health).toBe(100);
    expect(aside.health).toBe(100);
    // The next shot waits the cooldown plus the beam penalty.
    expect(combat.lastShotTime).toBe(-BEAM.cooldownPenalty);
    expect(combat.getWeaponState()).toMatchObject({
      weaponId: 'harmonic',
      shotsToBeam: 4,
    });

    combat.updateWeaponEffects(BEAM.duration + 0.01);
    expect(combat.beams).toHaveLength(0);
  });

  it('with several locks fires one beam at each lock and hits every locked enemy; the penalty comes once', () => {
    const up = makeEnemy('up', 250, 180);
    const level = makeEnemy('level', 300, 300);
    const down = makeEnemy('down', 250, 420);
    const { combat, eventBus } = makeCombat([up, level, down]);
    const beamFired = vi.fn();
    const fired = vi.fn();
    eventBus.on('weapon-beam-fired', beamFired);
    eventBus.on('weapon-fired', fired);
    eventBus.emit('upgrade-weapon', { weaponId: 'harmonic' });
    lockOnMany(combat, eventBus, 3);

    const stats = { multishot: 3, damage: DAMAGE };
    for (let shot = 0; shot < 4; shot += 1) combat.handleShooting(1, stats);

    expect(combat.beams).toHaveLength(3);
    expect(beamFired).toHaveBeenCalledTimes(3);
    const hit = 100 - DAMAGE * BEAM.damageMultiplier;
    [up, level, down].forEach((enemy) => {
      expect(enemy.health).toBeCloseTo(hit, 6);
    });
    expect(combat.lastShotTime).toBe(-BEAM.cooldownPenalty);
    expect(fired).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pattern: 'beam',
        targeting: expect.objectContaining({
          multiLockActive: true,
          predictedPoints: combat.currentLockAssignments.map((lock) => ({
            enemyId: lock.enemy.id,
            position: lock.predictedAim,
          })),
        }),
      })
    );
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
    enemies.waveState = { current: 2 };
    enemies.waveManager = { addExtraRocks: vi.fn() };
    enemies.assignVariantsToFragments = vi.fn(() => ['common']);
    enemies.acquireAsteroid = vi.fn((config) => ({ ...config }));
    enemies.registerActiveEnemy = vi.fn(() => ({ registered: true }));
    enemies.warnIfWaveManagerRegistrationFailed = vi.fn();
    enemies.createScopedRandom = vi.fn(() => ({ random: null }));
    const { combat } = makeCombat([], { enemies });

    combat.processBulletHit(
      lance({ kind: 'beam', extraFragments: BEAM.extraFragments }),
      rock,
      enemies
    );

    expect(enemies.acquireAsteroid).toHaveBeenCalledTimes(1);
    const fragment = enemies.acquireAsteroid.mock.calls[0][0];
    expect(fragment).toMatchObject({ size: 'medium', variant: 'common' });
    // Turned a quarter turn (π / 2 fragments) from the first seam.
    expect(fragment.x).toBeCloseTo(200, 6);
    expect(fragment.y).toBeCloseTo(310, 6);
    expect(enemies.waveManager.addExtraRocks).toHaveBeenCalledWith(1);

    // A lance kill splits normally.
    rock.destroyed = false;
    rock.health = 5;
    combat.processBulletHit(lance(), rock, enemies);
    expect(enemies.acquireAsteroid).toHaveBeenCalledTimes(1);
    expect(enemies.waveManager.addExtraRocks).toHaveBeenCalledTimes(1);
  });

  it('passes through a phased Shade: no hit, no burn, no chain hop through it', () => {
    const phased = makeEnemy('phased', 200, 300, {
      type: 'shade',
      intangible: true,
    });
    const solid = makeEnemy('solid', 330, 300); // 130 px from the Shade
    const aside = makeEnemy('aside', 200, 380); // off-axis, 80 px from it
    const { combat, eventBus } = makeCombat([phased, solid, aside]);
    const hits = vi.fn();
    eventBus.on('bullet-hit', hits);
    eventBus.emit('upgrade-weapon', { weaponId: 'harmonic' });
    ['thermal', 'arc'].forEach((family) =>
      eventBus.emit('synergy-unlocked', { family })
    );

    const stats = { multishot: 1, damage: DAMAGE };
    for (let shot = 0; shot < 4; shot += 1) combat.handleShooting(1, stats);
    expect(combat.beams).toHaveLength(1);
    expect(hits.mock.calls.map(([data]) => data.enemy.id)).toEqual(['solid']);
    expect(combat.burns.has(phased)).toBe(false);
    expect(combat.burns.has(solid)).toBe(true);
    // The solid one's arc has nothing else within 140 px.
    expect(combat.arcs).toHaveLength(0);

    combat.updateWeaponEffects(2);
    expect(phased.health).toBe(100);
    expect(aside.health).toBe(100);
  });
});

describe('Scatter Coil', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });

  const FAN = firePattern(WEAPONS.scatter, 'fan');
  const BOLT = WEAPONS.scatter.projectile;
  const scatter = (enemyList) => {
    const made = makeCombat(enemyList);
    made.eventBus.emit('upgrade-weapon', { weaponId: 'scatter' });
    return made;
  };

  it('the card swaps the cannon for the Scatter Coil; an unknown weapon id changes nothing', () => {
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

    progression.applyUpgrade('scatter_coil');
    expect(combat.getWeaponState()).toMatchObject({
      weaponId: 'scatter',
      name: 'Scatter Coil',
      shotsToBeam: null,
    });
    eventBus.emit('upgrade-weapon', { weaponId: 'nope' });
    expect(combat.weaponId).toBe('scatter');
  });

  it('fires a 26° fan of 5 slower bolts, one more per extra Multishot up to 9, and waits 1.6× the cooldown', () => {
    const { combat, eventBus } = scatter([]);
    const fired = vi.fn();
    eventBus.on('weapon-fired', fired);

    combat.handleShooting(1, { multishot: 1, damage: DAMAGE });
    expect(combat.bullets).toHaveLength(FAN.bolts);
    const angles = combat.bullets.map((bolt) => Math.atan2(bolt.vy, bolt.vx));
    const half = (FAN.fan * Math.PI) / 360;
    expect(angles[0]).toBeCloseTo(-half, 6);
    expect(angles[FAN.bolts - 1]).toBeCloseTo(half, 6);
    combat.bullets.forEach((bolt) => {
      expect(bolt.kind).toBe('flak');
      expect(Math.hypot(bolt.vx, bolt.vy)).toBeCloseTo(
        combat.bulletSpeed * BOLT.speedMultiplier,
        6
      );
      expect(bolt.damage).toBeCloseTo(DAMAGE * BOLT.damageMultiplier, 6);
    });
    expect(combat.lastShotTime).toBeCloseTo(
      -combat.shootCooldown * (FAN.cooldownMultiplier - 1),
      6
    );
    expect(fired).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: 'fan' })
    );

    combat.bullets = [];
    combat.handleShooting(1, { multishot: 3, damage: DAMAGE });
    expect(combat.bullets).toHaveLength(FAN.bolts + 2);
    combat.bullets = [];
    combat.handleShooting(1, { multishot: 20, damage: DAMAGE });
    expect(combat.bullets).toHaveLength(FAN.maxBolts);
  });

  it('with several locks splits its bolts over the locks, earlier locks first, each a small fan on its lock', () => {
    const enemies = [
      makeEnemy('up', 250, 180),
      makeEnemy('level', 300, 300),
      makeEnemy('down', 250, 420),
    ];
    const { combat, eventBus } = scatter(enemies);
    const fired = vi.fn();
    eventBus.on('weapon-fired', fired);
    lockOnMany(combat, eventBus, 3);

    // 7 bolts on 3 locks: 3, 2, 2.
    combat.handleShooting(1, { multishot: 3, damage: DAMAGE });
    expect(combat.bullets).toHaveLength(FAN.bolts + 2);
    const angles = combat.bullets.map((bolt) => Math.atan2(bolt.vy, bolt.vx));
    const step = (FAN.fan * Math.PI) / 180 / (FAN.bolts - 1);
    const groups = [angles.slice(0, 3), angles.slice(3, 5), angles.slice(5)];
    groups.forEach((group, index) => {
      const { predictedAim } = combat.currentLockAssignments[index];
      const toLock = Math.atan2(predictedAim.y - 300, predictedAim.x - 116);
      const centre = group.reduce((sum, a) => sum + a, 0) / group.length;
      expect(centre).toBeCloseTo(toLock, 6);
      group.slice(1).forEach((a, i) => {
        expect(a - group[i]).toBeCloseTo(step, 6);
      });
    });
    expect(fired).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pattern: 'fan',
        targeting: expect.objectContaining({ multiLockActive: true }),
      })
    );
    expect(
      fired.mock.lastCall[0].targeting.predictedPoints.map((p) => p.enemyId)
    ).toEqual(combat.currentTargetLocks.map((enemy) => enemy.id));

    // Fewer bolts than locks: one bolt each for the first locks.
    combat.bullets = [];
    combat.weapons.fireFan(
      { ...FAN, bolts: 2, maxBolts: 2 },
      { x: 100, y: 300 },
      { multishot: 1, damage: DAMAGE }
    );
    expect(combat.bullets).toHaveLength(2);
    [0, 1].forEach((index) => {
      const { predictedAim } = combat.currentLockAssignments[index];
      const bolt = combat.bullets[index];
      expect(Math.atan2(bolt.vy, bolt.vx)).toBeCloseTo(
        Math.atan2(predictedAim.y - 300, predictedAim.x - 116),
        6
      );
    });
  });

  it('a fan of one bolt flies along the aim', () => {
    const { combat } = scatter([]);

    combat.weapons.fireFan(
      { ...FAN, bolts: 1 },
      { x: 100, y: 300 },
      { multishot: 1, damage: DAMAGE }
    );
    expect(combat.bullets).toHaveLength(1);
    const [bolt] = combat.bullets;
    expect(Number.isFinite(bolt.vx) && Number.isFinite(bolt.vy)).toBe(true);
    expect(Math.atan2(bolt.vy, bolt.vx)).toBeCloseTo(0, 9);
    expect(Number.isFinite(bolt.x) && Number.isFinite(bolt.y)).toBe(true);
  });

  it('a bolt that hits nothing bursts at the end of its range; shrapnel hits each enemy in reach once per volley', () => {
    // Muzzle at (116, 300), aimed along +x: the centre bolt ends at x 296.
    const end = 116 + BOLT.range;
    const centre = makeEnemy('centre', end, 300); // in reach of all 5 bursts
    const reach = BOLT.burst.radius + 10;
    const outside = makeEnemy('outside', end + reach + 5, 300);
    const { combat, eventBus } = scatter([centre, outside]);
    const bursts = vi.fn();
    eventBus.on('flak-burst', bursts);

    combat.handleShooting(1, { multishot: 1, damage: DAMAGE });
    for (let step = 0; step < 4; step += 1) combat.updateBullets(0.1);

    expect(combat.bullets).toHaveLength(0);
    expect(bursts).toHaveBeenCalledTimes(FAN.bolts);
    expect(combat.flakBursts).toHaveLength(FAN.bolts);
    expect(combat.flakBursts.filter((burst) => burst.lit)).toHaveLength(1);
    const burst = combat.flakBursts[2];
    expect(burst.x).toBeCloseTo(end, 3);
    expect(burst.y).toBeCloseTo(300, 3);
    expect(centre.health).toBeCloseTo(
      100 - DAMAGE * BOLT.burst.damageMultiplier,
      6
    );
    expect(outside.health).toBe(100);

    combat.updateWeaponEffects(BOLT.burst.duration + 0.01);
    expect(combat.flakBursts).toHaveLength(0);
  });

  it('a bolt bursts on its first hit: the struck enemy takes the bolt, its neighbours the shrapnel, a phased Shade nothing, and the evolution procs on both', () => {
    const target = makeEnemy('target', 200, 300);
    const near = makeEnemy('near', 190, 300 + BOLT.burst.radius);
    const phased = makeEnemy('phased', 190, 290, {
      type: 'shade',
      intangible: true,
    });
    const { combat, eventBus } = scatter([target, near, phased]);
    eventBus.emit('synergy-unlocked', { family: 'thermal' });

    combat.handleShooting(1, { multishot: 1, damage: DAMAGE });
    const bolt = combat.bullets[2];
    bolt.x = 190;
    bolt.y = 300;
    combat.processBulletHit(bolt, target, combat.cachedEnemies);

    expect(bolt.hit).toBe(true);
    expect(combat.flakBursts).toHaveLength(1);
    expect(target.health).toBeCloseTo(100 - DAMAGE * BOLT.damageMultiplier, 6);
    expect(near.health).toBeCloseTo(
      100 - DAMAGE * BOLT.burst.damageMultiplier,
      6
    );
    expect(phased.health).toBe(100);
    expect(combat.burns.has(target)).toBe(true);
    expect(combat.burns.has(near)).toBe(true);
    expect(combat.burns.has(phased)).toBe(false);
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
    // A directionless hit: no knockback, so this measures the slow alone.
    combat.processBulletHit(lance({ vx: 0 }), target, combat.cachedEnemies);

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

describe('Apex evolutions', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });

  it('Solar Flare: a burn tick spreads a half burn to enemies within 70 px, once, and it does not spread again', () => {
    const target = makeEnemy('t', 0, 0);
    const neighbour = makeEnemy('n', 50, 0); // 30 px rim to rim
    const beyond = makeEnemy('b', 100, 0); // 80 px from the target's rim
    const { combat, eventBus } = makeCombat([target, neighbour, beyond]);
    eventBus.emit('apex-unlocked', { family: 'thermal' });

    combat.processBulletHit(lance(), target, combat.cachedEnemies);
    combat.updateWeaponEffects(0.4); // target tick 1 sets the neighbour alight
    expect(target.health).toBeCloseTo(88.5, 6);
    expect(neighbour.health).toBe(100);
    expect(combat.burns.size).toBe(2);
    expect(combat.arcs).toHaveLength(1);

    // The spread burn: 2 ticks of the same 1.5 over 0.6 s.
    combat.updateWeaponEffects(0.3);
    expect(neighbour.health).toBeCloseTo(98.5, 6);
    combat.updateWeaponEffects(0.1);
    expect(target.health).toBeCloseTo(87, 6);
    combat.updateWeaponEffects(0.2);
    expect(neighbour.health).toBeCloseTo(97, 6);
    combat.updateWeaponEffects(0.2); // target tick 3: no second spread
    combat.updateWeaponEffects(1);
    expect(target.health).toBeCloseTo(85.5, 6);
    expect(neighbour.health).toBeCloseTo(97, 6);
    expect(beyond.health).toBe(100);
    expect(combat.burns.size).toBe(0);
  });

  it('Coilgun: a lance pierces everything on its line for +25% damage', () => {
    const line = ['a', 'b', 'c', 'd', 'e'].map((id) => makeEnemy(id, 0, 0));
    const { combat, eventBus } = makeCombat(line);
    eventBus.emit('apex-unlocked', { family: 'kinetic' });
    combat.createBullet({ x: 0, y: 0 }, { x: 10, y: 0 }, DAMAGE);
    const bullet = combat.bullets[0];

    line.forEach((enemy) => {
      combat.processBulletHit(bullet, enemy, combat.cachedEnemies);
      combat.processBulletHit(bullet, enemy, combat.cachedEnemies); // still inside
    });
    expect(bullet.hit).toBe(false);
    expect(line.map((enemy) => enemy.health)).toEqual(
      line.map(() => 100 - DAMAGE * WEAPON_APEX.kinetic.damageMultiplier)
    );
  });

  it('Storm Lance: the first jump forks to the two nearest and each branch jumps on, 3 hops deep', () => {
    const source = makeEnemy('s', 100, 100);
    const a = makeEnemy('a', 160, 100); // 60 px: first fork
    const b = makeEnemy('b', 100, 170); // 70 px: second fork
    const d = makeEnemy('d', 230, 100); // 70 px from a
    const f = makeEnemy('f', 300, 100); // 70 px from d
    const e = makeEnemy('e', 100, 280); // 110 px from b
    const { combat, eventBus } = makeCombat([source, a, b, d, f, e]);
    eventBus.emit('apex-unlocked', { family: 'arc' });

    combat.processBulletHit(lance(), source, combat.cachedEnemies);
    expect(source.health).toBe(90);
    expect([a, b, d, f, e].map((enemy) => enemy.health)).toEqual([
      95, 95, 95, 95, 95,
    ]);
    // a+b (the fork), a→d→f, b→e: one hop per jump past the first.
    expect(combat.arcs).toHaveLength(5);
    expect(combat.arcs.every((arc) => arc.heavy)).toBe(true);
  });

  it('Singularity Lance: a hit pulls the target and enemies within 90 px toward it at 160 px/s for 0.5 s, instead of slowing', () => {
    const target = makeEnemy('t', 0, 0);
    const neighbour = makeEnemy('n', 75, 0); // rim 75 px from the hit point
    const far = makeEnemy('f', 105, 0); // rim 105 px away
    const boss = makeEnemy('w', 30, 0, { type: 'boss' });
    const { combat, eventBus } = makeCombat([target, neighbour, far, boss]);
    eventBus.emit('apex-unlocked', { family: 'field' });

    // A directionless hit at (-10, 0): no knockback.
    combat.processBulletHit(
      lance({ x: -10, vx: 0 }),
      target,
      combat.cachedEnemies
    );
    expect(combat.slows.size).toBe(0);
    expect(combat.wells).toHaveLength(1);

    for (let i = 0; i < 6; i += 1) combat.updateWeaponEffects(0.1);
    expect(target.x).toBeCloseTo(-10, 6); // reached the point and stays
    expect(neighbour.x).toBeCloseTo(-5, 6); // 0.5 s × 160 px/s, then free
    expect(far.x).toBe(105);
    expect(boss.x).toBe(30);
    expect(combat.pulls.size).toBe(0);
    expect(combat.wells).toHaveLength(0);
  });

  it('Motherlode: lance kills drop twice the orbs', () => {
    const enemies = makeEnemies([], 4);
    enemies.rewardManager = {
      stats: { totalOrbsDropped: 0 },
      createXPOrbs: vi.fn(),
    };
    const { combat, eventBus } = makeCombat([], { enemies });
    eventBus.emit('apex-unlocked', { family: 'salvage' });

    const rock = makeEnemy('r', 0, 0, { health: 5 });
    combat.processBulletHit(lance(), rock, enemies);
    expect(enemies.rewardManager.createXPOrbs).toHaveBeenCalledWith(
      rock,
      4,
      ORB_VALUE
    );
  });

  it('an Apex shows on the HUD state in place of its evolution and a new run clears it', () => {
    const { combat, eventBus } = makeCombat([]);
    eventBus.emit('synergy-unlocked', { family: 'arc' });
    eventBus.emit('apex-unlocked', { family: 'thermal' }); // evolves first
    expect(combat.getWeaponState().evolutions).toEqual([
      expect.objectContaining({ family: 'arc', id: 'chain', apex: false }),
      expect.objectContaining({
        family: 'thermal',
        name: 'Solar Flare Lance',
        apex: true,
        short: 'FLARE',
      }),
    ]);
    expect(combat.lanceLook.apex).toBe(true);

    eventBus.emit('progression-reset');
    expect(combat.getWeaponState().evolutions).toEqual([]);
    expect(combat.lanceLook.apex).toBe(false);
  });
});
