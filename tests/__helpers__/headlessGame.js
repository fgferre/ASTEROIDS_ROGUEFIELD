/**
 * Headless game harness: the production service manifest with only the
 * DOM-bound services (UI, audio) stubbed, stepped like app.js gameLoop.
 */

import { DIContainer } from '../../src/core/DIContainer.js';
import { EventBus } from '../../src/core/EventBus.js';
import { GamePools } from '../../src/core/GamePools.js';
import { createServiceManifest } from '../../src/bootstrap/serviceManifest.js';
import { createFixedStepper } from '../../src/core/fixedStep.js';
import { createReplayController } from '../../src/bootstrap/replaySession.js';

export const SEED = 0x5eed;
export const STEP_SECONDS = createFixedStepper().step;

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

export function keyEvent(code) {
  return {
    key: code.slice(3).toLowerCase(),
    code,
    preventDefault() {},
    stopPropagation() {},
  };
}

export function installDomStubs() {
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
export function createHeadlessGame() {
  GamePools.releaseAll();

  const gameState = {
    screen: 'menu',
    isPaused: false,
    randomSeed: SEED,
    randomSeedSource: 'test',
  };
  const eventBus = new EventBus();
  const ui = {
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
    eventBus,
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
