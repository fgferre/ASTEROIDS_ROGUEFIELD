/**
 * Record a scripted 10-second run through the real systems (input → player →
 * enemies → physics → combat → orbs → progression → world), replay it in a
 * fresh game instance, and require the same end state.
 *
 * The game is built from the production service manifest; only the DOM-bound
 * services (UI, audio) are stubbed. Keys go through InputSystem's real
 * keyboard handlers while recording; the replay feeds the recording through
 * the same per-step seam (`setInputSource`) the browser uses.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
  keyEvent,
} from '../__helpers__/headlessGame.js';
import { deserialize, serialize } from '../../src/core/replay.js';

const STEPS = 600; // 10 s at 60 Hz

// Keys held during each half-second of the run (W thrust, A/D turn, S brake);
// lowercase letters are taps (e shield, g spread toggle, t aim toggle).
const SEGMENT_STEPS = 30;
const SCRIPT = [
  '',
  'S',
  'S',
  'WAe',
  'WA',
  'W',
  'A',
  '',
  'A',
  'W',
  'g',
  'A',
  'W',
  'WD',
  'WDt',
  'WA',
  'WD',
  'WAe',
  'A',
  'At',
];
// Low enough that the scripted run levels up, so level-up picks are replayed.
const TEST_XP_TO_LEVEL = 10;

const KEY_CODES = {
  W: 'KeyW',
  A: 'KeyA',
  S: 'KeyS',
  D: 'KeyD',
  e: 'KeyE',
  g: 'KeyG',
  t: 'KeyT',
};

describe('run replay', () => {
  let restoreDom;

  beforeEach(() => {
    restoreDom = installDomStubs();
  });

  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
  });

  it('replays a recorded 10 s run to the same player position, kills and XP', () => {
    // Record.
    const live = createHeadlessGame();
    live.session.startNewRun({ source: 'test' });
    live.services.progression.experienceToNext = TEST_XP_TO_LEVEL;
    const input = live.services.input;
    const press = (letter) => input.onKeyDown(keyEvent(KEY_CODES[letter]));
    const release = (letter) => input.onKeyUp(keyEvent(KEY_CODES[letter]));
    let held = [];
    let taps = [];
    for (let step = 0; step < STEPS; step += 1) {
      const pick = live.takeOfferedUpgrade();
      if (pick) live.services.progression.applyUpgrade(pick);
      if (step % SEGMENT_STEPS === 0) {
        const keys = [...SCRIPT[step / SEGMENT_STEPS]];
        const nextHeld = keys.filter((key) => key === key.toUpperCase());
        held.filter((key) => !nextHeld.includes(key)).forEach(release);
        nextHeld.filter((key) => !held.includes(key)).forEach(press);
        held = nextHeld;
        taps = keys.filter((key) => key !== key.toUpperCase());
        taps.forEach(press);
      } else if (taps.length > 0) {
        taps.forEach(release);
        taps = [];
      }
      live.step();
    }
    const recorded = live.snapshot();
    const recording = deserialize(
      serialize(live.session.replayRecorder.toJSON())
    );

    expect(recording.steps).toBe(STEPS);
    expect(recording.upgrades.length).toBeGreaterThan(0);
    expect(recorded.kills).toBeGreaterThan(0);

    // Replay in a fresh instance: no key events, only the recording.
    const replay = createHeadlessGame();
    replay.controller.arm(recording);
    replay.session.startNewRun({ source: 'test' });
    replay.services.progression.experienceToNext = TEST_XP_TO_LEVEL;
    for (let step = 0; step < STEPS; step += 1) {
      replay.controller.tick();
      replay.step();
    }

    expect(replay.snapshot()).toEqual(recorded);
  });
});
