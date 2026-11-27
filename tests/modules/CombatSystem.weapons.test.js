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
import XPOrbSystem from '../../src/modules/XPOrbSystem.js';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import RandomService from '../../src/core/RandomService.js';
import { WEAPONS, WEAPON_APEX, firePattern } from '../../src/data/weapons.js';
import { fireBeam, fireFan } from '../../src/modules/combat/beamAndFan.js';
import { tickWeaponField } from '../../src/modules/combat/firePatterns.js';
import { ORB_VALUE } from '../../src/data/enemies/asteroid-configs.js';
import { TURRET_BARREL_LENGTH } from '../../src/data/constants/physics.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

const DAMAGE = 10;
const NOSE = 16;
const BEAM = firePattern(WEAPONS.harmonic, 'beam');
// The mock turret turns on PIVOT, at heading 0; with `toward` (multi-lock),
// the barrel tip of the turret layer aimed there.
const PIVOT = { x: 100 + NOSE - TURRET_BARREL_LENGTH, y: 300 };
function muzzleToward(toward) {
  const angle = toward ? Math.atan2(toward.y - PIVOT.y, toward.x - PIVOT.x) : 0;
  return {
    x: PIVOT.x + Math.cos(angle) * TURRET_BARREL_LENGTH,
    y: PIVOT.y + Math.sin(angle) * TURRET_BARREL_LENGTH,
  };
}

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
    getMuzzlePoint: muzzleToward,
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
  combat.targeting.targetUpdateTimer = 0;
  combat.updateTargeting(0);
  expect(combat.targeting.currentTargetLocks).toHaveLength(multishot);
}

// The Overcharge Coil at all three ranks (+52% lance speed).
function fullCoil(eventBus) {
  [1, 2, 3].forEach((level) =>
    eventBus.emit('upgrade-weapon-tuning', {
      upgradeId: 'overcharge_coil',
      level,
      bulletSpeedMultiplier: 1.15,
    })
  );
}

// The Chain Capacitor whose next roll lands.
function landingCapacitor(combat) {
  combat.cards.cardEffects.chainCapacitor = {
    extraJumps: 1,
    doubleHitChance: 0.1,
  };
  combat.cards.rollCardChance = vi.fn(() => true);
}

