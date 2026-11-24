// src/modules/ui/skipHold.js
//
// TRIAL (card cutscenes-pular-1, 23/11): skipping a cinematic by holding one
// key, for Felipe to feel before anything is locked ("uma tecla especifica
// que tem que ficar apertada [...] Se qq tecla for pressiponada durante um
// cutscne aparece o hint de como pular e um contador em circular"). Only on
// the test address: ?skipHold=<seconds> turns it on; ?skipLook=a|b|c picks
// the hint's look, ?skipAll=1|0 one hold to the run or one scene per hold,
// ?skipKey=space|enter|escape the keyboard's key. Without ?skipHold the
// cinematics skip on any press, as before.
//
// Any key, click, touch or pad button only shows the hint; the skip key
// (the keyboard's, Start on the pad, or the hint itself held by mouse or
// touch) held for the time fills the ring round its glyph and skips; let go
// before and the ring empties. The hint fades once nothing is pressed for a
// while. A hold outlives the scene (or the remote link) it began in: the
// next one's listener goes on filling the same ring.

const KEYS = {
  space: { code: 'Space', glyph: 'SPACE' },
  enter: { code: 'Enter', glyph: 'ENTER' },
  escape: { code: 'Escape', glyph: 'ESC' },
};
const PAD_START = 9;
const HINT_IDLE_MS = 2500;
// Let go early: the ring empties this many times faster than it filled.
const DRAIN_RATE = 3;

function readTrial() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location?.search ?? '');
  const seconds = Number(params.get('skipHold'));
  if (!(seconds > 0)) return null;
  const look = params.get('skipLook');
  return {
    holdMs: seconds * 1000,
    look: ['a', 'b', 'c'].includes(look) ? look : 'b',
    all: params.get('skipAll') !== '0',
    key: KEYS[params.get('skipKey')] ?? KEYS.space,
  };
}

export const SKIP_TRIAL = readTrial();
// The any-key hint (hudMarkup.js) keeps its place, unseen: the touch
// buttons still step aside while it shows (style.css).
if (SKIP_TRIAL) document.body?.classList.add('skip-trial');

// The pad the game reads (InputSystem's; UISystem hands its index over).
let padIndex = () => 0;
export function setSkipPad(index) {
  padIndex = index;
}
function readPad() {
  const pads = navigator.getGamepads?.() ?? [];
  return pads[padIndex()] || Array.from(pads).find(Boolean) || null;
}

// The hold, shared by every listener so that it carries over.
const hold = {
  key: false,
  pad: false,
  pointer: false,
  since: 0,
  progress: 0,
  // A hold that skipped counts again only once let go.
  needsRelease: false,
};
const holding = () => hold.key || hold.pad || hold.pointer;
let listening = 0;

// A run started by a hold that filled during the remote link skips its
// opening at once (one hold to the run).
let queued = false;
export function queueSkipToRun() {
  queued = true;
}
export function takeQueuedSkip() {
  const was = queued;
  queued = false;
  return was;
}

let hint = null;
let hideTimer = 0;
let shownDevice = null;

function device() {
  const d = document.body?.dataset?.inputDevice;
  return d === 'gamepad' || d === 'touch' ? d : 'keyboard';
}

function glyphFor(dev) {
  if (dev === 'gamepad') return 'START';
  if (dev === 'touch') return '▶▶';
  return SKIP_TRIAL.key.glyph;
}

const RING =
  '<svg class="skip-hold__ring" aria-hidden="true"><rect class="skip-hold__track"/><rect class="skip-hold__fill" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>';

// A: the key's own outline fills, in the corner. B: a ring round the key,
// in the line where the hint is today. C: a round button in the corner.
const MARKUP = {
  a: `<span class="skip-hold__button">${RING}<span class="skip-hold__glyph"></span></span><span class="skip-hold__label">HOLD TO SKIP</span>`,
  b: `<span class="skip-hold__label">HOLD</span><span class="skip-hold__button">${RING}<span class="skip-hold__glyph"></span></span><span class="skip-hold__label">TO SKIP</span>`,
  c: `<span class="skip-hold__button">${RING}<span class="skip-hold__glyph"></span><span class="skip-hold__word">SKIP</span></span><span class="skip-hold__label">HOLD</span>`,
};

