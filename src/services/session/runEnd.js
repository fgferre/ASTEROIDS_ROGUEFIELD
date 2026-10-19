// src/services/session/runEnd.js
//
// How a run ends: the final Warden's death wins it (a Boss Rush after its
// three Wardens), the victory screen's "continue" makes it endless, the layer
// and time reached go into the records, and the end screens open once the
// last transmission ends.

import { RUN_FINAL_LAYER } from '../../data/constants/gameplay.js';
import { BOSS_RUSH_LAYERS } from '../../data/layers.js';
import { updateRecords } from '../runRecords.js';

// The end screens wait for the transmission on air (the last words) to end,
// up to the cap.
const GAME_OVER_SCREEN_DELAY_MS = 3000;
const GAME_OVER_SCREEN_MAX_DELAY_MS = 6500; // proposta 18/10
const VICTORY_SCREEN_DELAY_MS = 2500; // boss death effects play first
const VICTORY_SCREEN_MAX_DELAY_MS = 7000; // proposta 18/10

export class RunEnd {
  /**
   * `eventBus`: emits 'run-won' and 'run-continued'.
   * `resolveServiceInstance(name)`: a session service by name, or null.
   * `getSessionState()` / `setSessionState(state, meta)`: the session state.
   * `setScreen(screen)` / `emitScreenChanged(screen, meta)`: the screen.
   * `getConfiguredHullId()`: the hull the player flies.
   * `findSafeSpawnPoint()`: where the ship can come back.
   */
  constructor({
    eventBus,
    resolveServiceInstance,
    getSessionState,
    setSessionState,
    setScreen,
    emitScreenChanged,
    getConfiguredHullId,
    findSafeSpawnPoint,
  }) {
    this.eventBus = eventBus;
    this.resolveServiceInstance = resolveServiceInstance;
    this.getSessionState = getSessionState;
    this.setSessionState = setSessionState;
    this.setScreen = setScreen;
    this.emitScreenChanged = emitScreenChanged;
    this.getConfiguredHullId = getConfiguredHullId;
    this.findSafeSpawnPoint = findSafeSpawnPoint;
    this.gameOverScreenTimeoutId = null;
    // Set while the end screen waits for the transmission on air to end.
    this.openRunEndScreen = null;
    this.transmissionOnAir = false;
    // True once the player continues past the final Warden (endless run).
    this.endless = false;
    // Boss Rush run: the three Wardens back to back (startNewRun); the
    // Wardens killed so far.
    this.bossRush = false;
    this.bossRushWardens = 0;
  }

  handleBossDefeatedEvent(payload = {}) {
    if (this.bossRush && payload?.wave !== RUN_FINAL_LAYER) {
      // Boss Rush: a card pick for each Warden before the last (not over
      // the death screen).
      this.bossRushWardens += 1;
      if (this.getSessionState() === 'running') {
        const progression = this.resolveServiceInstance('progression');
        progression.emitLevelUp(progression.applyLevelUp());
        progression.emitExperienceChanged();
      }
      return;
    }
    if (
      payload?.wave !== RUN_FINAL_LAYER ||
      this.endless ||
      this.getSessionState() === 'victory'
    ) {
      return;
    }

    if (this.bossRush) {
      this.bossRushWardens += 1;
    }
    this.resolveServiceInstance('enemies')?.waveManager?.holdWaves();
    this.setSessionState('victory', { reason: 'final-boss-defeated' });
    this.eventBus.emit('run-won', {
      wave: payload.wave,
      hullId: this.getConfiguredHullId(),
    });

    this.scheduleRunEndScreen(
      () => {
        const summary =
          this.resolveServiceInstance('world')?.buildRunSummary() ?? {};
        const data = { ...summary, ...this.recordRunReached(summary) };
        this.setScreen('victory');
        this.emitScreenChanged('victory', { source: 'run-won', data });
      },
      VICTORY_SCREEN_DELAY_MS,
      VICTORY_SCREEN_MAX_DELAY_MS
    );
  }