// A lance round, as Projectiles fires it.
const lance = (overrides = {}) => ({
  kind: 'lance',
  projectile: WEAPONS.lance.projectile,
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
    expect(combat.weapons.beams).toHaveLength(0);

    // On the cooldown exactly: the clock carries nothing past it.
    combat.weapons.lastShotTime = combat.weapons.shootCooldown;
    combat.handleShooting(0, stats);
    expect(combat.bullets).toHaveLength(3);
    expect(combat.weapons.beams).toHaveLength(1);
    expect(beamFired).toHaveBeenCalledTimes(1);
    const hit = 100 - DAMAGE * BEAM.damageMultiplier;
    expect(near.health).toBeCloseTo(hit, 6);
    expect(far.health).toBeCloseTo(hit, 6);
    expect(past.health).toBe(100);
    expect(aside.health).toBe(100);
    // The next shot waits the cooldown plus the beam penalty.
    expect(combat.weapons.lastShotTime).toBe(-BEAM.cooldownPenalty);
    expect(combat.getWeaponState()).toMatchObject({
      weaponId: 'harmonic',
      shotsToBeam: 4,
    });

    combat.updateWeaponEffects(BEAM.duration + 0.01);
    expect(combat.weapons.beams).toHaveLength(0);
  });

  it('with the Overcharge Coil the beam comes every 3rd shot', () => {
    const { combat, eventBus } = makeCombat([]);
    eventBus.emit('upgrade-weapon', { weaponId: 'harmonic' });
    fullCoil(eventBus);
    const stats = { multishot: 1, damage: DAMAGE };
    combat.handleShooting(1, stats);
    combat.handleShooting(1, stats);
    expect(combat.getWeaponState().shotsToBeam).toBe(1);
    expect(combat.weapons.beams).toHaveLength(0);
    combat.handleShooting(1, stats);
    expect(combat.weapons.beams).toHaveLength(1);
    expect(combat.bullets).toHaveLength(2);
    expect(combat.getWeaponState().shotsToBeam).toBe(3);
  });

  it('Chain Capacitor: a beam that rolls fires again along the same line 0.1 s later; lances never hit twice', () => {
    const near = makeEnemy('near', 200, 300);
    const { combat, eventBus, enemies } = makeCombat([near]);
    eventBus.emit('upgrade-weapon', { weaponId: 'harmonic' });
    landingCapacitor(combat);
    const stats = { multishot: 1, damage: DAMAGE };
    for (let shot = 0; shot < 4; shot += 1) combat.handleShooting(1, stats);
    const hit = DAMAGE * BEAM.damageMultiplier;
    expect(near.health).toBeCloseTo(100 - hit, 6);
    const [first] = combat.weapons.beams;

    tickWeaponField(combat.weapons, 0.05, stats);
    expect(combat.weapons.beams).toHaveLength(1);
    tickWeaponField(combat.weapons, 0.06, stats);
    expect(combat.weapons.beams).toHaveLength(2);
    expect(combat.weapons.beams[1]).toMatchObject({
      x: first.x,
      y: first.y,
      angle: first.angle,
    });
    expect(near.health).toBeCloseTo(100 - 2 * hit, 6);

    // The lances between beams take no double hit.
    const health = near.health;
    combat.processBulletHit(lance(), near, enemies);
    expect(near.health).toBeCloseTo(health - DAMAGE, 6);
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
    for (let shot = 0; shot < 3; shot += 1) combat.handleShooting(1, stats);
    // On the cooldown exactly: the clock carries nothing past it.
    combat.weapons.lastShotTime = combat.weapons.shootCooldown;
    combat.handleShooting(0, stats);

    expect(combat.weapons.beams).toHaveLength(3);
    expect(beamFired).toHaveBeenCalledTimes(3);
    const hit = 100 - DAMAGE * BEAM.damageMultiplier;
    [up, level, down].forEach((enemy) => {
      expect(enemy.health).toBeCloseTo(hit, 6);
    });
    expect(combat.weapons.lastShotTime).toBe(-BEAM.cooldownPenalty);
    expect(fired).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pattern: 'beam',
        targeting: expect.objectContaining({
          multiLockActive: true,
          predictedPoints: combat.targeting.currentLockAssignments.map(
            (lock) => ({
              enemyId: lock.enemy.id,
              position: lock.predictedAim,
            })
          ),
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
    expect(combat.weapons.beams).toHaveLength(1);
    expect(hits.mock.calls.map(([data]) => data.enemy.id)).toEqual(['solid']);
    // The beam's own Thermal form: its scar sets alight what lies on it.
    combat.updateWeaponEffects(0.01);
    expect(combat.burns.has(phased)).toBe(false);
    expect(combat.burns.has(solid)).toBe(true);
    // The solid one's arc has nothing else within 140 px.
    expect(combat.arcs).toHaveLength(0);

    combat.updateWeaponEffects(2);
    expect(phased.health).toBe(100);
    expect(aside.health).toBe(100);
  });
});

// The Harmonic with a family's own beam form: four shots, the 4th a beam.
function harmonicBeam(combat, eventBus, family, apex = false) {
  eventBus.emit('upgrade-weapon', { weaponId: 'harmonic' });
  eventBus.emit('synergy-unlocked', { family });
  if (apex) eventBus.emit('apex-unlocked', { family });
  const stats = { multishot: 1, damage: DAMAGE };
  for (let shot = 0; shot < 4; shot += 1) combat.handleShooting(1, stats);
  expect(combat.weapons.beams).toHaveLength(1);
}

