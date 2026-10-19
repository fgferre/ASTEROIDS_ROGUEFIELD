// Records every run and plays back `?replay=<url>` recordings.
//
// Recording starts when a run starts ('game-started') and stops at death; the
// run's seed, difficulty and Daily Field day come from the difficulty service
// and its mode from the session. An armed recording sets that service's
// difficulty and day and the session's start mode before its run begins, and
// its hull once the run has started. The recorder lives on the session
// (`session.replayRecorder`). Input is captured and substituted at
// InputSystem's per-step seam (`setInputSource`); level-up
// picks (and the rerolls/banishes before them) are recorded in order and
// re-applied at the next frame boundary, which is when a player's click lands
// too (the loop stops stepping on level-up).

import { createPlayer, createRecorder, deserialize } from '../core/replay.js';

/** `?replay=<url>` value, or null. */
export function getReplayUrl() {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }
  return new URLSearchParams(window.location.search).get('replay') || null;
}

export async function fetchRecording(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[replay] ${url}: HTTP ${response.status}`);
  }
  return deserialize(await response.text());
}

/**
 * @param {object} deps
 * @param {() => number} deps.getStep - fixed steps simulated so far (app loop).
 */
export function createReplayController({
  eventBus,
  input,
  session,
  progression,
  ui,
  getStep,
}) {
  let runStartStep = 0;
  let recorder = null;
  let player = null;
  let armedRecording = null;
  let pickPending = false;
  const difficulty = session.resolveServiceInstance('difficulty');

  const runStep = () => getStep() - runStartStep;

  const recordSource = (frame) => {
    recorder.record(runStep(), frame);
    return frame;
  };

  const replaySource = () => {
    const frame = player.frameAt(runStep());
    if (!frame) {
      // Recording over: hand control back to the devices.
      input.setInputSource(null);
      player = null;
    }
    return frame;
  };

  eventBus.on('game-started', () => {
    runStartStep = getStep();
    pickPending = false;

    if (armedRecording) {
      player = createPlayer(armedRecording);
      session.applyConfiguredPlayerHull({ hullId: armedRecording.hull });
      armedRecording = null;
      recorder = null;
      input.setInputSource(replaySource);
      return;
    }

    player = null;
    recorder = createRecorder({
      seed: difficulty.getRunSeed(),
      hull: session.getConfiguredHullId(),
      difficulty: difficulty.getDifficulty(),
      mode: session.bossRush
        ? 'bossRush'
        : difficulty.isDaily()
          ? 'daily'
          : 'normal',
      date: difficulty.dateKey,
    });
    session.replayRecorder = recorder;
    input.setInputSource(recordSource);
  });

  eventBus.on('player-died', () => {
    recorder = null;
    player = null;
    input.setInputSource(null);
  });

  eventBus.on('upgrade-applied', (payload = {}) => {
    if (recorder && payload.upgradeId) {
      recorder.recordUpgrade(runStep(), payload.upgradeId);
    }
  });

  eventBus.on('upgrade-rerolled', () => {
    if (recorder) {
      recorder.recordReroll(runStep());
    }
  });

  eventBus.on('upgrade-banished', (payload = {}) => {
    if (recorder && payload.upgradeId) {
      recorder.recordBanish(runStep(), payload.upgradeId);
    }
  });

  eventBus.on('upgrade-options-ready', (payload = {}) => {
    if (player && (payload.options || []).length > 0) {
      pickPending = true;
    }
  });

  return {
    /** Plays `recording` on the next run start, in its recorded mode. */
    arm(recording) {
      armedRecording = recording;
      difficulty.useReplay(recording);
      session.replayStart = {
        daily: recording.mode === 'daily',
        bossRush: recording.mode === 'bossRush',
      };
    },
    /**
     * Once per frame, before the fixed steps: applies a pending replay pick,
     * after the rerolls/banishes recorded before it.
     */
    tick() {
      if (!pickPending || !player) {
        return;
      }
      pickPending = false;
      let entry = player.takeUpgrade();
      while (entry?.action) {
        const options =
          entry.action === 'reroll'
            ? progression.rerollUpgradeOptions()
            : progression.banishUpgrade(entry.upgradeId);
        if (options?.length === 0) {
          // Banished the last card: the screen closed with no pick.
          ui.showGameUI();
          return;
        }
        entry = player.takeUpgrade();
      }
      if (entry && progression.applyUpgrade(entry.upgradeId)) {
        ui.showGameUI();
      }
    },
  };
}
