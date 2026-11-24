// src/modules/ui/skipHold.js
//
// Skipping a cinematic (Felipe's answers on card cutscenes-pular-1, 23/11):
// only the skip key does it — Space, the pad's Start (Options on a
// PlayStation pad), or the SKIP button itself held by mouse or touch. Held
// HOLD_MS it fills the outline round its glyph and skips the scene ("uma
// cena por segurar"); let go before and the outline empties. A quick tap
// goes to the next line ("só apertar rápido pulo de fala em fala"). Any
// other key, click, touch or pad button only shows the hint, which fades
// once nothing is pressed for a while. A hold outlives the scene it began
// in (or the remote link): the next scene's listener goes on filling the
// same outline; one that skipped counts again only once let go.

import { PAD_BUTTON } from '../../data/constants/gamepad.js';

export const HOLD_MS = 1500; // Felipe, 23/11
// Pressed and let go within this: a tap.
export const TAP_MS = 300;
const HINT_IDLE_MS = 2500;
// Let go early: the outline empties this many times faster than it filled.
const DRAIN_RATE = 3;
const SKIP_CODE = 'Space';

// The pad the game reads (InputSystem's; UISystem hands it over).
let padSource = () => null;
export function setSkipPad(source) {
  padSource = source;
}

/** A PlayStation pad shows its Options button; any other, Xbox's Menu. */
export const padFamily = (pad) =>
  /054c|dualsense|dualshock|playstation/i.test(pad?.id ?? '')
    ? 'playstation'
    : 'xbox';

const hold = {
  key: false,
  pad: false,
  pointer: false,
  since: 0,
  progress: 0,
  needsRelease: false,
};
const holding = () => hold.key || hold.pad || hold.pointer;
let listening = 0;

// The pad's menu button: three lines (Xbox's Menu, PlayStation's Options).
const MENU_LINES =
  '<svg viewBox="0 0 12 10" aria-hidden="true"><path d="M1 1.5h10M1 5h10M1 8.5h10"/></svg>';

let hint = null;
let hideTimer = 0;
let shown = null;

function glyph() {
  const device = document.body.dataset.inputDevice;
  if (device === 'gamepad') return padFamily(padSource());
  return device === 'touch' ? 'touch' : 'keyboard';
}

function hintElement() {
  if (hint) return hint;
  hint = document.createElement('div');
  hint.className = 'skip-hold';
  hint.innerHTML =
    '<span class="skip-hold__button"><svg class="skip-hold__ring" aria-hidden="true"><rect class="skip-hold__track"/><rect class="skip-hold__fill" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg><span class="skip-hold__glyph"></span></span><span class="skip-hold__label">SKIP</span>';
  document.body.append(hint);
  return hint;
}

// The outline traces the button as drawn: a key's pill, the round Menu
// button, the Options capsule, the touch button's pill.
function sizeRing() {
  const button = hint.querySelector('.skip-hold__button');
  const svg = hint.querySelector('.skip-hold__ring');
  const { width, height } = button.getBoundingClientRect();
  if (!width) return;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const inset = 1.5;
  const radius = Math.min(width, height) / 2 - inset;
  svg.querySelectorAll('rect').forEach((rect) => {
    rect.setAttribute('x', inset);
    rect.setAttribute('y', inset);
    rect.setAttribute('width', width - inset * 2);
    rect.setAttribute('height', height - inset * 2);
    rect.setAttribute('rx', radius);
    rect.setAttribute('ry', radius);
  });
}

function reveal() {
  const el = hintElement();
  const now = glyph();
  if (now !== shown) {
    shown = now;
    el.dataset.glyph = now;
    el.querySelector('.skip-hold__glyph').innerHTML =
      { keyboard: 'SPACE', touch: '▶▶' }[now] ?? MENU_LINES;
  }
  el.classList.add('is-showing');
  sizeRing();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(fadeIfIdle, HINT_IDLE_MS);
}

