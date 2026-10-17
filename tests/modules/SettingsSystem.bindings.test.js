import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SettingsSystem from '../../src/modules/SettingsSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { installDomStubs } from '../__helpers__/headlessGame.js';

const STORAGE_KEY = 'astro:settings:v1';

describe('SettingsSystem dash binding migration', () => {
  let restoreDom;

  beforeEach(() => {
    restoreDom = installDomStubs();
  });

  afterEach(() => {
    restoreDom();
  });

  const load = (controls) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ controls }));
    return new SettingsSystem({ eventBus: createEventBusMock() }).values
      .controls;
  };

  it('moves Shift from the shield to the dash in a save from before the dash', () => {
    const controls = load({
      activateShield: { keyboard: ['KeyE', 'ShiftLeft'], gamepad: [] },
    });
    expect(controls.activateShield.keyboard).toEqual(['KeyE']);
    expect(controls.dash.keyboard).toEqual(['ShiftLeft', 'ShiftRight']);
  });

  it('keeps a save that already binds the dash as it is', () => {
    const controls = load({
      activateShield: { keyboard: ['KeyE', 'ShiftLeft'], gamepad: [] },
      dash: { keyboard: ['KeyQ'], gamepad: [] },
    });
    expect(controls.activateShield.keyboard).toEqual(['KeyE', 'ShiftLeft']);
    expect(controls.dash.keyboard).toEqual(['KeyQ']);
  });
});
