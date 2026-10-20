import { describe, expect, it, vi } from 'vitest';

import { getContent } from '../../../src/content/registry.js';
import { recipeEnemyClass } from '../../../src/modules/enemies/types/RecipeEnemy.js';

const recipe = getContent('enemies', 'anvil');
const Anvil = recipeEnemyClass(recipe);
const ARMOR = recipe.behaviors['rear-weak-point'];
const { turn: TURN } = recipe.behaviors['turn-toward'];

describe('Anvil', () => {
  it('shrugs off shots on its prow and flanks and takes them in full on its core', () => {
    const eventBus = { emit: vi.fn() };
    const player = { position: { x: 600, y: 300 } };
    const anvil = new Anvil(
      { eventBus, getCachedPlayer: () => player },
      { id: 'anvil-1', x: 300, y: 300 }
    );
    expect(anvil.rotation).toBe(0); // it spawns facing the ship (+x)
    const hull = anvil.health;

    anvil.takeDamage(100, { hitPosition: { x: 330, y: 300 } }); // prow
    expect(anvil.health).toBeCloseTo(hull - 100 * ARMOR.front, 6);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'shield-deflected',
      expect.any(Object)
    );
    anvil.takeDamage(100, { hitPosition: { x: 300, y: 330 } }); // flank
    expect(anvil.health).toBeCloseTo(hull - 200 * ARMOR.front, 6);

    anvil.takeDamage(10, { hitPosition: { x: 270, y: 305 } }); // core
    expect(anvil.health).toBeCloseTo(
      hull - 200 * ARMOR.front - 10 * ARMOR.rear,
      6
    );
  });

  it('comes about toward the ship slowly, driving along its nose', () => {
    const player = { position: { x: 300, y: 600 } }; // straight below
    const anvil = new Anvil(
      {
        eventBus: { emit: vi.fn() },
        getCachedPlayer: () => ({ position: { x: 600, y: 300 } }),
      },
      { id: 'anvil-2', x: 300, y: 300 }
    );
    anvil.system.getCachedPlayer = () => player;
    anvil.onUpdate(1);
    expect(anvil.rotation).toBeCloseTo(TURN, 6); // not the quarter turn
    const speed = recipe.components.movement.maxSpeed;
    expect(anvil.vx).toBeCloseTo(Math.cos(TURN) * speed, 6);
    expect(anvil.vy).toBeCloseTo(Math.sin(TURN) * speed, 6);
  });
});
