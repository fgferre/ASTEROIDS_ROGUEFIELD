// src/modules/ui/CreditsOverlay.js
//
// The Credits overlay over the main menu: opens on request, closes on its
// buttons, a backdrop click or Escape, and gives the focus back to its opener.

const ensureArray = (value) => (Array.isArray(value) ? value : []);

export class CreditsOverlay {
  /**
   * `refs`: the overlay's nodes { overlay, primaryAction, closeButtons }.
   * `emit(name, payload)`: sends ui-hover.
   * `showScreen(name, options)`: shows or hides the overlay.
   * `announceVisibility(isOpen, payload)`: the overlay opened or closed.
   */
  constructor({ refs, emit, showScreen, announceVisibility }) {
    this.refs = refs;
    this.emit = emit;
    this.showScreen = showScreen;
    this.announceVisibility = announceVisibility;
    this.creditsState = {
      isOpen: false,
      triggerId: null,
    };
    this.handleCreditsKeyDown = this.handleCreditsKeyDown.bind(this);
  }

  /** A full screen change hid the overlay: no longer open, no opener kept. */
  markClosed() {
    this.creditsState.isOpen = false;
    this.creditsState.triggerId = null;
  }

  bindCreditsControls() {
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.handleCreditsKeyDown);
    }

    const creditsRefs = this.refs;

    if (creditsRefs.overlay) {
      creditsRefs.overlay.addEventListener('click', (event) => {
        if (event.target === creditsRefs.overlay) {
          this.closeCreditsOverlay({ restoreFocus: true });
        }
      });
    }

    ensureArray(creditsRefs.closeButtons).forEach((button) => {
      button.addEventListener('mouseenter', () => {
        // Only emit if credits menu is visible
        if (
          creditsRefs.overlay &&
          creditsRefs.overlay.classList.contains('hidden')
        ) {
          return;
        }
        this.emit('ui-hover', {
          source: 'credits-menu',
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

    this.openCreditsOverlay(payload?.triggerId);
  }

  openCreditsOverlay(triggerId = null) {
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

    this.showScreen('credits', { overlay: true, show: true });
    overlay.setAttribute('aria-hidden', 'false');
    document.body?.classList.add('is-credits-open');
    this.announceVisibility(true, { source: 'menu' });

    const focusTarget =
      creditsRefs?.primaryAction ||
      overlay.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus();
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

    this.showScreen('credits', { overlay: true, show: false });
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'true');
    }

    document.body?.classList.remove('is-credits-open');
    this.announceVisibility(false, { source: 'menu' });

    this.creditsState.isOpen = false;
    this.creditsState.triggerId = null;
  }

  handleCreditsKeyDown(event) {
    if (!this.creditsState.isOpen) {
      return;
    }

    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      this.closeCreditsOverlay({ restoreFocus: true });
    }
  }
}
