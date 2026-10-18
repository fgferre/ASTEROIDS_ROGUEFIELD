import { describe, expect, it, vi } from 'vitest';
import RandomService from '../../../src/core/RandomService.js';
import { BaseEnemy } from '../../../src/modules/enemies/base/BaseEnemy.js';
import { MovementComponent } from '../../../src/modules/enemies/components/MovementComponent.js';

describe('BaseEnemy pool reuse', () => {
  it('steers a reused enemy from its new velocity, not the last life', () => {
    const enemy = new BaseEnemy({});
    const tracking = new MovementComponent({
      strategy: 'tracking',
      targetingRange: 300,
    });
    const step = (playerPosition) =>
      tracking.update({
        enemy,
        deltaTime: 0.5,
        playerPosition,
        random: () => 0.5,
      });

    enemy.initialize({ id: 'first-life', x: 400, y: 300 });
    step({ x: 600, y: 300 }); // chases the player to the right
    expect(enemy.vx).toBeGreaterThan(0);

    enemy.resetForPool();
    enemy.initialize({ id: 'second-life', x: 400, y: 300, vy: 40 });
    step({ x: 0, y: 0 }); // player out of range: it just drifts

    expect(enemy.vx).toBe(0);
    expect(enemy.vy).toBe(40);
  });

  it('starts a reused mine lifetime clock from zero', () => {
    const enemy = new BaseEnemy({});
    const proximity = new MovementComponent({
      strategy: 'proximity',
      lifetime: 30,
    });
    const random = new RandomService('pool-test');
    enemy.markForRemoval = vi.fn();

    enemy.initialize({ id: 'first-mine' });
    proximity.update({ enemy, deltaTime: 29, random });
    enemy.resetForPool();
    enemy.initialize({ id: 'second-mine' });
    proximity.update({ enemy, deltaTime: 2, random });

    expect(enemy.markForRemoval).not.toHaveBeenCalled();
  });
});
