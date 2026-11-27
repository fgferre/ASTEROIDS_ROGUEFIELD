// The Seeker Swarm missile's own family forms (combat/missileForms.js,
// picked 23/11): what each does to a fight, with 3 cards and, where it
// differs, 5.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import CombatSystem from '../../src/modules/CombatSystem.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

const DAMAGE = 10;
const STATS = { multishot: 1, damage: DAMAGE };
const FORMS = WEAPONS['seeker-swarm'].familyForms;
const BURST = WEAPONS['seeker-swarm'].projectile.burst;

function makeEnemy(id, x, y, extra = {}) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 10,
    health: 1000,
    type: 'drone',
    ...extra,
  };
}

// The ship at (100, 300) facing +x with the Seeker Swarm, among `list`.
function seeker(list) {
  const eventBus = createEventBusMock();
  const player = {
    isDead: false,
    getPosition: () => ({ x: 100, y: 300 }),
    getVelocity: () => ({ x: 0, y: 0 }),
    getShieldRadius: () => 16,
    getTurretAngle: () => 0,
    getMuzzlePoint: () => ({ x: 116, y: 300 }),
    getStats: () => STATS,
  };
  const enemies = {
    forEachActiveEnemy: (callback) => list.forEach(callback),
    applyDamage(enemy, damage) {
      enemy.health = Math.max(0, enemy.health - damage);
      const killed = enemy.health <= 0;
      if (killed) enemy.destroyed = true;
      return { killed, remainingHealth: enemy.health };
    },
  };
  const physics = { forEachBulletCollision: () => {} };
  const combat = new CombatSystem({ eventBus, player, enemies, physics });
  eventBus.emit('upgrade-weapon', { weaponId: 'seeker-swarm' });
  return { combat, eventBus };
}

// A salvo's first missile, put on `enemy`'s rim flying along +x.
function missileOn(combat, enemy) {
  combat.handleShooting(1, STATS);
  const missile = combat.bullets[combat.bullets.length - 2];
  missile.x = enemy.x - enemy.radius;
  missile.y = enemy.y;
  missile.vx = 275;
  missile.vy = 0;
  return missile;
}

const step = (combat, seconds) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05)
    combat.updateWeaponEffects(0.05);
};

