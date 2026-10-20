import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { PauseScreen } from '../../../src/modules/ui/PauseScreen.js';

describe('Pause screen', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('renders the build, tools left, layer and seed from the services', () => {
    const refs = { build: {}, location: {}, tools: {}, seed: {} };
    const pause = new PauseScreen({
      refs,
      showScreen: () => {},
      progression: () => ({
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
  });
});
