import { describe, it, expect, vi } from 'vitest';
import AudioPool from '../../src/modules/AudioPool.js';

const makeParam = (value) => ({ value, cancelScheduledValues: vi.fn() });

const makeContext = () => ({
  currentTime: 0,
  createGain: () => ({ gain: makeParam(1), disconnect: vi.fn() }),
  createBiquadFilter: () => ({
    type: 'lowpass',
    frequency: makeParam(350),
    Q: makeParam(1),
    gain: makeParam(0),
    detune: makeParam(0),
    disconnect: vi.fn(),
  }),
});

describe('AudioPool reuse', () => {
  it('hands a reused gain back with its scheduled values cancelled and value 1', () => {
    const pool = new AudioPool(makeContext());
    const gain = pool.getGain();
    gain.gain.value = 0.2;
    pool.returnGain(gain);

    const again = pool.getGain();

    expect(again).toBe(gain);
    expect(again.gain.cancelScheduledValues).toHaveBeenCalledWith(0);
    expect(again.gain.value).toBe(1);
  });

  it('hands a reused filter back cancelled and with Web Audio defaults', () => {
    const pool = new AudioPool(makeContext());
    const filter = pool.getBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5000;
    filter.Q.value = 12;
    filter.gain.value = 9;
    filter.detune.value = 100;
    pool.returnBiquadFilter(filter);

    const again = pool.getBiquadFilter();

    expect(again).toBe(filter);
    for (const name of ['frequency', 'Q', 'gain', 'detune']) {
      expect(again[name].cancelScheduledValues).toHaveBeenCalledWith(0);
    }
    expect(again.type).toBe('lowpass');
    expect(again.frequency.value).toBe(350);
    expect(again.Q.value).toBe(1);
    expect(again.gain.value).toBe(0);
    expect(again.detune.value).toBe(0);
  });
});
