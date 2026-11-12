import { describe, expect, it, vi } from 'vitest';
import UISystem from '../../src/modules/UISystem.js';
import { sectorById } from '../../src/data/sectors.js';

describe('UISystem on a sector run', () => {
  it("the layer banner counts the sector's layers from its first one", () => {
    const showLayerBanner = vi.fn();
    const ui = {
      tacticalHud: { layout: { showLayerBanner } },
      cinematics: { introActive: false },
      queueTransmission: vi.fn(),
      getService: (name) =>
        name === 'game-session' ? { sector: sectorById('dense-core') } : null,
    };

    UISystem.prototype.handleLayerStarted.call(ui, { wave: 6 });

    expect(showLayerBanner).toHaveBeenCalledWith(1, {
      boss: false,
      bossRush: undefined,
      chapter: 'CHAPTER II — THE DENSE CORE',
    });
    expect(ui.transmissionLayer).toBe(6);
  });
});