function hintElement() {
  if (hint) return hint;
  hint = document.createElement('div');
  hint.className = `skip-hold skip-hold--${SKIP_TRIAL.look}`;
  hint.innerHTML = MARKUP[SKIP_TRIAL.look];
  document.body.append(hint);
  return hint;
}

// The ring traces the button's outline as drawn: a pill round a key, a
// circle round a square button.
function sizeRing() {
  const button = hint.querySelector('.skip-hold__button');
  const svg = hint.querySelector('.skip-hold__ring');
  const { width, height } = button.getBoundingClientRect();
  if (!width) return;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const inset = 1.5;
  const radius = Math.min(width, height) / 2 - inset;
  for (const rect of svg.querySelectorAll('rect')) {
    rect.setAttribute('x', inset);
    rect.setAttribute('y', inset);
    rect.setAttribute('width', width - inset * 2);
    rect.setAttribute('height', height - inset * 2);
    rect.setAttribute('rx', radius);
    rect.setAttribute('ry', radius);
  }
}

function reveal() {
  const el = hintElement();
  const dev = device();
  if (dev !== shownDevice) {
    shownDevice = dev;
    el.dataset.device = dev;
    el.querySelector('.skip-hold__glyph').textContent = glyphFor(dev);
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
}

/**
 * Listens for the hold while a cinematic plays; `onSkip()` when it fills.
 * Swallows every key, click and touch meanwhile (capture on window: before
 * any other handler), as the any-key skip did; a key still held after the
 * unbind stays swallowed until it is released. Returns the unbind.
 */
export function listenForHold(onSkip) {
  const { holdMs, key } = SKIP_TRIAL;
  const keys = new Set();
  let live = true;
  let frame = 0;
  let last = performance.now();
  let padHeld = readPad()?.buttons.map((b) => b.pressed) ?? [];
  listening += 1;

  const startHold = () => {
    if (!holding()) hold.since = performance.now();
  };
  const onKeyDown = (event) => {
    if (!live && !(event.repeat && keys.has(event.code))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!live) return;
    keys.add(event.code);
    reveal();
    if (event.code === key.code && !event.repeat) {
      startHold();
      hold.key = true;
    }
  };
  const detachKeys = () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
  };
  const onKeyUp = (event) => {
    keys.delete(event.code);
    if (event.code === key.code) hold.key = false;
    if (!live && keys.size === 0) detachKeys();
  };
  const onPointerDown = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    reveal();
    if (event.target?.closest?.('.skip-hold__button')) {
      startHold();
      hold.pointer = true;
    }
  };
  const onPointerUp = () => {
    hold.pointer = false;
  };
  const tick = () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    const pressed = readPad()?.buttons.map((b) => b.pressed) ?? [];
    if (pressed.some((on, i) => on && !padHeld[i])) reveal();
    if (pressed[PAD_START] && !padHeld[PAD_START]) startHold();
    hold.pad = Boolean(pressed[PAD_START]);
    padHeld = pressed;

    if (!holding()) hold.needsRelease = false;
    if (holding() && !hold.needsRelease) {
      hold.progress = Math.min(1, (now - hold.since) / holdMs);
    } else if (hold.progress > 0) {
      const reduced = document.body.classList.contains('motion-reduced');
      hold.progress = reduced
        ? 0
        : Math.max(0, hold.progress - (dt / holdMs) * DRAIN_RATE);
    }
    drawProgress();
    if (hold.progress >= 1) {
      hold.progress = 0;
      hold.needsRelease = true;
      drawProgress();
      onSkip();
      return;
    }
    frame = window.requestAnimationFrame(tick);
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
    // The next scene binds at once (or, after the link, as the run starts).
    setTimeout(settle, 0);
  };
}
