import { describe, expect, it, vi } from 'vitest';
import RandomService from '../../src/core/RandomService.js';
import EffectsSystem from '../../src/modules/EffectsSystem.js';

const createEffects = () =>
  new EffectsSystem({
    random: new RandomService('hit-stop-test'),
    audio: {},
    settings: { getCategoryValues: vi.fn(() => null) },
  });

describe('EffectsSystem hit-stop', () => {
  it('slows the world on a kill and triggers once per cooldown window', () => {
    const effects = createEffects();
    const step = 1 / 120;

    effects.addHitStop('small');
    expect(effects.update(step)).toBeLessThan(step * 0.5);

    // Kills landing inside the cooldown must not extend the stop.
    effects.addHitStop('small');
    effects.addHitStop('small');
    for (let i = 0; i < 6; i += 1) effects.update(step);
    expect(effects.update(step)).toBeCloseTo(step, 10);

    // After the cooldown, the next kill stops the world again.
    for (let i = 0; i < 6; i += 1) effects.update(step);
    effects.addHitStop('small');
    expect(effects.update(step)).toBeLessThan(step * 0.5);
  });
});