function fadeIfIdle() {
  if (holding()) {
    hideTimer = setTimeout(fadeIfIdle, HINT_IDLE_MS);
    return;
  }
  hint?.classList.remove('is-showing');
}

function drawProgress() {
  if (!hint) return;
  hint
    .querySelector('.skip-hold__fill')
    .setAttribute('stroke-dashoffset', (1 - hold.progress).toFixed(4));
  hint.classList.toggle('is-holding', holding() && !hold.needsRelease);
}

// No cinematic listens any more: the hold and the hint are dropped.
function settle() {
  if (listening > 0) return;
  Object.assign(hold, {
    key: false,
    pad: false,
    pointer: false,
    progress: 0,
    needsRelease: false,
  });
  clearTimeout(hideTimer);
  drawProgress();
  hint?.classList.remove('is-showing');
  // The touch buttons step aside while a cinematic plays (style.css).
  document.body.classList.remove('is-cinematic');
}

/**
 * Listens while a cinematic plays: `onSkip()` when the hold fills, `onNext()`
 * on a tap. Swallows every key, click and touch meanwhile (capture on window:
 * before any other handler); a key still held after the unbind stays
 * swallowed until it is released. Returns the unbind.
 */
export function listenForHold(onSkip, onNext) {
  const keys = new Set();
  let live = true;
  let frame = 0;
  let last = performance.now();
  listening += 1;
  document.body.classList.add('is-cinematic');

  const press = (source) => {
    if (!holding()) hold.since = performance.now();
    hold[source] = true;
  };
  // Let go: a quick one is a tap; one held the whole time skips even if no
  // frame came to fill it (a stalled page); the next hold counts from zero.
  const release = (source) => {
    hold[source] = false;
    if (holding()) return;
    const held = hold.needsRelease ? null : performance.now() - hold.since;
    hold.needsRelease = false;
    if (held !== null && held < TAP_MS) onNext();
    if (held >= HOLD_MS) onSkip();
  };
  const onKeyDown = (event) => {
    if (!live && !(event.repeat && keys.has(event.code))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!live) return;
    keys.add(event.code);
    reveal();
    if (event.code === SKIP_CODE && !hold.key) press('key');
  };
  const detachKeys = () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
  };
  const onKeyUp = (event) => {
    keys.delete(event.code);
    if (!live) {
      if (keys.size === 0) detachKeys();
      return;
    }
    if (event.code === SKIP_CODE && hold.key) release('key');
  };
  const onPointerDown = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    reveal();
    if (event.target?.closest?.('.skip-hold__button')) press('pointer');
  };
  const onPointerUp = () => {
    if (hold.pointer) release('pointer');
  };
  let padHeld = padSource()?.buttons.map((b) => b.pressed) ?? [];
  const tick = () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    const pressed = padSource()?.buttons.map((b) => b.pressed) ?? [];
    if (pressed.some((on, i) => on && !padHeld[i])) reveal();
    padHeld = pressed;
    const start = Boolean(pressed[PAD_BUTTON.START]);
    if (start && !hold.pad) press('pad');
    if (!start && hold.pad) release('pad');

    if (holding() && !hold.needsRelease) {
      hold.progress = Math.min(1, (now - hold.since) / HOLD_MS);
    } else if (hold.progress > 0) {
      const reduced = document.body.classList.contains('motion-reduced');
      hold.progress = reduced
        ? 0
        : Math.max(0, hold.progress - (dt / HOLD_MS) * DRAIN_RATE);
    }
    drawProgress();
    if (hold.progress >= 1) {
      hold.progress = 0;
      hold.needsRelease = true;
      drawProgress();
      onSkip();
    }
    if (live) frame = window.requestAnimationFrame(tick);
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  frame = window.requestAnimationFrame(tick);
  return () => {
    if (!live) return;
    live = false;
    listening -= 1;
    window.cancelAnimationFrame(frame);
    if (keys.size === 0) detachKeys();
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerUp, true);
    // The next scene binds at once (after the link, as the run starts).
    setTimeout(settle, 0);
  };
}
