import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SettingsSystem from '../../src/modules/SettingsSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { installDomStubs } from '../__helpers__/domStubs.js';

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
    expect(controls.activateShield.gamepad).toEqual(['button:6']);
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
    expect(controls.activateShield.gamepad).toEqual(['button:6']);
    expect(controls.dash.gamepad).toEqual(['button:0']);
  });

  // LB (button 4) became the strafe hold and the shield's default LT (6).
  const pad = (gamepad) => ({ keyboard: [], gamepad });

  it('moves a shield still on LB to LT, and LB holds the strafe', () => {
    const controls = load({
      activateShield: { keyboard: ['KeyE'], gamepad: ['button:4'] },
      vibration: true,
    });
    expect(controls.activateShield.gamepad).toEqual(['button:6']);
    expect(controls.strafeHold.gamepad).toEqual(['button:4']);
    expect(controls.strafeLeft.keyboard).toEqual(['KeyZ']);
    expect(controls.strafeRight.keyboard).toEqual(['KeyC']);
  });

  it('keeps a shield remapped elsewhere', () => {
    const controls = load({
      activateShield: pad(['button:11']),
      vibration: true,
    });
    expect(controls.activateShield.gamepad).toEqual(['button:11']);
    expect(controls.strafeHold.gamepad).toEqual(['button:4']);
  });

  it('with LT already taken, the shield stays on LB and the strafe hold starts unbound', () => {
    const controls = load({
      activateShield: pad(['button:4']),
      dash: pad(['button:6']),
      vibration: true,
    });
    expect(controls.activateShield.gamepad).toEqual(['button:4']);
    expect(controls.dash.gamepad).toEqual(['button:6']);
    expect(controls.strafeHold.gamepad).toEqual([]);
  });

  it('the strafe takes no key or button another action holds', () => {
    const controls = load({
      activateShield: pad(['button:11']),
      dash: pad(['button:4']),
      toggleAimMode: { keyboard: ['KeyC'], gamepad: [] },
      vibration: true,
    });
    expect(controls.dash.gamepad).toEqual(['button:4']);
    expect(controls.strafeHold.gamepad).toEqual([]);
    expect(controls.toggleAimMode.keyboard).toEqual(['KeyC']);
    expect(controls.strafeRight.keyboard).toEqual([]);
    expect(controls.strafeLeft.keyboard).toEqual(['KeyZ']);
  });

  it('leaves a save made with the strafe as it is', () => {
    const controls = load({
      activateShield: pad(['button:4']),
      strafeHold: pad(['button:10']),
      vibration: true,
    });
    expect(controls.activateShield.gamepad).toEqual(['button:4']);
    expect(controls.strafeHold.gamepad).toEqual(['button:10']);
  });

  // Space holds the strafe on the keys; confirm (menus only) keeps it too.
  it('gives Space to the hold in a save from before the strafe', () => {
    const controls = load({ vibration: true });
    expect(controls.strafeHold.keyboard).toEqual(['Space']);
    expect(controls.confirm.keyboard).toEqual(['Enter', 'Space']);
  });

  it('gives Space to a hold saved without a key', () => {
    const controls = load({ strafeHold: pad(['button:4']), vibration: true });
    expect(controls.strafeHold.keyboard).toEqual(['Space']);
    expect(controls.strafeHold.gamepad).toEqual(['button:4']);
  });

  it('with Space on another flight action, the hold stays without a key', () => {
    const dash = { keyboard: ['Space'], gamepad: [] };
    [
      { dash, vibration: true },
      { dash, strafeHold: pad(['button:4']), vibration: true },
    ].forEach((saved) => {
      const controls = load(saved);
      expect(controls.dash.keyboard).toEqual(['Space']);
      expect(controls.strafeHold.keyboard).toEqual([]);
    });
  });

  it('keeps a key the player set for the hold', () => {
    const controls = load({
      strafeHold: { keyboard: ['KeyX'], gamepad: ['button:4'] },
      vibration: true,
    });
    expect(controls.strafeHold.keyboard).toEqual(['KeyX']);
  });
});

describe('SettingsSystem rebinding a key another action holds', () => {
  let restoreDom;

  beforeEach(() => {
    restoreDom = installDomStubs();
  });

  afterEach(() => {
    restoreDom();
  });

  const create = (eventBus = createEventBusMock()) =>
    new SettingsSystem({ eventBus });

  it('takes the key from the flight action that had it', () => {
    const settings = create();
    settings.setSetting('controls', 'dash', {
      keyboard: ['KeyE', 'ShiftRight'],
      gamepad: ['button:5'],
    });
    expect(settings.getSetting('controls', 'dash').keyboard).toEqual([
      'KeyE',
      'ShiftRight',
    ]);
    expect(settings.getSetting('controls', 'activateShield').keyboard).toEqual(
      []
    );
  });

  it('takes a pad button the same way, and the loser stays unbound after a reload', () => {
    create().setSetting('controls', 'dash', {
      keyboard: ['ShiftLeft', 'ShiftRight'],
      gamepad: ['button:6'],
    });
    const shield = create().getSetting('controls', 'activateShield');
    expect(shield.gamepad).toEqual([]);
    expect(shield.keyboard).toEqual(['KeyE']);
  });

  it('lets a menu action keep sharing a key with a flight action', () => {
    const settings = create();
    settings.setSetting('controls', 'dash', {
      keyboard: ['Enter'],
      gamepad: ['button:5'],
    });
    settings.setSetting('controls', 'confirm', {
      keyboard: ['Enter', 'KeyE'],
      gamepad: [],
    });
    expect(settings.getSetting('controls', 'confirm').keyboard).toEqual([
      'Enter',
      'KeyE',
    ]);
    expect(settings.getSetting('controls', 'dash').keyboard).toEqual(['Enter']);
    expect(settings.getSetting('controls', 'activateShield').keyboard).toEqual([
      'KeyE',
    ]);
  });

  it('Reset Controls gives every action its default back', () => {
    const settings = create();
    settings.setSetting('controls', 'dash', {
      keyboard: ['KeyE', 'KeyW'],
      gamepad: ['button:6'],
    });
    settings.resetCategory('controls');
    expect(settings.getCategoryValues('controls')).toEqual(
      settings.defaults.controls
    );
  });

  it('tells the game once, with both changes', () => {
    const eventBus = createEventBusMock();
    const settings = create(eventBus);
    const heard = [];
    eventBus.on('settings-controls-changed', ({ values }) =>
      heard.push(values)
    );
    settings.setSetting('controls', 'dash', {
      keyboard: ['KeyE'],
      gamepad: ['button:5'],
    });
    expect(heard).toHaveLength(1);
    expect(heard[0].dash.keyboard).toEqual(['KeyE']);
    expect(heard[0].activateShield.keyboard).toEqual([]);
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
