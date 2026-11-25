/**
 * A run's random streams follow that run's seed only: not the boot seed, not an earlier run's.
 * Local copy of the headless harness with a parameterised boot seed (the shared one has a fixed seed).
 */

import { DIContainer } from '../../../src/core/DIContainer.js';
import { EventBus } from '../../../src/core/EventBus.js';
import { GamePools } from '../../../src/core/GamePools.js';
import { createServiceManifest } from '../../../src/bootstrap/serviceManifest.js';
import { createFixedStepper } from '../../../src/core/fixedStep.js';
import { createReplayController } from '../../../src/bootstrap/replaySession.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deserialize, serialize } from '../../../src/core/replay.js';
import { installDomStubs, keyEvent } from '../../__helpers__/domStubs.js';

const STEP_SECONDS = createFixedStepper().step;

const UPDATE_ORDER = [
  'input',
  'player',
  'enemies',
  'physics',
  'combat',
  'xp-orbs',
  'healthHearts',
  'pickups',
  'progression',
  'world',
];

const SIMULATION_SERVICES = [
  'random',
  'game-state',
  'game-pools',
  'settings',
  'difficulty',
  'command-queue',
  ...UPDATE_ORDER,
  'effects',
  'game-session',
];

function createGame(bootSeed, bootSource) {
  GamePools.releaseAll();

  const gameState = {
    screen: 'menu',
    isPaused: false,
    randomSeed: bootSeed,
    randomSeedSource: bootSource,
  };
  const eventBus = new EventBus();
  const ui = {
    chestCeremony: { current: null },
    flightBriefing: { continue() {} },
    handleBossEvent() {},
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
  const context = {
    gameState,
    seed: bootSeed,
    randomSeed: bootSeed,
    randomSeedSource: bootSource,
  };
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
  session.initialize({ seedInfo: { seed: bootSeed, source: bootSource } });

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
    eventBus,
    session,
    ui,
    controller,
    takeOfferedUpgrade() {
      const id = offeredUpgrade;
      offeredUpgrade = null;
      return id;
    },
    /** Mirrors the fixed-step body of app.js gameLoop. */
    step() {
      services['game-pools'].update(STEP_SECONDS);
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

const FRAMES = 60 * 12;
const STEPS = 900;

// Real boot: source 'crypto' (random per page load), so the run seed is not pinned.
const boot = (seed) => createGame(seed, 'crypto');

// The first asteroids to appear: kind, size, variant, place.
function firstSpawns(game, frames, keep = 12) {
  const { enemies, player } = game.services;
  player.setInvulnerableTimer(1e9);
  const seen = new Set();
  const list = [];
  for (let i = 0; i < frames && list.length < keep; i += 1) {
    game.step();
    for (const e of enemies.getActiveEnemies()) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      list.push(
        [
          e.type,
          e.size,
          e.variant,
          Math.round(e.x),
          Math.round(e.y),
          e.rockLayer ?? '',
        ].join('/')
      );
    }
  }
  return list;
}

// Per-game log of the first asteroids seen, plus the ship, for the replay check.
const logs = new WeakMap();
function stepLogged(game) {
  const log = logs.get(game) ?? { seen: new Set(), spawns: [] };
  logs.set(game, log);
  game.step();
  for (const e of game.services.enemies.getActiveEnemies()) {
    if (log.seen.has(e.id) || log.spawns.length >= 15) continue;
    log.seen.add(e.id);
    log.spawns.push(
      [e.size, e.variant, Math.round(e.x), Math.round(e.y)].join('/')
    );
  }
}
const fingerprint = (game) => {
  const { enemyCount: _enemyCount, ...snap } = game.snapshot();
  return JSON.stringify({ snap, spawns: logs.get(game).spawns });
};

describe('a run draws from its own seed', () => {
  let restore;
  beforeEach(() => {
    restore = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    restore();
    vi.restoreAllMocks();
  });

  it('a second run with seed B plays like a fresh boot with seed B', () => {
    const game = boot(1111);
    game.session.startNewRun({ source: 'test' });
    firstSpawns(game, FRAMES);
    game.services.difficulty.pinnedSeed = true;
    game.services.difficulty.runSeed = 2222;
    game.session.startNewRun({ source: 'test' });
    const second = firstSpawns(game, FRAMES);

    const fresh = boot(2222);
    fresh.session.startNewRun({ source: 'test' });

    expect(second).toEqual(firstSpawns(fresh, FRAMES));
  });

  it('the Daily seed gives the same first spawns on boots with different boot seeds', () => {
    const a = boot(4444);
    a.session.startNewRun({ source: 'test', daily: true });
    const b = boot(5555);
    b.session.startNewRun({ source: 'test', daily: true });

    expect(firstSpawns(b, FRAMES)).toEqual(firstSpawns(a, FRAMES));
  });

  it('a second-run recording replays on a clean boot', () => {
    const live = boot(1212);
    live.session.startNewRun({ source: 'test' }); // the first run spends the boot seed
    for (let i = 0; i < 60; i += 1) stepLogged(live);
    live.session.startNewRun({ source: 'test' });
    logs.delete(live);
    live.services.player.setInvulnerableTimer(1e9);
    live.services.input.onKeyDown(keyEvent('KeyW'));
    live.services.input.onKeyDown(keyEvent('KeyA'));
    for (let i = 0; i < STEPS; i += 1) stepLogged(live);
    const recording = deserialize(
      serialize(live.session.replayRecorder.toJSON())
    );

    // As app.js boots a replay: the recording's seed, source 'replay'.
    const replay = createGame(recording.seed, 'replay');
    replay.controller.arm(recording);
    replay.session.startNewRun({ source: 'test' });
    replay.services.player.setInvulnerableTimer(1e9);
    for (let i = 0; i < STEPS; i += 1) {
      replay.controller.tick();
      stepLogged(replay);
    }

    expect(fingerprint(replay)).toBe(fingerprint(live));
  });
});
