/**
 * Headless game harness: the production simulation (simulationManifest.js)
 * with doubles in the presentation slots (UI, audio, renderer, menu
 * background), stepped like app.js gameLoop. It never loads the presentation
 * systems (tests/process/simulationLoadsNoPresentation.test.js guards it).
 */

import { DIContainer } from '../../src/core/DIContainer.js';
import { EventBus } from '../../src/core/EventBus.js';
import { GamePools } from '../../src/core/GamePools.js';
import { createSimulationManifest } from '../../src/bootstrap/simulationManifest.js';
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

// The renderer's double. GameSessionService resets it with the other systems,
// and the real one then announces renderer-reset, an event the golden trace
// records (tests/modules/render3d/rendererDouble.test.js keeps the two alike).
export function createRendererDouble(eventBus) {
  return { reset: () => eventBus.emit('renderer-reset') };
}

/**
 * One game instance: real simulation services, presentation doubles.
 * `seedSource` is the boot's ('profile-harness' boots a demo page).
 */
export function createHeadlessGame({ seedSource = 'test' } = {}) {
  GamePools.releaseAll();

  const gameState = {
    screen: 'menu',
    isPaused: false,
    randomSeed: SEED,
    randomSeedSource: seedSource,
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
  // Each double holds only what the simulation calls on it.
  const presentation = {
    audio: { init() {}, reseedRandomScopes() {} },
    ui,
    renderer: createRendererDouble(eventBus),
    // Only the real renderer reads it.
    'menu-background': {},
  };
  const stubs = { 'event-bus': eventBus, ...presentation };

  // Same registration as ServiceRegistry.setupServices, with the stubs above
  // (the doubles in their slots) and everything lazy so only the services
  // resolved below are built.
  const context = {
    gameState,
    seed: SEED,
    randomSeed: SEED,
    randomSeedSource: seedSource,
  };
  const container = new DIContainer();
  container.verbose = false;
  const slots = Object.fromEntries(
    Object.keys(presentation).map((name) => [name, { name }])
  );
  for (const entry of createSimulationManifest(context, slots)) {
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
