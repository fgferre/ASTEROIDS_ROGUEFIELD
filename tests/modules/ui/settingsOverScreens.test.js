import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/domStubs.js';
import { FlightBriefing } from '../../../src/modules/ui/FlightBriefing.js';
import { inputLayers } from '../../../src/modules/input/inputLayers.js';

// Settings opened over another screen let a key act on the screen underneath:
// Enter closed the briefing or the credits, an arrow changed the Codex tab,
// all unseen. Every screen is on the input layer stack now, under Settings
// (tests/modules/ui/inputLayers/); the briefing takes the confirm only on
// top of it.
describe('Settings over another screen', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    inputLayers.install(null);
  });
  afterEach(() => restoreDom());

  it('does not let a confirm reach the flight briefing', () => {
    const ui = {
      registerEventListener: () => {},
      showScreen: vi.fn(),
      showGameUI: vi.fn(),
      eventBus: { emit: vi.fn() },
    };
    const briefing = new FlightBriefing(
      {
        screen: { focus: vi.fn(), style: { setProperty() {} } },
        continueBtn: null,
      },
      ui
    );
    briefing.pending = true;
    briefing.openNext();
    briefing.lockedUntil = 0; // past its lockout
    const settings = { name: 'settings', passes: [], staysOnTop: true };
    inputLayers.push(settings);

    inputLayers.confirm();
    expect(ui.showGameUI).not.toHaveBeenCalled();
    expect(briefing.isVisible).toBe(true);

    inputLayers.remove(settings);
    inputLayers.confirm();
    expect(ui.showGameUI).toHaveBeenCalledTimes(1);
  });
});
