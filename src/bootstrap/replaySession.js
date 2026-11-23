// Records every run and plays back `?replay=<url>` recordings.
//
// Recording starts when a run starts ('game-started') and stops at death; the
// run's seed, difficulty and Daily Field day come from the difficulty service,
// its mode from the session and its control scheme and Stick Sensitivity (and
// each change of it from the pause) from the player. An armed recording sets
// that service's difficulty and day and the session's start mode and hull
// before its run begins, its control scheme once the run has started, and its
// Stick Sensitivity at each step it feeds; its Hangar setup stands in for the viewer's for the whole run, a
// Retry's restore included, until the session starts the next run. The
// recorder lives on the session
// (`session.replayRecorder`). Input is captured and substituted at
// InputSystem's per-step seam (`setInputSource`); level-up
// picks (and the rerolls/banishes before them) are recorded in order and
// re-applied at the next frame boundary, which is when a player's click lands
// too (the loop stops stepping on level-up). A chest's cards, which wait for
// Continue, go on their own once the last has had its reveal, and the flight
// briefing as soon as it takes Continue; the run is paused under them, so the
// moment they go does not change it.

import { createPlayer, createRecorder, deserialize } from '../core/replay.js';
import { CHEST_REVEAL_MS } from '../modules/ui/ChestCeremony.js';

/** `?replay=<url>` value, or null. */
export function getReplayUrl() {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }
  return new URLSearchParams(window.location.search).get('replay') || null;
}

/** A replay link that never answers must not hold the game at "Loading the game". */
export const REPLAY_FETCH_TIMEOUT_MS = 10000;

export async function fetchRecording(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPLAY_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`[replay] ${url}: HTTP ${response.status}`);
    }
    return deserialize(await response.text());
  } finally {
    clearTimeout(timer);
  }
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
  // When a replay's chest cards, all revealed, go (Date.now ms), or null.
  let chestDoneAt = null;
  // The viewer's own Stick Sensitivity while a replay flies the recorded one.
  let viewerStick = null;
  const difficulty = session.resolveServiceInstance('difficulty');
  const playerService = session.resolveServiceInstance('player');
  const hangar = session.resolveServiceInstance('hangar');

  const runStep = () => getStep() - runStartStep;

  const recordSource = (frame) => {
    recorder.record(runStep(), frame);
    return frame;
  };

  const replaySource = () => {
    const frame = player.frameAt(runStep());
    if (frame) playerService.stickSensitivity = player.stickAt(runStep());
    if (!frame) {
      // Recording over: hand control back to the devices.
      input.setInputSource(null);
      player = null;
    }
    return frame;
  };

  eventBus.on('game-started', ({ carried = false } = {}) => {
    runStartStep = getStep();
    pickPending = false;

    if (armedRecording) {
      player = createPlayer(armedRecording);
      viewerStick ??= playerService.stickSensitivity;
      armedRecording = null;
      recorder = null;
      input.setInputSource(replaySource);
      return;
    }

    player = null;
    if (viewerStick) {
      playerService.stickSensitivity = viewerStick;
      viewerStick = null;
    }
    // A run that carries a build from the sector before cannot be played
    // back from its seed alone: it is not recorded.
    if (carried) {
      recorder = null;
      session.replayRecorder = null;
      input.setInputSource(null);
      return;
    }
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
      sector: session.sector?.id ?? null,
      stick: playerService.stickSensitivity,
      hangar: hangar.getRunSetup(),
    });
    session.replayRecorder = recorder;
    input.setInputSource(recordSource);
  });

  // A change from the pause: recorded for the run, or kept for the viewer's
  // own next run while a replay flies the recorded one.
  eventBus.on('settings-controls-changed', ({ values } = {}) => {
    const value = values?.stickSensitivity;
    if (!value) return;
    if (recorder) recorder.recordStick(runStep(), value);
    if (viewerStick) viewerStick = value;
  });

  eventBus.on('player-died', () => {
    recorder = null;
    player = null;
    input.setInputSource(null);
  });

  // A pick answers an offer on screen; a chest's cards (collectibles/
  // chests.js) land with none up, and the replayed run grants them itself.
  eventBus.on('upgrade-applied', (payload = {}) => {
    const picked = progression.pendingUpgradeOptions.length > 0;
    if (recorder && payload.upgradeId && picked) {
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

  eventBus.on('upgrade-held', (payload = {}) => {
    if (recorder && payload.upgradeId) {
      recorder.recordHold(runStep(), payload.upgradeId);
    }
  });

  eventBus.on('upgrade-options-ready', (payload = {}) => {
    if (player && (payload.options || []).length > 0) {
      pickPending = true;
    }
  });

  // The chest's cards on screen (ui/ChestCeremony.js) go a reveal's length
  // after the last one starts its own, as if Continue were pressed.
  const passChestCards = () => {
    const chest = ui.chestCeremony;
    const shown = chest.current;
    if (!shown || shown.revealed < shown.elements.length) {
      chestDoneAt = null;
      return;
    }
    chestDoneAt ??= Date.now() + CHEST_REVEAL_MS;
    if (Date.now() < chestDoneAt) return;
    chestDoneAt = null;
    chest.continue();
  };

  return {
    /** Plays `recording` on the next run start, in its recorded mode. */
    arm(recording) {
      armedRecording = recording;
      difficulty.useReplay(recording);
      hangar.useReplaySetup(recording.hangar);
      session.replayStart = {
        daily: recording.mode === 'daily',
        bossRush: recording.mode === 'bossRush',
        sector: recording.sector ?? null,
        hull: recording.hull,
      };
    },
    /**
     * Once per frame, before the fixed steps: passes a chest's cards and the
     * flight briefing (as soon as it takes Continue), and applies a pending
     * replay pick after the rerolls/banishes/holds recorded before it.
     */
    tick() {
      if (!player) {
        return;
      }
      passChestCards();
      ui.flightBriefing.continue();
      if (!pickPending) {
        return;
      }
      pickPending = false;
      let entry = player.takeUpgrade();
      while (entry?.action) {
        const options =
          entry.action === 'reroll'
            ? progression.rerollUpgradeOptions()
            : entry.action === 'hold'
              ? progression.holdUpgrade(entry.upgradeId)
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

/**
 * Tells the player, on screen, why a `?replay=` did not open. It stays until
 * the first key or click: the loading screen outlasts any timer.
 */
export function showReplayNotice(error) {
  const refused = /version/.test(error?.message ?? '');
  const notice = document.createElement('div');
  notice.textContent = refused
    ? "This replay was made with an older version of the game and can't be played."
    : "This replay couldn't be loaded.";
  Object.assign(notice.style, {
    position: 'fixed',
    left: '50%',
    bottom: '32px',
    transform: 'translateX(-50%)',
    zIndex: '10000',
    padding: '10px 16px',
    background: 'rgba(0, 0, 0, 0.8)',
    color: '#eaf2ff',
    font: 'inherit',
    textAlign: 'center',
    pointerEvents: 'none',
  });
  document.body.appendChild(notice);
  const dismiss = () => notice.remove();
  window.addEventListener('keydown', dismiss, { once: true });
  window.addEventListener('pointerdown', dismiss, { once: true });
}
