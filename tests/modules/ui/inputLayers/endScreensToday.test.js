import { describe, expect, it } from 'vitest';
import { layOut, pinTable } from '../../../__helpers__/screenRig.js';
import { GAMEPAD_NAV_SCREENS } from '../../../../src/modules/ui/gamepadNav.js';
import { RunCinematics } from '../../../../src/modules/ui/runCinematics.js';

// What the keyboard, the pad and a confirm on the bus do TODAY on the run's
// end screens, the changelog and a real cinematic, and the pad's A and
// d-pad on every screen of the pad's list, alone. Each row: the input, then
// what changed (see screenRig.js `effects`; 'Enter+click' adds the
// browser's button default, `session` the run flow a button started).
// Every row must come out the same through the layer stack.
const byId = (rig, id) => rig.dom.document.getElementById(id);
const all = (rig, selector) => rig.dom.document.querySelectorAll(selector);

// The death screen as the session shows it, past its lockout: Retry
// focused (⏎ / A), the three run buttons in a row.
function gameOver(rig) {
  rig.fly();
  rig.bus.emit('screen-changed', { screen: 'gameover', data: {} });
  rig.wait();
  layOut(
    ['retry-game-btn', 'restart-game-btn', 'quit-game-btn'].map((id) =>
      byId(rig, id)
    ),
    { across: true }
  );
}

// The victory screen of a first run: Continue focused, its buttons in a row.
function victory(rig) {
  rig.fly();
  rig.bus.emit('screen-changed', { screen: 'victory', data: {} });
  rig.wait();
  layOut(all(rig, '#victory-screen button:not(.hidden)'), { across: true });
}

// The intro as RunCinematics plays it (its real skip hold); `scene` is the
// cinematic playing, `held` the simulation held.
function intro(rig) {
  rig.fly();
  const cinematics = new RunCinematics({
    eventBus: rig.bus,
    renderer: () => ({ playIntro: () => true, endCinematic: () => {} }),
    hud: () => ({ cancelBanner() {}, showLetterbox() {} }),
    holdSim: (held) => (rig.state.paused = held),
    onIntroEnd: () => {},
  });
  rig.cleanups.push(() => cinematics.stop());
  cinematics.playIntro();
  rig.watch('scene', () => cinematics.kind);
  rig.watch('held', () => rig.state.paused);
}

// The game over screen: Retry by key or pad is the approved flow.
pinTable('game over', gameOver, [
  ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
  [
    'Enter+click',
    {
      session: 'retry:retry-game-btn',
      sent: { 'input-confirmed': 1 },
      prevented: false,
    },
  ],
  [
    'Space+click',
    {
      session: 'retry:retry-game-btn',
      sent: { 'input-confirmed': 1 },
      prevented: false,
    },
  ],
  ['Escape', { sent: { 'toggle-pause': 1 }, prevented: false }],
  ['KeyR', { sent: {}, prevented: false }],
  ['Digit1', { sent: {}, prevented: false }],
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
      session: 'retry:retry-game-btn',
      pad: 'press:gameover',
      sent: { 'input-confirmed': 1 },
    },
  ],
  ['pad:B', { pad: 'back:gameover', sent: {} }],
  ['pad:RIGHT', { focus: 'restart-game-btn', pad: 'press:gameover', sent: {} }],
  ['pad:START', { sent: { 'toggle-pause': 1 } }],
  [
    'pad:VIEW',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
    },
  ],
  ['bus:confirm', { sent: { 'input-confirmed': 1 } }],
]);

// Quit asks twice: the first press only arms it.
pinTable(
  'game over, Quit focused',
  (rig) => {
    gameOver(rig);
    byId(rig, 'quit-game-btn').focus();
  },
  [
    [
      'Enter+click',
      { quitArmed: true, sent: { 'input-confirmed': 1 }, prevented: false },
    ],
    [
      'pad:A',
      {
        quitArmed: true,
        pad: 'press:gameover',
        sent: { 'input-confirmed': 1 },
      },
    ],
    ['Escape', { sent: { 'toggle-pause': 1 }, prevented: false }],
  ]
);

pinTable(
  'Settings over the game over',
  (rig) => {
    gameOver(rig);
    rig.open.settings();
  },
  [
    ['Enter+click', { sent: { 'input-confirmed': 1 }, prevented: false }],
    ['pad:A', { pad: 'press:settings', sent: { 'input-confirmed': 1 } }],
    [
      'Escape',
      {
        top: 'gameover',
        focus: 'retry-game-btn',
        settings: false,
        sent: {},
        prevented: true,
      },
    ],
    [
      'pad:B',
      {
        top: 'gameover',
        focus: 'retry-game-btn',
        settings: false,
        pad: 'back:settings',
        sent: {},
      },
    ],
  ]
);

