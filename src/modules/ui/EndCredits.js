// src/modules/ui/EndCredits.js
//
// The end credits after the campaign's last ending: the names roll up slowly
// over the field, the support line and Continue stay at the bottom; Continue,
// Enter or Escape ends them and hands over to the final card. Announced as the
// 'end-credits' overlay, so a track can be tied to it.

import { inputLayers } from '../input/inputLayers.js';

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
    // Rolling, on the input layer stack: Enter or Escape ends them. The pause
    // key still goes to the game, which ignores it after a win.
    this.inputLayer = {
      name: 'end-credits',
      element: refs.overlay,
      passes: ['pause'],
      onKey: (event) => {
        if (event.repeat || !['Escape', 'Enter'].includes(event.key)) {
          return false;
        }
        event.preventDefault();
        this.finish();
        return false;
      },
    };
  }

  bindControls() {
    this.refs.continueBtn?.addEventListener('click', () => this.finish());
  }

  /** Rolls the credits from the start; `onDone` runs once when they end. */
  play(onDone) {
    const { overlay, roll, continueBtn } = this.refs;
    if (!overlay) {
      onDone();
      return;
    }
    this.onDone = onDone;
    inputLayers.push(this.inputLayer);
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
    inputLayers.remove(this.inputLayer);
    this.showScreen('end-credits', { overlay: true, show: false });
    this.announceVisibility(false, { source: 'ending' });
    onDone();
  }
}
