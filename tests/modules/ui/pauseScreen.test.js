import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { PauseScreen } from '../../../src/modules/ui/PauseScreen.js';

describe('Pause screen', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('renders the build, tools left, layer and seed from the services', () => {
    const hidden = new Set();
    const run = {
      classList: { toggle: (name, on) => hidden[on ? 'add' : 'delete'](name) },
    };
    const refs = { build: {}, location: {}, tools: {}, seed: {}, run };
    const pause = new PauseScreen({
      refs,
      showScreen: () => {},
      progression: () => ({
        pilotCardIds: [],
        rerollsLeft: 2,
        banishesLeft: 1,
        upgradeLookup: new Map(),
        getUpgradeProgressSnapshot: () => [],
        getSynergySnapshot: () => ({ families: {}, synergies: [] }),
      }),
      combat: () => ({
        getWeaponState: () => ({ name: 'Amber Lance', evolutions: [] }),
      }),
      difficulty: () => ({ runLabel: () => 'Seed 42 · Veteran' }),
      layer: () => 3,
      settingsOpenHere: () => false,
    });

    pause.updatePauseScreen(true);

    expect(refs.build.innerHTML).toContain(
      '<span class="end-weapon__name">Amber Lance</span>'
    );
    expect(refs.location.textContent).toMatch(/^Layer 3 · /);
    expect(refs.tools.textContent).toBe('Rerolls 2 · Banishes 1');
    expect(refs.seed.textContent).toBe('Seed 42 · Veteran');
    // The old flight has no piloting trail: no card slots column.
    expect(hidden.has('hidden')).toBe(true);
    expect(run.innerHTML).toBe('');
  });

  it('Escape with the quit armed only disarms it: the game never hears that press', () => {
    let onKey;
    window.addEventListener = (name, fn, capture) => {
      if (name === 'keydown' && capture) onKey = fn;
    };
    const classes = new Set();
    const exitBtn = {
      textContent: 'Quit to menu',
      addEventListener: () => {},
      setAttribute: () => {},
      removeAttribute: () => {},
      classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
      },
    };
    const pause = new PauseScreen({
      refs: { exitBtn },
      showScreen: () => {},
      progression: () => null,
    });
    pause.bindPauseControls();
    pause.updatePauseScreen(true);
    const escape = (repeat = false) => {
      const event = {
        key: 'Escape',
        repeat,
        stopImmediatePropagation: vi.fn(),
      };
      onKey(event);
      return event.stopImmediatePropagation.mock.calls.length > 0;
    };

    pause.confirmQuit(exitBtn);
    expect(exitBtn.textContent).toBe('Quit? Press again');
    expect([escape(), escape(true)]).toEqual([true, true]);
    expect(exitBtn.textContent).toBe('Quit to menu');
    expect(classes.has('is-confirming')).toBe(false);
    // Nothing armed: the next Escape resumes as before.
    expect(escape()).toBe(false);
  });
});
