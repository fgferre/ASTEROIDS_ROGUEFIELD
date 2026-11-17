// src/modules/menu/loadingScreen.js
//
// The boot loading screen (#loading-screen): its bar, percent and message
// follow the menu's asset preload, then it becomes a PRESS START gate over the
// live scene; a start press fades it out, shows the menu screen and the
// element leaves the DOM. It came from MenuBackgroundSystem.js
// unchanged.

/**
 * Sets up the loading screen UI and connects callbacks.
 * Automatically updates progress bar and hides loading when complete.
 * @param {(onProgress: Function, onComplete: Function) => void}
 *   setLoadingCallbacks - the system's
 */
export function setupLoadingScreen(setLoadingCallbacks) {
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
    let started = false;
    let rafId = 0;
    let padHeld = padPressed();

    function start() {
      if (started) return;
      started = true;
      document.removeEventListener('keydown', onKeyDown);
      loadingScreen.removeEventListener('click', start);
      cancelAnimationFrame(rafId);
      finish();
      menuScreen?.querySelector('button:not([disabled])')?.focus();
    }

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
        start();
        return;
      }
      padHeld = pressed;
      rafId = requestAnimationFrame(pollPad);
    }

    // The game shows the menu at boot, under the loading screen: keep its
    // panels out of sight (the scene canvas stays) until the player starts.
    menuScreen?.classList.add('menu-screen--gated');
    loadingScreen.classList.add('loading-screen--gate');
    document.addEventListener('keydown', onKeyDown);
    loadingScreen.addEventListener('click', start);
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
