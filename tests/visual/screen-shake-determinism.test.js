import { describe, expect, it } from 'vitest';
import EffectsSystem from '../../src/modules/EffectsSystem.js';
import { createTestContainer } from '../__helpers__/setup.js';

describe('EffectsSystem screen shake determinism', () => {
  function createEffectsHarness(seed) {
    const container = createTestContainer(seed);
    const random = container.resolve('random');
    const effects = new EffectsSystem({ random, audio: {} });

    return { effects, random };
  }

  it('restores the ScreenShake seed snapshot after reset', () => {
    const seed = 98765;
    const { effects, random } = createEffectsHarness(seed);

    const initialSnapshot = { ...effects.screenShakeSeedState };
    expect(initialSnapshot).toMatchObject({ x: expect.any(Number), y: expect.any(Number), angle: expect.any(Number) });

    // Mutate the internal RNG state
    effects.screenShake.reseed(effects.getRandomFork('screenShake'));
    const mutatedSnapshot = effects.screenShake.captureSeedState();
    expect(mutatedSnapshot).not.toStrictEqual(initialSnapshot);

    // Restore the stored seed state and reset all random forks
    effects.screenShakeSeedState = { ...initialSnapshot };
    random.reset(random.seed);
    effects.reset();

    const restoredSnapshot = effects.screenShake.captureSeedState();
    expect(restoredSnapshot).toStrictEqual(initialSnapshot);
  });
});
