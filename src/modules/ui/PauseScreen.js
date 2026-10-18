// src/modules/ui/PauseScreen.js
//
// The pause overlay: resume, settings and quit (quit asks twice, here and on
// the death recap), and the build panel with the level-up tools left, where
// the run is and its seed.

import { buildBlockMarkup, collectBuild, runLocationLine } from './runRecap.js';

export class PauseScreen {
  /**
   * `refs`: the overlay's nodes { resumeBtn, settingsBtn, exitBtn, location, build, tools, seed }.
   * `gameOverQuitBtn`: the death recap's Quit, which asks twice too.
   * `emit(name, payload)`: sends ui-hover, toggle-pause, settings-menu-requested, exit-to-menu-requested.
   * `showScreen(name, options)`: shows or hides the pause overlay.
   * `progression()`: the progression service (build, rerolls, banishes), or none.
   * `combat()`: the combat service (the build's weapon).
   * `difficulty()`: the difficulty service (the run's seed label).
   * `layer()`: the layer the run is on.
   * `settingsOpenHere()`: the settings panel is open from this screen.
   * `closeSettings()`: closes the settings panel when the game resumes.
   */
  constructor({
    refs,
    gameOverQuitBtn,
    emit,
    showScreen,
    progression,
    combat,
    difficulty,
    layer,
    settingsOpenHere,
    closeSettings,
  }) {
    this.refs = refs;
    this.gameOverQuitBtn = gameOverQuitBtn;
    this.emit = emit;
    this.showScreen = showScreen;
    this.progression = progression;
    this.combat = combat;
    this.difficulty = difficulty;
    this.layer = layer;
    this.settingsOpenHere = settingsOpenHere;
    this.closeSettings = closeSettings;
    this.currentPauseState = false;
    this.quitConfirm = { button: null, label: '', timeoutId: null };
  }

  bindPauseControls() {
    const pauseRefs = this.refs;

    if (pauseRefs.resumeBtn) {
      pauseRefs.resumeBtn.addEventListener('mouseenter', () => {
        this.emit('ui-hover', {
          source: 'pause-menu',
          button: 'resume',
        });
      });
      pauseRefs.resumeBtn.addEventListener('click', () => {
        if (!this.currentPauseState) {
          return;
        }

        this.emit('toggle-pause');
      });
    }

    if (pauseRefs.settingsBtn) {
      pauseRefs.settingsBtn.addEventListener('mouseenter', () => {
        this.emit('ui-hover', {
          source: 'pause-menu',
          button: 'settings',
        });
      });
      pauseRefs.settingsBtn.addEventListener('click', () => {
        if (!this.currentPauseState) {
          return;
        }

        this.emit('settings-menu-requested', { source: 'pause' });
      });
    }

    if (pauseRefs.exitBtn) {
      pauseRefs.exitBtn.addEventListener('mouseenter', () => {
        this.emit('ui-hover', {
          source: 'pause-menu',
          button: 'exit',
        });
      });
      pauseRefs.exitBtn.addEventListener('click', () => {
        if (!this.currentPauseState) {
          return;
        }

        if (!this.confirmQuit(pauseRefs.exitBtn)) {
          return;
        }

        this.emit('exit-to-menu-requested', {
          source: 'pause-menu',
        });
      });
    }

    const quitBtn = this.gameOverQuitBtn;
    if (quitBtn) {
      // Runs before GameSessionService's document-level click handler.
      quitBtn.addEventListener('click', (event) => {
        if (!this.confirmQuit(quitBtn)) {
          event.stopPropagation();
        }
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.cancelQuitConfirm();
      }
    });
  }

  confirmQuit(button) {
    const state = this.quitConfirm;
    if (state.button === button) {
      this.cancelQuitConfirm();
      return true;
    }

    this.cancelQuitConfirm();
    state.button = button;
    state.label = button.textContent;
    button.textContent = 'Quit? Press again';
    button.classList.add('is-confirming');
    button.setAttribute('aria-live', 'polite');
    state.timeoutId = setTimeout(() => this.cancelQuitConfirm(), 3000);
    return false;
  }

  cancelQuitConfirm() {
    const state = this.quitConfirm;
    clearTimeout(state.timeoutId);
    if (state.button) {
      state.button.textContent = state.label;
      state.button.classList.remove('is-confirming');
      state.button.removeAttribute('aria-live');
    }
    state.button = null;
    state.timeoutId = null;
  }

  updatePauseScreen(isPaused) {
    const shouldPause = Boolean(isPaused);
    if (this.currentPauseState === shouldPause) return;

    this.currentPauseState = shouldPause;
    this.showScreen('pause', { overlay: true, show: shouldPause });

    const resumeBtn = this.refs.resumeBtn;
    if (shouldPause) {
      this.renderPauseBuild();
      resumeBtn?.focus({ preventScroll: true });
    } else {
      this.cancelQuitConfirm();
      resumeBtn?.blur();
    }

    document.body?.classList.toggle('is-paused', shouldPause);

    if (!shouldPause && this.settingsOpenHere()) {
      this.closeSettings();
    }
  }

  // The pause panel: the same build block as the death recap, plus the
  // level-up tools left and where the run is.
  renderPauseBuild() {
    const refs = this.refs;
    const progression = this.progression();
    if (!refs.build || !progression) return;
    refs.build.innerHTML = buildBlockMarkup(
      collectBuild(progression, this.combat())
    );
    refs.location.textContent = runLocationLine(this.layer());
    refs.tools.textContent = `Rerolls ${progression.rerollsLeft} · Banishes ${progression.banishesLeft}`;
    refs.seed.textContent = this.difficulty().runLabel();
  }
}
