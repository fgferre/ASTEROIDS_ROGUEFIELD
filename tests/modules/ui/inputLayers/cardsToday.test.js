import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARDS,
  mountScreens,
  pinTable,
} from '../../../__helpers__/screenRig.js';
import { listenForHold } from '../../../../src/modules/ui/skipHold.js';

// What the keyboard, the pad and a confirm on the bus do TODAY on the card
// screens (level-up, chest, flight briefing, the ending's choice) and with
// Settings over them, before one layer stack takes the input from the
// screens' global listeners. Each row: the input, then what changed (see
// screenRig.js `effects`). Rows the layer stack flipped (the input reached
// the screen below, or the refusal of d1014459 hid it) say what is now
// true; every other row must come out the same.
// A card taken: the cards leave and the flight is back (the pad's list has
// no screen up then).
const picked = (id) => ({
  top: null,
  screen: 'playing',
  levelUp: false,
  card: -1,
  picked: id,
});
const CHEST_DONE = { screen: 'playing', chest: false };
const BRIEFING_DONE = { screen: 'playing', briefing: false };

pinTable('level-up over the flight', (rig) => rig.open.levelUp(), [
  ['Digit1', { ...picked('a'), sent: {}, prevented: true }],
  ['Digit3', { ...picked('c'), sent: {}, prevented: true }],
  [
    'Enter',
    { ...picked('a'), sent: { 'input-confirmed': 1 }, prevented: false },
  ],
  [
    'Space',
    { ...picked('a'), sent: { 'input-confirmed': 1 }, prevented: false },
  ],
  ['ArrowRight', { focus: 'card:b', card: 1, sent: {}, prevented: true }],
  ['ArrowLeft', { focus: 'card:c', card: 2, sent: {}, prevented: true }],
  ['ArrowDown', { focus: 'card:b', card: 1, sent: {}, prevented: true }],
  ['KeyS', { focus: 'card:b', card: 1, sent: {}, prevented: true }],
  ['KeyR', { rerolls: 1, sent: {}, prevented: false }],
  ['KeyB', { banishing: true, sent: {}, prevented: false }],
  ['KeyH', { holding: true, sent: {}, prevented: false }],
  ['KeyQ', { sent: {}, prevented: false }],
  ['Escape', { sent: { 'toggle-pause': 1 }, prevented: false }],
  ['KeyP', { sent: { 'toggle-pause': 1 }, prevented: false }],
  [
    'F10',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
      prevented: false,
    },
    'Settings opens over it',
  ],
  [
    'pad:A',
    { ...picked('a'), pad: 'levelup:confirm', sent: { 'input-confirmed': 1 } },
  ],
  ['pad:B', { pad: 'levelup:back', sent: {} }],
  ['pad:X', { rerolls: 1, pad: 'levelup:reroll', sent: {} }],
  ['pad:Y', { banishing: true, pad: 'levelup:banish', sent: {} }],
  ['pad:LB', { holding: true, pad: 'levelup:tabPrev', sent: {} }],
  ['pad:RB', { pad: 'levelup:tabNext', sent: {} }],
  ['pad:RIGHT', { focus: 'card:b', card: 1, pad: 'levelup:right', sent: {} }],
  ['pad:DOWN', { focus: 'card:b', card: 1, pad: 'levelup:down', sent: {} }],
  ['pad:START', { sent: { 'toggle-pause': 1 } }],
  [
    'pad:VIEW',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
    },
    'Settings opens over it',
  ],
  ['bus:confirm', { ...picked('a'), sent: { 'input-confirmed': 1 } }],
]);

// Not in the pad's screen list: A reaches it only as the bus's confirm.
pinTable('chest over the flight', (rig) => rig.open.chest(), [
  [
    'Enter',
    { ...CHEST_DONE, sent: { 'input-confirmed': 1 }, prevented: false },
  ],
  [
    'Space',
    { ...CHEST_DONE, sent: { 'input-confirmed': 1 }, prevented: false },
  ],
  ['Digit1', { sent: {}, prevented: false }],
  ['Escape', { sent: { 'toggle-pause': 1 }, prevented: false }],
  [
    'F10',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
      prevented: false,
    },
    'Settings opens over it',
  ],
  ['pad:A', { ...CHEST_DONE, sent: { 'input-confirmed': 1 } }],
  ['pad:B', { sent: {} }],
  ['pad:START', { sent: { 'toggle-pause': 1 } }],
  [
    'pad:VIEW',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
    },
    'Settings opens over it',
  ],
  ['bus:confirm', { ...CHEST_DONE, sent: { 'input-confirmed': 1 } }],
]);

