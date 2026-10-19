import { describe, expect, it } from 'vitest';

import { EventBus } from '../../../src/core/EventBus.js';
import { EnemySpawnSystem } from '../../../src/modules/enemies/systems/EnemySpawnSystem.js';

// Just the facade a factory acquire touches; the factory echoes its config.
function spawnSystem(eventBus) {
  return new EnemySpawnSystem({
    facade: {
      eventBus,
      asteroids: [],
      factory: {
        hasType: () => true,
        create: (type, config) => ({ type, ...config }),
      },
      isBossEnemy: () => false,
      invalidateActiveEnemyCache() {},
      registerEnemyWithPhysics() {},
    },
  });
}

describe("EnemySpawnSystem 'machine-spawned'", () => {
  it('announces a support machine as it arrives, not rocks, Wardens or Heralds', () => {
    const eventBus = new EventBus();
    const seen = [];
    eventBus.on('machine-spawned', ({ type, position }) =>
      seen.push({ type, position })
    );
    const spawns = spawnSystem(eventBus);

    spawns.acquireEnemyViaFactory('caster', { x: 40, y: 60 });
    spawns.acquireEnemyViaFactory('asteroid', { x: 1, y: 1 });
    spawns.acquireEnemyViaFactory('boss', { x: 1, y: 1 });
    spawns.acquireEnemyViaFactory('herald', { x: 1, y: 1 });

    expect(seen).toEqual([{ type: 'caster', position: { x: 40, y: 60 } }]);
  });
});
