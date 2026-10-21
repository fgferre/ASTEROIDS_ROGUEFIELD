import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import UISystem from '../../../src/modules/UISystem.js';
import { pickFocusTarget } from '../../../src/modules/ui/gamepadNav.js';

const rect = (left, top, width = 100, height = 40) => ({
  left,
  top,
  width,
  height,
});

// A 2×2 menu grid with a wide button under it.
const GRID = [
  rect(0, 0),
  rect(120, 0),
  rect(0, 60),
  rect(120, 60),
  rect(0, 120, 220),
];

describe('gamepad focus navigation', () => {
  it('moves along the rows and columns of a grid with the d-pad', () => {
    expect(pickFocusTarget(GRID[0], GRID, 'right')).toBe(1);
    expect(pickFocusTarget(GRID[0], GRID, 'down')).toBe(2);
    expect(pickFocusTarget(GRID[3], GRID, 'up')).toBe(1);
    expect(pickFocusTarget(GRID[3], GRID, 'left')).toBe(2);
    expect(pickFocusTarget(GRID[3], GRID, 'down')).toBe(4);
  });

  it('stays put at an edge and starts on the first control without focus', () => {
    expect(pickFocusTarget(GRID[0], GRID, 'up')).toBe(-1);
    expect(pickFocusTarget(GRID[1], GRID, 'right')).toBe(-1);
    expect(pickFocusTarget(null, GRID, 'down')).toBe(0);
    expect(pickFocusTarget(null, [], 'down')).toBe(-1);
  });
});

describe('UISystem gamepad navigation', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  // The menu screen with the GRID buttons; focus() and click() are recorded.
  function menuWithButtons() {
    const clicks = [];
    const buttons = GRID.map((box, index) => ({
      index,
      getBoundingClientRect: () => box,
      getClientRects: () => [box],
      focus() {
        document.activeElement = this;
      },
      click: () => clicks.push(index),
    }));
    const screen = {
      classList: { contains: () => false },
      contains: (element) => buttons.includes(element),
      querySelectorAll: () => buttons,
    };
    document.getElementById = (id) => (id === 'menu-screen' ? screen : null);
    const ui = {
      settingsPanel: { capturing: false },
      hudEditor: { isOpen: false },
    };
    Object.setPrototypeOf(ui, UISystem.prototype);
    return { ui, clicks };
  }

  it('moves the focus with the d-pad and activates it with A', () => {
    const { ui, clicks } = menuWithButtons();
    ui.handleGamepadNav('down');
    expect(document.activeElement.index).toBe(0);
    ui.handleGamepadNav('right');
    ui.handleGamepadNav('down');
    expect(document.activeElement.index).toBe(3);
    ui.handleGamepadNav('confirm');
    expect(clicks).toEqual([3]);
  });

  it('drives the game over, not cards left under it', () => {
    const shown = { classList: { contains: () => false } };
    document.getElementById = (id) =>
      id === 'levelup-screen' || id === 'gameover-screen' ? shown : null;
    const ui = Object.setPrototypeOf({}, UISystem.prototype);
    expect(ui.getGamepadNavScreen().id).toBe('gameover');
  });

  it('closes Settings with pad back instead of operating a covered screen', () => {
    const closeSettingsPanel = vi.fn();
    const settings = { classList: { contains: () => false } };
    document.getElementById = (id) =>
      id === 'settings-screen' || id === 'levelup-screen' ? settings : null;
    const ui = Object.setPrototypeOf(
      {
        settingsPanel: { capturing: false, closeSettingsPanel },
        hudEditor: { isOpen: false },
      },
      UISystem.prototype
    );

    ui.handleGamepadNav('back');

    expect(closeSettingsPanel).toHaveBeenCalledOnce();
  });
});
