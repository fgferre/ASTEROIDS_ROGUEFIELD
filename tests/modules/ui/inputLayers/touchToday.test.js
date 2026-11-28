import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEvent } from '../../../__helpers__/domEvents.js';
import { mountScreens } from '../../../__helpers__/screenRig.js';
import { HOLD_MS, listenForHold } from '../../../../src/modules/ui/skipHold.js';
import { TouchControls } from '../../../../src/modules/input/touchControls.js';

// The stick library reads the window on import; the buttons need none of it.
vi.mock('nipplejs', () => ({ default: { create: () => ({ on() {} }) } }));

// The on-screen buttons that act without the keyboard (DASH, SHIELD,
// STRAFE, the pause button, the HUD's mode words, the cinematic's SKIP),
// tapped with a screen on top, TODAY. `reachable`: whether a tap can land
// on the button, as style.css decides it (the touch layer is [hidden] off
// 'playing', display:none under body.is-paused, visibility:hidden under
// body.is-cinematic; SKIP sits at z-index 9500, over every screen, once its
// hint shows); the rest is what the button's own code does if it is
// pressed (a pad pointer's click lands the same way). A row marked "LEAK
// today" is a reachable button acting under the screen on top. The mode
// words live in the HUD under the screen; whether the screen covers them
// is layout, not judged here (null).

// A tap: pointerdown then pointerup on the button, bubbling.
function tap(target) {
  const init = { bubbles: true, pointerId: 1, isTrusted: true };
  target.dispatchEvent(new FakeEvent('pointerdown', init));
  target.dispatchEvent(new FakeEvent('pointerup', init));
}

// A cinematic holding the run, its skip hold listening; `answers` counts
// its skip and next-line calls.
function startCinematic(rig) {
  rig.fly();
  rig.state.paused = true;
  const answers = { skip: 0, next: 0 };
  rig.cleanups.push(
    listenForHold(
      () => (answers.skip += 1),
      () => (answers.next += 1)
    )
  );
  rig.bus.emit('cinematic-started', { kind: 'intro', holdsRun: true });
  return answers;
}

