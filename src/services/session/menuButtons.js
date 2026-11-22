// src/services/session/menuButtons.js
//
// The page's run buttons, heard with one document-level click listener: start
// (Descent, Daily Field, Boss Rush), a sector (the campaign map's Launch, the
// victory screen's Next Chapter), New Mission, Retry, Quit (the final
// card's Campaign and Main menu too), the victory screen's continue, and the
// menu's settings, credits and version (What's new).

export class MenuButtons {
  /**
   * `eventBus`: emits 'credits-menu-requested', 'changelog-menu-requested'
   * and 'settings-menu-requested'.
   * `startNewRun({ source, daily, bossRush, sector })`, `requestRetry({ source })`,
   * `exitToMenu({ source })`, `continueBeyondVictory()`: the session's flows.
   * `linkIn(options, start, button)`: plays the way into a run started from
   * the menu, calling `start` under it (absent: `start` at once).
   */
  constructor({
    eventBus,
    startNewRun,
    requestRetry,
    exitToMenu,
    continueBeyondVictory,
    linkIn = (options, start) => start(),
  }) {
    this.eventBus = eventBus;
    this.startNewRun = startNewRun;
    this.requestRetry = requestRetry;
    this.exitToMenu = exitToMenu;
    this.continueBeyondVictory = continueBeyondVictory;
    this.linkIn = linkIn;
    this.domClickHandler = (event) => this.handleDocumentClick(event);
    this.domClickUnsubscribe = null;
  }

  setupDomEventListeners() {
    if (typeof document === 'undefined') {
      return;
    }

    this.teardownDomEventListeners();

    document.addEventListener('click', this.domClickHandler);
    this.domClickUnsubscribe = () => {
      document.removeEventListener('click', this.domClickHandler);
      this.domClickUnsubscribe = null;
    };
  }

  teardownDomEventListeners() {
    if (typeof this.domClickUnsubscribe === 'function') {
      try {
        this.domClickUnsubscribe();
      } catch (error) {
        console.warn(
          '[GameSessionService] Failed to remove DOM listener:',
          error
        );
      }
    }

    this.domClickUnsubscribe = null;
  }

  handleDocumentClick(event) {
    if (!event) {
      return;
    }

    const { target } = event;
    if (!target) {
      return;
    }

    if (typeof Element !== 'undefined' && !(target instanceof Element)) {
      return;
    }

    const elementTarget = /** @type {Element} */ (target);

    const button =
      typeof elementTarget.closest === 'function'
        ? elementTarget.closest('button')
        : null;
    if (!button) {
      return;
    }

    const { id } = button;
    if (!id) {
      return;
    }

    const preventDefault = () => {
      try {
        event.preventDefault();
      } catch (error) {
        console.warn(
          '[GameSessionService] Failed to prevent default action:',
          error
        );
      }
    };

    switch (id) {
      case 'start-game-btn':
      case 'daily-field-btn':
      case 'boss-rush-btn':
      case 'restart-game-btn':
      case 'victory-restart-btn': {
        preventDefault();
        this.emitCreditsMenuRequest({ open: false, source: id });
        // From the menu, Start flies a normal run, Daily Field today's field
        // and Boss Rush the three Wardens; New Mission keeps the mode of the
        // run that just ended.
        const restart =
          id === 'restart-game-btn' || id === 'victory-restart-btn';
        const options = {
          source: id,
          daily: restart ? undefined : id === 'daily-field-btn',
          bossRush: restart ? undefined : id === 'boss-rush-btn',
        };
        if (restart) this.startNewRun(options);
        else this.linkIn(options, () => this.startNewRun(options), button);
        break;
      }
      case 'campaign-launch-btn':
      case 'victory-next-btn': {
        preventDefault();
        this.emitCreditsMenuRequest({ open: false, source: id });
        // The button carries the sector it starts.
        // From the victory screen the ship goes on as it is.
        const options = {
          source: id,
          sector: button.dataset.sector,
          carry: id === 'victory-next-btn',
        };
        if (options.carry) this.startNewRun(options);
        else this.linkIn(options, () => this.startNewRun(options), button);
        break;
      }
      case 'retry-game-btn': {
        preventDefault();
        if (!this.requestRetry({ source: id })) {
          console.warn('[Retry] Request rejected - verify retry availability.');
        }
        break;
      }
      case 'quit-game-btn':
      case 'victory-quit-btn':
      case 'victory-menu-btn': {
        preventDefault();
        this.exitToMenu({ source: 'gameover' });
        break;
      }
      case 'victory-continue-btn': {
        preventDefault();
        this.continueBeyondVictory();
        break;
      }
      case 'open-settings-btn': {
        preventDefault();
        this.emitSettingsMenuRequest({ source: 'menu' });
        break;
      }
      case 'menu-credits-btn': {
        preventDefault();
        this.emitCreditsMenuRequest({
          open: true,
          source: 'menu',
          triggerId: 'menu-credits-btn',
        });
        break;
      }
      case 'menu-version-btn': {
        preventDefault();
        this.eventBus.emit('changelog-menu-requested', {
          open: true,
          source: 'menu',
          triggerId: 'menu-version-btn',
        });
        break;
      }
      case 'menu-support-btn': {
        preventDefault();
        this.emitCreditsMenuRequest({
          open: true,
          source: 'menu',
          triggerId: 'menu-support-btn',
          section: 'support',
        });
        break;
      }
      default:
        break;
    }
  }

  emitCreditsMenuRequest({
    open,
    source,
    restoreFocus = false,
    triggerId,
    section,
  } = {}) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return;
    }

    this.eventBus.emit('credits-menu-requested', {
      open,
      restoreFocus,
      source,
      triggerId,
      section,
    });
  }

  emitSettingsMenuRequest(payload = {}) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return;
    }

    this.eventBus.emit('settings-menu-requested', { ...payload });
  }
}
