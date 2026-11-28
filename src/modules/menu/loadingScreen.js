// src/modules/menu/loadingScreen.js
//
// The boot loading screen (#loading-screen). First the opening (the owner's
// option C, 19/11): the ship crosses its route as the menu's assets preload
// (--load, 0..1); once loaded it asks for a tap, click or key, and that press
// fades it off the live scene. Then the same screen is the PRESS START gate; a
// start press fades it out and shows the menu screen. Escape on the menu with
// nothing open, the game's name on the menu (by touch: Felipe's pick B) or the
// menu left idle brings the gate back (Felipe, 20/11),
// and its press goes through the pilots again: the way to switch pilot. It
// came from MenuBackgroundSystem.js.
//
// The music waits for the press that leaves the opening (`onLeave`), even if
// an earlier touch woke the audio (Felipe, 19/11); that press is a gesture,
// so the music is on and the gate comes up awake: one press starts (and opens
// the pilots, pilotSelect.js, on the way to the menu).
// A pad press cannot wake the music, so after one the gate sleeps as before:
// the first touch or key wakes it, and the music with it; the next one is the
// start. The start blinks the button and fades into the menu (the owner's
// card, 17/11).

import { LOADING_JOKES, loadingStep } from '../../data/loadingLines.js';
import { MORPH_MS, morphIntoTitle } from './openingMorph.js';
import { openPilotSelect } from './pilotSelect.js';
import { isPilotStale } from '../../core/storage.js';
import { menuHome } from '../ui/gamepadNav.js';
import { inputLayers } from '../input/inputLayers.js';

const WAKE_HINT = 'Press any key';
// By touch (UISystem's data-input-device) the hints name the tap instead.
const TOUCH_WAKE_HINT = 'Tap the screen';
const TOUCH_HINT = 'Tap to begin';
// A second touch this soon after the waking one counts as the same touch.
const WAKE_GRACE_MS = 500;
// The start's blink and fade (style.css .loading-screen--starting).
const START_EFFECT_MS = 1000;
// The opening's fade off the scene (style.css .loading-screen--leaving).
const LEAVE_MS = 600;
// The loading line: the true step and a joke take turns this often.
const LINE_MS = 2400;
// No key, pointer or pad on the menu this long, nothing open: back to the
// gate. A proposal; Felipe judges it by playing.
export const MENU_IDLE_MS = 120000;
const IDLE_CHECK_MS = 250;
// A service failed to start (app.js): the opening stops on this line.
export const START_FAILED_LINE =
  'The game could not start. Reload the page to try again.';

/**
 * Sets up the loading screen: the opening follows the preload, then a press
 * hands over to the PRESS START gate.
 * @param {(onProgress: Function, onComplete: Function) => void}
 *   setLoadingCallbacks - the system's
 * @param {() => void} [onStart] - the start press (its sound)
 * @param {() => void} [onLeave] - the opening is left (the music may begin)
 */