pinTable('victory', victory, [
  ['Enter', { sent: { 'input-confirmed': 1 }, prevented: false }],
  [
    'Enter+click',
    { session: 'continue', sent: { 'input-confirmed': 1 }, prevented: false },
  ],
  [
    'Space+click',
    { session: 'continue', sent: { 'input-confirmed': 1 }, prevented: false },
  ],
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
      session: 'continue',
      pad: 'press:victory',
      sent: { 'input-confirmed': 1 },
    },
  ],
  ['pad:B', { pad: 'back:victory', sent: {} }],
  [
    'pad:RIGHT',
    { focus: 'victory-restart-btn', pad: 'press:victory', sent: {} },
  ],
  ['pad:START', { sent: { 'toggle-pause': 1 } }],
  ['bus:confirm', { sent: { 'input-confirmed': 1 } }],
]);

pinTable(
  'changelog over the menu',
  (rig) => rig.ui.changelogOverlay.openCreditsOverlay(),
  [
    [
      'Escape',
      {
        top: 'menu',
        changelog: false,
        sent: { 'toggle-pause': 1 },
        prevented: true,
      },
    ],
    [
      'Enter+click',
      {
        top: 'menu',
        changelog: false,
        sent: { 'input-confirmed': 1 },
        prevented: false,
      },
    ],
    [
      'pad:A',
      {
        top: 'menu',
        changelog: false,
        pad: 'press:changelog',
        sent: { 'input-confirmed': 1 },
      },
    ],
    [
      'pad:B',
      { top: 'menu', changelog: false, pad: 'back:changelog', sent: {} },
    ],
    ['pad:DOWN', { pad: 'press:changelog', sent: {} }],
  ]
);

// In the intro a tap goes to the next scene, so it ends like a hold.
pinTable('the intro, a real cinematic', intro, [
  ['Space', { scene: null, held: false, sent: {}, prevented: true }],
  ['hold:Space', { scene: null, held: false, sent: {}, prevented: true }],
  ['Enter', { sent: {}, prevented: true }],
  ['Escape', { sent: {}, prevented: true }],
  ['Digit1', { sent: {}, prevented: true }],
  ['F10', { sent: {}, prevented: true }],
  ['pad:START', { scene: null, held: false, sent: {} }],
  ['pad:A', { sent: { 'input-confirmed': 1 } }],
  [
    'pad:VIEW',
    {
      top: 'settings',
      focus: 'settings:game',
      settings: true,
      sent: { 'settings-menu-requested': 1 },
    },
  ],
]);

