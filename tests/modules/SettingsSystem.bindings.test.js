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

  it('moves a save from before 18/10 onto the new pad table, keeping remaps', () => {
    const controls = load({
      activateShield: { keyboard: ['KeyE'], gamepad: ['button:2', 'button:4'] },
      dash: { keyboard: ['ShiftLeft'], gamepad: ['button:1'] },
      toggleSpreadMode: { keyboard: ['KeyG'], gamepad: [] },
      toggleAimMode: { keyboard: ['KeyT'], gamepad: [] },
    });
    expect(controls.activateShield.gamepad).toEqual(['button:4']);
    expect(controls.dash.gamepad).toEqual(['button:1']);
    expect(controls.toggleSpreadMode.gamepad).toEqual(['button:2']);
    expect(controls.toggleAimMode.gamepad).toEqual(['button:3']);
    expect(controls.vibration).toBe(true);
  });

  it('moves a save on the 18/10 table to the two sticks, keeping remaps', () => {
    const controls = load({
      moveUp: { keyboard: ['KeyW'], gamepad: ['axis:1:-', 'button:12'] },
      moveLeft: { keyboard: ['KeyA'], gamepad: ['axis:0:-', 'button:14'] },
      activateShield: { keyboard: ['KeyE'], gamepad: ['button:6'] },
      dash: { keyboard: ['ShiftLeft'], gamepad: ['button:0'] },
      vibration: true,
    });
    expect(controls.moveUp.gamepad).toEqual(['button:12']);
    expect(controls.moveLeft.gamepad).toEqual(['button:14']);
    expect(controls.activateShield.gamepad).toEqual(['button:4']);
    expect(controls.dash.gamepad).toEqual(['button:0']);
  });
});

describe('SettingsSystem with a save holding options that left', () => {
  let restoreDom;

  beforeEach(() => {
    restoreDom = installDomStubs();
  });

  afterEach(() => {
    restoreDom();
  });

  it('loads it, keeps Hit Markers off and drops the old key on the next save', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ gameplay: { damageNumbers: false, hitMarkers: false } })
    );
    const settings = new SettingsSystem({ eventBus: createEventBusMock() });
    expect(settings.getSetting('gameplay', 'hitMarkers')).toBe(false);

    settings.setSetting('gameplay', 'screenShake', 0.5);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)).gameplay;
    expect(saved.hitMarkers).toBe(false);
    expect(saved).not.toHaveProperty('damageNumbers');
  });

  it('loads a saved Reduced Particles, keeps Bloom off and drops it on the next save', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ graphics: { reducedParticles: true, bloom: false } })
    );
    const settings = new SettingsSystem({ eventBus: createEventBusMock() });
    expect(settings.getSetting('graphics', 'bloom')).toBe(false);

    settings.setSetting('graphics', 'postProcessing', false);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)).graphics;
    expect(saved.bloom).toBe(false);
    expect(saved).not.toHaveProperty('reducedParticles');
  });
});
