// src/modules/ui/FlightBriefing.js
//
// The new flight's briefing (?direcao=nova; the owner, 16/11: "um pequeno
// tutorialzinho na tela, que a pessoa tem que dar enter para seguir"): the
// Flight Computer card waits for the card and chest screens to close, then
// pauses the run on its new keys; Continue (the confirm key or pad button, or
// a click) engages modern flight ('modern-flight-engaged') and goes back to
// play.

import {
  SCREEN_INPUT_LOCKOUT_MS,
  liftHudInstruments,
} from './LevelUpScreen.js';

export class FlightBriefing {
  /**
   * `refs`: { screen, continueBtn }.
   * `ui`: the UISystem (its event bus, showScreen and showGameUI).
   */
  constructor(refs, ui) {
    this.refs = refs;
    this.ui = ui;
    this.pending = false;
    this.lockedUntil = null;
    // The card is taken: the briefing waits for showGameUI.
    ui.registerEventListener('upgrade-modern-flight', () => {
      this.pending = true;
    });
    ui.registerEventListener('input-confirmed', () => this.continue());
    // A run starts or ends: nothing waits, nothing shows.
    ['game-started', 'player-died', 'run-won'].forEach((name) =>
      ui.registerEventListener(name, () => this.clear())
    );
    refs.continueBtn?.addEventListener('click', () => this.continue());
  }

  get isVisible() {
    return this.lockedUntil !== null;
  }

  /** Shows the briefing if the card was taken and it is not up; true if it did. */
  openNext() {
    if (!this.pending || this.isVisible) return false;
    this.pending = false;
    this.lockedUntil = Date.now() + SCREEN_INPUT_LOCKOUT_MS;
    this.ui.showScreen('flight', { overlay: true, show: true });
    liftHudInstruments(this.refs.screen);
    // The screen holds the focus: Enter is the confirm key, not a click.
    this.refs.screen.focus({ preventScroll: true });
    return true;
  }

  /** Continue: modern flight from here on, back to play. */
  continue() {
    if (!this.isVisible || Date.now() < this.lockedUntil) return;
    this.hide();
    this.ui.eventBus?.emit?.('modern-flight-engaged');
    this.ui.showGameUI();
  }

  hide() {
    this.lockedUntil = null;
    this.ui.showScreen('flight', {
      overlay: true,
      show: false,
      emitEvent: false,
    });
  }

  clear() {
    if (this.isVisible) this.hide();
    this.pending = false;
  }
}
