import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountScreens, pinTable } from '../../../__helpers__/screenRig.js';
import { listenForHold } from '../../../../src/modules/ui/skipHold.js';
import { inputLayers } from '../../../../src/modules/input/inputLayers.js';
import { RunCinematics } from '../../../../src/modules/ui/runCinematics.js';

// What the keyboard, the pad and a confirm on the bus do TODAY on the run's
// other screens (pause, Settings over the run, end credits, HUD editor, a
// cinematic's skip hold), before one layer stack takes the input from the
// screens' global listeners. Each row: the input, then what changed (see
// screenRig.js `effects`). Rows named "LEAK today" are the input reaching
// the screen below; every other row must come out the same.

// A cinematic holding the run (the intro): its skip hold listens, as
// RunCinematics binds it; `skipped` and `nextLine` count its two answers.
function startCinematic(rig) {
  rig.fly();
  rig.state.paused = true; // the intro holds the first step
  const skip = vi.fn();
  const next = vi.fn();
  rig.cleanups.push(listenForHold(skip, next));
  rig.bus.emit('cinematic-started', { kind: 'intro', holdsRun: true });
  rig.watch('skipped', () => skip.mock.calls.length);
  rig.watch('nextLine', () => next.mock.calls.length);
}

pinTable('pause over the flight', (rig) => rig.open.pause(), [
  [
    'Escape',
    {
      top: null,
      focus: 'body',
      pause: false,
      sent: { 'toggle-pause': 1 },
      prevented: false,
    },
  ],
  ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
  [
    'KeyP',
    {
      top: null,
      focus: 'body',
      pause: false,
      sent: { 'toggle-pause': 1 },
      prevented: false,
    },
  ],
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
      top: null,
      focus: 'body',
      pause: false,
      pad: 'press:pause',
      sent: { 'toggle-pause': 1 },
    },
  ],
  [
    'pad:B',
    {
      top: null,
      focus: 'body',
      pause: false,
      pad: 'back:pause',
      sent: { 'toggle-pause': 1 },
    },
  ],
  [
    'pad:START',
    { top: null, focus: 'body', pause: false, sent: { 'toggle-pause': 1 } },
  ],
  ['bus:confirm', { sent: { 'input-confirmed': 1 } }],
]);

// Escape disarms the quit and goes no further (window capture, first).
pinTable(
  'pause with a quit armed',
  (rig) => {
    rig.open.pause();
    rig.ui.domRefs.pause.exitBtn.click();
  },
  [
    ['Escape', { quitArmed: false, sent: {}, prevented: false }],
    ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
  ]
);