export function setupLoadingScreen(setLoadingCallbacks, onStart, onLeave) {
  if (typeof document === 'undefined') return;

  const loadingScreen = document.getElementById('loading-screen');
  const menuScreen = document.getElementById('menu-screen');

  if (!loadingScreen) {
    console.warn('[MenuBackgroundSystem] Loading screen element not found.');
    return;
  }

  // On the input layer stack from now until the menu shows: each step
  // (loading, the opening, the morph, the gate) hands over to the next with
  // no gap, so Settings never opens unseen under it.
  const loading = loadingLayer('loading', () => false);
  inputLayers.push(loading);

  // The loading line: what is loading now, a joke between (loadingLines.js).
  const line = loadingScreen.querySelector('.opening__line');
  let step = loadingStep(0);
  let joke = Date.now() % LOADING_JOKES.length;
  let joking = false;
  const failed = () =>
    loadingScreen.classList.contains('loading-screen--failed');
  function drawLine() {
    if (failed()) return;
    line.textContent = joking ? LOADING_JOKES[joke] : step;
    line.classList.toggle('is-real', !joking);
  }
  const lineTimer = setInterval(() => {
    joking = !joking;
    if (joking) joke = (joke + 1) % LOADING_JOKES.length;
    drawLine();
  }, LINE_MS);
  drawLine();

  setLoadingCallbacks(
    (progress) => {
      loadingScreen.style.setProperty('--load', progress.toFixed(3));
      const now = loadingStep(progress);
      // A new step shows at once; the percent climbs only on the step's turn.
      if (now.split(' · ')[0] !== step.split(' · ')[0]) joking = false;
      step = now;
      if (!joking) drawLine();
    },
    () => {
      clearInterval(lineTimer);
      if (failed()) return;
      if (!shouldShowGate()) {
        inputLayers.remove(loading);
        onLeave?.();
        finish();
        return;
      }
      showReady();
    }
  );

  // Hides the screen and shows the menu; the screen stays for the way back.
  function finish() {
    loadingScreen.classList.add('hidden');

    if (menuScreen) {
      menuScreen.classList.remove('hidden', 'menu-screen--gated');
    }
  }

  // The gate fades back over the live scene, the music playing on.
  function backToGate() {
    menuScreen.classList.add('menu-screen--gated');
    loadingScreen.classList.remove('hidden', 'loading-screen--starting');
    showGate(true);
  }

  // Escape with nothing open, the game's name or the idle time takes the menu
  // back to the gate. A menu key (input/inputLayers.js): with a screen open
  // its Escape closes that screen, and only that. Not while the remote link
  // covers the menu (inert): the run is starting.
  let watching = false;
  let lastInput = 0;
  const input = () => (lastInput = performance.now());
  const onMenu = () =>
    !menuScreen.inert &&
    !menuScreen.classList.contains('hidden') &&
    !menuScreen.classList.contains('menu-screen--gated');
  function watchMenu() {
    if (watching) return;
    watching = true;
    input();
    inputLayers.addBase((event) => {
      input();
      // A held Escape's repeats: its first press closed a panel, only that.
      if (event.key === 'Escape' && !event.repeat && onMenu() && !panelOpen())
        backToGate();
    });
    for (const type of ['pointerdown', 'pointermove', 'wheel']) {
      window.addEventListener(type, input, true);
    }
    menuScreen
      .querySelector('.menu-title-back')
      ?.addEventListener('click', () => {
        if (onMenu() && !panelOpen()) backToGate();
      });
    // A pilot another tab deleted or wrote: back to the gate, whose press
    // goes through the pilots, where Continue loads it again.
    setInterval(() => {
      if (!onMenu() || panelOpen() || padActive()) input();
      else if (isPilotStale() || performance.now() - lastInput >= MENU_IDLE_MS)
        backToGate();
    }, IDLE_CHECK_MS);
  }

  // Loaded: the opening asks for a press, which fades it into the gate.
  function showReady() {
    let rafId = 0;
    let padHeld = padPressed();
    // The game shows the menu at boot, under the loading screen: keep its
    // panels out of sight (the scene canvas stays) until the player starts.
    menuScreen?.classList.add('menu-screen--gated');
    loadingScreen.style.setProperty('--load', '1');
    loadingScreen.classList.add('loading-screen--ready');
    inputLayers.remove(loading);

    function goOn(gesture) {
      inputLayers.remove(opening);
      loadingScreen.removeEventListener('click', onClick);
      cancelAnimationFrame(rafId);
      onLeave?.();
      const morph = morphIntoTitle(loadingScreen);
      loadingScreen.classList.add('loading-screen--leaving');
      let timer = 0;
      function toGate() {
        clearTimeout(timer);
        inputLayers.remove(morphing);
        loadingScreen.removeEventListener('click', toGate);
        loadingScreen.classList.remove(
          'loading-screen--ready',
          'loading-screen--leaving',
          'loading-screen--morphing'
        );
        showGate(gesture);
        if (morph) {
          morph.classList.add('opening-morph--gone');
          setTimeout(() => morph.remove(), LEAVE_MS);
        }
      }
      // A press during the morph skips to the gate; it does not start.
      const morphing = loadingLayer('morph', () => {
        if (morph) toGate();
        return false;
      });
      inputLayers.push(morphing);
      timer = setTimeout(toGate, morph ? MORPH_MS : LEAVE_MS);
      if (morph) loadingScreen.addEventListener('click', toGate);
    }

    const onClick = () => goOn(true);

    const opening = loadingLayer('opening', (event) => {
      if (
        event.repeat ||
        ['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)
      ) {
        return false;
      }
      event.preventDefault();
      goOn(true);
      return false;
    });

    function pollPad() {
      const pressed = padPressed();
      if (pressed && !padHeld) {
        goOn(false);
        return;
      }
      padHeld = pressed;
      rafId = requestAnimationFrame(pollPad);
    }

    inputLayers.push(opening);
    loadingScreen.addEventListener('click', onClick);
    rafId = requestAnimationFrame(pollPad);
  }

  // The loading screen turns into the PRESS START gate over the live scene.
  // `gesture`: the opening was left by a touch, click or key (the music woke).
  function showGate(gesture) {
    const button = document.getElementById('press-start-btn');
    const hint = loadingScreen.querySelector(
      '.loading-screen__gate-action > span'
    );
    const touch = document.body.dataset.inputDevice === 'touch';
    if (hint && touch) hint.textContent = TOUCH_HINT;
    const awakeHint = hint?.textContent;
    let started = false;
    let rafId = 0;
    let padHeld = padPressed();
    let awakeAt =
      gesture || navigator.userActivation?.hasBeenActive ? -Infinity : null;

    function wake() {
      if (awakeAt !== null) return;
      awakeAt = performance.now();
      loadingScreen.classList.remove('loading-screen--asleep');
      if (hint) hint.textContent = awakeHint;
    }

    // `fromPad`: a pad press cannot wake the music, so it starts at once.
    function start(fromPad = false) {
      if (started) return;
      if (
        !fromPad &&
        (awakeAt === null || performance.now() - awakeAt < WAKE_GRACE_MS)
      ) {
        return;
      }
      started = true;
      document.removeEventListener('pointerdown', wake, true);
      loadingScreen.removeEventListener('click', onClick);
      cancelAnimationFrame(rafId);
      onStart?.();
      loadingScreen.classList.remove('loading-screen--asleep');
      loadingScreen.classList.add('loading-screen--starting');
      // The pilots come next, over the still-gated menu (pilotSelect.js).
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        openPilotSelect(() => {
          finish();
          watchMenu();
          // By pad, the highlight starts on Launch (gamepadNav.js); else the
          // first button past the game's name (a stray Enter stays put).
          const pad = document.body.dataset.inputDevice === 'gamepad';
          (
            (pad && menuHome(menuScreen)) ||
            menuScreen?.querySelector(
              'button:not([disabled]):not(.menu-title-back)'
            )
          )?.focus();
        }, backToGate);
        // The gate held the keys through its start; the pilots (or the menu,
        // or the gate again) have them now.
        inputLayers.remove(gate);
      }, START_EFFECT_MS);
    }

    const onClick = () => start();

    // Any key wakes it, the same press that wakes the music (AudioSystem's
    // unlock hears every key); Enter or Space then starts.
    const gate = loadingLayer('gate', (event) => {
      wake();
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return false;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        start();
      }
      return false;
    });

    function pollPad() {
      const pressed = padPressed();
      if (pressed && !padHeld) {
        start(true);
        return;
      }
      padHeld = pressed;
      rafId = requestAnimationFrame(pollPad);
    }

    loadingScreen.classList.add('loading-screen--gate');
    if (awakeAt === null) {
      loadingScreen.classList.add('loading-screen--asleep');
      if (hint) hint.textContent = touch ? TOUCH_WAKE_HINT : WAKE_HINT;
      // Capture phase, beside AudioSystem's: the same touch wakes both.
      document.addEventListener('pointerdown', wake, true);
    }
    inputLayers.push(gate);
    loadingScreen.addEventListener('click', onClick);
    rafId = requestAnimationFrame(pollPad);
    button?.focus();
  }

  // The pad's B on the menu (gamepadNav.js), as Escape.
  return {
    leaveMenu() {
      if (watching && onMenu() && !panelOpen()) backToGate();
    },
    // A pad press or scroll on the menu: the idle check only samples the pad,
    // and a quick tap falls between its samples.
    noteInput: input,
  };
}

