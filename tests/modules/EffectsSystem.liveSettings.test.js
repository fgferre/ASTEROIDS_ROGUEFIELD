import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';

// Game & camera options changed mid-run, through the real settings and event
// bus: they take hold at once, not at the next page load.
describe('gameplay settings changed mid-run', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreDom();
    GamePools.releaseAll();
  });

  it('Screen Shake and Hit Markers apply at once', () => {
    const { services, session } = createHeadlessGame();
    session.startNewRun({ source: 'test' });

    services.settings.setSetting('gameplay', 'screenShake', 0);
    services.settings.setSetting('gameplay', 'hitMarkers', false);
    expect(services.effects.screenShakeScale).toBe(0);
    expect(services.effects.hitMarkersEnabled).toBe(false);

    services.settings.resetCategory('gameplay');
    expect(services.effects.screenShakeScale).toBe(1);
    expect(services.effects.hitMarkersEnabled).toBe(true);
  });
});
