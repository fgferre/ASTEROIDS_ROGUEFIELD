import { describe, expect, it, vi } from 'vitest';

import { getContent } from '../../../src/content/registry.js';
import { recipeEnemyClass } from '../../../src/modules/enemies/types/RecipeEnemy.js';
import RandomService from '../../../src/core/RandomService.js';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

const recipe = getContent('enemies', 'twain');
const Twain = recipeEnemyClass(recipe);
const SPLIT = recipe.behaviors.split;
const { maxSpeed } = recipe.components.movement;

// A factory that builds Twains from their spawn config with their recipe's
// stats, as the real one does.
function systemOf() {
  const spawned = [];
  return {
    spawned,
    eventBus: { emit: vi.fn() },
    waveManager: { registerDynamicMinion: vi.fn() },
    acquireEnemyViaFactory: vi.fn((type, config) => {
      const child = new Twain(null, config);
      child.collisionRadius = recipe.config.radius;
      child.movementConfig = { ...recipe.components.movement };
      spawned.push(child);
      return child;
    }),
  };
}

describe('Twain', () => {
  it('splits in two smaller, faster Twains flying apart, and those split once more', () => {
    const system = systemOf();
    const twain = new Twain(system, {
      id: 'twain-1',
      x: 300,
      y: 200,
      wave: 11,
      random: new RandomService(4),
    });
    twain.takeDamage(twain.maxHealth);

    const halves = [...system.spawned];
    expect(halves).toHaveLength(SPLIT.count);
    for (const half of halves) {
      expect(half.type).toBe('twain');
      expect(half.generation).toBe(1);
      expect(half.radius).toBeCloseTo(recipe.config.radius * SPLIT.scale, 6);
      expect(half.collisionRadius).toBeCloseTo(half.radius, 6);
      expect(half.maxHealth).toBeCloseTo(recipe.config.health * SPLIT.scale, 6);
      expect(half.health).toBe(half.maxHealth);
      expect(half.movementConfig.maxSpeed).toBeCloseTo(
        maxSpeed * SPLIT.haste,
        6
      );
      const outward = (half.x - 300) * half.vx + (half.y - 200) * half.vy;
      expect(outward).toBeGreaterThan(0);
    }

    halves[0].system = system;
    halves[0].takeDamage(halves[0].maxHealth);
    const quarters = system.spawned.slice(halves.length);
    expect(quarters).toHaveLength(SPLIT.count);
    expect(quarters[0].generation).toBe(2);
    expect(quarters[0].radius).toBeCloseTo(
      recipe.config.radius * SPLIT.scale ** 2,
      6
    );

    quarters[0].system = system;
    quarters[0].takeDamage(quarters[0].maxHealth);
    expect(system.spawned).toHaveLength(halves.length + quarters.length); // the last
  });

  it('a Retry keeps how many times a Twain has split: the last split does not split again', () => {
    const restoreDom = installDomStubs();
    try {
      const game = createHeadlessGame();
      game.session.startNewRun({ source: 'test' });
      const { enemies } = game.services;
      const twains = () =>
        enemies.asteroids.filter(
          (enemy) => enemy.type === 'twain' && !enemy.destroyed
        );
      enemies.acquireEnemyViaFactory('twain', {
        x: 300,
        y: 200,
        wave: 11,
        generation: SPLIT.generations,
      });

      enemies.importState(enemies.exportState());
      const [restored] = twains();
      expect(restored.generation).toBe(SPLIT.generations);
      restored.takeDamage(restored.maxHealth);
      expect(twains()).toHaveLength(0);
    } finally {
      GamePools.releaseAll();
      restoreDom();
    }
  });
});
