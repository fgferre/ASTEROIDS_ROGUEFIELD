// src/modules/menu/pilotSelect.js
//
// "Choose your pilot" (the owner's card saves-1, 19/11: after PRESS START,
// on every entry, with each pilot's full summary). Up after the start press,
// over the gated menu; the focus waits on the pilot in play, so one tap,
// Enter or pad Ⓐ goes on with it. Another pilot is a new page: its save is
// read as the game boots (core/storage.js), so choosing one saves the choice
// and reloads, and the reloaded entry skips this screen once. A pilot is
// deleted through a box whose focus starts on Cancel (the same card, answer
// 3): deleting the one in play reloads back to this screen. Another tab can
// change the pilots under it: the screen shows them again as they are, a box
// about a pilot deleted meanwhile deletes nothing, and Continue on a pilot this
// page holds an old copy of reloads it (core/storage.js).

import {
  chooseSlot,
  deleteSlot,
  getActiveSlot,
  isPilotStale,
  slotDeletions,
} from '../../core/storage.js';
import { pilotSummaries } from '../../services/pilots.js';
import { localDay } from '../../services/runRecords.js';

// Set across the reload a choice makes: that entry goes straight on.
const CHOSEN_KEY = 'roguefield:pilot-chosen';
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
// The keys this screen answers; the rest (Tab, the browser's) pass.
const SCREEN_KEYS = [
  'ArrowLeft',
  'ArrowUp',
  'ArrowRight',
  'ArrowDown',
  'Enter',
  ' ',
  'Escape',
];