describe('Harmonic beam forms', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });
  const beamHit = DAMAGE * BEAM.damageMultiplier;

  it('Searing Beam (Thermal ×3): the line burns 1 s and sets alight what crosses it; the lances still burn', () => {
    const near = makeEnemy('near', 200, 300);
    const late = makeEnemy('late', 260, 420); // off the line as it fires
    const { combat, eventBus, enemies } = makeCombat([near, late]);
    harmonicBeam(combat, eventBus, 'thermal');
    expect(combat.getWeaponState().evolutions).toMatchObject([
      { family: 'thermal', name: 'Searing Beam' },
    ]);
    // The beam hit lands no lance burn; its scar touches on the next tick.
    expect(combat.burns.size).toBe(0);
    expect(combat.weapons.scars).toHaveLength(1);
    combat.updateWeaponEffects(0.01);
    expect(combat.burns.has(near)).toBe(true);
    expect(combat.burns.has(late)).toBe(false);

    late.y = 300;
    combat.updateWeaponEffects(0.2);
    expect(combat.burns.has(late)).toBe(true);
    combat.updateWeaponEffects(0.8);
    expect(combat.weapons.scars).toHaveLength(0);

    const other = makeEnemy('other', 0, 0);
    combat.processBulletHit(lance(), other, enemies);
    expect(combat.burns.has(other)).toBe(true);
  });

  it('Sunspear (Thermal ×5): the beam reaches 50% further and stays 0.5 s; its line burns 2 s', () => {
    const far = makeEnemy('far', 116 + 300, 300); // past 220 px, inside 330
    const { combat, eventBus } = makeCombat([far]);
    harmonicBeam(combat, eventBus, 'thermal', true);
    expect(far.health).toBeCloseTo(100 - beamHit, 6);
    combat.updateWeaponEffects(0.4);
    expect(combat.weapons.beams).toHaveLength(1);
    combat.updateWeaponEffects(0.2);
    expect(combat.weapons.beams).toHaveLength(0);
    expect(combat.weapons.scars).toHaveLength(1);
    combat.updateWeaponEffects(1.5);
    expect(combat.weapons.scars).toHaveLength(0);
  });

  it('Arc: at 3 the beam arcs from its far end to the 2 nearest off it; at 5 each enemy it crosses starts a chain of 3', () => {
    const { arc } = WEAPONS.harmonic.familyForms;
    const a = makeEnemy('a', 200, 300);
    const b = makeEnemy('b', 300, 300);
    const up = makeEnemy('up', 300, 200); // 100 px from b
    const down = makeEnemy('down', 300, 410); // 110 px
    const third = makeEnemy('third', 300, 430); // 130 px, third nearest
    const three = makeCombat([a, b, up, down, third]);
    harmonicBeam(three.combat, three.eventBus, 'arc');
    // No Chain Lance off the beam's hits: only its own two bolts.
    expect(a.health).toBeCloseTo(100 - beamHit, 6);
    expect(b.health).toBeCloseTo(100 - beamHit, 6);
    const bolt = beamHit * arc.damageFraction[0];
    expect(up.health).toBeCloseTo(100 - bolt, 6);
    expect(down.health).toBeCloseTo(100 - bolt, 6);
    expect(third.health).toBe(100);
    expect(three.combat.arcs.map((x) => x.bolt)).toEqual([true, true]);

    // At 5: from the one enemy it crosses, a chain jumping 3 times.
    const start = makeEnemy('start', 200, 300);
    const hops = [200, 90, -20, -130].map((y, i) => makeEnemy(`h${i}`, 200, y));
    const five = makeCombat([start, ...hops]);
    harmonicBeam(five.combat, five.eventBus, 'arc', true);
    const heavy = beamHit * arc.damageFraction[1];
    hops
      .slice(0, 3)
      .forEach((hop) => expect(hop.health).toBeCloseTo(100 - heavy, 6));
    expect(hops[3].health).toBe(100);
    expect(start.health).toBeCloseTo(100 - beamHit, 6);
    expect(five.combat.arcs).toHaveLength(3);
  });

  it('Salvage: orbs from beam kills fly to the ship; at 5 the beam also sends every orb it crosses', () => {
    const run = (apex) => {
      const rock = makeEnemy('rock', 200, 300, { health: 5 });
      const enemies = makeEnemies([rock]);
      // Just the orb state sendHome and updateHoming read.
      const orbs = {
        xpOrbs: [],
        homing: new Set(),
        resolvePlayer: () => ({ getPosition: () => ({ x: 100, y: 300 }) }),
        isOrbActive: (orb) => !orb.collected,
        invalidateSpatialIndex() {},
        sendHome: XPOrbSystem.prototype.sendHome,
      };
      const orbAt = (x, y) => {
        const orb = { x, y, home: null, collected: false, isFusing: false };
        orbs.xpOrbs.push(orb);
        return orb;
      };
      enemies.rewardManager = {
        stats: { totalOrbsDropped: 0 },
        createXPOrbs: (enemy, count) => {
          for (let i = 0; i < count; i += 1) orbAt(enemy.x, enemy.y);
        },
        getXPOrbSystem: () => orbs,
      };
      const applyDamage = enemies.applyDamage.bind(enemies);
      enemies.applyDamage = (enemy, damage) => {
        const result = applyDamage(enemy, damage);
        if (result.killed) enemies.rewardManager.createXPOrbs(enemy, 2);
        return result;
      };
      const onLine = orbAt(260, 305); // on the field before the beam
      const aside = orbAt(260, 340);
      const { combat, eventBus } = makeCombat([], { enemies });
      harmonicBeam(combat, eventBus, 'salvage', apex);
      const dropped = orbs.xpOrbs.filter((o) => o !== onLine && o !== aside);
      return { orbs, dropped, onLine, aside };
    };
    const three = run(false);
    expect(three.dropped).toHaveLength(2);
    three.dropped.forEach((orb) => expect(orb.home).not.toBeNull());
    expect(three.onLine.home).toBeNull();
    // Straight to the ship, faster each second.
    XPOrbSystem.prototype.updateHoming.call(three.orbs, 0.1);
    expect(three.dropped[0]).toMatchObject({ x: 200 - 40, y: 300 });

    const five = run(true);
    expect(five.onLine.home).not.toBeNull();
    expect(five.aside.home).toBeNull();
  });

  it('Kinetic ×3: a machine the beam strikes is thrown back along it, a boss is not; the fragments of a rock it kills fly out, then settle', () => {
    const { kinetic } = WEAPONS.harmonic.familyForms;
    const drone = makeEnemy('drone', 200, 300);
    const boss = makeEnemy('boss', 250, 300, { type: 'boss' });
    const rock = makeEnemy('rock', 300, 300, {
      type: 'asteroid',
      size: 'large',
      health: 5,
      generateFragments: () => [],
    });
    const fragments = [
      makeEnemy('f1', 310, 300, { type: 'asteroid', vx: 20 }),
      makeEnemy('f2', 300, 290, { type: 'asteroid', vy: -20 }),
    ];
    const enemies = makeEnemies([drone, boss, rock]);
    const applyDamage = enemies.applyDamage.bind(enemies);
    enemies.applyDamage = (enemy, damage) => {
      const result = applyDamage(enemy, damage);
      return { ...result, fragments: result.killed ? fragments : [] };
    };
    const { combat, eventBus } = makeCombat([], { enemies });
    harmonicBeam(combat, eventBus, 'kinetic');
    expect(rock.destroyed).toBe(true);
    expect(fragments[0].vx).toBe(kinetic.fling.speed);
    expect(fragments[1].vy).toBe(-kinetic.fling.speed);

    combat.updateWeaponEffects(1.5);
    expect(drone.x).toBeGreaterThan(200 + kinetic.knock.distance - 2);
    expect(drone.y).toBe(300);
    expect(boss.x).toBe(250);
    // Back to its own drift after three time constants.
    expect(fragments[0].vx).toBeCloseTo(20 + 220 * Math.exp(-3), 6);
    expect(combat.weapons.flung).toHaveLength(0);
  });

  it('Kinetic ×5: a rock the beam kills bursts into shards that hit what lies on along the beam', () => {
    const { cone } = WEAPONS.harmonic.familyForms.kinetic;
    const rock = makeEnemy('rock', 200, 300, {
      type: 'asteroid',
      size: 'small',
      health: 5,
    });
    const behind = makeEnemy('behind', 380, 300); // past the beam's end
    const aside = makeEnemy('aside', 300, 400); // 45° off the beam
    const { combat, eventBus } = makeCombat([rock, behind, aside]);
    harmonicBeam(combat, eventBus, 'kinetic', true);
    expect(combat.weapons.shards).toHaveLength(1);
    expect(behind.health).toBeCloseTo(
      100 - DAMAGE * BEAM.damageMultiplier * cone.damageFraction,
      6
    );
    expect(aside.health).toBe(100);
  });

  it('Field ×3: what lies near the beam is tugged onto its line and held; what it struck is held; a boss is left', () => {
    const struck = makeEnemy('struck', 200, 300);
    const near = makeEnemy('near', 250, 335); // inside the 40 px band
    const far = makeEnemy('far', 250, 380);
    const boss = makeEnemy('boss', 300, 330, { type: 'boss' });
    const { combat, eventBus } = makeCombat([struck, near, far, boss]);
    harmonicBeam(combat, eventBus, 'field');
    combat.updateWeaponEffects(0.2);
    // The Singularity's pull speed, 160 px/s, for the 0.2 s tug.
    expect(near.y).toBeCloseTo(335 - 32, 6);
    expect(struck.y).toBe(300);
    expect(far.y).toBe(380);
    expect(boss.y).toBe(330);
    expect([...combat.slows.keys()]).toEqual([struck, near]);
  });

  it('Field ×5: the beam leaves one trench on its line that drags what is in reach toward it for 1.2 s', () => {
    const { trench } = WEAPONS.harmonic.familyForms.field;
    const inReach = makeEnemy('in', 250, 360);
    const out = makeEnemy('out', 250, 390);
    const boss = makeEnemy('boss', 300, 340, { type: 'boss' });
    const { combat, eventBus } = makeCombat([inReach, out, boss]);
    harmonicBeam(combat, eventBus, 'field', true);
    const first = combat.weapons.trench;
    expect(first).toMatchObject({ y: 300, ey: 300, reach: trench.reach });
    combat.updateWeaponEffects(trench.tau);
    expect(inReach.y).toBeCloseTo(300 + 60 * Math.exp(-1), 6);
    expect(out.y).toBe(390);
    expect(boss.y).toBe(340);

    // A new beam's trench replaces the last.
    combat.weapons.beams.length = 0;
    harmonicBeam(combat, eventBus, 'field', true);
    expect(combat.weapons.trench).not.toBe(first);
    combat.updateWeaponEffects(trench.life);
    expect(combat.weapons.trench).toBeNull();
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
    expect(combat.weapons.weaponId).toBe('scatter');
  });

  it('fires a 26° fan of 5 slower bolts, one more per extra Multishot up to 9, and waits 1.6× the cooldown', () => {
    const { combat, eventBus } = scatter([]);
    const fired = vi.fn();
    eventBus.on('weapon-fired', fired);

    // On the cooldown exactly: the clock carries nothing past it.
    combat.weapons.lastShotTime = combat.weapons.shootCooldown;
    combat.handleShooting(0, { multishot: 1, damage: DAMAGE });
    expect(combat.bullets).toHaveLength(FAN.bolts);
    const angles = combat.bullets.map((bolt) => Math.atan2(bolt.vy, bolt.vx));
    const half = (FAN.fan * Math.PI) / 360;
    expect(angles[0]).toBeCloseTo(-half, 6);
    expect(angles[FAN.bolts - 1]).toBeCloseTo(half, 6);
    combat.bullets.forEach((bolt) => {
      expect(bolt.kind).toBe('flak');
      expect(Math.hypot(bolt.vx, bolt.vy)).toBeCloseTo(
        combat.weapons.bulletSpeed * BOLT.speedMultiplier,
        6
      );
      expect(bolt.damage).toBeCloseTo(DAMAGE * BOLT.damageMultiplier, 6);
    });
    expect(combat.weapons.lastShotTime).toBeCloseTo(
      -combat.weapons.shootCooldown * (FAN.cooldownMultiplier - 1),
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

  it('Overcharge Coil at rank 3: bolts fly 50% faster and burst 80 px further', () => {
    const { combat, eventBus } = scatter([]);
    fullCoil(eventBus);
    combat.handleShooting(1, { multishot: 1, damage: DAMAGE });
    const [bolt] = combat.bullets;
    const speed = Math.hypot(bolt.vx, bolt.vy);
    expect(speed).toBeCloseTo(
      (combat.weapons.bulletSpeed / 1.15 ** 3) * 1.5 * BOLT.speedMultiplier,
      6
    );
    expect(bolt.life * speed).toBeCloseTo(BOLT.range + 80, 6);
  });

  it('Thermal Lens: the fan is 20% narrower and each bolt hits 15% harder', () => {
    const { combat, eventBus } = scatter([]);
    eventBus.emit('upgrade-thermal-lens', {
      beamLengthMultiplier: 1.4,
      lanceDamageMultiplier: 1.15,
    });
    combat.handleShooting(1, { multishot: 1, damage: DAMAGE });
    const angles = combat.bullets.map((bolt) => Math.atan2(bolt.vy, bolt.vx));
    const half = (FAN.fan * 0.8 * Math.PI) / 360;
    expect(angles[0]).toBeCloseTo(-half, 6);
    expect(angles.at(-1)).toBeCloseTo(half, 6);
    expect(combat.bullets[0].damage).toBeCloseTo(
      DAMAGE * 1.15 * BOLT.damageMultiplier,
      6
    );
  });

  it('Chain Capacitor: a volley that rolls fires again 0.1 s later, which keeps the cooldown and never rolls', () => {
    const { combat } = scatter([]);
    landingCapacitor(combat);
    const stats = { multishot: 1, damage: DAMAGE };
    combat.handleShooting(1, stats);
    const wait = combat.weapons.lastShotTime;
    expect(combat.bullets).toHaveLength(FAN.bolts);

    tickWeaponField(combat.weapons, 0.11, stats);
    expect(combat.bullets).toHaveLength(2 * FAN.bolts);
    expect(combat.weapons.lastShotTime).toBe(wait);
    expect(combat.cards.rollCardChance).toHaveBeenCalledTimes(1);
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
      const { predictedAim } = combat.targeting.currentLockAssignments[index];
      const toLock = Math.atan2(
        predictedAim.y - PIVOT.y,
        predictedAim.x - PIVOT.x
      );
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
    ).toEqual(combat.targeting.currentTargetLocks.map((enemy) => enemy.id));

    // Fewer bolts than locks: one bolt each for the first locks.
    combat.bullets = [];
    fireFan(
      combat.weapons,
      { ...FAN, bolts: 2, maxBolts: 2 },
      { x: 100, y: 300 },
      { multishot: 1, damage: DAMAGE }
    );
    expect(combat.bullets).toHaveLength(2);
    [0, 1].forEach((index) => {
      const { predictedAim } = combat.targeting.currentLockAssignments[index];
      const bolt = combat.bullets[index];
      expect(Math.atan2(bolt.vy, bolt.vx)).toBeCloseTo(
        Math.atan2(predictedAim.y - PIVOT.y, predictedAim.x - PIVOT.x),
        6
      );
    });
  });

  it('a fan of one bolt flies along the aim', () => {
    const { combat } = scatter([]);

    fireFan(
      combat.weapons,
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
    // one burst caught the centre enemy; the rest burned out on nothing
    expect(bursts.mock.calls.filter(([burst]) => !burst.fizzled)).toHaveLength(
      1
    );
    expect(combat.weapons.flakBursts).toHaveLength(FAN.bolts);
    expect(combat.weapons.flakBursts.filter((burst) => burst.lit)).toHaveLength(
      1
    );
    const burst = combat.weapons.flakBursts[2];
    expect(burst.x).toBeCloseTo(end, 3);
    expect(burst.y).toBeCloseTo(300, 3);
    expect(centre.health).toBeCloseTo(
      100 - DAMAGE * BOLT.burst.damageMultiplier,
      6
    );
    expect(outside.health).toBe(100);

    combat.updateWeaponEffects(BOLT.burst.duration + 0.01);
    expect(combat.weapons.flakBursts).toHaveLength(0);
  });

  it('a bolt bursts on its first hit: the struck enemy takes the bolt, its neighbours the shrapnel, a phased Shade nothing, and the fan runs its own Thermal (no lance burn)', () => {
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
    expect(combat.weapons.flakBursts).toHaveLength(1);
    expect(target.health).toBeCloseTo(100 - DAMAGE * BOLT.damageMultiplier, 6);
    expect(near.health).toBeCloseTo(
      100 - DAMAGE * BOLT.burst.damageMultiplier,
      6
    );
    expect(phased.health).toBe(100);
    expect(combat.burns.size).toBe(0);
  });
});

describe('multi-lock turret layers', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });

  const STATS = { multishot: 3, damage: DAMAGE };
  // Three locks round the ship with `weaponId` (null: the lance); `tips`:
  // the barrel tip of the turret layer aimed at each lock, in lock order.
  const locked = (weaponId) => {
    const made = makeCombat([
      makeEnemy('up', 250, 180),
      makeEnemy('level', 300, 300),
      makeEnemy('down', 250, 420),
    ]);
    if (weaponId) made.eventBus.emit('upgrade-weapon', { weaponId });
    lockOnMany(made.combat, made.eventBus, 3);
    const tips = made.combat.targeting.currentLockAssignments.map(
      ({ predictedAim }) => muzzleToward(predictedAim)
    );
    return { ...made, tips };
  };
  const expectFrom = (shots, tips) => {
    expect(shots).toHaveLength(tips.length);
    shots.forEach((shot, i) => {
      expect(shot.x).toBeCloseTo(tips[i].x, 9);
      expect(shot.y).toBeCloseTo(tips[i].y, 9);
    });
  };

  it('every lance, fan bolt and beam at a lock leaves the barrel tip of the turret layer aimed at it', () => {
    let { combat, tips } = locked(null);
    expect(new Set(tips.map((tip) => `${tip.x},${tip.y}`)).size).toBe(3);
    combat.handleShooting(1, STATS);
    expectFrom(combat.bullets, tips);

    // 7 bolts on 3 locks: 3, 2, 2.
    ({ combat, tips } = locked('scatter'));
    combat.handleShooting(1, STATS);
    expectFrom(
      combat.bullets,
      [0, 0, 0, 1, 1, 2, 2].map((i) => tips[i])
    );

    // The beams stay on their layers' barrels while they show.
    ({ combat, tips } = locked('harmonic'));
    fireBeam(combat.weapons, BEAM, { x: 100, y: 300 }, STATS);
    expectFrom(combat.weapons.beams, tips);
    combat.updateWeaponEffects(1 / 60);
    expectFrom(combat.weapons.beams, tips);
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
      evolutions: [{ family: 'thermal', name: 'Searing Beam' }],
    });
    // The Harmonic's own form is its beam's: its lances still evolve.
    expect(combat.weapons.trailLength).toBeGreaterThan(6);

    combat.reset();
    expect(combat.getWeaponState()).toMatchObject({
      weaponId: 'lance',
      evolutions: [],
    });
    expect(combat.weapons.trailLength).toBe(6);
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
    expect(combat.weapons.lanceLook.apex).toBe(true);

    eventBus.emit('progression-reset');
    expect(combat.getWeaponState().evolutions).toEqual([]);
    expect(combat.weapons.lanceLook.apex).toBe(false);
  });
});
