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
import { DIContainer } from '../../src/core/DIContainer.js';
import { EventBus } from '../../src/core/EventBus.js';
import { GamePools } from '../../src/core/GamePools.js';
import { createServiceManifest } from '../../src/bootstrap/serviceManifest.js';
import { createFixedStepper } from '../../src/core/fixedStep.js';
import { createReplayController } from '../../src/bootstrap/replaySession.js';
import { deserialize, serialize } from '../../src/core/replay.js';

const SEED = 0x5eed;
const STEPS = 600; // 10 s at 60 Hz
const STEP_SECONDS = createFixedStepper().step;

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

const UPDATE_ORDER = [
  'input',
  'player',
  'enemies',
  'physics',
  'combat',
  'xp-orbs',
  'healthHearts',
  'progression',
  'world',
];

const SIMULATION_SERVICES = [
  'random',
  'game-state',
  'game-pools',
  'garbage-collector',
  'settings',
  'command-queue',
  ...UPDATE_ORDER,
  'effects',
  'game-session',
];

function keyEvent(code) {
  return {
    key: code.slice(3).toLowerCase(),
    code,
    preventDefault() {},
    stopPropagation() {},
  };
}

function installDomStubs() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
  };
  const noop = () => {};
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.document = {
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: () => null,
    querySelector: () => null,
    activeElement: null,
  };
  globalThis.window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { search: '' },
    localStorage: globalThis.localStorage,
  };
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}

/** One game instance: real simulation services, stubbed UI and audio. */
function createHeadlessGame() {
  GamePools.releaseAll();

  const gameState = {
    screen: 'menu',
    isPaused: false,
    randomSeed: SEED,
    randomSeedSource: 'test',
  };
  const eventBus = new EventBus();
  const ui = {
    showGameUI() {},
    showScreen() {},
    update() {},
    reset() {},
  };
  const stubs = {
    'event-bus': eventBus,
    audio: { init() {}, reseedRandomScopes() {} },
    ui,
  };

  // Same registration as ServiceRegistry.setupServices, with the stubs above
  // and everything lazy so only the services resolved below are built.
  const context = { gameState, seed: SEED, randomSeed: SEED };
  const container = new DIContainer();
  container.verbose = false;
  for (const entry of createServiceManifest(context)) {
    const { name, dependencies = [] } = entry;
    const factory = stubs[name]
      ? () => stubs[name]
      : (...deps) =>
          entry.factory({
            resolved: Object.fromEntries(
              dependencies.map((dep, index) => [dep, deps[index]])
            ),
            container,
            context,
          });
    container.register(name, factory, { dependencies, lazy: true });
  }

  const services = {};
  for (const name of SIMULATION_SERVICES) {
    services[name] = container.resolve(name);
  }
  const session = services['game-session'];
  session.initialize({ seedInfo: { seed: SEED, source: 'test' } });

  let step = 0;
  const controller = createReplayController({
    eventBus,
    input: services.input,
    session,
    progression: services.progression,
    ui,
    getStep: () => step,
  });

  // Stand-in for the player's level-up click while recording: the first
  // option, taken at the next frame boundary like a real click.
  let offeredUpgrade = null;
  eventBus.on('upgrade-options-ready', (payload = {}) => {
    offeredUpgrade = payload.options?.[0]?.id ?? null;
  });

  return {
    services,
    session,
    controller,
    takeOfferedUpgrade() {
      const id = offeredUpgrade;
      offeredUpgrade = null;
      return id;
    },
    /** Mirrors the fixed-step body of app.js gameLoop. */
    step() {
      services['game-pools'].update(STEP_SECONDS);
      services['garbage-collector'].update(STEP_SECONDS);
      const adjusted = services.effects.update(STEP_SECONDS);
      for (const name of UPDATE_ORDER) {
        services[name].update(adjusted);
      }
      step += 1;
    },
    snapshot() {
      const { player, progression, enemies } = services;
      return {
        x: player.position.x,
        y: player.position.y,
        angle: player.angle,
        kills: enemies.sessionStats.totalKills,
        xp: progression.totalExperience,
        level: progression.level,
        enemyCount: enemies.getActiveEnemyCount(),
      };
    },
  };
}

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
