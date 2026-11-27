// src/modules/ui/EndCredits.js
//
// The end credits after the campaign's last ending: the names roll up slowly
// over the field, the support line and Continue stay at the bottom; Continue,
// Enter or Escape ends them and hands over to the final card. Announced as the
// 'end-credits' overlay, so a track can be tied to it.

export class EndCredits {
  /**
   * `refs`: { overlay, roll, continueBtn }.
   * `showScreen(name, options)`: shows or hides the overlay.
   * `announceVisibility(isOpen, payload)`: the overlay opened or closed.
   */
  constructor({ refs, showScreen, announceVisibility }) {
    this.refs = refs;
    this.showScreen = showScreen;
    this.announceVisibility = announceVisibility;
    this.onDone = null;
  }

  bindControls() {
    this.refs.continueBtn?.addEventListener('click', () => this.finish());
    document.addEventListener('keydown', (event) => {
      if (!this.onDone || event.repeat) return;
      // Not under Settings: its Enter and Escape are Settings' own.
      if (document.body?.classList.contains('is-settings-open')) return;
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        this.finish();
      }
    });
  }

  /** Rolls the credits from the start; `onDone` runs once when they end. */
  play(onDone) {
    const { overlay, roll, continueBtn } = this.refs;
    if (!overlay) {
      onDone();
      return;
    }
    this.onDone = onDone;
    roll?.classList.remove('is-rolling');
    void roll?.offsetWidth; // restart the roll's animation
    roll?.classList.add('is-rolling');
    this.showScreen('end-credits', { overlay: true, show: true });
    this.announceVisibility(true, { source: 'ending' });
    continueBtn?.focus({ preventScroll: true });
  }

  finish() {
    const onDone = this.onDone;
    if (!onDone) return;
    this.onDone = null;
    this.showScreen('end-credits', { overlay: true, show: false });
    this.announceVisibility(false, { source: 'ending' });
    onDone();
  }
}
