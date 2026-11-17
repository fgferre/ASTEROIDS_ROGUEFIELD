import { describe, expect, it, vi } from 'vitest';
import { registerAudioEventCues } from '../../../src/modules/audio/eventDispatch.js';

describe('registerAudioEventCues', () => {
  it('pans the beam sound from the event position', () => {
    const listeners = new Map();
    const playHarmonicBeam = vi.fn();
    const audio = {
      listenerX: 400,
      sfxBus: { playHarmonicBeam },
      registerEventListener: (name, fn) => listeners.set(name, fn),
    };
    registerAudioEventCues(audio);

    listeners.get('weapon-beam-fired')({ position: { x: 100, y: 300 } });

    expect(playHarmonicBeam.mock.calls[0][0].pan).toBeLessThan(0);
  });
});