/**
 * A service failed to start: the loading screen stays, its line says so and
 * the menu stays shut (its Launch would do nothing). The console keeps the
 * error.
 */
export function showStartFailure() {
  const loadingScreen = document.getElementById('loading-screen');
  loadingScreen.classList.add('loading-screen--failed');
  const line = loadingScreen.querySelector('.opening__line');
  line.textContent = START_FAILED_LINE;
  line.classList.remove('is-real');
  document.getElementById('menu-screen')?.classList.add('hidden');
}

// Pad A or Start, on any pad.
function padPressed() {
  const pads = navigator.getGamepads?.() ?? [];
  return Array.from(pads).some(
    (pad) => pad && (pad.buttons[0]?.pressed || pad.buttons[9]?.pressed)
  );
}

// Any button or stick on any pad: the menu is in use.
function padActive() {
  const pads = navigator.getGamepads?.() ?? [];
  return Array.from(pads).some(
    (pad) =>
      pad &&
      (pad.buttons.some((button) => button.pressed) ||
        pad.axes.some((axis) => Math.abs(axis) > 0.5))
  );
}

// The loading screen in one of its steps (the opening, the morph, the gate)
// on the input layer stack: `onKey(event)` hears the keys. It reads the pad
// itself and the pad's pointer works over it; the pause key goes to the
// game, which ignores it there. Settings does not open over it: the game is
// not ready yet, and the gate's key wake needs every key.
function loadingLayer(name, onKey) {
  return { name, passes: ['pause'], pointer: true, noSettings: true, onKey };
}

// Something over the menu that Escape closes first: a screen on the input
// layer stack (Settings, Credits, Codex, Hangar, the pilots), a dialog or
// the phone's Wake log.
function panelOpen() {
  if (inputLayers.top()) return true;
  if (document.querySelector('.is-log-open')) return true;
  return Array.from(
    document.querySelectorAll('.screen--overlay, [aria-modal="true"]')
  ).some((el) => !el.closest('.hidden'));
}

// Boot paths that start a run or a scene without the player skip the gate.
function shouldShowGate() {
  if (typeof window === 'undefined' || !window.location) return false;
  const params = new URLSearchParams(window.location.search);
  return !['profile', 'scene', 'content', 'replay'].some((name) =>
    params.has(name)
  );
}
