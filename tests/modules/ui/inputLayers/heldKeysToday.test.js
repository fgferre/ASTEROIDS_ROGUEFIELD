import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountScreens } from '../../../__helpers__/screenRig.js';
import { listenForHold } from '../../../../src/modules/ui/skipHold.js';

// Thrust (W) held in flight while a screen opens over the run, let go while
// that screen is open or after it closed: what the game (InputSystem) sees.
// TODAY no screen stops a key's release (the skip hold listens to it but
// lets it through), so the thrust always ends; a router must keep that.

// Each screen: how it opens over the flight, and how it closes.
const SCREENS = [
  ['level-up', (rig) => rig.open.levelUp(), (rig) => rig.tap('Digit1')],
  ['chest', (rig) => rig.open.chest(), (rig) => rig.send('bus:confirm')],
  [
    'flight briefing',
    (rig) => rig.open.briefing(),
    (rig) => rig.send('bus:confirm'),
  ],
  ['pause', (rig) => rig.open.pause(), (rig) => rig.tap('Escape')],
  [
    'Settings opened in flight',
    (rig) => rig.open.settings(),
    (rig) => rig.tap('Escape'),
  ],
  [
    'HUD editor over the pause',
    (rig) => {
      rig.open.pause();
      rig.ui.domRefs.pause.editHudBtn.click();
    },
    (rig) => rig.tap('Escape'),
  ],
  [
    "a cinematic's skip hold",
    (rig) => {
      rig.state.paused = true;
      rig.cleanups.push(
        listenForHold(
          () => {},
          () => {}
        )
      );
      rig.bus.emit('cinematic-started', { kind: 'intro', holdsRun: true });
    },
    (rig) => {
      rig.cleanups.pop()();
      rig.bus.emit('cinematic-ended', { kind: 'intro' });
      rig.state.paused = false;
      rig.wait(1);
    },
  ],
];

describe('a key held in flight while a screen opens, today', () => {
  let rig;
  const thrust = () => rig.input.isActionActive('moveUp');
  beforeEach(() => {
    rig = mountScreens();
    rig.fly();
  });
  afterEach(() => {
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });

  it.each(SCREENS)(
    '%s: let go while it is open, the game hears the release',
    (_name, open) => {
      expect(rig.keyDown('KeyW').defaultPrevented).toBe(true);
      open(rig);
      expect(thrust()).toBe(true);
      const since = rig.record();
      expect(rig.keyUp('KeyW').defaultPrevented).toBe(false);
      expect(thrust()).toBe(false);
      expect(since('input-action')).toBe(1); // moveUp released
      expect(since('key-pressed')).toBe(1);
    }
  );

  it.each(SCREENS)(
    '%s: let go after it closed, the game hears the release',
    (_name, open, close) => {
      rig.keyDown('KeyW');
      open(rig);
      close(rig);
      expect(thrust()).toBe(true);
      const since = rig.record();
      rig.keyUp('KeyW');
      expect(thrust()).toBe(false);
      expect(since('input-action')).toBe(1);
    }
  );

  it('a key pressed under the skip hold never reaches the game; its release, after the scene, passes and holds nothing', () => {
    const [, open, close] = SCREENS.at(-1);
    open(rig);
    const since = rig.record();
    expect(rig.keyDown('KeyW').defaultPrevented).toBe(true);
    expect(thrust()).toBe(false);
    close(rig);
    rig.keyUp('KeyW');
    expect(thrust()).toBe(false);
    // the release only, and a 'released' for a thrust never pressed
    expect(since('key-pressed')).toBe(1);
    expect(since('input-action')).toBe(1);
  });
});