// SKIP first in this file: the skip hint is built once per module, in the
// page of the first test that shows it.
describe('the SKIP button with Settings over the scene, today', () => {
  let rig;
  beforeEach(() => (rig = mountScreens()));
  afterEach(() => {
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });

  it('Settings opened by the pad over a scene: SKIP (z-index 9500) steps aside at once, takes no tap or hold under it, and is back once Settings closes', () => {
    const answers = startCinematic(rig);
    rig.tap('KeyW'); // shows the hint
    const hint = rig.dom.document.querySelector('.skip-hold');
    expect(hint.classList.contains('is-showing')).toBe(true);
    rig.send('pad:VIEW'); // opens Settings
    expect(rig.ui.settingsPanel.settingsState.isOpen).toBe(true);
    // Hidden at once (style.css: no fade), so a touch there reaches Settings.
    expect(hint.classList.contains('is-showing')).toBe(false);
    expect(hint.classList.contains('is-covered')).toBe(true);
    const skip = hint.querySelector('.skip-hold__button');
    tap(skip);
    const init = { bubbles: true, pointerId: 1, isTrusted: true };
    skip.dispatchEvent(new FakeEvent('pointerdown', init));
    rig.wait(HOLD_MS + 100);
    rig.dom.frame();
    skip.dispatchEvent(new FakeEvent('pointerup', init));
    expect(answers).toEqual({ skip: 0, next: 0 });
    expect(rig.ui.settingsPanel.settingsState.isOpen).toBe(true);
    rig.tap('Escape');
    rig.dom.frame();
    expect(hint.classList.contains('is-covered')).toBe(false);
  });

  it('a tap on Settings over a scene reaches Settings (before the stack the hold swallowed it on its way down)', () => {
    startCinematic(rig);
    rig.send('pad:VIEW');
    const heard = vi.fn();
    const tab = rig.dom.document.querySelector('#settings-tabs button');
    tab.addEventListener('pointerdown', heard);
    tap(tab);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

// Touch play on (a touch device), in flight; the HUD's mode word stands
// where the build instrument draws it.
function touchOn(rig) {
  const touch = new TouchControls({
    input: rig.input,
    player: {},
    eventBus: rig.bus,
    settings: rig.ui.settings,
    declared: true,
  });
  rig.input.touch = touch;
  touch.start();
  const word = rig.dom.el(
    'span',
    { dataset: { touchAction: 'toggleAimMode' } },
    rig.dom.document.getElementById('hud-layer')
  );
  rig.fly();
  rig.bus.emit('screen-changed', { screen: 'playing' });
  const button = (name) => touch.layer.querySelector(`.touch-btn--${name}`);
  return {
    touch,
    targets: {
      DASH: button('dash'),
      SHIELD: button('shield'),
      STRAFE: button('strafe'),
      PAUSE: button('pause'),
      'AIM mode word': word,
    },
  };
}

const SCREENS = {
  pause: (rig) => rig.open.pause(),
  // the pause screen shows under it
  'Settings opened in flight': (rig) => rig.open.settings(),
  'HUD editor over the pause': (rig) => {
    rig.open.pause();
    rig.ui.domRefs.pause.editHudBtn.click();
  },
  'level-up': (rig) => rig.open.levelUp(),
  "a cinematic's skip hold": (rig) => startCinematic(rig),
};

// What each button does, pressed under each screen (read once the press
// and its microtasks ran, before the finger lifts): `reachable` as above,
// `queued` a press the next fixed step takes, `strafing` STRAFE held,
// `paused` the run's pause when the press changed it.
const PAUSED_BY_TOUCH = { reachable: false, queued: '', strafing: false };
// Rows the layer stack changed, by screen and button: what is now true.
const NOW = {
  'Settings opened in flight': {
    PAUSE: 'Settings passes no pause, the run stays paused',
  },
};
const ROWS = {
  pause: {
    DASH: PAUSED_BY_TOUCH,
    SHIELD: PAUSED_BY_TOUCH,
    STRAFE: { ...PAUSED_BY_TOUCH, strafing: true },
    PAUSE: { ...PAUSED_BY_TOUCH, paused: false },
    'AIM mode word': { ...PAUSED_BY_TOUCH, reachable: null },
  },
  'Settings opened in flight': {
    DASH: PAUSED_BY_TOUCH,
    SHIELD: PAUSED_BY_TOUCH,
    STRAFE: { ...PAUSED_BY_TOUCH, strafing: true },
    PAUSE: PAUSED_BY_TOUCH,
    'AIM mode word': { ...PAUSED_BY_TOUCH, reachable: null },
  },
  'HUD editor over the pause': {
    DASH: PAUSED_BY_TOUCH,
    SHIELD: PAUSED_BY_TOUCH,
    STRAFE: { ...PAUSED_BY_TOUCH, strafing: true },
    PAUSE: PAUSED_BY_TOUCH,
    'AIM mode word': { ...PAUSED_BY_TOUCH, reachable: null },
  },
  'level-up': {
    DASH: PAUSED_BY_TOUCH,
    SHIELD: PAUSED_BY_TOUCH,
    STRAFE: { ...PAUSED_BY_TOUCH, strafing: true },
    PAUSE: PAUSED_BY_TOUCH,
    'AIM mode word': { ...PAUSED_BY_TOUCH, reachable: null },
  },
  "a cinematic's skip hold": {
    DASH: PAUSED_BY_TOUCH,
    SHIELD: PAUSED_BY_TOUCH,
    STRAFE: PAUSED_BY_TOUCH,
    PAUSE: PAUSED_BY_TOUCH,
    'AIM mode word': { ...PAUSED_BY_TOUCH, reachable: null },
  },
};

describe('touch buttons tapped with a screen on top, today', () => {
  let rig;
  beforeEach(() => (rig = mountScreens()));
  afterEach(() => {
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });

  Object.entries(ROWS).forEach(([screen, buttons]) => {
    describe(screen, () => {
      const rows = Object.entries(buttons).map(([name, expected]) => [
        NOW[screen]?.[name] ? `${name}: ${NOW[screen][name]}` : name,
        name,
        expected,
      ]);
      it.each(rows)('%s', async (_title, name, expected) => {
        const { touch, targets } = touchOn(rig);
        SCREENS[screen](rig);
        const target = targets[name];
        const body = rig.dom.document.body.classList;
        const reachable = target.closest('.touch-layer')
          ? !touch.layer.hidden &&
            !body.contains('is-paused') &&
            !body.contains('is-cinematic')
          : null;
        const pausedBefore = rig.state.paused;
        const init = { bubbles: true, pointerId: 1, isTrusted: true };
        target.dispatchEvent(new FakeEvent('pointerdown', init));
        await Promise.resolve();
        await Promise.resolve();
        const outcome = {
          reachable,
          queued: [...rig.input.pendingStepPresses].join(),
          strafing: touch.strafing,
        };
        if (rig.state.paused !== pausedBefore)
          outcome.paused = rig.state.paused;
        target.dispatchEvent(new FakeEvent('pointerup', init));
        expect(outcome).toEqual(expected);
      });
    });
  });

  it('in flight with nothing on top, each acts', () => {
    const { touch, targets } = touchOn(rig);
    ['DASH', 'SHIELD', 'AIM mode word'].forEach((name) => tap(targets[name]));
    expect([...rig.input.pendingStepPresses].sort()).toEqual([
      'aim',
      'dash',
      'shield',
    ]);
    targets.STRAFE.dispatchEvent(
      new FakeEvent('pointerdown', { bubbles: true, pointerId: 1 })
    );
    expect(touch.strafing).toBe(true);
    tap(targets.PAUSE);
    expect(rig.state.paused).toBe(true);
  });
});
