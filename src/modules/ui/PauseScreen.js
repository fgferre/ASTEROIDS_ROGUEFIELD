// src/modules/ui/PauseScreen.js
//
// The pause overlay: resume, settings, the HUD editor and quit (quit asks
// twice, here and on the death screen), the run's build as the run end
// shows it with the rerolls and banishes left, where the run is and its seed;
// with the new flight, the run's card slots and piloting trail beside it.

import { collectBuild, endBuildMarkup, runLocationLine } from './runRecap.js';
import { runTrayMarkup } from './upgradeCard.js';
import { FIRST_RUN_MODE } from '../../core/runMode.js';
import { inputLayers } from '../input/inputLayers.js';

export class PauseScreen {
  /**
   * `refs`: the overlay's nodes { container, resumeBtn, settingsBtn, editHudBtn, exitBtn, location, build, tools, seed, run }.
   * `gameOverQuitBtn`: the death recap's Quit, which asks twice too.
   * `emit(name, payload)`: sends ui-hover, toggle-pause, settings-menu-requested, exit-to-menu-requested.
   * `showScreen(name, options)`: shows or hides the pause overlay.
   * `progression()`: the progression service (build, rerolls, banishes), or none.
   * `combat()`: the combat service (the build's weapon).
   * `difficulty()`: the difficulty service (the run's seed label).
   * `layer()`: the layer the run is on.
   * `sector()`: the sector run's sector, or null.
   * `settingsOpenHere()`: the settings panel is open from this screen.
   * `closeSettings()`: closes the settings panel when the game resumes.
   * `openHudEditor()`: Edit HUD, over the paused run.
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
    mode = () => FIRST_RUN_MODE,
    settingsOpenHere,
    closeSettings,
    openHudEditor,
  }) {
    this.refs = refs;
    this.gameOverQuitBtn = gameOverQuitBtn;
    this.emit = emit;
    this.showScreen = showScreen;
    this.progression = progression;
    this.combat = combat;
    this.difficulty = difficulty;
    this.layer = layer;
    this.mode = mode;
    this.settingsOpenHere = settingsOpenHere;
    this.closeSettings = closeSettings;
    this.openHudEditor = openHudEditor;
    this.currentPauseState = false;
    this.quitConfirm = { button: null, label: '', timeoutId: null };
    // The Escape held now disarmed a quit on the pause screen.
    this.escapeDisarms = false;
    // Paused, on the input layer stack: the pause key (P, Start, Escape)
    // still goes to the game, and resumes.
    this.inputLayer = {
      name: 'pause',
      element: refs.container,
      passes: ['pause'],
      onKey: (event) => this.handlePauseKey(event),
    };
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

        // A panel over the pause takes Escape: no quit left armed under it.
        this.cancelQuitConfirm();
        this.emit('settings-menu-requested', { source: 'pause' });
      });
    }

    pauseRefs.editHudBtn?.addEventListener('click', () => {
      if (this.currentPauseState) {
        this.cancelQuitConfirm();
        this.openHudEditor();
      }
    });

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
  }

  // A key on the paused run (its layer, input/inputLayers.js). Escape disarms
  // an armed quit, and that press and its repeats while held go no further:
  // the game would read it as resume. Unarmed, the game resumes.
  handlePauseKey(event) {
    if (event.key !== 'Escape') return false;
    if (!event.repeat) this.escapeDisarms = Boolean(this.quitConfirm.button);
    this.cancelQuitConfirm();
    return this.escapeDisarms;
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
    button.textContent =
      document.body?.dataset.inputDevice === 'touch'
        ? 'Quit? Tap again'
        : 'Quit? Press again';
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
    if (shouldPause) inputLayers.push(this.inputLayer);
    else inputLayers.remove(this.inputLayer);

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

  // The pause panel: the run end's build block (runRecap.endBuildMarkup),
  // plus the rerolls and banishes left and where the run is; the card slots
  // and the trail in a second column (the panel widens, style.css).
  renderPauseBuild() {
    const refs = this.refs;
    const progression = this.progression();
    if (!refs.build || !progression) return;
    refs.build.innerHTML = endBuildMarkup(
      collectBuild(progression, this.combat())
    );
    refs.location.textContent = runLocationLine(
      this.layer(),
      null,
      null,
      this.mode().sector
    );
    refs.tools.textContent = `Rerolls ${progression.rerollsLeft} · Banishes ${progression.banishesLeft}`;
    refs.seed.textContent = this.difficulty().runLabel();
    const piloting = progression.pilotCardIds.length > 0;
    refs.run.classList.toggle('hidden', !piloting);
    refs.run.innerHTML = piloting ? runTrayMarkup(progression) : '';
  }
}
