import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CombatSystem from '../../src/modules/CombatSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

// Close Quarters: the stats the weapons are handed carry the bonus while an
// enemy is within the card's radius of the ship.
describe('Close Quarters in the combat stats', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  function makeCombat(multiplier) {
    const active = [];
    const player = {
      isDead: true,
      position: { x: 100, y: 300 },
      closeDamageMultiplier: multiplier,
      closeRadius: 150,
      getPosition: () => ({ x: 100, y: 300 }),
      getStats: () => ({ multishot: 1, damage: 20 }),
    };
    const enemies = {
      getActiveEnemies: () => active,
      forEachActiveEnemy() {},
    };
    const combat = new CombatSystem({
      eventBus: createEventBusMock(),
      player,
      enemies,
      physics: { forEachBulletCollision: () => {} },
    });
    const damage = () => {
      combat.update(1 / 60);
      return combat.lastKnownPlayerStats.damage;
    };
    return { active, damage };
  }

  it('x1.6 while an enemy is within 150 px, back to base when it is out', () => {
    const { active, damage } = makeCombat(1.6);
    expect(damage()).toBe(20);
    active.push({ x: 240, y: 300 });
    expect(damage()).toBeCloseTo(32, 6);
    active[0].x = 260;
    expect(damage()).toBe(20);
  });

  it('does nothing without the card', () => {
    const { active, damage } = makeCombat(1);
    active.push({ x: 120, y: 300 });
    expect(damage()).toBe(20);
  });
});
