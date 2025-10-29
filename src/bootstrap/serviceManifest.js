import SettingsSystem from '../modules/SettingsSystem.js';
import InputSystem from '../modules/InputSystem.js';
import PlayerSystem from '../modules/PlayerSystem.js';
import CombatSystem from '../modules/CombatSystem.js';
import { EnemySystem } from '../modules/EnemySystem.js';
import PhysicsSystem from '../modules/PhysicsSystem.js';
import XPOrbSystem from '../modules/XPOrbSystem.js';
import HealthHeartSystem from '../modules/collectibles/HealthHeartSystem.js';
import ProgressionSystem from '../modules/ProgressionSystem.js';
import UISystem from '../modules/UISystem.js';
import EffectsSystem from '../modules/EffectsSystem.js';
import AudioSystem from '../modules/AudioSystem.js';
import WorldSystem from '../modules/WorldSystem.js';
import RenderingSystem from '../modules/RenderingSystem.js';
import MenuBackgroundSystem from '../modules/MenuBackgroundSystem.js';
import { GamePools } from '../core/GamePools.js';
import { GarbageCollectionManager } from '../core/GarbageCollectionManager.js';
import RandomService from '../core/RandomService.js';
import GameSessionService from '../services/GameSessionService.js';
import CommandQueueService from '../services/CommandQueueService.js';
import CrackGenerationService from '../services/CrackGenerationService.js';

export const DEFAULT_POOL_CONFIG = {
  bullets: { initial: 25, max: 120 },
  particles: { initial: 60, max: 400 },
  asteroids: { initial: 20, max: 100 },
  xpOrbs: { initial: 40, max: 250 },
  shockwaves: { initial: 8, max: 25 },
  tempObjects: { initial: 15, max: 60 }
};

export const DEFAULT_GC_OPTIONS = {
  defaultInterval: 4500,
  idleTimeout: 120,
  maxTasksPerFrame: 2
};

function ensureGameStateService(gameState) {
  if (!gameState || typeof gameState !== 'object') {
    throw new Error('[serviceManifest] Missing game state reference');
  }

  let sessionDelegate = null;

  const service = {
    isPaused: () => {
      if (sessionDelegate && typeof sessionDelegate.isPaused === 'function') {
        try {
          return Boolean(sessionDelegate.isPaused());
        } catch (error) {
          console.warn('[serviceManifest] Falling back to raw pause state:', error);
        }
      }
      return Boolean(gameState.isPaused);
    },
    getScreen: () => {
      if (sessionDelegate && typeof sessionDelegate.getScreen === 'function') {
        try {
          return sessionDelegate.getScreen();
        } catch (error) {
          console.warn('[serviceManifest] Falling back to raw screen state:', error);
        }
      }
      return gameState.screen;
    },
    setScreen: (screen) => {
      if (sessionDelegate && typeof sessionDelegate.setScreen === 'function') {
        sessionDelegate.setScreen(screen);
        const delegatedScreen =
          typeof sessionDelegate.getScreen === 'function' ? sessionDelegate.getScreen() : undefined;
        if (delegatedScreen !== undefined) {
          gameState.screen = delegatedScreen;
          return;
        }
      }

      gameState.screen = screen;
    },
    setPaused: (value) => {
      if (sessionDelegate && typeof sessionDelegate.setPaused === 'function') {
        sessionDelegate.setPaused(value);
        const delegatedState =
          typeof sessionDelegate.isPaused === 'function' ? sessionDelegate.isPaused() : undefined;
        if (delegatedState !== undefined) {
          gameState.isPaused = Boolean(delegatedState);
          return;
        }
      }

      gameState.isPaused = Boolean(value);
    },
    getRawState: () => gameState
  };

  Object.defineProperty(service, '__attachSessionService', {
    value: (sessionService) => {
      sessionDelegate = sessionService || null;

      if (sessionDelegate) {
        if (typeof sessionDelegate.getScreen === 'function') {
          const screen = sessionDelegate.getScreen();
          if (screen !== undefined) {
            gameState.screen = screen;
          }
        }

        if (typeof sessionDelegate.isPaused === 'function') {
          const paused = sessionDelegate.isPaused();
          if (paused !== undefined) {
            gameState.isPaused = Boolean(paused);
          }
        }
      }
    },
    enumerable: false,
    writable: false
  });

  return service;
}

