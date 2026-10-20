import { describe, expect, it, vi } from 'vitest';

import { getContent } from '../../../src/content/registry.js';
import { recipeEnemyClass } from '../../../src/modules/enemies/types/RecipeEnemy.js';

const recipe = getContent('enemies', 'surveyor');
const Surveyor = recipeEnemyClass(recipe);
const AIM = recipe.behaviors['aim-line'];

describe('Surveyor', () => {
  it('draws a line at the ship, follows it, holds it still, then fires one shot down it', () => {
    const player = { position: { x: 500, y: 100 } };
    const eventBus = { emit: vi.fn() };
    const surveyor = new Surveyor(
      { eventBus, getCachedPlayer: () => player },
      { id: 'surveyor-1', x: 100, y: 100 }
    );
    const emitted = (name) =>
      eventBus.emit.mock.calls.filter(([event]) => event === name);

    surveyor.onUpdate(AIM.interval - 0.1);
    expect(surveyor.telegraph).toBeNull();
    surveyor.onUpdate(0.11);
    expect(surveyor.telegraph).toMatchObject({
      type: 'aim',
      angle: 0,
      length: AIM.length,
      locked: false,
    });
    expect(emitted('enemy-telegraph')).toHaveLength(1);
    expect(surveyor.vx).toBe(0); // it stands to aim
    expect(surveyor.vy).toBe(0);

    // the line follows the ship...
    player.position = { x: 100, y: 500 };
    surveyor.onUpdate(0.1);
    expect(surveyor.telegraph.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(surveyor.telegraphRatio).toBeGreaterThan(0);

    // ...until its last `lock` s, when it holds still
    surveyor.onUpdate(AIM.aim - AIM.lock - 0.05);
    expect(surveyor.telegraph.locked).toBe(true);
    player.position = { x: 500, y: 100 };
    surveyor.onUpdate(0.01);
    expect(surveyor.telegraph.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(emitted('enemy-fired')).toHaveLength(0);

    surveyor.onUpdate(AIM.lock);
    const shots = emitted('enemy-fired');
    expect(shots).toHaveLength(1);
    expect(shots[0][1]).toMatchObject({
      damage: AIM.damage,
      projectile: { speed: AIM.speed, lifetime: AIM.lifetime },
    });
    expect(shots[0][1].velocity.x).toBeCloseTo(0, 6);
    expect(shots[0][1].velocity.y).toBeCloseTo(AIM.speed, 6);
    expect(surveyor.telegraph).toBeNull();
  });
});