pinTable('flight briefing over the flight', (rig) => rig.open.briefing(), [
  [
    'Enter',
    {
      ...BRIEFING_DONE,
      sent: { 'input-confirmed': 1, 'modern-flight-engaged': 1 },
      prevented: false,
    },
  ],
  [
    'Space',
    {
      ...BRIEFING_DONE,
      sent: { 'input-confirmed': 1, 'modern-flight-engaged': 1 },
      prevented: false,
    },
  ],
  ['Digit1', { sent: {}, prevented: false }],
  ['Escape', { sent: { 'toggle-pause': 1 }, prevented: false }],
  [
    'F10',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
      prevented: false,
    },
  ],
  [
    'pad:A',
    {
      ...BRIEFING_DONE,
      sent: { 'input-confirmed': 1, 'modern-flight-engaged': 1 },
    },
  ],
  ['pad:B', { sent: {} }],
  [
    'bus:confirm',
    {
      ...BRIEFING_DONE,
      sent: { 'input-confirmed': 1, 'modern-flight-engaged': 1 },
    },
  ],
]);

pinTable("the ending's choice over the run", (rig) => rig.open.choice(), [
  [
    'Digit1',
    {
      top: null,
      choice: false,
      ending: 'severance',
      sent: {},
      prevented: true,
    },
  ],
  [
    'Digit2',
    {
      top: null,
      choice: false,
      ending: 'stewardship',
      sent: {},
      prevented: true,
    },
  ],
  ['ArrowRight', { focus: 'ending:stewardship', sent: {}, prevented: true }],
  ['ArrowLeft', { sent: {}, prevented: true }],
  ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
  ['Escape', { sent: { 'toggle-pause': 1 }, prevented: false }],
  [
    'F10',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
      prevented: false,
    },
    'Settings opens over it',
  ],
  [
    'pad:A',
    {
      top: null,
      choice: false,
      ending: 'severance',
      pad: 'press:ending',
      sent: { 'input-confirmed': 1 },
    },
  ],
  ['pad:B', { pad: 'back:ending', sent: {} }],
  ['pad:RIGHT', { pad: 'press:ending', sent: {} }],
  [
    'pad:VIEW',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
    },
    'Settings opens over it',
  ],
  ['bus:confirm', { sent: { 'input-confirmed': 1 } }],
]);

