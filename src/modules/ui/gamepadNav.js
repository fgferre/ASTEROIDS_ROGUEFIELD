// src/modules/ui/gamepadNav.js

// Gamepad focus navigation for menus and overlays (R6.1; console-style
// highlight, Felipe's card controle-1, 20/11): the d-pad or left stick moves
// the focus to the nearest control in that direction, A presses it, B goes
// back, LB/RB switch tabs, the right stick scrolls, and a strip of hints names
// the buttons that work on the screen. Driven by UISystem's 'gamepad-ui-nav'
// and 'gamepad-ui-scroll' (InputSystem).

import { inputLayers } from '../input/inputLayers.js';

/** Screens a pad can navigate, topmost first (`#<id>-screen`), under the
 * top layer of the input layer stack: the screens not on it yet go by this
 * list. */
export const GAMEPAD_NAV_SCREENS = Object.freeze([
  'settings',
  'end-credits',
  'codex',
  'hangar',
  'credits',
  'changelog',
  'gameover',
  'levelup',
  'pause',
  'ending',
  'victory',
  'menu',
]);

export const GAMEPAD_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// The menu's Launch of the mode shown: where the highlight starts.
const MENU_HOME_SELECTOR = '.prep-launch__btn:not([disabled])';
// In a list, controls this close below the nearest one share its row (px).
const ROW_BAND = 12;
// Right stick: pixels scrolled per polled frame at full tilt.
const SCROLL_STEP = 14;
const STEP_ACTIONS = new Set(['up', 'down', 'left', 'right']);

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const box = (rect) => ({
  left: rect.left,
  top: rect.top,
  right: rect.left + rect.width,
  bottom: rect.top + rect.height,
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

// The gap between two spans on one axis; 0 when they overlap.
const spanGap = (a0, a1, b0, b1) => Math.max(0, b0 - a1, a0 - b1);

/**
 * Index of the candidate rect to focus from `from` going `direction`
 * ('up' | 'down' | 'left' | 'right'), or -1 when nothing lies that way.
 * Without a current rect the first candidate is picked. Edges, not centres:
 * a wide row under a small tab is straight below it, and the gap off the
 * axis weighs double, so a grid moves along its rows and columns. `rows`:
 * a scrolling list, where up and down step row by row.
 */
export function pickFocusTarget(from, candidates, direction, rows = false) {
  if (!from) {
    return candidates.length > 0 ? 0 : -1;
  }
  const axis = DIRECTIONS[direction];
  if (!axis) {
    return -1;
  }
  const a = box(from);
  const ahead = [];
  candidates.forEach((rect, index) => {
    const b = box(rect);
    if ((b.x - a.x) * axis.x + (b.y - a.y) * axis.y <= 1) {
      return;
    }
    // Side by side on this axis (mostly overlapping along it): not ahead.
    const [a0, a1, b0, b1] = axis.x
      ? [a.left, a.right, b.left, b.right]
      : [a.top, a.bottom, b.top, b.bottom];
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap > Math.min(a1 - a0, b1 - b0) / 2) {
      return;
    }
    const along = Math.max(
      0,
      axis.x > 0
        ? b.left - a.right
        : axis.x < 0
          ? a.left - b.right
          : axis.y > 0
            ? b.top - a.bottom
            : a.top - b.bottom
    );
    const across = axis.x
      ? spanGap(a.top, a.bottom, b.top, b.bottom)
      : spanGap(a.left, a.right, b.left, b.right);
    // Ties between overlapping rows: the one lined up (by its start or its
    // centre) with the current control.
    const offset = axis.x
      ? Math.min(Math.abs(b.y - a.y), Math.abs(b.top - a.top))
      : Math.min(Math.abs(b.x - a.x), Math.abs(b.left - a.left));
    ahead.push({ index, along, across, offset });
  });
  // In a list (`rows`), up and down go to the next row, then to the control
  // in it nearest across: a small box at a row's end is not skipped.
  const nearest = Math.min(...ahead.map((entry) => entry.along));
  let best = -1;
  let bestScore = Infinity;
  ahead.forEach(({ index, along, across, offset }) => {
    const score =
      rows && axis.y
        ? along > nearest + ROW_BAND
          ? Infinity
          : across * 2 + offset * 0.01
        : along + across * 2 + offset * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

// Laid out and shown: not in a closed <details> nor under visibility:hidden.
const visible = (element) =>
  element.getClientRects().length > 0 &&
  (element.checkVisibility?.({ visibilityProperty: true }) ?? true);

/** The menu's Launch for the mode shown, when it can be pressed. */
export function menuHome(menuScreen) {
  return (
    [...(menuScreen?.querySelectorAll(MENU_HOME_SELECTOR) ?? [])].find(
      visible
    ) ?? null
  );
}

function scrollable(element) {
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  return /(auto|scroll)/.test(getComputedStyle(element).overflowY);
}

/** The nearest scrolling box around `element`, inside `root`, or null. */
function scrollerOf(element, root) {
  for (
    let node = element.parentElement;
    node && node !== root;
    node = node.parentElement
  ) {
    if (scrollable(node)) return node;
  }
  return null;
}

// The buttons each screen answers besides A; `[glyphs, label]`.
const HINTS = {
  menu: [
    ['B', 'Title'],
    ['LB RB', 'Mode'],
  ],
  hangar: [
    ['B', 'Back'],
    ['LB RB', 'Tab'],
  ],
  codex: [
    ['B', 'Back'],
    ['LB RB', 'Tab'],
  ],
  settings: [
    ['B', 'Back'],
    ['LB RB', 'Section'],
  ],
  credits: [['B', 'Back']],
  changelog: [['B', 'Back']],
  pause: [['B', 'Resume']],
  'end-credits': [['B', 'Continue']],
};

const hintMarkup = ([glyphs, label]) =>
  `<span class="pad-hints__item">${glyphs
    .split(' ')
    .map(
      (key) =>
        `<i class="pad-hints__glyph${key.length > 1 ? ' pad-hints__glyph--wide' : ''}">${key}</i>`
    )
    .join('')}${label}</span>`;

/**
 * The pad's side of every menu and overlay. `ui` is the UISystem: its
 * screens (settingsPanel, codexScreen, hangarScreen, creditsOverlay,
 * mainMenu, runEndScreens, hudEditor) and its eventBus.
 */
export class GamepadMenuNav {
  constructor(ui) {
    this.ui = ui;
    // A <select> whose value the d-pad changes, entered and left with A.
    this.editing = null;
    this.hints = null;
  }

  /** The screen a pad navigates: the input layer stack's top
   * (input/inputLayers.js) when it is shown, with its `layer`; with none on
   * the stack, the first of the list shown; or null (also while the PRESS
   * START gate or the pilots cover the menu: they read the pad; and while
   * the remote link covers it, inert: the run is starting). */
  screen() {
    const shown = (element) =>
      element &&
      !element.inert &&
      !element.classList.contains('hidden') &&
      !element.classList.contains('menu-screen--gated');
    const layer = inputLayers.top();
    if (layer) {
      return shown(layer.element)
        ? { id: layer.name, element: layer.element, layer }
        : null;
    }
    for (const id of GAMEPAD_NAV_SCREENS) {
      const element = document.getElementById(`${id}-screen`);
      if (shown(element)) return { id, element };
    }
    return null;
  }

  /** One pad press (InputSystem 'gamepad-ui-nav'): d-pad/stick move the
   * focus, A presses, B goes back, LB/RB switch tabs; a layer with its own
   * pad map takes the press instead (the level-up's X/Y reroll and banish,
   * its cards following the move and confirm bindings). */
  handle(action) {
    const { ui } = this;
    // The HUD editor drives its instruments; its dialogs and panels move
    // the focus like any screen.
    if (ui.hudEditor.isOpen) {
      const root = ui.hudEditor.navRoot;
      if (root && (STEP_ACTIONS.has(action) || action === 'confirm')) {
        this.press(root, action);
      } else {
        ui.hudEditor.handlePadNav(action);
      }
      return;
    }
    const screen = this.screen();
    if (!screen) return;
    if (ui.settingsPanel.capturing) {
      // Waiting for a key: B gives up (a pad binding takes any button).
      if (action === 'back' && ui.settingsPanel.captureDevice === 'keyboard') {
        ui.settingsPanel.cancelBindingCapture();
        this.refreshHints();
      }
      return;
    }
    const { id, element, layer } = screen;
    if (layer?.onPad) {
      layer.onPad(action);
      return;
    }
    if (this.editing && !this.editing.isConnected) this.editing = null;
    if (this.editing) {
      this.edit(action);
      return;
    }

    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
      case 'confirm':
        this.press(element, action);
        break;
      case 'back':
        this.back(id);
        break;
      case 'tabPrev':
      case 'tabNext':
        this.cycleTab(id, element, action === 'tabPrev' ? -1 : 1);
        break;
      default:
        break;
    }
    this.refreshHints();
  }

  back(id) {
    const { ui } = this;
    if (id === 'settings') ui.settingsPanel.closeSettingsPanel();
    else if (id === 'codex') ui.codexScreen.closeCodex();
    else if (id === 'hangar') ui.hangarScreen.closeHangar();
    else if (id === 'credits') {
      ui.creditsOverlay.closeCreditsOverlay({ restoreFocus: true });
    } else if (id === 'changelog') {
      ui.changelogOverlay.closeCreditsOverlay({ restoreFocus: true });
    } else if (id === 'pause') ui.eventBus?.emit?.('toggle-pause');
    else if (id === 'end-credits') ui.runEndScreens.endCredits.finish();
    else if (id === 'menu') ui.eventBus?.emit?.('gamepad-menu-back');
  }

  cycleTab(id, element, step) {
    const { ui } = this;
    if (id === 'codex') ui.codexScreen.cycleTab(step);
    else if (id === 'settings') ui.settingsPanel.cycleCategory(step);
    else if (id === 'hangar') ui.hangarScreen.cycleTab(step);
    else if (id === 'menu') {
      const tab = ui.mainMenu.cyclePrepTab(step);
      (menuHome(element) ?? tab)?.focus();
    }
  }

  /** A d-pad move or A in `root`: the focus moves, or the focused control
   * is pressed (a list is entered, for the d-pad to change it). */
  press(root, action) {
    if (action !== 'confirm') {
      this.move(root, action);
      return;
    }
    const active = document.activeElement;
    if (!active || !root.contains(active) || active === root) {
      this.move(root, null);
    } else if (active.tagName === 'SELECT') {
      this.editing = active;
      active.classList.add('is-pad-editing');
    } else {
      active.click();
    }
  }

  /** The d-pad steps the list being edited; A or B leaves it. */
  edit(action) {
    const select = this.editing;
    if (action === 'confirm' || action === 'back') {
      select.classList.remove('is-pad-editing');
      this.editing = null;
      this.refreshHints();
      return;
    }
    if (!STEP_ACTIONS.has(action)) return;
    const step = action === 'left' || action === 'up' ? -1 : 1;
    const count = select.options.length;
    select.selectedIndex = (select.selectedIndex + step + count) % count;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // The menu rebuilds its list on a change: keep editing the new one.
    const rebuilt = select.id && document.getElementById(select.id);
    if (rebuilt && rebuilt !== select) {
      this.editing = rebuilt;
      rebuilt.classList.add('is-pad-editing');
      rebuilt.focus();
    }
  }

  /** Focus the nearest control `direction` of the focused one (null: the
   * menu's Launch, else the screen's first). Sliders take left/right. */
  move(root, direction) {
    const active = document.activeElement;
    const current = active && root.contains(active) ? active : null;
    if (
      current?.type === 'range' &&
      (direction === 'left' || direction === 'right')
    ) {
      if (direction === 'left') current.stepDown();
      else current.stepUp();
      current.dispatchEvent(new Event('input', { bubbles: true }));
      current.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const home = current ? null : menuHome(root);
    if (home) {
      home.focus();
      return;
    }
    // A scrolling panel that holds controls is not a stop of its own.
    const all = [...root.querySelectorAll(GAMEPAD_FOCUSABLE_SELECTOR)];
    const candidates = all.filter(
      (candidate) =>
        candidate !== current &&
        visible(candidate) &&
        !all.some((other) => other !== candidate && candidate.contains(other))
    );
    // Inside a scrolling list, its own controls first (rows scrolled out of
    // sight), before a footer laid over it.
    const scroller = current && scrollerOf(current, root);
    const pools = scroller
      ? [
          candidates.filter((candidate) => scroller.contains(candidate)),
          candidates,
        ]
      : [candidates];
    for (const pool of pools) {
      const index = pickFocusTarget(
        current?.getBoundingClientRect() ?? null,
        pool.map((candidate) => candidate.getBoundingClientRect()),
        direction,
        pool !== candidates
      );
      if (index >= 0) {
        pool[index].focus();
        pool[index].scrollIntoView?.({ block: 'nearest' });
        return;
      }
    }
  }

  /** Right stick (InputSystem 'gamepad-ui-scroll'): the list or text under
   * the focus scrolls, else the screen's longest one. */
  scroll(dy) {
    const screen = this.screen();
    if (!screen || !dy) return;
    const active = document.activeElement;
    let target =
      active && screen.element.contains(active)
        ? scrollerOf(active, screen.element.parentElement)
        : null;
    if (!target) {
      let most = 0;
      screen.element.querySelectorAll('*').forEach((node) => {
        const overflow = node.scrollHeight - node.clientHeight;
        if (overflow > most && visible(node) && scrollable(node)) {
          most = overflow;
          target = node;
        }
      });
    }
    target?.scrollBy?.(0, dy * SCROLL_STEP);
  }

  /** The strip naming the buttons that work here, while the pad is used. */
  refreshHints() {
    if (typeof document === 'undefined' || !document.body) return;
    if (!this.hints) {
      this.hints = document.createElement('div');
      this.hints.id = 'pad-hints';
      this.hints.className = 'pad-hints';
      document.body.appendChild(this.hints);
    }
    const screen = this.screen();
    const shown =
      document.body.dataset.inputDevice === 'gamepad' &&
      Boolean(screen) &&
      screen.id !== 'levelup' &&
      !this.ui.hudEditor.isOpen;
    this.hints.hidden = !shown;
    if (!shown) return;
    const { settingsPanel } = this.ui;
    const active = document.activeElement;
    let items;
    if (settingsPanel.capturing) {
      items =
        settingsPanel.captureDevice === 'keyboard' ? [['B', 'Cancel']] : [];
    } else if (this.editing) {
      items = [
        ['◀ ▶', 'Change'],
        ['A', 'Done'],
      ];
    } else {
      const press =
        active?.tagName === 'SELECT'
          ? 'Change'
          : screen.id === 'end-credits'
            ? 'Continue'
            : 'Select';
      // The pad's pointer (padPointer.js) works on every screen but the
      // credits that roll.
      const sticks =
        screen.id === 'end-credits'
          ? []
          : [
              ['L-Stick', 'Point'],
              ['R-Stick', 'Scroll'],
            ];
      items = [['A', press], ...(HINTS[screen.id] ?? []), ...sticks];
      if (active?.type === 'range') items.unshift(['◀ ▶', 'Adjust']);
    }
    this.hints.dataset.screen = screen.id;
    this.hints.innerHTML = items.map(hintMarkup).join('');
  }

  /** Hints follow the screens opening and closing, whatever opened them;
   * a list being edited is left when the focus goes elsewhere. */
  watchScreens() {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => this.refreshHints());
    for (const id of GAMEPAD_NAV_SCREENS) {
      const element = document.getElementById(`${id}-screen`);
      if (element) {
        observer.observe(element, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }
    }
    document.addEventListener('focusin', () => {
      if (this.editing && document.activeElement !== this.editing) {
        this.editing.classList.remove('is-pad-editing');
        this.editing = null;
      }
      if (document.body.dataset.inputDevice === 'gamepad') this.refreshHints();
    });
  }
}