describe('Seeker Swarm family forms', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });

  it('Thermite (Thermal ×3): a missile lodges in what it hits and burns it, then 1 s later bursts 60% wider on it and round it; one that kills bursts at once', () => {
    const target = makeEnemy('target', 200, 300);
    const near = makeEnemy('near', 200, 350); // 40 px rim to the burst: only the wider one
    const { combat, eventBus } = seeker([target, near]);
    eventBus.emit('synergy-unlocked', { family: 'thermal' });
    const missile = missileOn(combat, target);
    const shrapnel = missile.shrapnel * FORMS.thermal.burstDamage;

    combat.processBulletHit(missile, target, combat.cachedEnemies);
    expect(combat.weapons.flakBursts).toHaveLength(0);
    expect(combat.weapons.lodged).toHaveLength(1);
    // no Incendiary Lance: the hit itself sets nothing burning
    expect(combat.burns.has(target)).toBe(false);
    step(combat, 0.3);
    expect(combat.burns.has(target)).toBe(true);
    expect(near.health).toBe(1000);
    step(combat, 0.75);
    expect(combat.weapons.lodged).toHaveLength(0);
    expect(combat.weapons.flakBursts).toHaveLength(1);
    expect(combat.weapons.flakBursts[0].maxRadius).toBeCloseTo(
      BURST.radius * FORMS.thermal.burstScale,
      6
    );
    expect(near.health).toBeCloseTo(1000 - shrapnel, 6);

    const weak = makeEnemy('weak', 200, 400, { health: 1 });
    combat.weapons.flakBursts.length = 0;
    const killer = missileOn(combat, weak);
    combat.processBulletHit(killer, weak, combat.cachedEnemies);
    expect(combat.weapons.lodged).toHaveLength(0);
    expect(combat.weapons.flakBursts).toHaveLength(1);
  });

  it('Thermite at 5: the burst throws thermite at the nearest neighbours; it flies there, sticks and burns', () => {
    const target = makeEnemy('target', 200, 300);
    const near = makeEnemy('near', 200, 380); // out of the burst, in the throw
    const far = makeEnemy('far', 200, 600);
    const { combat, eventBus } = seeker([target, near, far]);
    eventBus.emit('synergy-unlocked', { family: 'thermal' });
    eventBus.emit('apex-unlocked', { family: 'thermal' });
    const missile = missileOn(combat, target);

    combat.processBulletHit(missile, target, combat.cachedEnemies);
    step(combat, 1.05);
    expect(combat.weapons.thermite.map((p) => p.enemy)).toEqual([near]);
    expect(near.health).toBe(1000);
    step(combat, 0.8);
    expect(combat.weapons.thermite.every((p) => !p.flying)).toBe(true);
    expect(combat.burns.has(near)).toBe(true);
    expect(near.health).toBeLessThan(1000);
    expect(far.health).toBe(1000);
  });

  it('Storm Warhead (Arc ×3): each burst throws one heavy bolt that leaps across the 3 nearest enemies outside it, one after another; at 5, five', () => {
    const target = makeEnemy('target', 200, 300);
    const hops = [
      makeEnemy('a', 260, 300),
      makeEnemy('b', 330, 300),
      makeEnemy('c', 400, 300),
      makeEnemy('d', 470, 300),
      makeEnemy('e', 540, 300),
    ];
    const { combat, eventBus } = seeker([target, ...hops]);
    eventBus.emit('synergy-unlocked', { family: 'arc' });
    const missile = missileOn(combat, target);
    const each = missile.damage * FORMS.arc.damageFraction[0];

    combat.processBulletHit(missile, target, combat.cachedEnemies);
    // no Chain Lance off the hit
    expect(combat.arcs).toHaveLength(0);
    combat.updateWeaponEffects(0.01);
    expect(combat.arcs).toHaveLength(1);
    expect(combat.arcs[0]).toMatchObject({ heavy: true, bolt: false });
    step(combat, 0.5);
    hops.slice(0, 3).forEach((e) => {
      expect(e.health).toBeCloseTo(1000 - each, 6);
    });
    hops.slice(3).forEach((e) => expect(e.health).toBe(1000));
    expect(target.health).toBeCloseTo(1000 - missile.damage, 6);

    eventBus.emit('apex-unlocked', { family: 'arc' });
    const apex = missileOn(combat, target);
    const strong = apex.damage * FORMS.arc.damageFraction[1];
    combat.processBulletHit(apex, target, combat.cachedEnemies);
    step(combat, 0.5);
    hops.forEach((e, i) => {
      const before = i < 3 ? 1000 - each : 1000;
      expect(e.health).toBeCloseTo(before - strong, 6);
    });
  });

  it('Gravity Warhead (Field ×3): after a burst a well pulls what lies within 70 px into its centre for 0.6 s; at 5 the salvo’s other missile homes on it', () => {
    const target = makeEnemy('target', 200, 300);
    const side = makeEnemy('side', 190, 365); // 55 px rim to the burst
    const outside = makeEnemy('outside', 190, 395);
    const { combat, eventBus } = seeker([target, side, outside]);
    eventBus.emit('synergy-unlocked', { family: 'field' });
    const missile = missileOn(combat, target);

    combat.processBulletHit(missile, target, combat.cachedEnemies);
    expect(combat.weapons.flakBursts).toHaveLength(1);
    expect(combat.weapons.gravityWells).toHaveLength(1);
    expect(combat.slows.size).toBe(0); // no Gravitic Lance
    step(combat, 0.3);
    expect(side.y).toBeLessThan(330);
    expect(outside.y).toBe(395);
    step(combat, 0.35);
    expect(combat.weapons.gravityWells).toHaveLength(0);
    const held = side.y;
    step(combat, 0.2);
    expect(side.y).toBe(held);

    eventBus.emit('apex-unlocked', { family: 'field' });
    const first = missileOn(combat, target);
    const other = combat.bullets[combat.bullets.length - 1];
    other.x = 150;
    other.y = 350;
    other.vx = 275;
    other.vy = 0;
    other.seeker.target = outside;
    other.seeker.id = outside.id;
    combat.processBulletHit(first, target, combat.cachedEnemies);
    combat.updateBullets(0.1);
    // it turns up toward the well (above), not down toward its target
    expect(other.vy).toBeLessThan(0);
  });
});
