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
import { WEAPONS, WEAPON_APEX } from '../../src/data/weapons.js';
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
    getTurretAngle: () => 0,
    getMuzzlePoint: () => ({ x: 100 + NOSE, y: 300 }),
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
    eventBus.emit('upgrade-weapon-harmonic', { weaponId: 'harmonic' });
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
