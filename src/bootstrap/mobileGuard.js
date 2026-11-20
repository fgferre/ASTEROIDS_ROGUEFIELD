// src/bootstrap/mobileGuard.js
//
// Pre-DI touch-device gate. A phone or tablet (a coarse primary pointer plus a
// touch signal) plays by touch (input/touchControls.js) held sideways. The
// door notice holds the boot: upright, it asks to turn the device; on a phone
// or an iPad in the browser it also tells how to add the game to the Home
// Screen (full screen: the two steps drawn on iOS, the browser's own Install
// button on Android, installPrompt.js), with a button to play in the browser
// anyway (remembered for the session). TouchControls brings the turn notice back when turned upright
// mid-run. `?desktop=force` keeps the desktop path on any device (captures).
// A screen that declares a mouse (a car, a touch laptop) plays by touch once a
// finger touches it (onFinger) until a key or pad, or for good with
// `?touch=force`, for a browser that sends its touches as a mouse
// (input/touchControls.js decides; setTouchShown tells touchScreen).

import { debugLog } from '../core/debugLogging.js';
import { install, onInstallable, watchInstallOffer } from './installPrompt.js';

const DESKTOP_FORCE_PARAM = 'desktop';
const DESKTOP_FORCE_VALUE = 'force';
const TOUCH_FORCE_PARAM = 'touch';
/** A screen whose short side is under this (CSS px) is a phone. */
const PHONE_MAX_SIDE = 500;
const PLAY_IN_BROWSER_KEY = 'roguefield:play-in-browser';
/** The choice for this visit when sessionStorage is blocked (Safari private modes). */
let playInBrowserChosen = false;
/** Touch play is on where the device does not declare it (setTouchShown). */
let touchShown = false;
let fingerSeen = false;
let fingerHandler = null;
/** The pointer type of the last press since the boot, for screenReport. */
let lastPress = null;

export const TURN_TEXT = 'Turn your device sideways to play';
export const INSTALL_TEXT_IOS =
  'For full screen, add the game to your Home Screen:';
export const INSTALL_TEXT_OTHER =
  'For full screen, add the game to your Home screen: open the browser menu and choose Add to Home screen.';
/** Android with the browser's own offer: the button opens its confirmation. */
export const INSTALL_TEXT_OFFER =
  'For full screen, install the game on your Home screen.';
export const INSTALL_BUTTON_TEXT = 'Install';
export const INSTALLED_TEXT =
  'Installed: open the game from its icon on your Home screen.';
// Safari's own glyphs for the two steps (Felipe's pick, 20/11).
const SHARE_GLYPH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 9.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2h-1.5"/><path d="M12 14.5V3M8.5 6.5 12 3l3.5 3.5"/></svg>';
const ADD_GLYPH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
export const PLAY_IN_BROWSER_TEXT = 'Play in the browser anyway';

/**
 * A coarse primary pointer plus one touch signal: Windows laptops report
 * maxTouchPoints > 0 alone, so that is not enough.
 */
function isTouchDevice() {
  if (!window.matchMedia?.('(pointer: coarse)')?.matches) {
    return false;
  }
  const hasTouchStart = 'ontouchstart' in window;
  const hasTouchPoints =
    typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return hasTouchStart || hasTouchPoints;
}

/** True when ?<param>=force is in the URL (case-insensitive value). */
function hasForceFlag(param) {
  const params = new URLSearchParams(window.location?.search || '');
  return params.get(param)?.trim().toLowerCase() === DESKTOP_FORCE_VALUE;
}

const hasForceDesktopFlag = () => hasForceFlag(DESKTOP_FORCE_PARAM);

/** ?touch=force: touch play from the start, mouse-type pointers included. */
export const hasForceTouchFlag = () => hasForceFlag(TOUCH_FORCE_PARAM);

/** A phone or tablet that says it is one (Touch Controls is not offered there). */
export const declaresTouch = () =>
  typeof window !== 'undefined' && isTouchDevice();

/**
 * What this screen tells the browser, for Settings' Touch Controls line: a
 * photo of it says how a car or laptop declares itself.
 */
export function screenReport() {
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  return {
    pointer: coarse ? 'touch' : 'mouse',
    touchPoints: navigator.maxTouchPoints ?? 0,
    lastPress: lastPress ?? 'none',
  };
}

/** A screen that does not declare touch may still turn to it (not ?desktop=force). */
export const mayTurnToTouch = () => !hasForceDesktopFlag();

/** Touch play turned on or off where the device does not declare it. */
export function setTouchShown(on) {
  touchShown = on;
}

/**
 * Calls `handler` on each finger press since the boot (at once if one came
 * already): a pointer of type touch, whatever the browser declares.
 */
export function onFinger(handler) {
  fingerHandler = handler;
  if (fingerSeen) handler();
}

function notePress(event) {
  lastPress = event.pointerType;
  if (event.pointerType !== 'touch') return;
  fingerSeen = true;
  fingerHandler?.();
}

export const isPortrait = () => window.innerHeight > window.innerWidth;

