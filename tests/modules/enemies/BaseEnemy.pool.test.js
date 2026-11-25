import { describe, expect, it, vi } from 'vitest';
import { getContent } from '../../../src/content/registry.js';
import { GamePools } from '../../../src/core/GamePools.js';
import { BaseEnemy } from '../../../src/modules/enemies/base/BaseEnemy.js';
import { EnemyFactory } from '../../../src/modules/enemies/base/EnemyFactory.js';
import { MovementComponent } from '../../../src/modules/enemies/components/MovementComponent.js';
import { recipeEnemyClass } from '../../../src/modules/enemies/types/RecipeEnemy.js';

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

  it('arms a mine taken from the pool again in the same time as a new one', () => {
    const content = getContent('enemies', 'mine');
    const Mine = recipeEnemyClass(content);
    const factory = new EnemyFactory({ eventBus: { emit() {} } });
    factory.registerType('mine', {
      class: Mine,
      defaults: { ...content.config, components: content.components },
      pool: GamePools.createEnemyPool(Mine, { initial: 0, max: 1 }),
    });
    // Its weapon's steps, the ship parked inside its proximity radius, until
    // it calls for the blast.
    const stepsToGoOff = (mine) => {
      vi.spyOn(mine, 'triggerDetonation').mockImplementation(() => {});
      const weapon = mine.getComponent('weapon');
      const player = { position: { x: mine.x + 40, y: mine.y } };
      let steps = 0;
      while (!mine.weaponState.detonated && steps < 120) {
        weapon.update({ enemy: mine, deltaTime: 1 / 60, player });
        steps += 1;
      }
      return steps;
    };

    const first = factory.create('mine', { x: 100, y: 100 });
    const fresh = stepsToGoOff(first);
    expect(fresh).toBeGreaterThan(1);
    factory.release(first);

    const again = factory.create('mine', { x: 100, y: 100 });
    expect(again).toBe(first);
    expect(stepsToGoOff(again)).toBe(fresh);
  });
});
