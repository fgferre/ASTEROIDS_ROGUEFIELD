import { describe, expect, it, vi } from 'vitest';
import RandomService from '../../src/core/RandomService.js';
import EffectsSystem from '../../src/modules/EffectsSystem.js';

const createEffects = (accessibility) =>
  new EffectsSystem({
    random: new RandomService('reduce-flashing-test'),
    audio: {},
    settings: {
      getCategoryValues: vi.fn((id) =>
        id === 'accessibility' ? accessibility : null
      ),
    },
  });

describe('EffectsSystem Reduce Flashing', () => {
  it('draws flashes at 30 % and never more than one per third of a second', () => {
    const effects = createEffects({ reduceFlashing: true });
    const step = 1 / 60;

    effects.addScreenFlash('#fff', 0.6, 0.45); // the Solar Flare's flash
    expect(effects.screenFlash.intensity).toBeCloseTo(0.135, 5);

    // A burst of hits inside the window must not restart the flash.
    for (let i = 0; i < 10; i += 1) {
      effects.update(step);
      effects.addScreenFlash('#f00', 0.25, 0.3);
    }
    expect(effects.screenFlash.color).toBe('#fff');

    for (let i = 0; i < 12; i += 1) effects.update(step);
    effects.addScreenFlash('#f00', 0.25, 0.3);
    expect(effects.screenFlash.color).toBe('#f00');
    expect(effects.screenFlash.intensity).toBeCloseTo(0.09, 5);
  });

  it('follows the setting live', () => {
    const effects = createEffects({ reduceFlashing: false });
    effects.addScreenFlash('#fff', 0.6, 0.45);
    expect(effects.screenFlash.intensity).toBe(0.45);
    effects.applyAccessibilityPreferences({ reduceFlashing: true });
    effects.addScreenFlash('#fff', 0.6, 0.45);
    expect(effects.screenFlash.intensity).toBeCloseTo(0.135, 5);
  });
});