/** iPhone or iPad (an iPad's Safari may call itself a Mac with touch). */
const isIOS = () => {
  const agent = navigator.userAgent || '';
  return (
    /iPhone|iPad|iPod/.test(agent) ||
    (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
  );
};

const isPhone = () =>
  Math.min(
    window.screen?.width ?? window.innerWidth,
    window.screen?.height ?? window.innerHeight
  ) < PHONE_MAX_SIDE;

/**
 * The touch screen the game is played on, 'phone' or 'tablet' (the HUD has
 * a layout for each, data/ui/hudPresets.js), or null when it is not played
 * by touch: what mobileGuard below lets in, or a screen played by touch
 * since (setTouchShown).
 */
export function touchScreen() {
  if (typeof window === 'undefined' || hasForceDesktopFlag()) return null;
  if (!touchShown && !isTouchDevice()) return null;
  return isPhone() ? 'phone' : 'tablet';
}

/** Running from the Home Screen (iOS's own flag, or the manifest's mode). */
const isInstalled = () =>
  navigator.standalone === true ||
  ['standalone', 'fullscreen'].some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`)?.matches
  );

function readPlayInBrowser() {
  try {
    return window.sessionStorage?.getItem(PLAY_IN_BROWSER_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberPlayInBrowser() {
  playInBrowserChosen = true;
  try {
    window.sessionStorage?.setItem(PLAY_IN_BROWSER_KEY, '1');
  } catch {
    // Blocked storage: the choice lives in memory for this visit.
  }
}

/**
 * A phone, or an iPad (no install offer of its own), in the browser that has
 * not chosen to play there this session.
 */
function shouldAskToInstall() {
  return (
    (isPhone() || isIOS()) &&
    !isInstalled() &&
    !playInBrowserChosen &&
    !readPlayInBrowser()
  );
}

const line = (className, text) => {
  const el = document.createElement('p');
  el.className = className;
  el.textContent = text;
  return el;
};

const installStep = (number, glyph, title, note) => {
  const el = document.createElement('div');
  el.className = 'door-step';
  el.innerHTML = `<b>${number}</b><span class="door-step__key">${glyph}</span><span>${title}<small>${note}</small></span>`;
  return el;
};

/** iPhone and iPad: the two steps, drawn. */
function appendInstallSteps(notice) {
  notice.appendChild(line('door-notice__install', INSTALL_TEXT_IOS));
  const steps = document.createElement('div');
  steps.className = 'door-steps';
  const where = isPhone() ? 'at the bottom' : 'at the top';
  steps.appendChild(
    installStep(
      1,
      SHARE_GLYPH,
      'Tap Share',
      `${where} of Safari, or in its ⋯ menu`
    )
  );
  steps.appendChild(
    installStep(
      2,
      ADD_GLYPH,
      'Add to Home Screen',
      'then open the game from its icon'
    )
  );
  notice.appendChild(steps);
}

/** Android: the browser's install button while it offers one, else how to. */
function appendInstallOffer(notice) {
  const text = line('door-notice__install', INSTALL_TEXT_OTHER);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--primary door-notice__install-btn';
  button.textContent = INSTALL_BUTTON_TEXT;
  onInstallable((available) => {
    button.hidden = !available;
    text.textContent = available ? INSTALL_TEXT_OFFER : INSTALL_TEXT_OTHER;
  });
  button.addEventListener('click', async () => {
    if (await install()) text.textContent = INSTALLED_TEXT;
  });
  notice.appendChild(text);
  notice.appendChild(button);
}

/**
 * The door notice: resolves once the device is sideways and, when `install`,
 * the player chose to play in the browser. The turn line shows only while
 * upright (`.is-upright`).
 */
export function waitAtDoor({ install = false } = {}) {
  let asking = install;
  if (!isPortrait() && !asking) {
    return Promise.resolve();
  }
  const notice = document.createElement('div');
  notice.className = 'door-notice';
  notice.setAttribute('role', 'alert');
  notice.appendChild(line('door-notice__turn', TURN_TEXT));
  const skip = asking ? document.createElement('button') : null;
  if (skip) {
    if (isIOS()) appendInstallSteps(notice);
    else appendInstallOffer(notice);
    skip.type = 'button';
    skip.className = 'btn door-notice__skip';
    skip.textContent = PLAY_IN_BROWSER_TEXT;
    notice.appendChild(skip);
  }
  document.getElementById('game-container')?.appendChild(notice);
  return new Promise((resolve) => {
    const check = () => {
      notice.classList.toggle('is-upright', isPortrait());
      if (isPortrait() || asking) {
        return;
      }
      window.removeEventListener('resize', check);
      notice.remove();
      resolve();
    };
    skip?.addEventListener('click', () => {
      asking = false;
      rememberPlayInBrowser();
      check();
    });
    window.addEventListener('resize', check);
    check();
  });
}

/**
 * Resolves `{ touch }` when the boot may go on: at once on a desktop (or with
 * ?desktop=force), on a touch device once it passed the door notice.
 *
 * @returns {Promise<{ touch: boolean }>}
 */
export async function mobileGuard() {
  if (typeof window === 'undefined') {
    return { touch: false };
  }
  watchInstallOffer();
  if (!isTouchDevice()) {
    window.addEventListener('pointerdown', notePress, true);
    return { touch: false };
  }
  if (hasForceDesktopFlag()) {
    debugLog('[mobileGuard] ?desktop=force override active');
    return { touch: false };
  }
  await waitAtDoor({ install: shouldAskToInstall() });
  return { touch: true };
}
