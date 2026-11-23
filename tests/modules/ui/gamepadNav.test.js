import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../../__helpers__/domStubs.js';
import {
  GamepadMenuNav,
  pickFocusTarget,
} from '../../../src/modules/ui/gamepadNav.js';

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

  it('goes down from a small tab to the wide row under it, not a nearer-centred field', () => {
    const tab = rect(32, 100, 68, 36);
    const row = rect(32, 185, 824, 38);
    const field = rect(32, 391, 176, 40);
    expect(pickFocusTarget(tab, [field, row], 'down')).toBe(1);
  });
});

describe('GamepadMenuNav', () => {
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
      contains: () => false,
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
    const ui = new GamepadMenuNav({
      settingsPanel: { capturing: false },
      hudEditor: { isOpen: false },
    });
    return { ui, clicks };
  }

  it('moves the focus with the d-pad and activates it with A', () => {
    const { ui, clicks } = menuWithButtons();
    ui.handle('down');
    expect(document.activeElement.index).toBe(0);
    ui.handle('right');
    ui.handle('down');
    expect(document.activeElement.index).toBe(3);
    ui.handle('confirm');
    expect(clicks).toEqual([3]);
  });

  it('drives the game over, not cards left under it', () => {
    const shown = { classList: { contains: () => false } };
    document.getElementById = (id) =>
      id === 'levelup-screen' || id === 'gameover-screen' ? shown : null;
    const ui = new GamepadMenuNav({});
    expect(ui.screen().id).toBe('gameover');
  });

  it('closes Settings with pad back instead of operating a covered screen', () => {
    const closeSettingsPanel = vi.fn();
    const settings = { classList: { contains: () => false } };
    document.getElementById = (id) =>
      id === 'settings-screen' || id === 'levelup-screen' ? settings : null;
    const ui = new GamepadMenuNav({
      settingsPanel: { capturing: false, closeSettingsPanel },
      hudEditor: { isOpen: false },
    });

    ui.handle('back');

    expect(closeSettingsPanel).toHaveBeenCalledOnce();
  });

  // The menu screen showing, with `active` focused in it.
  function menuNav(active, ui = {}) {
    const menu = {
      id: 'menu-screen',
      classList: { contains: () => false },
      contains: (element) => element === active,
      querySelectorAll: () => [],
    };
    document.getElementById = (id) => (id === 'menu-screen' ? menu : null);
    document.activeElement = active;
    return new GamepadMenuNav({
      settingsPanel: { capturing: false },
      hudEditor: { isOpen: false },
      ...ui,
    });
  }

  it('changes a list only after A, and leaves it with B', () => {
    const changes = [];
    const classes = new Set();
    const select = {
      tagName: 'SELECT',
      isConnected: true,
      options: ['pilot', 'veteran', 'warden'],
      selectedIndex: 1,
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      dispatchEvent: (event) => changes.push(event.type),
      getBoundingClientRect: () => rect(0, 0),
    };
    const ui = menuNav(select);

    ui.handle('right');
    expect(select.selectedIndex).toBe(1);

    ui.handle('confirm');
    expect(classes.has('is-pad-editing')).toBe(true);
    ui.handle('right');
    expect(select.selectedIndex).toBe(2);
    expect(changes).toEqual(['change']);

    ui.handle('back');
    expect(classes.has('is-pad-editing')).toBe(false);
    expect(ui.editing).toBeNull();
  });

  it('takes the menu back to the title with B', () => {
    const emit = vi.fn();
    const ui = menuNav(null, { eventBus: { emit } });
    ui.handle('back');
    expect(emit).toHaveBeenCalledWith('gamepad-menu-back');
  });

  it('gives up waiting for a key with B', () => {
    const cancelBindingCapture = vi.fn();
    const ui = menuNav(null, {
      settingsPanel: {
        capturing: true,
        captureDevice: 'keyboard',
        cancelBindingCapture,
      },
    });
    ui.handle('back');
    expect(cancelBindingCapture).toHaveBeenCalledOnce();
  });
});
