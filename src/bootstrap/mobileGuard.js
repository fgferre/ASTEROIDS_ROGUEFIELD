// src/bootstrap/mobileGuard.js
//
// Pre-DI touch-device gate. A phone or tablet (a coarse primary pointer plus a
// touch signal) plays by touch (input/touchControls.js) held sideways. The
// door notice holds the boot: upright, it asks to turn the device; on a phone
// in the browser it also tells how to add the game to the Home Screen (full
// screen), with a button to play in the browser anyway (remembered for the
// session). TouchControls brings the turn notice back when turned upright
// mid-run. `?desktop=force` keeps the desktop path on any device (captures).
// A screen that declares a mouse (a car, a touch laptop) plays by touch once a
// finger touches it (onFinger) until a key or pad, or for good with
// `?touch=force`, for a browser that sends its touches as a mouse
// (input/touchControls.js decides; setTouchShown tells touchScreen).

import { debugLog } from '../core/debugLogging.js';

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

export const TURN_TEXT = 'Turn your device sideways to play';
export const INSTALL_TEXT_IOS =
  'For full screen, add the game to your Home Screen: tap Share, then Add to Home Screen.';
export const INSTALL_TEXT_OTHER =
  'For full screen, add the game to your Home screen: open the browser menu and choose Add to Home screen.';
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

function noteFinger(event) {
  if (event.pointerType !== 'touch') return;
  fingerSeen = true;
  fingerHandler?.();
}

export const isPortrait = () => window.innerHeight > window.innerWidth;

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

/** A phone in the browser that has not chosen to play there this session. */
function shouldAskToInstall() {
  return (
    isPhone() && !isInstalled() && !playInBrowserChosen && !readPlayInBrowser()
  );
}

const line = (className, text) => {
  const el = document.createElement('p');
  el.className = className;
  el.textContent = text;
  return el;
};

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
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
    notice.appendChild(
      line('door-notice__install', ios ? INSTALL_TEXT_IOS : INSTALL_TEXT_OTHER)
    );
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
  if (!isTouchDevice()) {
    window.addEventListener('pointerdown', noteFinger, true);
    return { touch: false };
  }
  if (hasForceDesktopFlag()) {
    debugLog('[mobileGuard] ?desktop=force override active');
    return { touch: false };
  }
  await waitAtDoor({ install: shouldAskToInstall() });
  return { touch: true };
}
