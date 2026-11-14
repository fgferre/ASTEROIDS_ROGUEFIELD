// src/services/session/runEnd.js
//
// How a run ends: the final Warden's death wins it (a Boss Rush after its
// three Wardens, a sector run at its own Warden), the victory screen's "continue" makes it endless, the layer
// and time reached go into the records, and the end screens open once the
// last transmission ends.

import { RUN_FINAL_LAYER } from '../../data/constants/gameplay.js';
import { BOSS_RUSH_LAYERS } from '../../data/layers.js';
import { PICKUP_KINDS } from '../../data/pickups.js';
import { nextSector } from '../../data/sectors.js';
import { loadRecords, updateRecords } from '../runRecords.js';

// The end screens wait for the transmission on air (the last words) to end,
// up to the cap.
const GAME_OVER_SCREEN_DELAY_MS = 3000;
const GAME_OVER_SCREEN_MAX_DELAY_MS = 6500; // proposta 18/10
// The win leaves time to gather the spoils: every orb flies to the ship (a
// Magnet's pull) and the break timer counts the seconds down to the screen.
const VICTORY_SPOILS_SECONDS = 6; // proposta 12/11 (2.5 s: the owner could not gather anything)
const VICTORY_SCREEN_DELAY_MS = VICTORY_SPOILS_SECONDS * 1000;
const VICTORY_SCREEN_MAX_DELAY_MS = 9000; // proposta 12/11

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
    // Sector run (src/data/sectors.js): the sector played, or null.
    this.sector = null;
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
    const finalLayer = this.sector ? this.sector.layers[1] : RUN_FINAL_LAYER;
    if (
      payload?.wave !== finalLayer ||
      this.endless ||
      this.getSessionState() === 'victory'
    ) {
      return;
    }

    if (this.bossRush) {
      this.bossRushWardens += 1;
    }
    this.resolveServiceInstance('enemies')?.waveManager?.holdWaves(
      VICTORY_SPOILS_SECONDS
    );
    const { pullSpeed, pullAcceleration } = PICKUP_KINDS.magnet;
    this.resolveServiceInstance('xpOrbs')?.startGlobalPull(
      VICTORY_SPOILS_SECONDS,
      pullSpeed,
      pullAcceleration
    );
    this.setSessionState('victory', { reason: 'final-boss-defeated' });
    this.eventBus.emit('run-won', {
      wave: payload.wave,
      hullId: this.getConfiguredHullId(),
      ...(this.sector && { sector: this.sector.id }),
    });

    this.scheduleRunEndScreen(
      () => {
        const summary =
          this.resolveServiceInstance('world')?.buildRunSummary() ?? {};
        const data = {
          ...summary,
          ...this.recordRunReached(summary, { won: true }),
        };
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
   * after a Boss Rush or a sector run.
   */
  continueBeyondVictory() {
    if (this.getSessionState() !== 'victory' || this.bossRush || this.sector) {
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
   * reached. A sector run records only its clear (`won`) and returns
   * `{ sector: { id, time, bestTime, firstClear, next } }`, `next` the next
   * sector's id on a win, else null.
   */
  recordRunReached(summary = {}, { won = false } = {}) {
    if (this.sector) {
      const { id } = this.sector;
      const time = Math.floor(summary.stats?.timeElapsed ?? 0);
      const firstClear = won && !loadRecords().sectorsWon.includes(id);
      const records = updateRecords(
        won ? { sectorWon: id, sectorTime: time } : {}
      );
      return {
        sector: {
          id,
          time,
          bestTime: records.sectorTimes[id] ?? 0,
          firstClear,
          next: won ? nextSector(this.sector)?.id ?? null : null,
        },
      };
    }
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
