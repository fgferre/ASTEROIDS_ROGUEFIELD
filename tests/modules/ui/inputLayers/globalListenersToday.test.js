import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountScreens } from '../../../__helpers__/screenRig.js';
import { listenForHold } from '../../../../src/modules/ui/skipHold.js';
import AudioSystem from '../../../../src/modules/AudioSystem.js';
import { PerformanceMonitor } from '../../../../src/utils/PerformanceMonitor.js';
import { showReplayNotice } from '../../../../src/bootstrap/replaySession.js';

// The key listeners that are not screens and stay global, against the
// screens that CONSUME a key today (stop it on its way): does each still
// hear it? Target and phase decide: a listener hears a consumed key only if
// it sits before the consumer on the event's path (window capture, then
// document capture, then document and window bubble; on one node and phase,
// stopPropagation still lets the later listeners run, stopImmediatePropagation
// does not). Each listener is bound here after the consumer opened; where
// boot binds it earlier on the same node and phase, the answer is the same.
// Settings and the pause screen take their keys through the layer stack,
// which stops none: every listener hears them since.
const NOW = 'true, since the layer stack (it stops no key)';

// The screens that consume a key today, and that key.
const CONSUMERS = {
  // window capture, every key, stopImmediatePropagation
  'skip hold': [
    'Enter',
    (rig) => {
      rig.fly();
      rig.state.paused = true;
      rig.cleanups.push(
        listenForHold(
          () => {},
          () => {}
        )
      );
    },
  ],
  // window capture, every key, stopImmediatePropagation
  'HUD editor': [
    'Enter',
    (rig) => {
      rig.open.pause();
      rig.ui.domRefs.pause.editHudBtn.click();
    },
  ],
  // document capture, its keys, stopPropagation
  pilots: ['Enter', (rig) => rig.open.gate({ pilots: true })],
  // the layer stack (window capture), Escape, taken but not stopped
  Settings: ['Escape', (rig) => rig.open.settings()],
  // the layer stack (window capture), Escape, taken but not stopped
  'pause with a quit armed': [
    'Escape',
    (rig) => {
      rig.open.pause();
      rig.ui.domRefs.pause.exitBtn.click();
    },
  ],
};

// Each listener: its key (none: the consumer's), how it is bound, and
// whether it heard; then, per consumer, whether it hears today.
const LISTENERS = {
  'InputSystem (document; capture for S and ArrowDown, bubble for the rest)': {
    bind: (rig) => {
      const from = rig.sent.length;
      return () =>
        rig.sent
          .slice(from)
          .some(
            ({ name, payload }) =>
              name === 'key-pressed' && payload.type === 'down'
          );
    },
    heard: {
      'skip hold': false,
      'HUD editor': false,
      pilots: false,
      Settings: NOW,
      'pause with a quit armed': NOW,
    },
  },
  'audio unlock (AudioSystem, document, capture; gone after the first key)': {
    bind: () => {
      const audio = { initialized: false, init: vi.fn(async () => {}) };
      AudioSystem.prototype._setupEarlyInit.call(audio);
      return () => audio.init.mock.calls.length > 0;
    },
    heard: {
      'skip hold': false,
      'HUD editor': false,
      pilots: true,
      Settings: true,
      'pause with a quit armed': NOW,
    },
  },
  // Bound with the UI, before the skip hold, the editor and Pause's check.
  "pad pointer's hide (PadPointer, window, capture; real keys only)": {
    bind: (rig) => {
      rig.ui.padPointer.show();
      return () => !rig.ui.padPointer.shown;
    },
    heard: {
      'skip hold': true,
      'HUD editor': true,
      pilots: true,
      Settings: true,
      'pause with a quit armed': true,
    },
  },
  'F3 (PerformanceMonitor overlay, document, bubble)': {
    key: 'F3',
    bind: () => {
      const monitor = new PerformanceMonitor();
      monitor.showOverlay();
      return () => monitor.overlayElement.style.display === 'none';
    },
    heard: { 'skip hold': false, 'HUD editor': false },
  },
  // app.js binds F8 and F9 inside its boot (not exported): a listener on
  // the same target and phase stands in for them.
  'F8 and F9 (app.js, window, bubble; stand-in)': {
    key: 'F8',
    bind: (rig) => {
      const heard = vi.fn();
      rig.dom.window.addEventListener('keydown', (e) => {
        if (e.key === 'F8') heard();
      });
      return () => heard.mock.calls.length > 0;
    },
    heard: { 'skip hold': false, 'HUD editor': false },
  },
  'replay notice (replaySession, window, bubble, once)': {
    bind: (rig) => {
      showReplayNotice(new Error('broken'));
      const notice = rig.dom.document.body.children.at(-1);
      return () => !notice.isConnected;
    },
    heard: {
      'skip hold': false,
      'HUD editor': false,
      pilots: false,
      Settings: NOW,
      'pause with a quit armed': NOW,
    },
  },
};

describe('global listeners under a screen that consumes the key, today', () => {
  let rig;
  beforeEach(() => (rig = mountScreens()));
  afterEach(() => {
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });

  Object.entries(LISTENERS).forEach(([listener, { key, bind, heard }]) => {
    describe(listener, () => {
      it.each(Object.entries(heard))('%s: heard %s', (consumer, expected) => {
        const [consumedKey, open] = CONSUMERS[consumer];
        open(rig);
        const didHear = bind(rig);
        rig.keyDown(key ?? consumedKey);
        expect(didHear()).toBe(expected === NOW || expected);
        rig.keyUp(key ?? consumedKey);
      });
    });
  });

  it('with nothing on top, each hears its key', () => {
    const from = rig.sent.length;
    const audio = { initialized: false, init: vi.fn(async () => {}) };
    AudioSystem.prototype._setupEarlyInit.call(audio);
    rig.ui.padPointer.show();
    const monitor = new PerformanceMonitor();
    monitor.showOverlay();
    showReplayNotice(new Error('broken'));
    const notice = rig.dom.document.body.children.at(-1);
    rig.tap('Enter');
    rig.tap('F3');
    const downs = rig.sent
      .slice(from)
      .filter(
        ({ name, payload }) => name === 'key-pressed' && payload.type === 'down'
      );
    expect(downs).toHaveLength(2);
    // the unlock leaves once its init settles: both keys came before that
    expect(audio.init).toHaveBeenCalled();
    expect(rig.ui.padPointer.shown).toBe(false);
    expect(monitor.overlayElement.style.display).toBe('none');
    expect(notice.isConnected).toBe(false);
  });
});
