import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import RandomService from '../../src/core/RandomService.js';
import EffectsSystem from '../../src/modules/EffectsSystem.js';

describe('EffectsSystem mine blast', () => {
  it('plays the blast of a mine the pool brought back, not only its first', () => {
    const eventBus = new EventBus();
    const effects = new EffectsSystem({
      eventBus,
      random: new RandomService('mine-blast-test'),
      audio: {},
      settings: { getCategoryValues: vi.fn(() => null) },
    });
    const hitStops = vi.spyOn(effects.gameTime, 'addHitStop');
    const mine = { type: 'mine', x: 100, y: 100 };
    const blast = { enemy: mine, radius: 110 };

    eventBus.emit('machine-spawned', { enemy: mine, type: 'mine' });
    eventBus.emit('mine-exploded', blast);
    eventBus.emit('mine-exploded', blast); // the same death, heard twice
    expect(hitStops).toHaveBeenCalledTimes(1);

    // The same object, out of the pool for a second life.
    eventBus.emit('machine-spawned', { enemy: mine, type: 'mine' });
    eventBus.emit('mine-exploded', blast);
    expect(hitStops).toHaveBeenCalledTimes(2);
    expect(hitStops).toHaveBeenLastCalledWith('blast');
  });
});
