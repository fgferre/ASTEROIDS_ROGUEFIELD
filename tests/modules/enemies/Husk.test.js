import { describe, expect, it, vi } from 'vitest';

import Husk from '../../../src/modules/enemies/types/Husk.js';
import { HUSK_SPLIT_COUNT } from '../../../src/data/enemies/husk.js';

describe('Husk', () => {
  it('splits into three Motes moving outward when it dies', () => {
    const acquireEnemyViaFactory = vi.fn((type, config) => ({
      type,
      ...config,
    }));
    const registerDynamicMinion = vi.fn();
    const system = {
      eventBus: { emit: vi.fn() },
      acquireEnemyViaFactory,
      waveManager: { registerDynamicMinion },
    };
    const husk = new Husk(system, { id: 'husk-1', x: 200, y: 150, wave: 7 });

    husk.takeDamage(husk.maxHealth);

    expect(HUSK_SPLIT_COUNT).toBe(3);
    expect(acquireEnemyViaFactory).toHaveBeenCalledTimes(3);
    for (const [type, config] of acquireEnemyViaFactory.mock.calls) {
      expect(type).toBe('drone');
      expect(config.wave).toBe(7);
      expect(config.spawnedBy).toBe('husk-1');
      // velocity points away from the Husk
      const outward =
        (config.x - 200) * config.vx + (config.y - 150) * config.vy;
      expect(outward).toBeGreaterThan(0);
    }
    expect(registerDynamicMinion).toHaveBeenCalledTimes(3);
  });
});
