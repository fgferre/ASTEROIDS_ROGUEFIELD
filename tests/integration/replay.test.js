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
import { PAD_BUTTON } from '../../src/data/constants/gamepad.js';
import { installFakeGamepad } from '../__helpers__/fakeGamepad.js';

const STEPS = 600; // 10 s at 60 Hz

// Keys held during each half-second of the run (WASD moves on the screen
// axes); lowercase letters are taps (e shield, g spread toggle, t aim toggle,
// h dash). The route is picked so the run levels up twice.
const SEGMENT_STEPS = 30;
const SCRIPT = [
  '',
  'W',
  'W',
  'WAe',
  'WA',
  'Wh',
  'A',
  '',
  'A',
  'W',
  'g',
  'A',
  'W',
  'WDh',
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
  h: 'ShiftLeft',
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

  // Plays the scripted run with real key events; `beforePick(progression,
  // levelUpIndex)` runs on the level-up screen before the first card is taken.
  function recordRun(beforePick = () => {}) {
    const live = createHeadlessGame();
    live.session.startNewRun({ source: 'test' });
    const { progression } = live.services;
    progression.experienceToNext = TEST_XP_TO_LEVEL;
    const input = live.services.input;
    const press = (letter) => input.onKeyDown(keyEvent(KEY_CODES[letter]));
    const release = (letter) => input.onKeyUp(keyEvent(KEY_CODES[letter]));
    let held = [];
    let taps = [];
    let levelUps = 0;
    for (let step = 0; step < STEPS; step += 1) {
      if (live.takeOfferedUpgrade()) {
        beforePick(progression, levelUps);
        levelUps += 1;
        progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);
      }
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
    const recording = deserialize(
      serialize(live.session.replayRecorder.toJSON())
    );
    return { live, recording };
  }

  // Replays `recording` in a fresh instance: no key events, only the recording.
  function replayRun(recording) {
    const replay = createHeadlessGame();
    replay.controller.arm(recording);
    replay.session.startNewRun({ source: 'test' });
    replay.services.progression.experienceToNext = TEST_XP_TO_LEVEL;
    for (let step = 0; step < STEPS; step += 1) {
      replay.controller.tick();
      replay.step();
    }
    return replay;
  }

  it('replays a recorded 10 s run to the same player position, kills and XP', () => {
    const { live, recording } = recordRun();
    const recorded = live.snapshot();

    expect(recording.steps).toBe(STEPS);
    expect(recording.upgrades.length).toBeGreaterThan(0);
    // The dash bit (version 2) is in the recording.
    expect(recording.inputs.some(([, mask]) => mask & 128)).toBe(true);
    expect(recorded.kills).toBeGreaterThan(0);

    expect(replayRun(recording).snapshot()).toEqual(recorded);
  });

  it('replays a gamepad-driven run (analog sticks, triggers) to the same end state', () => {
    const fake = installFakeGamepad();
    try {
      const live = createHeadlessGame();
      live.session.startNewRun({ source: 'test' });
      live.services.progression.experienceToNext = TEST_XP_TO_LEVEL;
      for (let step = 0; step < STEPS; step += 1) {
        if (live.takeOfferedUpgrade()) {
          const { progression } = live.services;
          progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);
        }
        // The left stick sweeps a slow circle at part tilt; the right stick
        // aims by hand every other second; RT dashes now and then.
        const t = step / 60;
        const aiming = Math.floor(t) % 2 === 1;
        fake.set({
          axes: [
            0.7 * Math.cos(t),
            0.7 * Math.sin(t),
            aiming ? Math.cos(2 * t) : 0,
            aiming ? Math.sin(2 * t) : 0,
          ],
          pressed: step % 150 === 75 ? [PAD_BUTTON.RT] : [],
        });
        live.step();
      }
      const recording = deserialize(
        serialize(live.session.replayRecorder.toJSON())
      );
      const recorded = live.snapshot();
      expect(recording.inputs.some((entry) => entry.length === 6)).toBe(true);
      expect(recording.inputs.some(([, mask]) => mask & 128)).toBe(true);

      fake.disconnect();
      expect(replayRun(recording).snapshot()).toEqual(recorded);
    } finally {
      fake.restore();
    }
  });

  it('replays level-up rerolls and banishes to the same upgrades', () => {
    const { live, recording } = recordRun((progression, levelUpIndex) => {
      if (levelUpIndex === 0) progression.rerollUpgradeOptions();
      if (levelUpIndex === 1) {
        progression.banishUpgrade(progression.pendingUpgradeOptions[0].id);
      }
    });
    const entries = recording.upgrades.map(([, entry]) => entry);
    expect(entries).toContainEqual({ type: 'reroll' });
    expect(entries.some((entry) => entry?.type === 'banish')).toBe(true);

    // Snapshot before replaying: the pools are shared between instances.
    const recorded = live.snapshot();
    const { progression } = live.services;
    const upgrades = progression.getAllUpgrades();
    const banished = new Set(progression.banishedUpgrades);

    const replay = replayRun(recording);
    expect(replay.snapshot()).toEqual(recorded);
    expect(replay.services.progression.getAllUpgrades()).toEqual(upgrades);
    expect(replay.services.progression.banishedUpgrades).toEqual(banished);
  });
});
