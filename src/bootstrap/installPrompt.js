// src/bootstrap/installPrompt.js
//
// The browser's own offer to install the game (Android, Chrome or Edge on a
// computer): held from the boot (mobileGuard), and a button calling install()
// opens the browser's confirmation. Buttons show only while the offer stands
// (onInstallable) and go once the game is installed; an installed game never
// gets the offer. iPhone and iPad make none: the door notice draws the steps.

let offer = null;
const listeners = new Set();
const tell = () => listeners.forEach((listener) => listener(Boolean(offer)));

export function watchInstallOffer() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offer = event;
    tell();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    tell();
  });
}

/** Calls `listener(available)` now and each time the offer comes or goes. */
export function onInstallable(listener) {
  listeners.add(listener);
  listener(Boolean(offer));
}

/** Opens the browser's install confirmation; true when the player accepts. */
export async function install() {
  const pending = offer;
  if (!pending) return false;
  offer = null;
  tell();
  await pending.prompt();
  const { outcome } = await pending.userChoice;
  return outcome === 'accepted';
}