describe("the pad's screen list", () => {
  it('is the twelve screens pinned below, topmost first', () => {
    expect(GAMEPAD_NAV_SCREENS).toEqual([
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
  });
});

// The pad's A and d-pad on each screen of the list (the changelog, game
// over and victory have theirs in the tables above), laid out as a column
// or a row so a move has somewhere to go; Enter with the browser's default
// beside A.
pinTable(
  'pad on Settings alone',
  (rig) => {
    rig.open.settings();
    layOut(all(rig, '#settings-tabs button'));
  },
  [
    [
      'pad:DOWN',
      { focus: 'settings:controls', pad: 'press:settings', sent: {} },
    ],
    ['pad:A', { pad: 'press:settings', sent: { 'input-confirmed': 1 } }],
    ['Enter+click', { sent: { 'input-confirmed': 1 }, prevented: false }],
  ]
);

pinTable(
  'pad on the end credits alone',
  (rig) => {
    rig.open.endCredits();
    layOut([byId(rig, 'end-credits-continue-btn')]);
  },
  [
    ['pad:DOWN', { pad: 'press:end-credits', sent: {} }],
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
      'Enter+click',
      {
        top: null,
        endCredits: false,
        sent: { 'input-confirmed': 1 },
        prevented: true,
      },
    ],
  ]
);

pinTable(
  'pad on the Codex alone',
  (rig) => {
    rig.open.codex();
    layOut(
      ['codex-back-btn', 'codex-tab-enemies', 'codex-tab-achievements'].map(
        (id) => byId(rig, id)
      )
    );
  },
  [
    ['pad:DOWN', { focus: 'codex-tab-enemies', pad: 'press:codex', sent: {} }],
    [
      'pad:A',
      {
        top: 'menu',
        focus: 'body',
        codex: false,
        pad: 'press:codex',
        sent: { 'input-confirmed': 1 },
      },
    ],
    [
      'Enter+click',
      {
        top: 'menu',
        focus: 'body',
        codex: false,
        sent: { 'input-confirmed': 1 },
        prevented: false,
      },
    ],
  ]
);

pinTable(
  'pad on the Hangar alone',
  (rig) => {
    rig.open.hangar();
    layOut([byId(rig, 'hangar-back-btn')]);
  },
  [
    ['pad:DOWN', { pad: 'press:hangar', sent: {} }],
    [
      'pad:A',
      {
        top: 'menu',
        focus: 'body',
        hangar: false,
        pad: 'press:hangar',
        sent: { 'input-confirmed': 1 },
      },
    ],
    [
      'Enter+click',
      {
        top: 'menu',
        focus: 'body',
        hangar: false,
        sent: { 'input-confirmed': 1 },
        prevented: false,
      },
    ],
  ]
);

pinTable(
  'pad on the Credits alone',
  (rig) => {
    rig.open.credits();
    layOut([byId(rig, 'credits-back-btn')]);
  },
  [
    ['pad:DOWN', { pad: 'press:credits', sent: {} }],
    [
      'pad:A',
      {
        top: 'menu',
        credits: false,
        pad: 'press:credits',
        sent: { 'input-confirmed': 1 },
      },
    ],
    [
      'Enter+click',
      {
        top: 'menu',
        credits: false,
        sent: { 'input-confirmed': 1 },
        prevented: false,
      },
    ],
  ]
);

// Enter's default click lands on the focused card after the pick has reset
// the cards (Reduce Motion: no exit animation keeps them locked), so the
// card is taken twice here. A browser fires that click on the keypress
// after the keydown; whether it does on a card just hidden is unchecked.
pinTable(
  'pad on the level-up alone',
  (rig) => {
    rig.open.levelUp();
    layOut(all(rig, '#upgrades-container button'), { across: true });
  },
  [
    ['pad:RIGHT', { focus: 'card:b', card: 1, pad: 'levelup:right', sent: {} }],
    [
      'pad:A',
      {
        top: null,
        screen: 'playing',
        levelUp: false,
        card: -1,
        picked: 'a',
        pad: 'levelup:confirm',
        sent: { 'input-confirmed': 1 },
      },
    ],
    [
      'Enter+click',
      {
        top: null,
        screen: 'playing',
        levelUp: false,
        card: -1,
        picked: 'a,a',
        sent: { 'input-confirmed': 1 },
        prevented: false,
      },
    ],
  ]
);

pinTable(
  'pad on the pause alone',
  (rig) => {
    rig.open.pause();
    layOut(all(rig, '#pause-screen button'));
  },
  [
    ['pad:DOWN', { focus: 'pause-settings-btn', pad: 'press:pause', sent: {} }],
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
      'Enter+click',
      {
        top: null,
        focus: 'body',
        pause: false,
        sent: { 'input-confirmed': 1, 'toggle-pause': 1 },
        prevented: false,
      },
    ],
  ]
);

pinTable(
  "pad on the ending's choice alone",
  (rig) => {
    rig.open.choice();
    layOut(all(rig, '#ending-options button'), { across: true });
  },
  [
    [
      'pad:RIGHT',
      { focus: 'ending:stewardship', pad: 'press:ending', sent: {} },
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
    [
      'Enter+click',
      {
        top: null,
        choice: false,
        ending: 'severance',
        sent: { 'input-confirmed': 1 },
        prevented: false,
      },
    ],
  ]
);

// Nothing focused on the menu: the d-pad (and A) first lands on Launch.
pinTable(
  'pad on the menu alone',
  (rig) => {
    layOut(all(rig, '[data-campaign-chapter]'), { across: true });
    layOut(all(rig, '[data-campaign-row]'), { at: 100 });
    layOut([byId(rig, 'campaign-launch-btn')], { at: 300 });
    layOut(
      ['menu-codex-btn', 'open-settings-btn'].map((id) => byId(rig, id)),
      { across: true, at: 400 }
    );
  },
  [
    ['pad:DOWN', { focus: 'campaign-launch-btn', pad: 'press:menu', sent: {} }],
    [
      'pad:A',
      {
        focus: 'campaign-launch-btn',
        pad: 'press:menu',
        sent: { 'input-confirmed': 1 },
      },
    ],
  ]
);

pinTable(
  'pad on the menu, Launch focused',
  (rig) => {
    layOut([byId(rig, 'campaign-launch-btn')], { at: 300 });
    byId(rig, 'campaign-launch-btn').focus();
  },
  [
    [
      'pad:A',
      {
        session: 'newRun:campaign-launch-btn',
        pad: 'press:menu',
        sent: { 'input-confirmed': 1 },
      },
    ],
    [
      'Enter+click',
      {
        session: 'newRun:campaign-launch-btn',
        sent: { 'input-confirmed': 1 },
        prevented: false,
      },
    ],
  ]
);
