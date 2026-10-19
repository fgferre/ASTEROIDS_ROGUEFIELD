import { describe, expect, it } from 'vitest';

import RandomService from '../../../src/core/RandomService.js';
import { Asteroid } from '../../../src/modules/enemies/types/Asteroid.js';
import { EnemySpawnSystem } from '../../../src/modules/enemies/systems/EnemySpawnSystem.js';

// Just the facade registerActiveEnemy touches.
function spawnSystem(layerModifier) {
  return new EnemySpawnSystem({
    facade: {
      asteroids: [],
      waveManager: { layerModifier },
      isBossEnemy: () => false,
      invalidateActiveEnemyCache() {},
      registerEnemyWithPhysics() {},
    },
  });
}

function rock(generation = 0) {
  const asteroid = new Asteroid();
  asteroid.initialize(null, {
    size: 'medium',
    variant: 'common',
    x: 100,
    y: 100,
    generation,
    random: new RandomService('glass-field'),
  });
  return asteroid;
}

describe('Glass Field (layer modifier)', () => {
  it('turns every new rock Volatile, leaving fragments to their own rules', () => {
    const glass = spawnSystem('glass-field');
    const fresh = rock();
    const fragment = rock(1);
    glass.registerActiveEnemy(fresh);
    glass.registerActiveEnemy(fragment);
    expect(fresh.variant).toBe('volatile');
    expect(fragment.variant).toBe('common');

    const plain = rock();
    spawnSystem('dense-fog').registerActiveEnemy(plain);
    expect(plain.variant).toBe('common');
  });
});
