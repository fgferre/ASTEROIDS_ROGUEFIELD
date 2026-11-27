import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/domStubs.js';
import { FlightBriefing } from '../../../src/modules/ui/FlightBriefing.js';

// Settings opened over another screen let a key act on the screen underneath:
// Enter closed the briefing or the credits, an arrow changed the Codex tab,
// all unseen. The credits and the Codex are on the input layer stack now,
// under Settings (tests/modules/ui/inputLayers/); the briefing still checks
// for itself: Settings is open when the body carries 'is-settings-open'.
describe('Settings over another screen', () => {
  let restoreDom;
  let settingsOpen;
  beforeEach(() => {
    restoreDom = installDomStubs();
    settingsOpen = true;
    document.body = { classList: { contains: () => settingsOpen } };
  });
  afterEach(() => restoreDom());

  it('does not let a confirm reach the flight briefing', () => {
    const handlers = new Map();
    const ui = {
      registerEventListener: (name, handler) => handlers.set(name, handler),
      showScreen: vi.fn(),
      showGameUI: vi.fn(),
      eventBus: { emit: vi.fn() },
    };
    const briefing = new FlightBriefing(
      { screen: { focus: vi.fn() }, continueBtn: null },
      ui
    );
    briefing.lockedUntil = 0; // up, past its lockout

    handlers.get('input-confirmed')();
    expect(ui.showGameUI).not.toHaveBeenCalled();
    expect(briefing.isVisible).toBe(true);

    settingsOpen = false;
    handlers.get('input-confirmed')();
    expect(ui.showGameUI).toHaveBeenCalledTimes(1);
  });
});
