// src/modules/menu/loadingScreen.js
//
// The boot loading screen (#loading-screen). First the opening (the owner's
// option C, 19/11): the ship crosses its route as the menu's assets preload
// (--load, 0..1); once loaded it asks for a tap, click or key, and that press
// fades it off the live scene. Then the same screen is the PRESS START gate; a
// start press fades it out, shows the menu screen and the element leaves the
// DOM. It came from MenuBackgroundSystem.js.
//
// The press that leaves the opening is the page's first gesture, so the music
// is on (AudioSystem hears it) and the gate comes up awake: one press starts.
// A pad press cannot wake the music, so after one the gate sleeps as before:
// the first touch or key wakes it, and the music with it; the next one is the
// start. The start blinks the button and fades into the menu (the owner's
// card, 17/11).

import { MORPH_MS, morphIntoTitle } from './openingMorph.js';

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

/**
 * Sets up the loading screen: the opening follows the preload, then a press
 * hands over to the PRESS START gate.
 * @param {(onProgress: Function, onComplete: Function) => void}
 *   setLoadingCallbacks - the system's
 * @param {() => void} [onStart] - the start press (its sound)
 */
export function setupLoadingScreen(setLoadingCallbacks, onStart) {
  if (typeof document === 'undefined') return;

  const loadingScreen = document.getElementById('loading-screen');
  const menuScreen = document.getElementById('menu-screen');

  if (!loadingScreen) {
    console.warn('[MenuBackgroundSystem] Loading screen element not found.');
    return;
  }

  setLoadingCallbacks(
    (progress) => {
      loadingScreen.style.setProperty('--load', progress.toFixed(3));
    },
    () => {
      if (!shouldShowGate()) {
        finish();
        return;
      }
      showReady();
    }
  );

  // Hides the screen, shows the menu and removes the element afterwards.
  function finish() {
    loadingScreen.classList.add('hidden');

    if (menuScreen) {
      menuScreen.classList.remove('hidden', 'menu-screen--gated');
    }

    setTimeout(() => {
      if (loadingScreen.parentNode) {
        loadingScreen.parentNode.removeChild(loadingScreen);
      }
    }, 600);
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

    function goOn(gesture) {
      document.removeEventListener('keydown', onKey);
      loadingScreen.removeEventListener('click', onClick);
      cancelAnimationFrame(rafId);
      const morph = morphIntoTitle(loadingScreen);
      loadingScreen.classList.add('loading-screen--leaving');
      let timer = 0;
      function toGate() {
        clearTimeout(timer);
        document.removeEventListener('keydown', toGate);
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
      timer = setTimeout(toGate, morph ? MORPH_MS : LEAVE_MS);
      // A press during the morph skips to the gate; it does not start.
      if (morph) {
        document.addEventListener('keydown', toGate);
        loadingScreen.addEventListener('click', toGate);
      }
    }

    const onClick = () => goOn(true);

    function onKey(event) {
      if (
        event.repeat ||
        ['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)
      ) {
        return;
      }
      event.preventDefault();
      goOn(true);
    }

    function pollPad() {
      const pressed = padPressed();
      if (pressed && !padHeld) {
        goOn(false);
        return;
      }
      padHeld = pressed;
      rafId = requestAnimationFrame(pollPad);
    }

    document.addEventListener('keydown', onKey);
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
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', wake, true);
      document.removeEventListener('keydown', wake, true);
      loadingScreen.removeEventListener('click', onClick);
      cancelAnimationFrame(rafId);
      onStart?.();
      loadingScreen.classList.remove('loading-screen--asleep');
      loadingScreen.classList.add('loading-screen--starting');
      setTimeout(() => {
        finish();
        menuScreen?.querySelector('button:not([disabled])')?.focus();
      }, START_EFFECT_MS);
    }

    const onClick = () => start();

    function onKeyDown(event) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        start();
      }
    }

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
      // Capture phase, beside AudioSystem's: the same gesture wakes both.
      document.addEventListener('pointerdown', wake, true);
      document.addEventListener('keydown', wake, true);
    }
    document.addEventListener('keydown', onKeyDown);
    loadingScreen.addEventListener('click', onClick);
    rafId = requestAnimationFrame(pollPad);
    button?.focus();
  }
}

// Pad A or Start, on any pad.
function padPressed() {
  const pads = navigator.getGamepads?.() ?? [];
  return Array.from(pads).some(
    (pad) => pad && (pad.buttons[0]?.pressed || pad.buttons[9]?.pressed)
  );
}

// Boot paths that start a run or a scene without the player skip the gate.
function shouldShowGate() {
  if (typeof window === 'undefined' || !window.location) return false;
  const params = new URLSearchParams(window.location.search);
  return !['profile', 'scene', 'content', 'replay'].some((name) =>
    params.has(name)
  );
}