function initializeGamePools(config) {
  const poolConfig = { ...DEFAULT_POOL_CONFIG, ...config };
  if (!GamePools.initialized) {
    GamePools.initialize(poolConfig);
  }
  return GamePools;
}

function createGarbageCollector(options) {
  const gcOptions = { ...DEFAULT_GC_OPTIONS, ...options };
  const manager = new GarbageCollectionManager(gcOptions);
  manager.initialize();

  manager.registerPeriodicTask(
    'pool-auto-manage',
    () => GamePools.autoManageAll(),
    { interval: 5000, priority: 2, runImmediately: true }
  );

  manager.registerPeriodicTask(
    'temp-pool-trim',
    () => {
      const tempPool = GamePools.tempObjects;
      if (tempPool && typeof tempPool.autoManage === 'function') {
        tempPool.autoManage({ targetUtilization: 0.55, maxShrinkage: 10, maxExpansion: 6 });
      }
    },
    { interval: 7000, priority: 1 }
  );

  return manager;
}

function createRandomService(context = {}) {
  const { randomOverrides, seed } = context;

  const baseSeed =
    (randomOverrides && typeof randomOverrides === 'object' && 'seed' in randomOverrides)
      ? randomOverrides.seed
      : seed;

  if (typeof randomOverrides === 'function') {
    const result = randomOverrides({
      seed: baseSeed,
      context,
      RandomService,
    });

    if (result) {
      return result;
    }
  }

  if (randomOverrides && typeof randomOverrides === 'object') {
    if (typeof randomOverrides.factory === 'function') {
      const factoryResult = randomOverrides.factory({
        seed: baseSeed,
        context,
        RandomService,
      });

      if (factoryResult) {
        return factoryResult;
      }
    }

    if (randomOverrides.instance) {
      return randomOverrides.instance;
    }

    if (typeof randomOverrides.create === 'function') {
      const created = randomOverrides.create({
        seed: baseSeed,
        context,
        RandomService,
      });

      if (created) {
        return created;
      }
    }
  }

  const ServiceCtor =
    (randomOverrides && typeof randomOverrides === 'object' && randomOverrides.Service)
      || (randomOverrides && typeof randomOverrides === 'object' && randomOverrides.RandomService)
      || (randomOverrides && typeof randomOverrides === 'object' && randomOverrides.constructorOverride)
      || RandomService;

  const service = new ServiceCtor(baseSeed);

  if (randomOverrides && typeof randomOverrides === 'object' && typeof randomOverrides.configure === 'function') {
    randomOverrides.configure(service, {
      seed: baseSeed,
      context,
      RandomService,
    });
  }

  return service;
}

