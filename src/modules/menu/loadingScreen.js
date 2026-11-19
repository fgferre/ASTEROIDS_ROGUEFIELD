// src/modules/menu/loadingScreen.js
//
// The boot loading screen (#loading-screen): its bar, percent and message
// follow the menu's asset preload, then it becomes a PRESS START gate over the
// live scene; a start press fades it out, shows the menu screen and the
// element leaves the DOM. It came from MenuBackgroundSystem.js.
//
// Until the page has had a gesture the gate sleeps (the browser keeps the
// music off until then): the first touch wakes it, and the music with it
// (AudioSystem hears the same gesture); the next one is the start. The start
// blinks the button and fades into the menu (the owner's card, 17/11).

const WAKE_HINT = 'Press any key';
// A second touch this soon after the waking one counts as the same touch.
const WAKE_GRACE_MS = 500;
// The start's blink and fade (style.css .loading-screen--starting).
const START_EFFECT_MS = 1000;

/**
 * Sets up the loading screen UI and connects callbacks.
 * Automatically updates progress bar and hides loading when complete.
 * @param {(onProgress: Function, onComplete: Function) => void}
 *   setLoadingCallbacks - the system's
 * @param {() => void} [onStart] - the start press (its sound)
 */
export function setupLoadingScreen(setLoadingCallbacks, onStart) {
  if (typeof document === 'undefined') return;

  const loadingScreen = document.getElementById('loading-screen');
  const progressFill = document.getElementById('loading-progress-fill');
  const progressPercent = document.getElementById('loading-progress-percent');
  const progressMessage = document.getElementById('loading-progress-message');
  const menuScreen = document.getElementById('menu-screen');

  if (!loadingScreen) {
    console.warn('[MenuBackgroundSystem] Loading screen element not found.');
    return;
  }

  setLoadingCallbacks(
    // onProgress callback
    (progress, message) => {
      const percent = Math.round(progress * 100);

      if (progressFill) {
        progressFill.style.width = `${percent}%`;
      }

      if (progressPercent) {
        progressPercent.textContent = `${percent}%`;
      }

      if (progressMessage) {
        progressMessage.textContent = message;
      }
    },
    // onComplete callback
    () => {
      if (!shouldShowGate()) {
        finish();
        return;
      }
      showGate();
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

  // The loading screen turns into the PRESS START gate over the live scene.
  function showGate() {
    const button = document.getElementById('press-start-btn');
    const hint = loadingScreen.querySelector(
      '.loading-screen__gate-action > span'
    );
    const awakeHint = hint?.textContent;
    let started = false;
    let rafId = 0;
    let padHeld = padPressed();
    let awakeAt = navigator.userActivation?.hasBeenActive ? -Infinity : null;

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

    function padPressed() {
      const pads = navigator.getGamepads?.() ?? [];
      return Array.from(pads).some(
        (pad) => pad && (pad.buttons[0]?.pressed || pad.buttons[9]?.pressed)
      );
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

    // The game shows the menu at boot, under the loading screen: keep its
    // panels out of sight (the scene canvas stays) until the player starts.
    menuScreen?.classList.add('menu-screen--gated');
    loadingScreen.classList.add('loading-screen--gate');
    if (awakeAt === null) {
      loadingScreen.classList.add('loading-screen--asleep');
      if (hint) hint.textContent = WAKE_HINT;
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

// Boot paths that start a run or a scene without the player skip the gate.
function shouldShowGate() {
  if (typeof window === 'undefined' || !window.location) return false;
  const params = new URLSearchParams(window.location.search);
  return !['profile', 'scene', 'content', 'replay'].some((name) =>
    params.has(name)
  );
}
