import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';
import SettingsSystem from '../../../src/modules/SettingsSystem.js';
import UISystem from '../../../src/modules/UISystem.js';
import {
  CARDS_TIP_TEXT,
  CARDS_TIP_TEXT_GAMEPAD,
  MOVE_HOLD_SECONDS,
  ONBOARDING_GAP_SECONDS,
  ONBOARDING_STORAGE_KEY,
  Onboarding,
  SHIELD_TIP_SECONDS,
  onboardingPrompts,
} from '../../../src/modules/ui/onboarding.js';

const STEP = 1 / 60;

function fakeView() {
  return {
    showing: null,
    showTip(id) {
      this.showing = id;
    },
    hideTip() {
      this.showing = null;
    },
  };
}

function run(onboarding, seconds, state = {}) {
  for (let t = 0; t < seconds; t += STEP) {
    onboarding.update(STEP, state);
  }
}

const saved = () =>
  JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)).done;

describe('Onboarding', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('teaches move, dash, shield in order, each after a gap', () => {
    const view = fakeView();
    const shown = [];
    const onboarding = new Onboarding(view, (id) => shown.push(id));
    onboarding.start();

    onboarding.update(STEP);
    expect(view.showing).toBe('move');
    run(onboarding, MOVE_HOLD_SECONDS + STEP, { moving: true });
    expect(view.showing).toBeNull();

    run(onboarding, ONBOARDING_GAP_SECONDS - 0.1);
    expect(view.showing).toBeNull();
    run(onboarding, 0.2);
    expect(view.showing).toBe('dash');
    onboarding.dashed();
    expect(view.showing).toBeNull();

    run(onboarding, ONBOARDING_GAP_SECONDS + 1);
    expect(view.showing).toBeNull(); // no shield on the ship yet
    run(onboarding, STEP * 2, { shieldReady: true });
    expect(view.showing).toBe('shield');
    onboarding.shieldRaised();
    expect(view.showing).toBeNull();
    expect(shown).toEqual(['move', 'dash', 'shield']);
  });

  it('waits for a HUD banner before showing a tip', () => {
    const view = fakeView();
    const onboarding = new Onboarding(view);
    onboarding.start();
    run(onboarding, 2, { bannerBusy: true });
    expect(view.showing).toBeNull();
    onboarding.update(STEP);
    expect(view.showing).toBe('move');
  });

  it('lets the shield tip leave on its own', () => {
    localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ done: ['move', 'dash'] })
    );
    const view = fakeView();
    const onboarding = new Onboarding(view);
    onboarding.start();
    onboarding.update(STEP, { shieldReady: true });
    expect(view.showing).toBe('shield');
    run(onboarding, SHIELD_TIP_SECONDS + STEP, { shieldReady: true });
    expect(view.showing).toBeNull();
    expect(saved()).toContain('shield');
  });

  it('shows the cards tip on the first level-up and counts the pick', () => {
    const onboarding = new Onboarding(fakeView());
    onboarding.start();
    onboarding.cardPicked(); // an auto-resolved pick never showed the tip
    expect(onboarding.cardsTip()).toBe(CARDS_TIP_TEXT);
    onboarding.cardPicked();
    expect(onboarding.cardsTip()).toBeNull();
    expect(saved()).toEqual(['cards']);
  });

  it('remembers finished tips across runs until replayed', () => {
    localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ done: ['move', 'dash', 'shield', 'cards'] })
    );
    const done = new Onboarding(fakeView());
    done.start();
    expect(done.current).toBeNull();
    expect(done.cardsTip()).toBeNull();

    done.replay();
    const again = new Onboarding(fakeView());
    again.start();
    expect(again.current).toBe('move');
  });

  it('names the bound keys for each control scheme', () => {
    const keys = {
      moveUp: 'W',
      moveDown: 'S',
      moveLeft: 'A',
      moveRight: 'D',
      dash: 'Shift',
      activateShield: 'E',
    };
    expect(onboardingPrompts(keys).move.keys).toEqual(['W', 'A', 'S', 'D']);
    expect(onboardingPrompts(keys, 'classic').move.keys).toEqual([
      'A',
      'W',
      'D',
    ]);
    expect(onboardingPrompts(keys).dash.keys).toEqual(['⇧ Shift']);
  });

  it('names the pad buttons when the gamepad was used last', () => {
    const buttons = {
      moveUp: 'L-Stick ↑',
      moveDown: 'L-Stick ↓',
      moveLeft: 'L-Stick ←',
      moveRight: 'L-Stick →',
      dash: 'RT',
      activateShield: 'LT',
    };
    const prompts = onboardingPrompts(buttons, 'modern', 'gamepad');
    expect(prompts.move.keys).toEqual(['L-Stick']);
    expect(prompts.move.text).toMatch(/right stick/);
    expect(prompts.dash.keys).toEqual(['RT']);
    expect(prompts.shield.keys).toEqual(['LT']);

    const onboarding = new Onboarding(fakeView());
    onboarding.start();
    expect(onboarding.cardsTip('gamepad')).toBe(CARDS_TIP_TEXT_GAMEPAD);
  });

  it('is off when the Settings toggle is off', () => {
    const settings = new SettingsSystem({ eventBus: createEventBusMock() });
    const ui = {
      controlsToastDisabled: false,
      resolveSettingsService: () => settings,
    };
    const enabled = () => UISystem.prototype.isOnboardingEnabled.call(ui);
    expect(enabled()).toBe(true);
    settings.setSetting('gameplay', 'onboardingTips', false);
    expect(enabled()).toBe(false);
  });
});