export function createServiceManifest(context = {}) {
  const {
    gameState,
    poolConfig,
    garbageCollectorOptions
  } = context;

  return [
    {
      name: 'event-bus',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: () => {
        if (typeof gameEvents === 'undefined') {
          throw new Error('[serviceManifest] Global event bus is not available');
        }
        return gameEvents;
      }
    },
    {
      name: 'random',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: ({ context: manifestContext }) =>
        createRandomService({ ...manifestContext })
    },
    {
      name: 'game-state',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: ({ container }) => {
        const service = ensureGameStateService(gameState);

        if (typeof container?.syncInstance === 'function') {
          container.syncInstance('game-state', service);
        }

        return service;
      }
    },
    {
      name: 'game-pools',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: () => initializeGamePools(poolConfig)
    },
    {
      name: 'garbage-collector',
      singleton: true,
      lazy: false,
      dependencies: ['game-pools'],
      factory: ({ container }) => {
        const manager = createGarbageCollector(garbageCollectorOptions);

        if (typeof container?.syncInstance === 'function') {
          container.syncInstance('garbage-collector', manager);
        }

        return manager;
      }
    },
    {
      name: 'settings',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: () => new SettingsSystem()
    },
    {
      name: 'audio',
      singleton: true,
      lazy: true,
      dependencies: ['settings', 'random'],
      factory: ({ resolved }) =>
        new AudioSystem({ settings: resolved['settings'], random: resolved['random'] })
    },
    {
      name: 'command-queue',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: ({ context: manifestContext }) =>
        new CommandQueueService({
          initialFrame: Number.isFinite(manifestContext?.initialFrame)
            ? manifestContext.initialFrame
            : 0,
          frameSource: manifestContext?.frameSource,
          hooks: manifestContext?.metrics?.commandQueue,
        })
    },
    {
      name: 'crack-generation',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: ({ container }) => {
        if (typeof container?.syncInstance === 'function') {
          container.syncInstance('crack-generation', CrackGenerationService);
        }

        return CrackGenerationService;
      }
    },
    {
      name: 'input',
      singleton: true,
      lazy: false,
      dependencies: ['settings', 'command-queue'],
      factory: ({ resolved }) =>
        new InputSystem({
          settings: resolved['settings'],
          'command-queue': resolved['command-queue'],
        })
    },
    {
      name: 'player',
      singleton: true,
      lazy: false,
      dependencies: ['input', 'command-queue'],
      factory: ({ resolved }) =>
        new PlayerSystem({
          input: resolved['input'],
          'command-queue': resolved['command-queue'],
        })
    },
    {
      name: 'xp-orbs',
      singleton: true,
      lazy: false,
      dependencies: ['player', 'random'],
      factory: ({ resolved }) =>
        new XPOrbSystem({
          player: resolved['player'],
          random: resolved['random'],
        })
    },
    {
      name: 'healthHearts',
      singleton: true,
      lazy: false,
      dependencies: ['player'],
      factory: ({ resolved }) => new HealthHeartSystem({ player: resolved['player'] })
    },
    {
      name: 'physics',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: ({ resolved, container }) => {
        const physics = new PhysicsSystem();

        const enemyInstance =
          resolved['enemies'] ||
          (typeof container?.isInstantiated === 'function' && container.isInstantiated('enemies')
            ? container.resolve('enemies')
            : null);

        if (enemyInstance && typeof physics.attachEnemySystem === 'function') {
          physics.attachEnemySystem(enemyInstance);
        }

        return physics;
      }
    },
    {
      name: 'ui',
      singleton: true,
      lazy: false,
      dependencies: ['settings'],
      factory: ({ resolved }) => new UISystem({ settings: resolved['settings'] })
    },
    {
      name: 'effects',
      singleton: true,
      lazy: false,
      dependencies: ['audio', 'settings', 'random'],
      factory: ({ resolved }) =>
        new EffectsSystem({
          audio: resolved['audio'],
          settings: resolved['settings'],
          random: resolved['random'],
        })
    },
    {
      name: 'progression',
      singleton: true,
      lazy: false,
      dependencies: ['xp-orbs', 'player', 'ui', 'effects', 'random'],
      factory: ({ resolved }) => {
        const progression = new ProgressionSystem({
          'xp-orbs': resolved['xp-orbs'],
          player: resolved['player'],
          ui: resolved['ui'],
          effects: resolved['effects'],
          random: resolved['random'],
        });

        const xpOrbSystem = resolved['xp-orbs'];
        if (xpOrbSystem && typeof xpOrbSystem.attachProgression === 'function') {
          xpOrbSystem.attachProgression(progression);
        }

        return progression;
      }
    },
    {
      name: 'enemies',
      singleton: true,
      lazy: false,
      dependencies: ['player', 'xp-orbs', 'progression', 'physics', 'healthHearts', 'random'],
      factory: ({ resolved }) => {
        const enemySystem = new EnemySystem({
          player: resolved['player'],
          'xp-orbs': resolved['xp-orbs'],
          progression: resolved['progression'],
          physics: resolved['physics'],
          healthHearts: resolved['healthHearts'],
          random: resolved['random'],
        });

        if (resolved['progression'] && typeof enemySystem.attachProgression === 'function') {
          enemySystem.attachProgression(resolved['progression']);
        }

        if (resolved['physics'] && typeof resolved['physics'].attachEnemySystem === 'function') {
          resolved['physics'].attachEnemySystem(enemySystem);
        }

        return enemySystem;
      }
    },
    {
      name: 'enemy-spawn',
      singleton: true,
      lazy: true,
      dependencies: ['enemies'],
      factory: ({ resolved }) => {
        const enemySystem = resolved['enemies'];
        return enemySystem ? enemySystem.spawnSystem : null;
      }
    },
    {
      name: 'enemy-damage',
      singleton: true,
      lazy: true,
      dependencies: ['enemies'],
      factory: ({ resolved }) => {
        const enemySystem = resolved['enemies'];
        return enemySystem ? enemySystem.damageSystem : null;
      }
    },
    {
      name: 'enemy-update',
      singleton: true,
      lazy: true,
      dependencies: ['enemies'],
      factory: ({ resolved }) => {
        const enemySystem = resolved['enemies'];
        return enemySystem ? enemySystem.updateSystem : null;
      }
    },
    {
      name: 'enemy-render',
      singleton: true,
      lazy: true,
      dependencies: ['enemies'],
      factory: ({ resolved }) => {
        const enemySystem = resolved['enemies'];
        return enemySystem ? enemySystem.renderSystem : null;
      }
    },
    {
      name: 'combat',
      singleton: true,
      lazy: false,
      dependencies: ['player', 'enemies', 'physics', 'command-queue'],
      factory: ({ resolved }) =>
        new CombatSystem({
          player: resolved['player'],
          enemies: resolved['enemies'],
          physics: resolved['physics'],
          'command-queue': resolved['command-queue']
        })
    },
    {
      name: 'world',
      singleton: true,
      lazy: false,
      dependencies: ['player', 'enemies', 'physics', 'progression'],
      factory: ({ resolved }) => {
        const world = new WorldSystem({
          player: resolved['player'],
          enemies: resolved['enemies'],
          physics: resolved['physics'],
          progression: resolved['progression']
        });

        if (resolved['enemies'] && typeof resolved['enemies'].attachWorld === 'function') {
          resolved['enemies'].attachWorld(world);
        }

        return world;
      }
    },
    {
      name: 'game-session',
      singleton: true,
      lazy: false,
      dependencies: [
        'event-bus',
        'random',
        'game-state',
        'audio',
        'ui',
        'player',
        'progression',
        'enemies',
        'physics',
        'xp-orbs',
        'healthHearts',
        'world',
        'effects'
      ],
      factory: ({ resolved, context, container }) => {
        const instance = new GameSessionService({
          eventBus: resolved['event-bus'],
          random: resolved['random'],
          gameStateFacade: resolved['game-state'],
          services: {
            audio: resolved['audio'],
            ui: resolved['ui'],
            player: resolved['player'],
            progression: resolved['progression'],
            enemies: resolved['enemies'],
            physics: resolved['physics'],
            xpOrbs: resolved['xp-orbs'],
            healthHearts: resolved['healthHearts'],
            world: resolved['world'],
            effects: resolved['effects']
          },
          gameState: context.gameState
        });

        if (typeof container?.syncInstance === 'function') {
          container.syncInstance('game-session', instance);
        }

        if (
          resolved['game-state'] &&
          typeof resolved['game-state'].__attachSessionService === 'function'
        ) {
          resolved['game-state'].__attachSessionService(instance);
        }

        return instance;
      }
    },
    {
      name: 'renderer',
      singleton: true,
      lazy: false,
      dependencies: [
        'player',
        'progression',
        'xp-orbs',
        'healthHearts',
        'effects',
        'combat',
        'enemies',
        'random'
      ],
      factory: ({ resolved }) =>
        new RenderingSystem({
          player: resolved['player'],
          progression: resolved['progression'],
          'xp-orbs': resolved['xp-orbs'],
          healthHearts: resolved['healthHearts'],
          effects: resolved['effects'],
          combat: resolved['combat'],
          enemies: resolved['enemies'],
          random: resolved['random'],
        })
    },
    {
      name: 'menu-background',
      singleton: true,
      lazy: false,
      dependencies: ['settings', 'random'],
      factory: ({ resolved }) =>
        new MenuBackgroundSystem({
          settings: resolved['settings'],
          random: resolved['random'],
        })
    }
  ];
}
