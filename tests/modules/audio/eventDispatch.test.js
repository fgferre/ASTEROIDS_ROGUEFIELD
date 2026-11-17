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

  it('run-continued brings back the score the victory screen stopped', () => {
    const listeners = new Map();
    const sectorScore = {
      active: false,
      sectorId: 'prime-gate',
      start: vi.fn(),
    };
    const audio = {
      sectorScore,
      sfxBus: { playDeepFieldEntry: vi.fn() },
      registerEventListener: (name, fn) => listeners.set(name, fn),
    };
    registerAudioEventCues(audio);

    listeners.get('run-continued')({ fromLayer: 20 });

    expect(sectorScore.start).toHaveBeenCalledWith('prime-gate');
  });
});
