import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/domStubs.js';
import { CodexScreen } from '../../../src/modules/ui/CodexScreen.js';
import { EndCredits } from '../../../src/modules/ui/EndCredits.js';
import { FlightBriefing } from '../../../src/modules/ui/FlightBriefing.js';

// Settings opened over another screen let a key act on the screen underneath:
// Enter closed the briefing or the credits, an arrow changed the Codex tab,
// all unseen. Settings is open when the body carries 'is-settings-open'.
describe('Settings over another screen', () => {
  let restoreDom;
  let settingsOpen;
  let onKey;
  beforeEach(() => {
    restoreDom = installDomStubs();
    settingsOpen = true;
    onKey = null;
    document.body = { classList: { contains: () => settingsOpen } };
    document.addEventListener = (type, handler) => {
      if (type === 'keydown') onKey = handler;
    };
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

  it('does not let Enter reach the end credits', () => {
    const credits = new EndCredits({
      refs: {},
      showScreen: vi.fn(),
      announceVisibility: vi.fn(),
    });
    credits.bindControls();
    const onDone = vi.fn();
    credits.onDone = onDone;

    onKey({ key: 'Enter', preventDefault: vi.fn() });
    expect(onDone).not.toHaveBeenCalled();

    settingsOpen = false;
    onKey({ key: 'Enter', preventDefault: vi.fn() });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not let an arrow change the Codex tab', () => {
    const node = { addEventListener: vi.fn() };
    const codex = new CodexScreen({
      refs: { overlay: node, tabs: [] },
      showScreen: vi.fn(),
      announceVisibility: vi.fn(),
      codex: vi.fn(),
      achievements: vi.fn(),
    });
    codex.bindCodexControls();
    codex.codexState.isOpen = true;
    const cycleTab = vi.spyOn(codex, 'cycleTab').mockImplementation(() => {});

    onKey({ key: 'ArrowRight', preventDefault: vi.fn() });
    expect(cycleTab).not.toHaveBeenCalled();

    settingsOpen = false;
    onKey({ key: 'ArrowRight', preventDefault: vi.fn() });
    expect(cycleTab).toHaveBeenCalledWith(1);
  });
});
