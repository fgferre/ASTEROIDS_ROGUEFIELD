import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountScreens, pinTable } from '../../../__helpers__/screenRig.js';

// What the keyboard, the pad and a confirm on the bus do TODAY on the menus
// (the campaign map, Settings, Codex, Hangar, Credits, the title gate and
// the pilots), before one layer stack takes the input from the screens'
// global listeners. Each row: the input, then what changed (see
// screenRig.js `effects`). The one leak here (Escape, while a binding
// waited, reached the Hangar under Settings) is gone with the layer stack:
// its row says what is now true; every other row must come out the same.
const focus = (rig, id) => rig.dom.document.getElementById(id).focus();

// Heard on the way down (capture), and only on a focused chapter or row.
pinTable(
  'menu, focus on a campaign chapter',
  (rig) => focus(rig, 'chapter-1'),
  [
    ['ArrowRight', { map: 'stepChapter(1)', sent: {}, prevented: true }],
    ['ArrowDown', { map: 'focusRow(null)', sent: {}, prevented: true }],
    ['ArrowLeft', { map: 'stepChapter(-1)', sent: {}, prevented: true }],
    ['Escape', { sent: { 'toggle-pause': 1 }, prevented: false }],
    ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
    ['pad:B', { pad: 'back:menu', sent: { 'gamepad-menu-back': 1 } }],
    ['pad:DOWN', { pad: 'press:menu', sent: {} }],
    [
      'pad:RB',
      { focus: 'campaign-launch-btn', pad: 'cycleTab:menu', sent: {} },
    ],
  ]
);

pinTable(
  'menu, focus on a campaign row',
  (rig) => focus(rig, 'row-debris-wake'),
  [
    ['ArrowDown', { map: 'stepRow(1)', sent: {}, prevented: true }],
    ['ArrowUp', { map: 'stepRow(-1)', sent: {}, prevented: true }],
  ]
);

