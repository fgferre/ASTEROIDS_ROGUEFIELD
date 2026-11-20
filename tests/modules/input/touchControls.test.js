import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TouchControls,
  touchModeFromUrl,
  touchMovement,
} from '../../../src/modules/input/touchControls.js';

const UP = { x: 0, y: -1 };
const facingRight = { angle: 0, angularVelocity: 0 };

describe('touch stick', () => {
  it("picks the thumb's flight from ?toque=, 'teclas' by default", () => {
    expect(touchModeFromUrl('')).toBe('teclas');
    expect(touchModeFromUrl('?toque=aponta')).toBe('aponta');
    expect(touchModeFromUrl('?toque=other')).toBe('teclas');
  });

  it("'teclas': the stick is the pad's four move keys plus its analog", () => {
    expect(touchMovement(UP, 'teclas', facingRight)).toEqual({
      up: true,
      down: false,
      left: false,
      right: false,
      moveX: 0,
      moveY: -1,
    });
    const leftDown = touchMovement({ x: -0.8, y: 0.6 }, 'teclas', facingRight);
    expect([leftDown.left, leftDown.down, leftDown.up]).toEqual([
      true,
      true,
      false,
    ]);
    // Inside the deadzone nothing is held.
    expect(touchMovement({ x: 0.1, y: 0.1 }, 'teclas', facingRight)).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
      moveX: 0,
      moveY: 0,
    });
  });

  it("'aponta': turns the nose toward the thumb, thrusts once it is near", () => {
    // Nose right, thumb up (screen y down): turn counter-clockwise, no thrust.
    const turning = touchMovement(UP, 'aponta', facingRight);
    expect([turning.left, turning.right, turning.up]).toEqual([
      true,
      false,
      false,
    ]);
    // Nose almost up: thrust, no turn; nothing ever brakes.
    const flying = touchMovement(UP, 'aponta', { angle: -1.55 });
    expect([flying.left, flying.right, flying.up, flying.down]).toEqual([
      false,
      false,
      true,
      false,
    ]);
    // A light push only turns the nose (aiming the fixed cannon).
    const light = touchMovement({ x: 0, y: -0.45 }, 'aponta', { angle: -1.55 });
    expect(light.up).toBe(false);
    // Spinning toward the thumb fast: counter-steer instead of overshooting.
    const coasting = touchMovement(UP, 'aponta', {
      angle: -1.2,
      angularVelocity: -3,
    });
    expect([coasting.left, coasting.right]).toEqual([false, true]);
  });

  it('joins the keys and pad: keys add up, a moved pad stick wins', () => {
    const touch = new TouchControls({
      input: null,
      player: facingRight,
      eventBus: null,
      mode: 'teclas',
    });
    touch.stick = UP;
    const keys = { up: false, down: false, left: true, right: false };
    expect(touch.merge({ ...keys, moveX: 0, moveY: 0 })).toMatchObject({
      up: true,
      left: true,
      moveX: 0,
      moveY: -1,
    });
    expect(touch.merge({ ...keys, moveX: 0.5, moveY: 0 })).toMatchObject({
      moveX: 0.5,
      moveY: 0,
    });
  });

  it('lets go and pauses a running run when the app leaves the screen', () => {
    const emitted = [];
    let running = true;
    const touch = new TouchControls({
      input: { isGameRunning: () => running },
      player: facingRight,
      eventBus: { emit: (name) => emitted.push(name) },
      mode: 'teclas',
    });
    touch.stick = UP;
    touch.pauseRun();
    expect(touch.stick).toEqual({ x: 0, y: 0 });
    expect(emitted).toEqual(['toggle-pause']);
    running = false; // already paused, or in a menu: nothing toggles
    touch.pauseRun();
    expect(emitted).toEqual(['toggle-pause']);
  });
});

// A car's or a touch laptop's browser declares a mouse (no coarse pointer):
// the last device used rules there, and ?touch=force pins touch play on.
describe('touch play on a screen that declares a mouse', () => {
  let listeners;
  let bodyClasses;

  beforeEach(() => {
    vi.resetModules();
    listeners = {};
    bodyClasses = {};
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('document', {
      body: {
        classList: { toggle: (name, on) => (bodyClasses[name] = on) },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  async function computer(search = '') {
    vi.stubGlobal('window', {
      location: { search },
      innerWidth: 1440,
      innerHeight: 900,
      matchMedia: () => ({ matches: false }),
      addEventListener: (type, handler) => (listeners[type] = handler),
    });
    const guard = await import('../../../src/bootstrap/mobileGuard.js');
    const { TouchControls: Controls } = await import(
      '../../../src/modules/input/touchControls.js'
    );
    expect(await guard.mobileGuard()).toEqual({ touch: false });
    const handlers = {};
    const input = {
      device: 'keyboard',
      getActiveDevice() {
        return this.device;
      },
      setActiveDevice(device) {
        if (device === this.device) return;
        this.device = device;
        handlers['input-device-changed']?.({ device });
      },
    };
    const shown = [];
    const touch = new Controls({
      input,
      player: facingRight,
      eventBus: { on: (name, handler) => (handlers[name] = handler) },
      onShow: () => shown.push(touch.on),
    });
    touch.layer = { hidden: true }; // built already: no DOM here
    touch.start();
    return { touch, input, shown, touchScreen: guard.touchScreen };
  }

  it('a finger turns it on, a key turns it off, a mouse click never does', async () => {
    const { touch, input, shown, touchScreen } = await computer();
    listeners.pointerdown({ pointerType: 'mouse' });
    expect([touch.on, touchScreen()]).toEqual([false, null]);
    listeners.pointerdown({ pointerType: 'touch' });
    expect([touch.on, bodyClasses['touch-play'], touchScreen()]).toEqual([
      true,
      true,
      'tablet',
    ]);
    input.setActiveDevice('keyboard');
    expect([touch.on, bodyClasses['touch-play'], touchScreen()]).toEqual([
      false,
      false,
      null,
    ]);
    // The HUD followed each turn.
    expect(shown).toEqual([true, false]);
  });

  it('?touch=force keeps it on whatever is pressed; ?desktop=force never turns', async () => {
    const pinned = await computer('?touch=force');
    pinned.input.setActiveDevice('keyboard');
    expect(pinned.touch.on).toBe(true);

    vi.resetModules();
    const desktop = await computer('?desktop=force');
    listeners.pointerdown({ pointerType: 'touch' });
    expect(desktop.touch.on).toBe(false);
  });
});
