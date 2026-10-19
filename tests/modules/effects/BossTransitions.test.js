import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WARDEN_ARRIVAL } from '../../../src/core/cinematics.js';
import { EventBus } from '../../../src/core/EventBus.js';
import { GamePools } from '../../../src/core/GamePools.js';
import RandomService from '../../../src/core/RandomService.js';
import EffectsSystem from '../../../src/modules/EffectsSystem.js';

// World speed (simulated / real time) `seconds` after a Warden spawns.
function speedAfterSpawn(seconds, reducedMotion) {
  const eventBus = new EventBus();
  const effects = new EffectsSystem({
    eventBus,
    random: new RandomService('warden-arrival'),
    audio: {},
    settings: { getCategoryValues: vi.fn(() => null) },
  });
  effects.applyAccessibilityPreferences({ reducedMotion });
  const warden = { id: 'warden', x: 400, y: 84 };
  eventBus.emit('boss-spawned', { enemy: warden, position: { ...warden } });
  const step = 1 / 120;
  for (let t = 0; t < seconds; t += step) effects.update(step);
  return effects.update(step) / step;
}

describe('BossTransitions Warden arrival', () => {
  // The entrance's particles come from the pools.
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });

  it('slows the world while the camera is away; under Reduced Motion only the short entrance slow-down', () => {
    const { scale, hold, duration } = WARDEN_ARRIVAL.slowMotion;
    expect(speedAfterSpawn(hold - 0.1, false)).toBeCloseTo(scale, 6);
    expect(speedAfterSpawn(hold - 0.1, true)).toBe(1);
    expect(speedAfterSpawn(hold + duration + 0.05, false)).toBe(1);
  });
});