// Settings takes the focus: the map's arrows find no chapter focused.
pinTable(
  'Settings over the menu',
  (rig) => {
    focus(rig, 'chapter-1');
    rig.open.settings();
  },
  [
    [
      'Escape',
      {
        top: 'menu',
        focus: 'chapter:1',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    ['ArrowRight', { sent: {}, prevented: true }],
    ['ArrowDown', { sent: {}, prevented: true }],
    ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
    [
      'pad:B',
      {
        top: 'menu',
        focus: 'chapter:1',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
    [
      'pad:RB',
      { focus: 'settings:controls', pad: 'cycleTab:settings', sent: {} },
    ],
  ]
);

pinTable('Codex over the menu', (rig) => rig.open.codex(), [
  [
    'Escape',
    {
      top: 'menu',
      focus: 'body',
      codex: false,
      sent: { 'toggle-pause': 1 },
      prevented: true,
    },
  ],
  [
    'ArrowRight',
    {
      focus: 'codex-tab-achievements',
      codex: 'achievements',
      sent: {},
      prevented: true,
    },
  ],
  [
    'ArrowLeft',
    {
      focus: 'codex-tab-achievements',
      codex: 'achievements',
      sent: {},
      prevented: true,
    },
  ],
  ['ArrowDown', { sent: {}, prevented: true }],
  [
    'pad:B',
    { top: 'menu', focus: 'body', codex: false, pad: 'back:codex', sent: {} },
  ],
  [
    'pad:RB',
    {
      focus: 'codex-tab-achievements',
      codex: 'achievements',
      pad: 'cycleTab:codex',
      sent: {},
    },
  ],
]);

// The Codex's own is-settings-open check (lot 2) holds its arrows.
pinTable(
  'Settings over the Codex',
  (rig) => {
    rig.open.codex();
    rig.open.settings();
  },
  [
    [
      'Escape',
      {
        top: 'codex',
        focus: 'codex-back-btn',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    ['ArrowRight', { sent: {}, prevented: true }],
    [
      'pad:B',
      {
        top: 'codex',
        focus: 'codex-back-btn',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
  ]
);

pinTable('Hangar over the menu', (rig) => rig.open.hangar(), [
  [
    'Escape',
    {
      top: 'menu',
      focus: 'body',
      hangar: false,
      sent: { 'toggle-pause': 1 },
      prevented: true,
    },
  ],
  [
    'pad:B',
    { top: 'menu', focus: 'body', hangar: false, pad: 'back:hangar', sent: {} },
  ],
]);

pinTable(
  'Settings over the Hangar',
  (rig) => {
    rig.open.hangar();
    rig.open.settings();
  },
  [
    [
      'Escape',
      {
        top: 'hangar',
        focus: 'hangar-back-btn',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    [
      'pad:B',
      {
        top: 'hangar',
        focus: 'hangar-back-btn',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
  ]
);

pinTable('Credits over the menu', (rig) => rig.open.credits(), [
  [
    'Escape',
    {
      top: 'menu',
      credits: false,
      sent: { 'toggle-pause': 1 },
      prevented: true,
    },
  ],
  ['pad:B', { top: 'menu', credits: false, pad: 'back:credits', sent: {} }],
]);

pinTable(
  'Settings over the Credits',
  (rig) => {
    rig.open.credits();
    rig.open.settings();
  },
  [
    [
      'Escape',
      {
        top: 'credits',
        focus: 'credits-back-btn',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    [
      'pad:B',
      {
        top: 'credits',
        focus: 'credits-back-btn',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
  ]
);

// A binding waiting for its key takes every key (Settings, on top of the
// layer stack): Escape becomes the binding, and the Hangar under it no
// longer hears it (it closed too, before the stack).
pinTable(
  'Settings waiting for a key, over the Hangar',
  (rig) => {
    rig.open.hangar();
    rig.open.settings();
    rig.ui.settingsPanel.switchSettingsSection('controls');
    rig.ui.domRefs.settings.container
      .querySelector('[data-action="capture-binding"]')
      .click();
  },
  [
    [
      'Escape',
      { capturing: false, sent: {}, prevented: true },
      'the binding takes it, the Hangar stays open',
    ],
    [
      'Enter',
      { capturing: false, sent: {}, prevented: true },
      'the binding takes it, no button pressed by default',
    ],
  ]
);

// Escape (or the pad's B) on the menu with nothing over it: back to the
// gate. Its check runs first (window capture) and asks whether any screen
// is on top; with one, that screen's own Escape closes it, and only that.
pinTable('the title gate watching the menu', (rig) => rig.open.gate(), [
  [
    'Escape',
    {
      top: null,
      focus: 'press-start-btn',
      gate: true,
      sent: { 'toggle-pause': 1 },
      prevented: false,
    },
  ],
  ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
  [
    'pad:B',
    {
      top: null,
      focus: 'press-start-btn',
      pad: 'back:menu',
      gate: true,
      sent: { 'gamepad-menu-back': 1 },
    },
  ],
]);

pinTable(
  'the title gate, Codex open',
  (rig) => {
    rig.open.gate();
    rig.open.codex();
  },
  [
    [
      'Escape',
      {
        top: 'menu',
        focus: 'chapter:1',
        codex: false,
        sent: { 'toggle-pause': 1 },
        prevented: true,
      },
    ],
  ]
);

pinTable(
  'the title gate, Settings open',
  (rig) => {
    rig.open.gate();
    rig.open.settings();
  },
  [
    [
      'Escape',
      {
        top: 'menu',
        focus: 'chapter:1',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
  ]
);

pinTable(
  'the title gate, Hangar open',
  (rig) => {
    rig.open.gate();
    rig.open.hangar();
  },
  [
    [
      'Escape',
      {
        top: 'menu',
        focus: 'chapter:1',
        hangar: false,
        sent: { 'toggle-pause': 1 },
        prevented: true,
      },
    ],
  ]
);

// On the gate itself: Enter starts (after its 1 s effect); no screen of the
// pad's list is up.
pinTable(
  'the title gate, back on it',
  (rig) => {
    rig.open.gate();
    rig.tap('Escape');
  },
  [
    ['Enter', { sent: { 'input-confirmed': 1 }, prevented: true }],
    ['Escape', { sent: { 'toggle-pause': 1 }, prevented: false }],
    ['pad:B', { sent: {} }],
  ]
);

// The pilots stop their keys on the document's way down (capture): the
// game never hears Enter, Space, Escape or the side arrows; ArrowDown and S
// reach it first (its password-manager stop, bound earlier). Its pad is
// read by its own frame loop.
pinTable(
  'pilots over the gated menu',
  (rig) => rig.open.gate({ pilots: true }),
  [
    [
      'Enter',
      {
        top: 'menu',
        focus: 'chapter:1',
        pilots: false,
        sent: {},
        prevented: true,
      },
    ],
    [
      'Space',
      {
        top: 'menu',
        focus: 'chapter:1',
        pilots: false,
        sent: {},
        prevented: true,
      },
    ],
    [
      'Escape',
      {
        focus: 'press-start-btn',
        gate: true,
        pilots: false,
        sent: {},
        prevented: true,
      },
    ],
    ['ArrowDown', { focus: 'pilot:2', sent: {}, prevented: true }],
    ['ArrowRight', { focus: 'pilot:2', sent: {}, prevented: true }],
    ['KeyS', { sent: {}, prevented: true }],
    ['Digit1', { sent: {}, prevented: false }],
    [
      'pad:B',
      { focus: 'press-start-btn', gate: true, pilots: false, sent: {} },
    ],
  ]
);

describe('menus, hidden rules today', () => {
  let rig;
  beforeEach(() => (rig = mountScreens()));
  afterEach(() => {
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });

  it('S and the down arrow stop at the document on the way down (password managers): a bubbling listener never hears them, a capturing one does; in a text field they pass', () => {
    const { document, el } = rig.dom;
    const heard = [];
    document.addEventListener('keydown', (e) => heard.push(`bubble ${e.code}`));
    document.addEventListener(
      'keydown',
      (e) => heard.push(`capture ${e.code}`),
      true
    );
    ['KeyS', 'ArrowDown', 'ArrowUp'].forEach((code) => rig.tap(code));
    expect(heard).toEqual([
      'capture KeyS',
      'capture ArrowDown',
      'capture ArrowUp',
      'bubble ArrowUp',
    ]);

    heard.length = 0;
    el(
      'input',
      { type: 'text' },
      document.getElementById('menu-screen')
    ).focus();
    rig.tap('KeyS');
    expect(heard).toEqual(['capture KeyS', 'bubble KeyS']);
  });

  // No default actions here: in the browser Enter (and Space) also press
  // the focused button (a campaign row's keyboard click launches it).
  it("the focused button Enter or Space would press: each panel's Back", () => {
    rig.open.codex();
    expect(rig.snapshot().focus).toBe('codex-back-btn');
    rig.ui.codexScreen.closeCodex();
    rig.open.hangar();
    expect(rig.snapshot().focus).toBe('hangar-back-btn');
    rig.ui.hangarScreen.closeHangar();
    rig.open.credits();
    expect(rig.snapshot().focus).toBe('credits-back-btn');
  });

  it('the campaign map does not move while the menu is out of view', async () => {
    focus(rig, 'chapter-1');
    rig.fly();
    expect(await rig.effects(() => rig.tap('ArrowRight'))).toEqual({
      sent: {},
      prevented: true,
    });
  });
});