// Settings, on top of the layer stack, takes Escape: the pause under it
// never hears it. The pause key (P, Start) passes only under a layer that
// lets it: not Settings (before the stack it resumed the run under it).
const NO_PAUSE = 'Settings passes no pause, the run stays paused';
pinTable(
  'Settings over the pause',
  (rig) => {
    rig.open.pause();
    rig.open.settings();
  },
  [
    [
      'Escape',
      {
        top: 'pause',
        focus: 'pause-resume-btn',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    ['KeyP', { sent: {}, prevented: false }, NO_PAUSE],
    ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
    ['pad:A', { pad: 'press:settings', sent: { 'input-confirmed': 1 } }],
    [
      'pad:B',
      {
        top: 'pause',
        focus: 'pause-resume-btn',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
    ['pad:START', { sent: {} }, NO_PAUSE],
  ]
);

// Opened in flight (F10): the session pauses and the pause screen shows
// under Settings; closing Settings resumes the run.
pinTable(
  'Settings opened in flight',
  (rig) => {
    rig.fly();
    rig.open.settings();
  },
  [
    [
      'Escape',
      {
        top: null,
        focus: 'body',
        pause: false,
        settings: false,
        sent: { 'toggle-pause': 1 },
        prevented: true,
      },
    ],
    ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
    [
      'pad:B',
      {
        top: null,
        focus: 'body',
        pause: false,
        settings: false,
        pad: 'back:settings',
        sent: { 'toggle-pause': 1 },
      },
    ],
  ]
);

pinTable('end credits', (rig) => rig.open.endCredits(), [
  [
    'Enter',
    {
      top: null,
      endCredits: false,
      sent: { 'input-confirmed': 1 },
      prevented: true,
    },
  ],
  ['Space', { sent: { 'input-confirmed': 1 }, prevented: false }],
  [
    'Escape',
    {
      top: null,
      endCredits: false,
      sent: { 'toggle-pause': 1 },
      prevented: true,
    },
  ],
  [
    'pad:A',
    {
      top: null,
      endCredits: false,
      pad: 'press:end-credits',
      sent: { 'input-confirmed': 1 },
    },
  ],
  [
    'pad:B',
    { top: null, endCredits: false, pad: 'back:end-credits', sent: {} },
  ],
  ['bus:confirm', { sent: { 'input-confirmed': 1 } }],
]);

// Settings, on top of the stack, keeps the credits' Enter and Escape.
pinTable(
  'Settings over the end credits',
  (rig) => {
    rig.open.endCredits();
    rig.open.settings();
  },
  [
    ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
    [
      'Escape',
      {
        top: 'end-credits',
        focus: 'end-credits-continue-btn',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    ['pad:A', { pad: 'press:settings', sent: { 'input-confirmed': 1 } }],
    [
      'pad:B',
      {
        top: 'end-credits',
        focus: 'end-credits-continue-btn',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
  ]
);

// Every key stops at the editor (window capture); the pad's Start still
// reaches the session, and the editor asks to close and keeps the pause.
pinTable(
  'HUD editor over the pause',
  (rig) => {
    rig.open.pause();
    rig.ui.domRefs.pause.editHudBtn.click();
  },
  [
    [
      'Escape',
      { top: 'pause', focus: 'pause-edit-hud-btn', sent: {}, prevented: true },
    ],
    ['Enter', { sent: {}, prevented: false }],
    ['KeyP', { sent: {}, prevented: false }],
    ['F10', { sent: {}, prevented: false }],
    // A letter goes on as typed (its text fields): nothing holds it back.
    ['KeyW', { sent: {}, prevented: false }],
    [
      'pad:START',
      { top: 'pause', focus: 'pause-resume-btn', sent: { 'toggle-pause': 2 } },
    ],
    ['pad:B', { top: 'pause', focus: 'pause-edit-hud-btn', sent: {} }],
  ]
);

// Every key stops at the skip hold (window capture); Space and Start are its
// own. The pad's View still opens Settings over the scene (not over the
// ending's acts).
pinTable("a cinematic's skip hold over the flight", startCinematic, [
  ['Escape', { sent: {}, prevented: true }],
  ['Enter', { sent: {}, prevented: true }],
  ['F10', { sent: {}, prevented: true }],
  ['KeyP', { sent: {}, prevented: true }],
  ['Digit1', { sent: {}, prevented: true }],
  ['Space', { nextLine: 1, sent: {}, prevented: true }],
  ['pad:START', { nextLine: 1, sent: {} }],
  [
    'pad:VIEW',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
    },
  ],
  ['pad:A', { sent: { 'input-confirmed': 1 } }],
]);

// Settings is on top of the layer stack, which hears a key before the skip
// hold swallows it: Escape closes Settings (before the stack only the pad's
// B did), and goes no further.
pinTable(
  'Settings (opened by the pad) over a cinematic',
  (rig) => {
    startCinematic(rig);
    rig.send('pad:VIEW');
  },
  [
    [
      'Escape',
      { top: null, focus: 'body', settings: false, sent: {}, prevented: true },
      'Settings, on top of the stack, closes',
    ],
    [
      'pad:B',
      {
        top: null,
        focus: 'body',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
  ]
);

describe("the run's screens, hidden rules today", () => {
  let rig;
  beforeEach(() => (rig = mountScreens()));
  afterEach(() => {
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });

  it('an Escape that disarmed a quit is swallowed while held, its repeats too; the next press resumes', () => {
    rig.open.pause();
    rig.ui.domRefs.pause.exitBtn.click();
    rig.keyDown('Escape');
    rig.keyDown('Escape', { repeat: true });
    rig.keyUp('Escape');
    expect(rig.count('toggle-pause')).toBe(0);
    expect(rig.ui.pauseScreen.currentPauseState).toBe(true);

    rig.tap('Escape');
    expect(rig.count('toggle-pause')).toBe(1);
    expect(rig.ui.pauseScreen.currentPauseState).toBe(false);
  });

  // Before the stack the hold stopped every key at the window (only the
  // listeners bound before it heard one); it is a layer now: the screen
  // under it hears nothing, the global listeners still do.
  it('the skip hold takes every key: no screen under it hears one, a global listener still does', () => {
    const under = vi.fn(() => false);
    inputLayers.push({
      name: 'probe',
      element: null,
      passes: [],
      onKey: under,
    });
    startCinematic(rig);
    const after = vi.fn();
    rig.dom.window.addEventListener('keydown', after, true);
    rig.tap('Escape');
    expect(under).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("the game's own actions follow the cinematic: no Settings over the ending's acts, the pause only in the epilogue and a Warden's arrival", () => {
    rig.fly();
    rig.bus.emit('cinematic-started', { kind: 'ending' });
    rig.send('pad:VIEW');
    rig.send('pad:START');
    expect(rig.count('settings-menu-requested')).toBe(0);
    expect(rig.count('toggle-pause')).toBe(0);

    rig.bus.emit('cinematic-started', { kind: 'epilogue' });
    rig.send('pad:START');
    expect(rig.count('toggle-pause')).toBe(1);
  });

  // No default actions here: in the browser Enter (and Space) also press
  // the focused button, which these rows do not see.
  it('the focused button Enter or Space would press: Resume, Continue, the first ending', () => {
    rig.open.pause();
    expect(rig.snapshot().focus).toBe('pause-resume-btn');
    rig.open.endCredits();
    expect(rig.snapshot().focus).toBe('end-credits-continue-btn');
    rig.open.choice();
    expect(rig.snapshot().focus).toBe('ending:severance');
  });

  it('a scene that ends under Settings (opened by the pad) leaves the run paused under it; closing Settings resumes it', () => {
    rig.fly();
    const cinematics = new RunCinematics({
      eventBus: rig.bus,
      renderer: () => ({ playIntro: () => true, endCinematic: () => {} }),
      hud: () => ({ cancelBanner() {}, showLetterbox() {} }),
      holdSim: (held) => rig.ui.holdSim(held),
      onIntroEnd: () => {},
    });
    rig.cleanups.push(() => cinematics.stop());
    cinematics.playIntro();
    rig.send('pad:VIEW');
    cinematics.skip();
    expect(cinematics.kind).toBe(null);
    expect(rig.state.paused).toBe(true);
    expect(rig.snapshot()).toMatchObject({ top: 'settings', pause: true });
    rig.tap('Escape');
    expect(rig.state.paused).toBe(false);
    expect(rig.snapshot()).toMatchObject({ settings: false, pause: false });
  });

  it('the skip hold lets key releases through to the game; the press is heard and moves nothing', () => {
    startCinematic(rig);
    const heard = rig.record();
    rig.tap('KeyW');
    expect(heard('key-pressed')).toBe(2);
    expect(heard('input-action')).toBe(1); // the release only
    expect(rig.sent.at(-1).payload.type).toBe('up');
  });
});
