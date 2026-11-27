import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountScreens, pinTable } from '../../../__helpers__/screenRig.js';

// What the keyboard, the pad and a confirm on the bus do TODAY on the card
// screens (level-up, chest, flight briefing, the ending's choice) and with
// Settings over them, before one layer stack takes the input from the
// screens' global listeners. Each row: the input, then what changed (see
// screenRig.js `effects`). Rows named "LEAK today" are the input reaching
// the screen below, or the refusal (d1014459) that hides it: the stack
// flips exactly those; every other row must come out the same.
const LEAK = true;
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
  ['F10', { sent: { 'settings-menu-requested': 1 }, prevented: false }, LEAK],
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
  ['pad:VIEW', { sent: { 'settings-menu-requested': 1 } }, LEAK],
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
  ['F10', { sent: { 'settings-menu-requested': 1 }, prevented: false }, LEAK],
  ['pad:A', { ...CHEST_DONE, sent: { 'input-confirmed': 1 } }],
  ['pad:B', { sent: {} }],
  ['pad:START', { sent: { 'toggle-pause': 1 } }],
  ['pad:VIEW', { sent: { 'settings-menu-requested': 1 } }, LEAK],
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
  ['F10', { sent: { 'settings-menu-requested': 1 }, prevented: false }, LEAK],
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
  ['pad:VIEW', { sent: { 'settings-menu-requested': 1 } }, LEAK],
  ['bus:confirm', { sent: { 'input-confirmed': 1 } }],
]);

// The refusal keeps Settings shut over the cards (rows F10 and pad:VIEW
// above); opened past it, as it would open without the refusal (the source
// the request carries off flight). The pick leaves Settings open but hidden
// (showGameUI hides every screen): the original defect.
pinTable(
  'Settings forced open over the level-up',
  (rig) => {
    rig.open.levelUp();
    rig.ui.settingsPanel.openSettingsPanel('keyboard');
  },
  [
    ['Digit1', { ...picked('a'), sent: {}, prevented: true }, LEAK],
    [
      'Enter',
      { ...picked('a'), sent: { 'input-confirmed': 1 }, prevented: false },
      LEAK,
    ],
    [
      'ArrowRight',
      { focus: 'card:b', card: 1, sent: {}, prevented: true },
      LEAK,
    ],
    [
      'ArrowDown',
      { focus: 'card:b', card: 1, sent: {}, prevented: true },
      LEAK,
    ],
    ['KeyR', { rerolls: 1, sent: {}, prevented: false }, LEAK],
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
      { ...picked('a'), pad: 'press:settings', sent: { 'input-confirmed': 1 } },
      LEAK,
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
    [
      'pad:RIGHT',
      { focus: 'card:b', card: 1, pad: 'press:settings', sent: {} },
      LEAK,
    ],
    ['bus:confirm', { ...picked('a'), sent: { 'input-confirmed': 1 } }, LEAK],
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
      {
        top: null,
        ...CHEST_DONE,
        sent: { 'input-confirmed': 1 },
        prevented: false,
      },
      LEAK,
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
      {
        top: null,
        ...CHEST_DONE,
        pad: 'press:settings',
        sent: { 'input-confirmed': 1 },
      },
      LEAK,
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
    [
      'bus:confirm',
      { top: null, ...CHEST_DONE, sent: { 'input-confirmed': 1 } },
      LEAK,
    ],
  ]
);

pinTable(
  "Settings forced open over the ending's choice",
  (rig) => {
    rig.open.choice();
    rig.ui.settingsPanel.openSettingsPanel('keyboard');
  },
  [
    [
      'Digit1',
      { choice: false, ending: 'severance', sent: {}, prevented: true },
      LEAK,
    ],
    [
      'ArrowRight',
      { focus: 'ending:stewardship', sent: {}, prevented: true },
      LEAK,
    ],
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
