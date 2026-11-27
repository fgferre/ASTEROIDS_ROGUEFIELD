import { SUPPORT_EMAIL } from '../../data/credits.js';
import { RELEASES } from '../../data/changelog.js';
import { asArray } from '../upgradeCatalog.js';
import { inputLayers } from '../input/inputLayers.js';

// src/modules/ui/CreditsOverlay.js
//
// The Credits overlay over the main menu: opens on request, closes on its
// buttons, a backdrop click or Escape, and gives the focus back to its opener.
// The menu's Support button opens it at its support section. What's new (the
// changelog, opened by the version in the menu's corner) is the same kind of
// window: a second CreditsOverlay named 'changelog'.

/** Every `[data-support-email]` link shows the support address and opens the player's mail program on it. */
export function fillSupportEmail(root = document) {
  root.querySelectorAll('[data-support-email]').forEach((link) => {
    link.textContent = SUPPORT_EMAIL;
    link.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Supporting Asteroid Roguefield')}`;
  });
}

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const GROUPS = [
  ['new', 'New'],
  ['improved', 'Improved'],
  ['fixed', 'Fixed'],
];
const escapeText = (text) =>
  text.replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]
  );

/** What's new: every published version, newest first, with its date and its New, Improved and Fixed lines. */
export function changelogMarkup(releases = RELEASES) {
  return releases
    .map(({ version, date, ...lines }, i) => {
      const [year, month, day] = date.split('-').map(Number);
      const when = `${day} ${MONTHS[month - 1]} ${year}${i === 0 ? ' · this version' : ''}`;
      const groups = GROUPS.filter(([key]) => lines[key].length)
        .map(
          ([key, label]) =>
            `<div class="credits-entry"><dt>${label}</dt><dd><ul class="changelog-lines">${lines[
              key
            ]
              .map((line) => `<li>${escapeText(line)}</li>`)
              .join('')}</ul></dd></div>`
        )
        .join('');
      return `<section class="changelog-version"><h3 class="changelog-version__title">${version}<span class="changelog-version__date">${when}</span></h3><dl class="credits-list">${groups}</dl></section>`;
    })
    .join('');
}

/** The menu's corner shows the game's version (package.json); What's new gets its list. */
export function fillChangelog({ body, versionButton }) {
  if (body) body.innerHTML = changelogMarkup();
  if (versionButton) {
    versionButton.textContent = `v${__GAME_VERSION__}`;
    versionButton.setAttribute(
      'aria-label',
      `Version ${__GAME_VERSION__}: what's new`
    );
  }
}

export class CreditsOverlay {
  /**
   * `refs`: the overlay's nodes { overlay, primaryAction, closeButtons }.
   * `emit(name, payload)`: sends ui-hover.
   * `showScreen(name, options)`: shows or hides the overlay.
   * `announceVisibility(isOpen, payload)`: the overlay opened or closed.
   * `name`: the screen, `#<name>-screen` ('credits' or 'changelog').
   */
  constructor({
    refs,
    emit,
    showScreen,
    announceVisibility,
    name = 'credits',
  }) {
    this.name = name;
    this.refs = refs;
    this.emit = emit;
    this.showScreen = showScreen;
    this.announceVisibility = announceVisibility;
    this.creditsState = {
      isOpen: false,
      triggerId: null,
    };
    // Open, on the input layer stack: Escape closes it. The pause key still
    // goes to the game, which ignores it on the menu.
    this.inputLayer = {
      name,
      element: refs.overlay,
      passes: ['pause'],
      onKey: (event) => this.handleCreditsKeyDown(event),
    };
  }

  /** A full screen change hid the overlay: no longer open, no opener kept. */
  markClosed() {
    this.creditsState.isOpen = false;
    this.creditsState.triggerId = null;
    inputLayers.remove(this.inputLayer);
  }

  bindCreditsControls() {
    if (typeof document !== 'undefined') {
      fillSupportEmail();
    }

    const creditsRefs = this.refs;

    if (creditsRefs.overlay) {
      creditsRefs.overlay.addEventListener('click', (event) => {
        if (event.target === creditsRefs.overlay) {
          this.closeCreditsOverlay({ restoreFocus: true });
        }
      });
    }

    asArray(creditsRefs.closeButtons).forEach((button) => {
      button.addEventListener('mouseenter', () => {
        // Only emit if credits menu is visible
        if (
          creditsRefs.overlay &&
          creditsRefs.overlay.classList.contains('hidden')
        ) {
          return;
        }
        this.emit('ui-hover', {
          source: `${this.name}-menu`,
          element: 'close',
        });
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.closeCreditsOverlay({ restoreFocus: true });
      });
    });
  }

  handleCreditsMenuRequest(payload = {}) {
    if (payload && payload.open === false) {
      const restoreFocus = payload.restoreFocus !== false;
      this.closeCreditsOverlay({ restoreFocus });
      return;
    }

    if (payload && payload.toggle === true) {
      if (this.creditsState.isOpen) {
        this.closeCreditsOverlay({ restoreFocus: true });
      } else {
        this.openCreditsOverlay(payload.triggerId);
      }
      return;
    }

    this.openCreditsOverlay(payload?.triggerId, payload?.section);
  }

  openCreditsOverlay(triggerId = null, section = null) {
    const creditsRefs = this.refs;
    const overlay = creditsRefs?.overlay;
    if (!overlay) {
      return;
    }

    let resolvedTriggerId = null;
    if (typeof triggerId === 'string' && triggerId) {
      resolvedTriggerId = triggerId;
    } else if (
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement.id
    ) {
      resolvedTriggerId = document.activeElement.id;
    }

    if (resolvedTriggerId) {
      this.creditsState.triggerId = resolvedTriggerId;
    }

    this.creditsState.isOpen = true;
    inputLayers.push(this.inputLayer);

    this.showScreen(this.name, { overlay: true, show: true });
    overlay.setAttribute('aria-hidden', 'false');
    document.body?.classList.add(`is-${this.name}-open`);
    this.announceVisibility(true, { source: 'menu' });

    const support =
      section === 'support' ? overlay.querySelector('#credits-support') : null;
    support?.scrollIntoView({ block: 'center' });
    const focusTarget =
      support ||
      creditsRefs?.primaryAction ||
      overlay.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus({ preventScroll: Boolean(support) });
    }
  }

  closeCreditsOverlay(options = {}) {
    if (!this.creditsState.isOpen) {
      this.creditsState.triggerId = null;
      return;
    }

    const restoreFocus = Boolean(options?.restoreFocus);
    const triggerId = this.creditsState.triggerId;

    if (restoreFocus && triggerId) {
      const trigger = document.getElementById(triggerId);
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
    }

    const overlay = this.refs.overlay;

    this.showScreen(this.name, { overlay: true, show: false });
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'true');
    }

    document.body?.classList.remove(`is-${this.name}-open`);
    this.announceVisibility(false, { source: 'menu' });

    this.creditsState.isOpen = false;
    this.creditsState.triggerId = null;
    inputLayers.remove(this.inputLayer);
  }

  handleCreditsKeyDown(event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      this.closeCreditsOverlay({ restoreFocus: true });
    }
    return false;
  }
}
