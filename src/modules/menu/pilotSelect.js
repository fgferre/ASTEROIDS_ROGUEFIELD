// src/modules/menu/pilotSelect.js
//
// "Choose your pilot" (the owner's card saves-1, 19/11: after PRESS START,
// on every entry, with each pilot's full summary). Up after the start press,
// over the gated menu; the focus waits on the pilot in play, so one tap,
// Enter or pad Ⓐ goes on with it. Another pilot is a new page: its save is
// read as the game boots (core/storage.js), so choosing one saves the choice
// and reloads, and the reloaded entry skips this screen once.

import { chooseSlot, getActiveSlot } from '../../core/storage.js';
import { pilotSummaries } from '../../services/pilots.js';
import { localDay } from '../../services/runRecords.js';

// Set across the reload a choice makes: that entry goes straight on.
const CHOSEN_KEY = 'roguefield:pilot-chosen';
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

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
  return `<li class="pilot-card${active ? ' is-active' : ''}">${head}${body}<button type="button" class="pilot-card__go" data-pilot-slot="${slot}">${action}</button></li>`;
}

/** True once, on the entry right after a pilot was chosen. */
function justChosen() {
  try {
    const chosen = window.sessionStorage?.getItem(CHOSEN_KEY) === '1';
    window.sessionStorage?.removeItem(CHOSEN_KEY);
    return chosen;
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
  screen.innerHTML = `<div class="credits-dialog pilot-dialog">
      <header class="credits-header"><h2 id="pilot-screen-title" class="credits-title">Choose your pilot</h2></header>
      <ul class="pilot-cards">${pilotSummaries()
        .map((summary, i) => pilotCardMarkup(summary, i + 1, i + 1 === active))
        .join('')}</ul>
    </div>`;
  document.body.appendChild(screen);
  const buttons = [...screen.querySelectorAll('[data-pilot-slot]')];
  let chosen = false;
  let rafId = 0;
  let held = padState();

  function choose(slot) {
    if (chosen) return;
    chosen = true;
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKey, true);
    if (slot === active) {
      screen.remove();
      onContinue();
      return;
    }
    chooseSlot(slot);
    try {
      window.sessionStorage?.setItem(CHOSEN_KEY, '1');
    } catch {
      // No session storage: the reloaded entry shows the pilots once more.
    }
    window.location.reload();
  }

  function move(step) {
    const at = buttons.indexOf(document.activeElement);
    const next = (Math.max(0, at) + step + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  // Capture phase: the menu under this screen hears none of these keys.
  function onKey(event) {
    if (event.repeat) return;
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[
      event.key
    ];
    if (step) {
      move(step);
    } else if (event.key === 'Enter' || event.key === ' ') {
      const slot = Number(document.activeElement?.dataset?.pilotSlot);
      choose(slot || active);
    } else if (event.key !== 'Tab') {
      return;
    }
    if (event.key !== 'Tab') {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function pollPad() {
    const now = padState();
    if (now.go && !held.go) {
      const slot = Number(document.activeElement?.dataset?.pilotSlot);
      choose(slot || active);
      return;
    }
    if (now.left && !held.left) move(-1);
    if (now.right && !held.right) move(1);
    held = now;
    rafId = requestAnimationFrame(pollPad);
  }

  buttons.forEach((button) =>
    button.addEventListener('click', () =>
      choose(Number(button.dataset.pilotSlot))
    )
  );
  document.addEventListener('keydown', onKey, true);
  rafId = requestAnimationFrame(pollPad);
  buttons[active - 1].focus({ preventScroll: true });
}
