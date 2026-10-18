import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CombatSystem, {
  knockbackSpeed,
} from '../../src/modules/CombatSystem.js';
import {
  KNOCKBACK_BASE,
  KNOCKBACK_HEAVY_FACTOR,
  KNOCKBACK_MAX,
  KNOCKBACK_MIN,
} from '../../src/data/constants/gameplay.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

function makeCombat() {
  const player = {
    isDead: false,
    getPosition: () => ({ x: 100, y: 300 }),
    getAngle: () => 0,
    getStats: () => ({ multishot: 1, damage: 20 }),
  };
  const enemies = {
    forEachActiveEnemy() {},
    applyDamage(enemy, damage) {
      enemy.health = Math.max(0, enemy.health - damage);
      return { killed: enemy.health <= 0, remainingHealth: enemy.health };
    },
  };
  const physics = { forEachBulletCollision: () => {} };
  const combat = new CombatSystem({
    eventBus: createEventBusMock(),
    player,
    enemies,
    physics,
  });
  return { combat, enemies };
}

const enemy = (type, health = 1000) => ({
  id: type,
  type,
  x: 200,
  y: 300,
  vx: 0,
  vy: 0,
  radius: 10,
  health,
});

const hit = (damage) => ({
  kind: 'lance',
  x: 190,
  y: 300,
  vx: 0,
  vy: 500,
  damage,
  hit: false,
});

describe('CombatSystem knockback', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it('scales with damage between the floor and the cap', () => {
    expect(knockbackSpeed(20)).toBe(KNOCKBACK_BASE);
    expect(knockbackSpeed(40)).toBe(KNOCKBACK_BASE * 2);
    expect(knockbackSpeed(1)).toBe(KNOCKBACK_MIN);
    expect(knockbackSpeed(500)).toBe(KNOCKBACK_MAX);
  });

  it('pushes a hit enemy along the bullet, bosses and heralds far less', () => {
    const { combat, enemies } = makeCombat();
    const drone = enemy('drone');
    drone.velocity = { vx: 0, vy: 0 };
    combat.processBulletHit(hit(40), drone, enemies);
    expect(drone.vx).toBeCloseTo(0, 6);
    expect(drone.vy).toBeCloseTo(KNOCKBACK_BASE * 2, 6);
    expect(drone.velocity.vy).toBeCloseTo(KNOCKBACK_BASE * 2, 6);

    ['boss', 'herald'].forEach((type) => {
      const heavy = enemy(type);
      combat.processBulletHit(hit(40), heavy, enemies);
      expect(heavy.vy).toBeCloseTo(
        KNOCKBACK_BASE * 2 * KNOCKBACK_HEAVY_FACTOR,
        6
      );
    });
  });

  it('leaves asteroids, kills and directionless hits alone', () => {
    const { combat, enemies } = makeCombat();
    const rock = enemy('asteroid');
    combat.processBulletHit(hit(40), rock, enemies);
    const dying = enemy('drone', 10);
    combat.processBulletHit(hit(40), dying, enemies);
    const arc = enemy('drone');
    combat.processBulletHit({ ...hit(40), kind: 'chain', vy: 0 }, arc, enemies);
    [rock, dying, arc].forEach((target) => expect(target.vy).toBe(0));
  });
});
