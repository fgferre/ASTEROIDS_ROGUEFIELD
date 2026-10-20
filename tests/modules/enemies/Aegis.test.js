import { describe, expect, it, vi } from 'vitest';

import { getContent } from '../../../src/content/registry.js';
import { recipeEnemyClass } from '../../../src/modules/enemies/types/RecipeEnemy.js';

const recipe = getContent('enemies', 'aegis');
const Aegis = recipeEnemyClass(recipe);
const Mote = recipeEnemyClass(getContent('enemies', 'drone'));
const WARD = recipe.behaviors.ward;
const shot = (enemy) => ({ hitPosition: { x: enemy.x - 5, y: enemy.y } });

describe('Aegis', () => {
  it('wards the machines near it, never itself, until its ward breaks; then it comes back', () => {
    const enemies = [];
    const eventBus = { emit: vi.fn() };
    const system = {
      eventBus,
      getCachedPlayer: () => ({ position: { x: 700, y: 500 } }),
      forEachActiveEnemy: (fn) => enemies.forEach(fn),
    };
    const aegis = new Aegis(system, { id: 'aegis-1', x: 300, y: 300 });
    const near = new Mote(system, {
      id: 'near',
      x: 300 + WARD.radius - 10,
      y: 300,
    });
    const far = new Mote(system, {
      id: 'far',
      x: 300 + WARD.radius + 20,
      y: 300,
    });
    enemies.push(aegis, near, far, {
      type: 'asteroid',
      alive: true,
      x: 300,
      y: 310,
    });

    aegis.onUpdate(1 / 60);
    expect(aegis.wardLinks).toEqual([near]);
    expect(aegis.wardRatio).toBe(1);

    const hull = near.health;
    near.takeDamage(20, shot(near));
    expect(near.health).toBe(hull);
    expect(aegis.wardHealth).toBe(WARD.health - 20);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'shield-deflected',
      expect.any(Object)
    );

    // a blow with no shot behind it is not warded, nor is what is out of reach
    near.takeDamage(5);
    expect(near.health).toBe(hull - 5);
    far.takeDamage(10, shot(far));
    expect(far.health).toBe(far.maxHealth - 10);
    // nor the Aegis itself
    aegis.takeDamage(10, shot(aegis));
    expect(aegis.health).toBe(aegis.maxHealth - 10);

    // the ward breaks; the overflow reaches the hull
    near.takeDamage(WARD.health, shot(near));
    expect(aegis.wardHealth).toBe(0);
    expect(near.health).toBe(hull - 5 - 20);
    aegis.onUpdate(1 / 60);
    expect(aegis.wardLinks).toEqual([]);

    aegis.onUpdate(WARD.recharge);
    expect(aegis.wardHealth).toBe(WARD.health);
    expect(aegis.wardLinks).toEqual([near]);
  });
});
