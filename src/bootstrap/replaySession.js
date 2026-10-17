// Records every run and plays back `?replay=<url>` recordings.
//
// Recording starts when a run starts ('game-started') and stops at death; the
// recorder lives on the session (`session.replayRecorder`). Input is captured
// and substituted at InputSystem's per-step seam (`setInputSource`); level-up
// picks are recorded in order and re-applied at the next frame boundary, which
// is when a player's click lands too (the loop stops stepping on level-up).

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
      seed: session.getSeedInfo().seed,
      hull: session.getConfiguredHullId(),
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

  eventBus.on('upgrade-options-ready', (payload = {}) => {
    if (player && (payload.options || []).length > 0) {
      pickPending = true;
    }
  });

  return {
    /** Plays `recording` on the next run start. */
    arm(recording) {
      armedRecording = recording;
    },
    /** Once per frame, before the fixed steps: applies a pending replay pick. */
    tick() {
      if (!pickPending || !player) {
        return;
      }
      pickPending = false;
      const pick = player.takeUpgrade();
      if (pick && progression.applyUpgrade(pick.upgradeId)) {
        ui.showGameUI();
      }
    },
  };
}
