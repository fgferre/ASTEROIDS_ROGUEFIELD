import { describe, expect, it } from 'vitest';
import AudioSystem from '../../src/modules/AudioSystem.js';
import AudioBatcher from '../../src/modules/AudioBatcher.js';
import { createGainStub, createBufferSourceStub } from '../__helpers__/stubs.js';
import { createTestContainer } from '../__helpers__/setup.js';

describe('AudioSystem RNG determinism', () => {
  function createAudioHarness(seed) {
    const container = createTestContainer(seed);
    const random = container.resolve('random');

    const audioSystem = new AudioSystem({
      random,
      settings: { get: () => null, set: () => {} },
    });

    const frequencyLog = [];
    const createOscillatorStub = () => ({
      connect: () => {},
      start: () => {},
      stop: () => {},
      frequency: {
        setValueAtTime: (value) => {
          frequencyLog.push(Number(value.toFixed(6)));
        },
        exponentialRampToValueAtTime: () => {},
      },
    });

    audioSystem.context = {
      state: 'running',
      currentTime: 0,
      sampleRate: 44100,
    };
    audioSystem.initialized = true;
    audioSystem.masterGain = createGainStub();
    audioSystem.effectsGain = createGainStub();
    audioSystem.pool = {
      getOscillator: () => createOscillatorStub(),
      getGain: () => createGainStub(),
      getBufferSource: () => createBufferSourceStub(),
      returnGain: () => {},
    };

    audioSystem.batcher = new AudioBatcher(audioSystem, 0, {
      random: audioSystem.randomScopes?.batcher || random,
    });
    audioSystem.captureRandomScopes({ refreshForks: true });

    async function captureAsteroidFrequencies(iterations) {
      frequencyLog.length = 0;
      if (audioSystem.batcher?.activeSounds?.clear) {
        audioSystem.batcher.activeSounds.clear();
      }
      for (let index = 0; index < iterations; index += 1) {
        audioSystem.playAsteroidBreak('medium');
      }
      await Promise.resolve();
      await Promise.resolve();
      return [...frequencyLog];
    }

    return { audioSystem, random, captureAsteroidFrequencies };
  }

  it('restores identical batched asteroid frequencies after reseeding', async () => {
    const seed = 2024;
    const { audioSystem, random, captureAsteroidFrequencies } = createAudioHarness(seed);

    const firstFrequencies = await captureAsteroidFrequencies(3);
    expect(firstFrequencies.length).toBeGreaterThan(0);

    // Advance RNG state to ensure determinism is validated after reset
    await captureAsteroidFrequencies(2);

    random.reset(random.seed);
    audioSystem.reseedRandomScopes({ refreshForks: true });

    const secondFrequencies = await captureAsteroidFrequencies(3);
    expect(secondFrequencies).toStrictEqual(firstFrequencies);
  });
});