// Settings opened over the cards as F10 opens it off flight (the source the
// request carries). Before the layer stack their keys, the pad and the
// confirm reached the cards under it, and the pick left Settings open but
// hidden (showGameUI hid every screen): the original defect. Settings is on
// top now and keeps everything.
const CONFIRM_STOPS = 'the confirm stops at Settings, on top: nothing taken';
const UNDER = 'the screen under Settings hears nothing';
pinTable(
  'Settings forced open over the level-up',
  (rig) => {
    rig.open.levelUp();
    rig.ui.settingsPanel.openSettingsPanel('keyboard');
  },
  [
    ['Digit1', { sent: {}, prevented: false }, UNDER],
    [
      'Enter',
      { sent: { 'input-confirmed': 1 }, prevented: false },
      CONFIRM_STOPS,
    ],
    ['ArrowRight', { sent: {}, prevented: true }, UNDER],
    ['ArrowDown', { sent: {}, prevented: true }, UNDER],
    ['KeyR', { sent: {}, prevented: false }, UNDER],
    [
      'Escape',
      {
        top: 'levelup',
        focus: 'card:a',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    [
      'pad:A',
      { pad: 'press:settings', sent: { 'input-confirmed': 1 } },
      CONFIRM_STOPS,
    ],
    [
      'pad:B',
      {
        top: 'levelup',
        focus: 'card:a',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
    ['pad:X', { sent: {} }],
    ['pad:RIGHT', { pad: 'press:settings', sent: {} }, UNDER],
    ['bus:confirm', { sent: { 'input-confirmed': 1 } }, CONFIRM_STOPS],
  ]
);

pinTable(
  'Settings forced open over the chest',
  (rig) => {
    rig.open.chest();
    rig.ui.settingsPanel.openSettingsPanel('keyboard');
  },
  [
    [
      'Enter',
      { sent: { 'input-confirmed': 1 }, prevented: false },
      CONFIRM_STOPS,
    ],
    [
      'Escape',
      {
        top: null,
        focus: 'chest-screen',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    [
      'pad:A',
      { pad: 'press:settings', sent: { 'input-confirmed': 1 } },
      CONFIRM_STOPS,
    ],
    [
      'pad:B',
      {
        top: null,
        focus: 'chest-screen',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
    ['bus:confirm', { sent: { 'input-confirmed': 1 } }, CONFIRM_STOPS],
  ]
);

pinTable(
  "Settings forced open over the ending's choice",
  (rig) => {
    rig.open.choice();
    rig.ui.settingsPanel.openSettingsPanel('keyboard');
  },
  [
    ['Digit1', { sent: {}, prevented: false }, UNDER],
    ['ArrowRight', { sent: {}, prevented: true }, UNDER],
    ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
    [
      'Escape',
      {
        top: 'ending',
        focus: 'ending:severance',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    ['pad:A', { pad: 'press:settings', sent: { 'input-confirmed': 1 } }],
    [
      'pad:B',
      {
        top: 'ending',
        focus: 'ending:severance',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
    ['bus:confirm', { sent: { 'input-confirmed': 1 } }],
  ]
);

// No refusal here: the briefing's own is-settings-open check holds the
// confirm (lot 2), so nothing reaches it.
pinTable(
  'Settings over the flight briefing',
  (rig) => {
    rig.open.briefing();
    rig.open.settings();
  },
  [
    ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
    [
      'Escape',
      {
        top: null,
        focus: 'flight-screen',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    ['pad:A', { pad: 'press:settings', sent: { 'input-confirmed': 1 } }],
    [
      'pad:B',
      {
        top: null,
        focus: 'flight-screen',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
    ['bus:confirm', { sent: { 'input-confirmed': 1 } }],
  ]
);

describe('card screens, hidden rules today', () => {
  let rig;
  beforeEach(() => (rig = mountScreens()));
  afterEach(() => {
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });

  it('ignore input for 400 ms after the cards show', () => {
    rig.fly();
    rig.bus.emit('upgrade-options-ready', { level: 3, options: [{ id: 'a' }] });
    rig.tap('Digit1');
    rig.tap('Enter');
    expect(rig.progression.applyUpgrade).not.toHaveBeenCalled();
    rig.wait();
    rig.tap('Digit1');
    expect(rig.progression.applyUpgrade).toHaveBeenCalledWith('a');
  });

  it('a confirm goes to the briefing, the cards, then the chest: one pick opens the chest waiting, which keeps that confirm out by its lockout', () => {
    rig.open.levelUp();
    rig.bus.emit('chest-card', { id: 'a' });
    rig.bus.emit('chest-spent');
    expect(rig.ui.chestCeremony.isVisible).toBe(false); // waits for the pick

    rig.tap('Enter');
    expect(rig.progression.applyUpgrade).toHaveBeenCalledWith('a');
    expect(rig.ui.chestCeremony.isVisible).toBe(true);
    rig.tap('Enter');
    expect(rig.ui.chestCeremony.isVisible).toBe(true);
    rig.wait();
    rig.tap('Enter');
    expect(rig.ui.chestCeremony.isVisible).toBe(false);
  });

  it('the briefing waiting behind the cards heard that confirm first: it opens after the pick, untouched', async () => {
    rig.open.levelUp();
    rig.bus.emit('upgrade-modern-flight');
    expect(await rig.effects(() => rig.tap('Enter'))).toMatchObject({
      picked: 'a',
      briefing: true,
      sent: { 'input-confirmed': 1 },
    });
  });

  it('during a head start Q (or RB) arms "Equip for me" and the second press equips; Escape or B backs out of what is armed', () => {
    rig.headStart.progress = () => ({ pick: 1, total: 3 });
    const equip = vi.spyOn(rig.headStart, 'equipRest');
    rig.open.levelUp();
    rig.tap('KeyQ');
    expect(rig.ui.levelUpScreen.equipArmTimer).not.toBeNull();
    rig.tap('Escape');
    expect(rig.ui.levelUpScreen.equipArmTimer).toBeNull();
    rig.send('pad:RB');
    rig.tap('KeyQ');
    expect(equip).toHaveBeenCalledTimes(1);
    expect(rig.ui.levelUpScreen.levelUpState.isVisible).toBe(false);

    rig.open.levelUp();
    rig.tap('KeyB');
    rig.tap('Escape');
    expect(rig.ui.levelUpScreen.levelUpState.banishMode).toBe(false);
    rig.send('pad:Y');
    rig.send('pad:B');
    expect(rig.ui.levelUpScreen.levelUpState.banishMode).toBe(false);
    rig.send('pad:LB');
    expect(rig.ui.levelUpScreen.levelUpState.holdMode).toBe(true);
  });

  it('a held key repeats nothing: no card, no confirm, no ending', () => {
    rig.open.levelUp();
    rig.keyDown('Digit1', { repeat: true });
    rig.keyDown('Enter', { repeat: true });
    expect(rig.progression.applyUpgrade).not.toHaveBeenCalled();
    expect(rig.count('input-confirmed')).toBe(0);

    rig.ui.levelUpScreen.resetLevelUpState();
    rig.open.choice();
    rig.keyDown('Digit1', { repeat: true });
    expect(rig.ui.runEndScreens.choice).not.toBeNull();
  });

  it('a Space held from flight into the cards picks nothing and its release is held back; a fresh Space picks', () => {
    rig.fly();
    expect(rig.keyDown('Space').defaultPrevented).toBe(true); // the strafe
    rig.bus.emit('upgrade-options-ready', { level: 3, options: [{ id: 'a' }] });
    rig.wait();

    expect(rig.keyDown('Space', { repeat: true }).defaultPrevented).toBe(true);
    expect(rig.keyUp('Space').defaultPrevented).toBe(true);
    expect(rig.progression.applyUpgrade).not.toHaveBeenCalled();
    expect(rig.tap('Space').defaultPrevented).toBe(false);
    expect(rig.progression.applyUpgrade).toHaveBeenCalledWith('a');
  });
});

// The original losses (outside audit 8, B7), now with Settings opened by F10
// over each choice: no key, pad button or confirm that chooses there chooses
// anything under it, and Escape gives the choice back as it was, shown.
const CHOICES = [
  ['the level-up', (rig) => rig.open.levelUp(), 'levelup'],
  ['the chest', (rig) => rig.open.chest(), 'chest'],
  ["the ending's choice", (rig) => rig.open.choice(), 'ending'],
];
const EVERY_PICK = [
  'Digit1',
  'Digit2',
  'Enter',
  'Space',
  'ArrowRight',
  'KeyR',
  'KeyB',
  'KeyH',
  'KeyQ',
  'pad:A',
  'pad:X',
  'pad:Y',
  'pad:LB',
  'pad:RIGHT',
  'bus:confirm',
];

describe('Settings open over a choice', () => {
  let rig;
  beforeEach(() => (rig = mountScreens()));
  afterEach(() => {
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });
  const shown = (id) =>
    !rig.dom.document
      .getElementById(`${id}-screen`)
      .classList.contains('hidden');
  // Everything but the pad's own record of where its presses went.
  const state = () => {
    const { pad: _pad, ...rest } = rig.snapshot();
    return rest;
  };

  it.each(CHOICES)(
    'over %s, nothing is chosen under it; closing Settings gives it back intact and shown',
    (_name, open, id) => {
      open(rig);
      const before = state();
      rig.tap('F10');
      expect(rig.snapshot()).toMatchObject({ settings: true, top: 'settings' });
      EVERY_PICK.forEach((input) => rig.send(input));
      rig.wait();
      rig.tap('Escape');
      expect(state()).toEqual(before);
      expect(shown(id)).toBe(true);
    }
  );

  it('a screen change under it (a card taken, back to play) leaves Settings open and shown', () => {
    rig.open.levelUp();
    rig.tap('F10');
    rig.ui.showGameUI();
    expect(rig.snapshot()).toMatchObject({ settings: true, top: 'settings' });
    expect(shown('settings')).toBe(true);
  });

  it("opened before the choice's options wake, it keeps the focus: Enter chooses no ending unseen", () => {
    rig.fly();
    rig.state.screen = 'victory';
    rig.state.sessionState = 'victory';
    rig.ui.runEndScreens.showEndingChoice({ data: {} });
    rig.tap('F10');
    rig.wait();
    expect(rig.snapshot().focus).toBe('settings:game');
    rig.send('Enter+click');
    expect(rig.snapshot()).toMatchObject({ choice: true, ending: '' });
  });

  // A choice that shows while Settings is up goes under it.
  it('the cards that come after a scene Settings was opened over wait under it; nothing takes one', () => {
    rig.fly();
    rig.state.paused = true;
    const stop = listenForHold(
      () => {},
      () => {}
    );
    rig.bus.emit('cinematic-started', { kind: 'intro', holdsRun: true });
    rig.send('pad:VIEW');
    stop();
    rig.bus.emit('cinematic-ended', { kind: 'intro' });
    rig.state.paused = false;
    rig.wait(1);
    rig.bus.emit('upgrade-options-ready', {
      level: 3,
      options: CARDS.map((id) => ({ id })),
    });
    rig.wait();
    expect(rig.snapshot()).toMatchObject({ top: 'settings', levelUp: true });
    ['Digit1', 'Enter+click', 'pad:A', 'bus:confirm'].forEach((input) =>
      rig.send(input)
    );
    expect(rig.snapshot().picked).toBe('');
    rig.tap('Escape');
    expect(rig.snapshot()).toMatchObject({ top: 'levelup', levelUp: true });
  });

  it('opened as a picked card leaves (motion on), it stays on top and the run waits paused under it; closing it resumes', () => {
    rig.dom.document.body.classList.remove('motion-reduced');
    rig.dom.window.matchMedia = () => ({ matches: false });
    rig.open.levelUp();
    rig.tap('Digit1');
    rig.tap('F10');
    rig.wait(2000);
    expect(rig.snapshot()).toMatchObject({
      top: 'settings',
      screen: 'playing',
      pause: true,
    });
    expect(rig.state.paused).toBe(true);
    rig.tap('Escape');
    expect(rig.state.paused).toBe(false);
  });

  it('the victory that shows while it is up goes under it and takes no focus: Enter presses nothing on it', () => {
    rig.fly();
    rig.state.screen = 'victory';
    rig.state.sessionState = 'victory';
    rig.tap('F10');
    rig.bus.emit('screen-changed', { screen: 'victory', data: {} });
    rig.wait();
    expect(rig.snapshot()).toMatchObject({
      top: 'settings',
      focus: 'settings:game',
    });
    rig.send('Enter+click');
    expect(rig.snapshot().session).toBe('');
  });

  it('the HUD editor opened from it over the cards: no key, pad button or confirm takes a card', () => {
    rig.open.levelUp();
    rig.tap('F10');
    rig.ui.openHudEditor();
    expect(rig.ui.hudEditor.isOpen).toBe(true);
    ['Digit1', 'Enter', 'ArrowRight', 'pad:A', 'bus:confirm'].forEach((input) =>
      rig.send(input)
    );
    expect(rig.snapshot()).toMatchObject({
      levelUp: true,
      card: 0,
      picked: '',
    });
  });
});

describe('the cards take their own keys', () => {
  let rig;
  beforeEach(() => (rig = mountScreens()));
  afterEach(() => {
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });

  it('a card picked by its key fires no flight press bound to that key in the run it resumes', () => {
    const dash = rig.ui.settings.getSetting('controls', 'dash');
    rig.ui.settings.setSetting('controls', 'dash', {
      ...dash,
      keyboard: ['Digit1'],
    });
    rig.fly();
    rig.tap('Digit1');
    expect([...rig.input.pendingStepPresses]).toEqual(['dash']);
    rig.input.pendingStepPresses.clear();

    rig.open.levelUp();
    rig.tap('Digit1');
    expect(rig.snapshot()).toMatchObject({ picked: 'a', screen: 'playing' });
    expect([...rig.input.pendingStepPresses]).toEqual([]);
  });
});
