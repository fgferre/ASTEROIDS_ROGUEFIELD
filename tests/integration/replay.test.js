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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
  keyEvent,
  SEED,
} from '../__helpers__/headlessGame.js';
import {
  createInputFrame,
  createRecorder,
  deserialize,
  serialize,
} from '../../src/core/replay.js';
import { PAD_BUTTON } from '../../src/data/constants/gamepad.js';
import { BASTION_HULL_ID, DEFAULT_HULL_ID } from '../../src/data/shipModels.js';
import { installFakeGamepad } from '../__helpers__/fakeGamepad.js';
import {
  CHEST_REVEAL_MS,
  ChestCeremony,
} from '../../src/modules/ui/ChestCeremony.js';

const STEPS = 600; // 10 s at 60 Hz

// Keys held during each half-second of the run (WASD moves on the screen
// axes); lowercase letters are taps (e shield, g spread toggle, t aim toggle,
// h dash). The route is picked so the run levels up at least twice (four
// times since the orbs burst out of kills, 20/10).
const SEGMENT_STEPS = 30;
const SCRIPT = [
  '',
  'W',
  'W',
  'WAe',
  'WA',
  'Wh',
  'S',
  'A',
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
// Every level costs TEST_XP_TO_LEVEL, so the short run levels up several times.
const cheapLevels = (progression) => {
  progression.levelCost = () => TEST_XP_TO_LEVEL;
  progression.experienceToNext = TEST_XP_TO_LEVEL;
};

// Enough of a DOM node for the chest's cards to show.
const stubNode = () => ({
  classList: { add() {}, remove() {}, replace() {}, toggle() {} },
  style: { setProperty() {} },
  appendChild() {},
  focus() {},
});

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
  // `hull` is flown unlocked; `bossRush` starts a Boss Rush; `controls` sets
  // the player's control scheme.
  function recordRun(
    beforePick = () => {},
    difficulty = 'veteran',
    { hull, bossRush, controls } = {}
  ) {
    const live = createHeadlessGame();
    live.services.settings.setSetting('gameplay', 'difficulty', difficulty);
    if (hull) {
      live.session.resolveServiceInstance('hangar').owned[`${hull}-hull`] =
        true;
      live.services.settings.setSetting('gameplay', 'selectedHull', hull);
    }
    if (controls) live.services.player.controlScheme = controls;
    live.session.startNewRun({ source: 'test', bossRush });
    const { progression } = live.services;
    cheapLevels(progression);
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
  // `start` is what starts the run (the browser clicks Start).
  function replayRun(recording, start = { source: 'test' }) {
    const replay = createHeadlessGame();
    // The hull setting is shared storage: the replay must ignore it.
    replay.services.settings.setSetting(
      'gameplay',
      'selectedHull',
      DEFAULT_HULL_ID
    );
    replay.controller.arm(recording);
    replay.session.startNewRun(start);
    cheapLevels(replay.services.progression);
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

  it("passes a chest's cards on its own after their reveal, and plays on to the same end", () => {
    const { live, recording } = recordRun();
    const recorded = live.snapshot();
    vi.useFakeTimers();
    try {
      document.createElement = stubNode;
      const replay = createHeadlessGame();
      let backToPlay = 0;
      const chest = new ChestCeremony({
        refs: {
          screen: stubNode(),
          title: stubNode(),
          count: stubNode(),
          cards: stubNode(),
          continueBtn: stubNode(),
        },
        showScreen() {},
        showGameUI: () => {
          backToPlay += 1;
        },
        cardChoiceOpen: () => false,
        prefersReducedMotion: () => false,
      });
      replay.ui.chestCeremony = chest;
      replay.controller.arm(recording);
      replay.session.startNewRun({ source: 'test' });
      cheapLevels(replay.services.progression);
      // Frames of the paused loop: the controller ticks, no step runs.
      const frames = (ms) => {
        for (let t = 0; t < ms; t += 16) {
          vi.advanceTimersByTime(16);
          replay.controller.tick();
        }
      };
      for (let step = 0; step < STEPS; step += 1) {
        if (step === STEPS / 2) {
          const card = { className: 'card', color: '#fff', html: '' };
          chest.show([card, card, card]);
          frames(2.5 * CHEST_REVEAL_MS); // the last card is still landing
          expect(chest.isVisible).toBe(true);
          frames(CHEST_REVEAL_MS);
          expect(chest.isVisible).toBe(false);
          expect(backToPlay).toBe(1);
        }
        replay.controller.tick();
        replay.step();
      }
      expect(replay.snapshot()).toEqual(recorded);
    } finally {
      vi.useRealTimers();
    }
  });

  it('replays a gamepad-driven run (analog sticks, triggers) to the same end state', () => {
    const fake = installFakeGamepad();
    try {
      const live = createHeadlessGame();
      live.session.startNewRun({ source: 'test' });
      cheapLevels(live.services.progression);
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

  it('replays a Warden run at Warden, whatever the replaying setting', () => {
    const { live, recording } = recordRun(() => {}, 'warden');
    const recorded = live.snapshot();
    expect(recording.difficulty).toBe('warden');

    // The setting is shared storage: the replay must ignore it.
    const replay = createHeadlessGame();
    replay.services.settings.setSetting('gameplay', 'difficulty', 'pilot');
    replay.controller.arm(recording);
    replay.session.startNewRun({ source: 'test' });
    cheapLevels(replay.services.progression);
    for (let step = 0; step < STEPS; step += 1) {
      replay.controller.tick();
      replay.step();
    }
    expect(replay.services.difficulty.getDifficulty()).toBe('warden');
    expect(replay.snapshot()).toEqual(recorded);
  });

  it('replays a Boss Rush as a Boss Rush in its hull, whatever started it', () => {
    const { live, recording } = recordRun(() => {}, 'veteran', {
      hull: BASTION_HULL_ID,
      bossRush: true,
    });
    const recorded = live.snapshot();
    expect(recording).toMatchObject({
      mode: 'bossRush',
      date: null,
      hull: BASTION_HULL_ID,
    });

    // Bastion is locked in this instance's Hangar; the browser clicks Start.
    const replay = replayRun(recording, {
      source: 'start-game-btn',
      daily: false,
      bossRush: false,
    });
    expect(replay.session.bossRush).toBe(true);
    expect(replay.services.enemies.waveManager.bossRush).toBe(true);
    expect(replay.services.player.currentHull.id).toBe(BASTION_HULL_ID);
    expect(replay.snapshot()).toEqual(recorded);
  });

  it('replays a Daily Field on the day it was recorded', () => {
    const live = createHeadlessGame();
    live.services.difficulty.now = () => new Date('2026-10-17T12:00:00Z');
    live.session.startNewRun({ source: 'daily-field-btn', daily: true });
    const recording = deserialize(
      serialize(live.session.replayRecorder.toJSON())
    );
    expect(recording).toMatchObject({ mode: 'daily', date: '2026-10-17' });

    const replay = createHeadlessGame();
    replay.services.difficulty.now = () => new Date('2026-10-18T12:00:00Z');
    replay.controller.arm(recording);
    replay.session.startNewRun({
      source: 'start-game-btn',
      daily: false,
      bossRush: false,
    });
    expect(replay.services.difficulty.isDaily()).toBe(true);
    expect(replay.services.difficulty.getRunSeed()).toBe(recording.seed);
  });

  it('replays a Classic-controls run with Classic controls, whatever the replaying scheme', () => {
    const { live, recording } = recordRun(() => {}, 'veteran', {
      controls: 'classic',
    });
    const recorded = live.snapshot();
    expect(recording.controls).toBe('classic');

    // The replaying game flies Modern, as a viewer's default Settings would.
    const replay = replayRun(recording);
    expect(replay.services.player.controlScheme).toBe('classic');
    expect(replay.snapshot()).toEqual(recorded);

    // The viewer's next own run flies their scheme again.
    replay.session.startNewRun({ source: 'test' });
    expect(replay.services.player.controlScheme).toBe('modern');
  });

  it('plays a recording without a mode (version 5) as a normal run', () => {
    const { live, recording } = recordRun();
    const recorded = live.snapshot();
    const { mode, date, ...v5 } = recording;
    expect([mode, date]).toEqual(['normal', null]);

    const replay = replayRun(deserialize({ ...v5, version: 5 }));
    expect(replay.session.bossRush).toBe(false);
    expect(replay.services.difficulty.isDaily()).toBe(false);
    expect(replay.snapshot()).toEqual(recorded);
  });

  it("leaves the viewer's Salvage and pad alone, then pays and rumbles for their own run", () => {
    const fake = installFakeGamepad();
    try {
      const recorder = createRecorder({
        seed: SEED,
        hull: DEFAULT_HULL_ID,
        difficulty: 'veteran',
        mode: 'normal',
        controls: 'modern',
      });
      recorder.record(0, createInputFrame());
      const replay = createHeadlessGame();
      const hangar = replay.session.resolveServiceInstance('hangar');
      const salvage = hangar.salvage;

      replay.controller.arm(deserialize(serialize(recorder.toJSON())));
      replay.session.startNewRun({ source: 'test' });
      replay.step(); // the pad is polled
      const death = { wave: { current: 9 }, stats: { totalKills: 47 } };
      replay.eventBus.emit('player-took-damage', { damage: 10 });
      replay.eventBus.emit('player-died', death);
      expect(hangar.salvage).toBe(salvage);
      expect(fake.effects).toEqual([]);

      replay.session.startNewRun({ source: 'test' });
      replay.eventBus.emit('player-took-damage', { damage: 10 });
      replay.eventBus.emit('player-died', death);
      expect(hangar.salvage).toBeGreaterThan(salvage);
      expect(fake.effects).toHaveLength(1);
    } finally {
      fake.restore();
    }
  });
});
