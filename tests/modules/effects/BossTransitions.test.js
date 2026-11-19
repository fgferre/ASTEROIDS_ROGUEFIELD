import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../src/core/EventBus.js';
import { GamePools } from '../../../src/core/GamePools.js';
import RandomService from '../../../src/core/RandomService.js';
import EffectsSystem from '../../../src/modules/EffectsSystem.js';

const ARRIVAL = {
  travel: 1.1,
  close: 0.25,
  world: 0.25,
  recover: 0.5,
};

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
  eventBus.emit('boss-spawned', {
    enemy: warden,
    position: { ...warden },
    arrival: ARRIVAL,
  });
  const step = 1 / 120;
  for (let t = 0; t < seconds; t += step) effects.update(step);
  return effects.update(step) / step;
}

describe('BossTransitions Warden arrival', () => {
  // The entrance's particles come from the pools.
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });

  it('slows the world to its recipe speed until it closes up, then recovers, with Reduced Motion too', () => {
    const { travel, close, world, recover } = ARRIVAL;
    expect(speedAfterSpawn(travel + close - 0.1, false)).toBeCloseTo(world, 6);
    expect(speedAfterSpawn(travel + close - 0.1, true)).toBeCloseTo(world, 6);
    expect(speedAfterSpawn(travel + close + recover + 0.05, false)).toBe(1);
  });
});

describe('BossTransitions defeat bursts', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });

  function defeatedEffects() {
    const eventBus = new EventBus();
    const effects = new EffectsSystem({
      eventBus,
      random: new RandomService('boss-defeat'),
      audio: {},
      settings: { getCategoryValues: vi.fn(() => null) },
    });
    eventBus.emit('boss-defeated', { position: { x: 400, y: 300 }, wave: 5 });
    return effects;
  }

  it("fires its bursts 0.02 s apart in frame time, through the defeat's freeze, and not at all after a reset", () => {
    const effects = defeatedEffects();
    const { particles } = effects.particleEffects;
    // The debris is there at once; the bursts are not.
    const debris = new Set(particles);
    const bursts = () => particles.filter((p) => !debris.has(p)).length;
    effects.update(0.05);
    // Due at 0, 0.02 and 0.04 s, though the freeze frame holds effect time.
    expect(bursts()).toBe(3);
    effects.update(0);
    expect(bursts()).toBe(3);

    effects.reset();
    effects.update(2);
    expect(effects.particleEffects.particles).toHaveLength(0);
  });
});
