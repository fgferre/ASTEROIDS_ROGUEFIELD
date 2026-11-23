// The Scatter Coil fan's own family forms (combat/fanForms.js, approved
// 23/11): what each does to a fight, with 3 cards and, where it differs, 5.
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
import { WEAPONS } from '../../src/data/weapons.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

const DAMAGE = 10;

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

// The ship at (100, 300) facing +x with the Scatter Coil, among `list`.
function scatter(list) {
  const eventBus = createEventBusMock();
  const player = {
    isDead: false,
    getPosition: () => ({ x: 100, y: 300 }),
    getVelocity: () => ({ x: 0, y: 0 }),
    getShieldRadius: () => 16,
    getTurretAngle: () => 0,
    getMuzzlePoint: () => ({ x: 116, y: 300 }),
    getStats: () => ({ multishot: 1, damage: DAMAGE }),
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
  eventBus.emit('upgrade-weapon', { weaponId: 'scatter' });
  return { combat, eventBus };
}

describe('Scatter Coil family forms', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });

  // The centre bolt of a fresh volley, put at (190, 300) flying along +x.
  const centreBolt = (combat) => {
    combat.handleShooting(1, { multishot: 1, damage: DAMAGE });
    const bolt = combat.bullets[combat.bullets.length - 3];
    bolt.x = 190;
    bolt.y = 300;
    return bolt;
  };
  const FORMS = WEAPONS.scatter.familyForms;

  it('Grapeshot (Kinetic ×3): a bolt that hits bursts, then glances off into the next enemy ahead at half strength and bursts there; Hailstorm glances twice', () => {
    const first = makeEnemy('first', 200, 300);
    const ahead = makeEnemy('ahead', 320, 330);
    const behind = makeEnemy('behind', 110, 330);
    const beyond = makeEnemy('beyond', 450, 340);
    const { combat, eventBus } = scatter([first, ahead, behind, beyond]);
    const glanced = vi.fn();
    eventBus.on('flak-glanced', glanced);
    eventBus.emit('synergy-unlocked', { family: 'kinetic' });
    expect(combat.weapons.getWeaponState().evolutions[0].name).toBe(
      'Grapeshot'
    );
    const bolt = centreBolt(combat);
    const full = bolt.damage;

    combat.processBulletHit(bolt, first, combat.cachedEnemies);
    expect(bolt.hit).toBe(false);
    expect(glanced).toHaveBeenCalledTimes(1);
    expect(Math.atan2(bolt.vy, bolt.vx)).toBeCloseTo(
      Math.atan2(330 - 300, 320 - 190),
      6
    );
    expect(bolt.damage).toBeCloseTo(full * 0.5, 9);
    combat.processBulletHit(bolt, ahead, combat.cachedEnemies);
    expect(bolt.hit).toBe(true); // Grapeshot glances once
    expect(combat.flakBursts).toHaveLength(2);
    expect(ahead.health).toBeCloseTo(100 - full * 0.5, 6);
    expect(behind.health).toBe(100);

    eventBus.emit('apex-unlocked', { family: 'kinetic' });
    const hail = centreBolt(combat);
    combat.processBulletHit(hail, first, combat.cachedEnemies);
    hail.x = 310; // at `ahead`'s rim
    hail.y = 327;
    combat.processBulletHit(hail, ahead, combat.cachedEnemies);
    expect(hail.hit).toBe(false); // on to `beyond`
    expect(glanced).toHaveBeenCalledTimes(3);
  });

  it('Kindling (Thermal ×3): a rock struck 3 times by one volley burns from inside; a machine catches only with 5 cards, and passes it to its neighbour', () => {
    const rock = makeEnemy('rock', 200, 300, {
      type: 'asteroid',
      variant: 'common',
      health: 1000,
    });
    const drone = makeEnemy('drone', 200, 420, { health: 1000 });
    const neighbour = makeEnemy('neighbour', 200, 500, { health: 1000 });
    const { combat, eventBus } = scatter([rock, drone, neighbour]);
    eventBus.emit('synergy-unlocked', { family: 'thermal' });
    combat.handleShooting(1, { multishot: 1, damage: DAMAGE });
    const [a, b, c, d, e] = combat.bullets;
    const hit = (bolt, enemy) =>
      combat.processBulletHit(bolt, enemy, combat.cachedEnemies);

    hit(a, rock);
    hit(b, rock);
    expect(combat.burns.has(rock)).toBe(false);
    hit(c, rock);
    expect(combat.burns.has(rock)).toBe(true);
    expect(rock.look).toBe('kindled');
    // it dies (its own burn, a bolt): its pieces fly off burning
    const piece = makeEnemy('piece', 205, 300, {
      type: 'asteroid',
      variant: 'common',
      look: 'kindled',
    });
    rock.destroyed = true;
    eventBus.emit('enemy-destroyed', { enemy: rock, fragments: [piece] });
    expect(combat.burns.has(piece)).toBe(true);
    expect(combat.weapons.flung).toEqual([
      expect.objectContaining({ enemy: piece, fire: true }),
    ]);
    expect(combat.weapons.kindled.some((k) => k.enemy === rock)).toBe(false);
    [d, e].forEach((bolt) => hit(bolt, drone));
    combat.handleShooting(1, { multishot: 1, damage: DAMAGE });
    combat.bullets.slice(-3).forEach((bolt) => hit(bolt, drone));
    expect(combat.burns.has(drone)).toBe(false);

    eventBus.emit('apex-unlocked', { family: 'thermal' });
    combat.handleShooting(1, { multishot: 1, damage: DAMAGE });
    combat.bullets.slice(-3).forEach((bolt) => hit(bolt, drone));
    expect(combat.burns.has(drone)).toBe(true);
    expect(combat.burns.has(neighbour)).toBe(true);
    expect(drone.look).toBeUndefined();
  });

  it('Discharge (Arc ×3): a burst arcs to the 2 nearest enemies outside it, each struck once a volley, without shoving them', () => {
    const target = makeEnemy('target', 200, 300);
    const near = makeEnemy('near', 190, 370);
    const next = makeEnemy('next', 280, 300);
    const later = makeEnemy('later', 190, 430);
    const far = makeEnemy('far', 400, 300);
    const { combat, eventBus } = scatter([target, near, next, later, far]);
    eventBus.emit('synergy-unlocked', { family: 'arc' });
    const bolt = centreBolt(combat);
    const bolt2 = combat.bullets[combat.bullets.length - 4];
    bolt2.x = 190;
    bolt2.y = 300;

    combat.processBulletHit(bolt, target, combat.cachedEnemies);
    const each = bolt.shrapnel * FORMS.arc.damageFraction[0];
    expect(combat.arcs).toHaveLength(2);
    expect(near.health).toBeCloseTo(100 - each, 6);
    expect(next.health).toBeCloseTo(100 - each, 6);
    expect(near.vx).toBe(0);
    expect(later.health).toBe(100);
    // the volley's next burst passes them over for the next nearest
    combat.processBulletHit(bolt2, target, combat.cachedEnemies);
    expect(later.health).toBeCloseTo(100 - each, 6);
    expect(near.health).toBeCloseTo(100 - each, 6);
    expect(far.health).toBe(100); // out of range
  });

  it('Implosion (Field ×3): a burst first drags what lies within 60 px into its centre, then bursts on the clump 0.3 s later', () => {
    const target = makeEnemy('target', 200, 300, { health: 1000 });
    const side = makeEnemy('side', 190, 365);
    const outside = makeEnemy('outside', 190, 385);
    const { combat, eventBus } = scatter([target, side, outside]);
    eventBus.emit('synergy-unlocked', { family: 'field' });
    const bolt = centreBolt(combat);

    combat.processBulletHit(bolt, target, combat.cachedEnemies);
    expect(combat.flakBursts).toHaveLength(0);
    expect(side.health).toBe(100);
    combat.updateWeaponEffects(0.1);
    combat.updateWeaponEffects(0.1);
    expect(side.y).toBeLessThan(330);
    expect(combat.flakBursts).toHaveLength(0);
    combat.updateWeaponEffects(0.1);
    expect(combat.flakBursts).toHaveLength(1);
    expect(side.health).toBeCloseTo(100 - bolt.shrapnel, 6);
    expect(outside.y).toBe(385);
    expect(outside.health).toBe(100);
  });

  it('Scrap Rounds (Salvage ×3): a flak kill throws a shard that fires itself 0.15 s later at the nearest enemy; a shard kill throws none', () => {
    const victim = makeEnemy('victim', 200, 300, { health: 1 });
    const target = makeEnemy('target', 320, 380, { health: 1 });
    const { combat, eventBus } = scatter([victim, target]);
    eventBus.emit('synergy-unlocked', { family: 'salvage' });
    const bolt = centreBolt(combat);

    combat.processBulletHit(bolt, victim, combat.cachedEnemies);
    const shards = () => combat.bullets.filter((b) => b.volley.scrap);
    expect(shards()).toHaveLength(0);
    combat.updateWeaponEffects(FORMS.salvage.delay - 0.01);
    expect(shards()).toHaveLength(0);
    combat.updateWeaponEffects(0.02);
    const [shard] = shards();
    expect(shard).toBeDefined();
    expect(shard.vx).toBeGreaterThan(0);
    expect(shard.vy).toBeGreaterThan(0);
    combat.processBulletHit(shard, target, combat.cachedEnemies);
    expect(target.destroyed).toBe(true);
    combat.updateWeaponEffects(1);
    expect(shards()).toHaveLength(1);
  });
});