/** 'Today', or the day as '12 Nov'; '—' for none. */
export function lastFlownLabel(day, today = localDay(new Date())) {
  if (!day) return '—';
  if (day === today) return 'Today';
  const [, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS[month - 1]}`;
}

/** One pilot's card: its summary and the button that goes on with it. */
export function pilotCardMarkup(summary, slot, active) {
  const action = active ? 'Continue' : summary ? 'Fly' : 'New pilot';
  const head = `<div class="pilot-card__head"><span class="pilot-card__name">Pilot ${slot}</span>${
    active ? '<span class="pilot-card__tag">Flying</span>' : ''
  }</div>`;
  const body = summary
    ? `<dl class="pilot-card__stats">
        <dt>Deepest layer</dt><dd>${summary.layer}</dd>
        <dt>Sectors won</dt><dd>${summary.sectorsWon} / ${summary.sectors}</dd>
        <dt>Medals</dt><dd>${summary.medals} / ${summary.medalsTotal}</dd>
        <dt>Salvage</dt><dd>${summary.salvage}</dd>
        <dt>Last flown</dt><dd>${lastFlownLabel(summary.lastRun)}</dd>
      </dl>`
    : `<p class="pilot-card__empty"><strong>Empty</strong>A new pilot starts at the first sector, and the story is told from the beginning.</p>`;
  const remove = summary
    ? `<button type="button" class="pilot-card__delete" data-pilot-delete="${slot}">Delete</button>`
    : '';
  return `<li class="pilot-card${active ? ' is-active' : ''}">${head}${body}<div class="pilot-card__actions"><button type="button" class="pilot-card__go" data-pilot-slot="${slot}">${action}</button>${remove}</div></li>`;
}

/** The box that asks before a pilot is deleted; Cancel comes first. */
export function deleteConfirmMarkup(summary, slot) {
  const sectors = `${summary.sectorsWon} sector${summary.sectorsWon === 1 ? '' : 's'} won`;
  const medals = `${summary.medals} medal${summary.medals === 1 ? '' : 's'}`;
  return `<div class="pilot-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pilot-confirm-title">
      <h3 id="pilot-confirm-title">Delete Pilot ${slot}?</h3>
      <p>Deepest layer ${summary.layer} · ${sectors} · ${medals} · ${summary.salvage} Salvage.</p>
      <p>This cannot be undone.</p>
      <div class="pilot-confirm__row">
        <button type="button" class="pilot-confirm__cancel" data-confirm="cancel">Cancel</button>
        <button type="button" class="pilot-confirm__delete" data-confirm="delete">Delete</button>
      </div>
    </div>`;
}

/**
 * True once, on the entry right after a pilot was chosen, and only if that
 * pilot is the one this page plays (a choice that did not stick shows the
 * pilots again).
 */
export function justChosen() {
  try {
    const chosen = Number(window.sessionStorage?.getItem(CHOSEN_KEY));
    window.sessionStorage?.removeItem(CHOSEN_KEY);
    return chosen === getActiveSlot();
  } catch {
    return false;
  }
}

// Pad: Ⓐ, Start, and left/right on the d-pad or the left stick.
function padState() {
  const pads = Array.from(navigator.getGamepads?.() ?? []).filter(Boolean);
  const pressed = (index) => pads.some((pad) => pad.buttons[index]?.pressed);
  const axis = pads.reduce((sum, pad) => sum + (pad.axes[0] ?? 0), 0);
  return {
    go: pressed(0) || pressed(9),
    back: pressed(1),
    left: pressed(14) || axis < -0.5,
    right: pressed(15) || axis > 0.5,
  };
}

/**
 * Shows the pilots and calls `onContinue` when the pilot in play goes on;
 * another pilot reloads the page instead. Straight to `onContinue` on the
 * entry a choice reloaded into.
 */
export function openPilotSelect(onContinue) {
  if (justChosen()) {
    onContinue();
    return;
  }
  const active = getActiveSlot();
  const screen = document.createElement('div');
  screen.className = 'pilot-screen';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-labelledby', 'pilot-screen-title');
  document.body.appendChild(screen);
  let summaries = [];
  let confirming = null; // the slot the box asks about, or null
  let confirmSeen = 0; // that pilot's deletion count as the box opened
  let refused = null; // a pilot the browser would not store as the next one
  let done = false;
  let rafId = 0;
  let held = padState();

  function render(focusSelector) {
    summaries = pilotSummaries();
    // The pilot the box asks about was deleted (in another tab) meanwhile.
    if (
      confirming &&
      (!summaries[confirming - 1] || slotDeletions(confirming) !== confirmSeen)
    ) {
      confirming = null;
      focusSelector = `[data-pilot-slot="${active}"]`;
    }
    screen.innerHTML = `<div class="credits-dialog pilot-dialog">
        <header class="credits-header"><h2 id="pilot-screen-title" class="credits-title">Choose your pilot</h2></header>${
          refused
            ? `<p class="pilot-error" role="alert">Pilot ${refused} could not be saved as the one to fly: this browser refused to store it. Pilot ${active} stays.</p>`
            : ''
        }
        <ul class="pilot-cards">${summaries
          .map((summary, i) =>
            pilotCardMarkup(summary, i + 1, i + 1 === active)
          )
          .join('')}</ul>
      </div>${
        confirming
          ? `<div class="pilot-confirm__veil">${deleteConfirmMarkup(summaries[confirming - 1], confirming)}</div>`
          : ''
      }`;
    screen.querySelector(focusSelector)?.focus({ preventScroll: true });
  }

  // The buttons the arrows step through: the box's while it is up.
  const focusable = () => [
    ...screen.querySelectorAll(
      confirming ? '[data-confirm]' : '[data-pilot-slot], [data-pilot-delete]'
    ),
  ];

  function leave() {
    done = true;
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('storage', onStorage);
  }

  // Another tab changed the pilots: shown again as they are.
  function onStorage() {
    render(
      confirming ? '[data-confirm="cancel"]' : `[data-pilot-slot="${active}"]`
    );
  }

  function choose(slot) {
    if (done) return;
    // A pilot changed in another tab goes on through a new page, as any other.
    if (slot === active && !isPilotStale()) {
      leave();
      screen.remove();
      onContinue();
      return;
    }
    // Not stored: no reload into the wrong pilot; this screen says so.
    if (!chooseSlot(slot)) {
      refused = slot;
      render(`[data-pilot-slot="${active}"]`);
      return;
    }
    leave();
    try {
      window.sessionStorage?.setItem(CHOSEN_KEY, String(slot));
    } catch {
      // No session storage: the reloaded entry shows the pilots once more.
    }
    window.location.reload();
  }

  function ask(slot) {
    confirming = slot;
    confirmSeen = slotDeletions(slot);
    render('[data-confirm="cancel"]');
  }

  function answer(remove) {
    const slot = confirming;
    confirming = null;
    if (!remove) {
      render(`[data-pilot-delete="${slot}"]`);
      return;
    }
    if (!deleteSlot(slot, confirmSeen)) {
      render(`[data-pilot-slot="${active}"]`);
      return;
    }
    if (slot === active) {
      // The pilot in play is in memory: a new page, back to this screen.
      leave();
      window.location.reload();
      return;
    }
    render(`[data-pilot-slot="${active}"]`);
  }

  function activate(button) {
    if (!button || done) return;
    const { pilotSlot, pilotDelete, confirm } = button.dataset;
    if (confirm) answer(confirm === 'delete');
    else if (pilotDelete) ask(Number(pilotDelete));
    else if (pilotSlot) choose(Number(pilotSlot));
  }

  function move(step) {
    const buttons = focusable();
    const at = buttons.indexOf(document.activeElement);
    const next = (Math.max(0, at) + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  // Capture phase: the menu under this screen hears none of these keys. A
  // held key's repeats do nothing, so a held Enter never reaches Delete.
  function onKey(event) {
    if (!SCREEN_KEYS.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[
      event.key
    ];
    if (step) move(step);
    else if (event.key === 'Escape' && confirming) answer(false);
    else if (event.key === 'Enter' || event.key === ' ') {
      const own = focusable().includes(document.activeElement);
      activate(own ? document.activeElement : focusable()[0]);
    }
  }

  function pollPad() {
    const now = padState();
    if (now.go && !held.go) {
      const own = focusable().includes(document.activeElement);
      activate(own ? document.activeElement : focusable()[0]);
    } else if (now.back && !held.back && confirming) answer(false);
    else if (now.left && !held.left) move(-1);
    else if (now.right && !held.right) move(1);
    held = now;
    if (!done) rafId = requestAnimationFrame(pollPad);
  }

  screen.addEventListener('click', (event) =>
    activate(event.target.closest('button'))
  );
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('storage', onStorage);
  rafId = requestAnimationFrame(pollPad);
  render(`[data-pilot-slot="${active}"]`);
}
