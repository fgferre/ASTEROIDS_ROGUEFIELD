// src/modules/menu/loadingScreen.js
//
// The boot loading screen (#loading-screen): its bar, percent and message
// follow the menu's asset preload, then it fades out, the menu screen shows
// and the element leaves the DOM. It came from MenuBackgroundSystem.js
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
      // Fade out loading screen
      loadingScreen.classList.add('hidden');

      // Show menu screen
      if (menuScreen) {
        menuScreen.classList.remove('hidden');
      }

      // Remove loading screen from DOM after transition
      setTimeout(() => {
        if (loadingScreen.parentNode) {
          loadingScreen.parentNode.removeChild(loadingScreen);
        }
      }, 600);
    }
  );
}