  /**
   * Victory screen's "continue": the run goes endless. Layers resume from the
   * one after the final Warden; later Wardens only drop their rewards. Not
   * after a Boss Rush.
   */
  continueBeyondVictory() {
    if (this.getSessionState() !== 'victory' || this.bossRush) {
      return false;
    }

    this.clearPendingGameOverTransition();
    this.endless = true;
    // Lost between the final Warden's death and this screen: the run is won,
    // so the ship comes back the way a Retry brings it (full hull, a safe
    // spot, a moment of invulnerability).
    const player = this.resolveServiceInstance('player');
    if (player.isDead) {
      player.health = player.maxHealth;
      player.respawn(this.findSafeSpawnPoint(), 3);
      this.resolveServiceInstance('world').reset();
    }
    this.resolveServiceInstance('enemies')?.waveManager?.resumeWaves();
    this.setScreen('playing');
    this.emitScreenChanged('playing', { source: 'run-continued' });
    this.setSessionState('running', { reason: 'run-continued' });
    this.eventBus.emit('run-continued', { fromLayer: RUN_FINAL_LAYER });
    return true;
  }

  /**
   * Records the layer and time in a run summary (and in today's Daily Field
   * record on a Daily Field run); returns `{ bestLayer }` for the end screen.
   * A Boss Rush records only its clear time (on a win) and returns
   * `{ bossRush: { stage, bestStage, bestTime } }`, `stage` the Warden it
   * reached.
   */
  recordRunReached(summary = {}) {
    if (this.bossRush) {
      const records = updateRecords({
        bossRushTime:
          this.bossRushWardens === BOSS_RUSH_LAYERS.length
            ? summary.stats?.timeElapsed
            : 0,
      });
      return {
        bossRush: {
          stage: Math.min(this.bossRushWardens + 1, BOSS_RUSH_LAYERS.length),
          bestStage: records.bossRushStage,
          bestTime: records.bossRushTime,
        },
      };
    }
    const wave = summary.wave;
    const reached = {
      layer: typeof wave === 'number' ? wave : wave?.current,
      time: summary.stats?.timeElapsed,
    };
    this.resolveServiceInstance('difficulty').recordRun(reached);
    return { bestLayer: updateRecords(reached).bestLayer };
  }

  clearPendingGameOverTransition() {
    if (this.gameOverScreenTimeoutId) {
      clearTimeout(this.gameOverScreenTimeoutId);
      this.gameOverScreenTimeoutId = null;
    }
    this.openRunEndScreen = null;
  }

  /**
   * `open()` runs after `delayMs`; if a transmission is on air then, it runs
   * when the line ends, and by `maxDelayMs` at the latest.
   */
  scheduleRunEndScreen(open, delayMs, maxDelayMs) {
    this.clearPendingGameOverTransition();
    const fire = () => {
      this.clearPendingGameOverTransition();
      open();
    };
    this.gameOverScreenTimeoutId = setTimeout(() => {
      if (!this.transmissionOnAir) {
        fire();
        return;
      }
      this.openRunEndScreen = fire;
      this.gameOverScreenTimeoutId = setTimeout(fire, maxDelayMs - delayMs);
    }, delayMs);
  }

  scheduleGameOverScreenTransition(data = {}) {
    if (typeof setTimeout !== 'function') {
      this.setScreen('gameover');
      this.emitScreenChanged('gameover', {
        source: 'player-died',
        data,
        immediate: true,
      });
      return;
    }

    this.scheduleRunEndScreen(
      () => {
        this.setScreen('gameover');
        this.emitScreenChanged('gameover', { source: 'player-died', data });
      },
      GAME_OVER_SCREEN_DELAY_MS,
      GAME_OVER_SCREEN_MAX_DELAY_MS
    );
  }
}
