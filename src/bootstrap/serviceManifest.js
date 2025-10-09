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

const DEFAULT_POOL_CONFIG = {
  bullets: { initial: 25, max: 120 },
  particles: { initial: 60, max: 400 },
  asteroids: { initial: 20, max: 100 },
  xpOrbs: { initial: 40, max: 250 },
  shockwaves: { initial: 8, max: 25 },
  tempObjects: { initial: 15, max: 60 }
};

const DEFAULT_GC_OPTIONS = {
  defaultInterval: 4500,
  idleTimeout: 120,
  maxTasksPerFrame: 2
};

function ensureGameStateService(gameState) {
  if (!gameState || typeof gameState !== 'object') {
    throw new Error('[serviceManifest] Missing game state reference');
  }

  const service = {
    isPaused: () => Boolean(gameState.isPaused),
    getScreen: () => gameState.screen,
    setScreen: (screen) => {
      gameState.screen = screen;
    },
    setPaused: (value) => {
      gameState.isPaused = Boolean(value);
    }
  };

  if (typeof gameServices !== 'undefined') {
    gameServices.register('game-state', service);
  }

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

  if (typeof gameServices !== 'undefined') {
    gameServices.register('garbage-collector', manager);
  }

  return manager;
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
      name: 'game-state',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: () => ensureGameStateService(gameState)
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
      factory: () => createGarbageCollector(garbageCollectorOptions)
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
      dependencies: ['settings'],
      factory: ({ resolved }) => new AudioSystem({ settings: resolved['settings'] })
    },
    {
      name: 'input',
      singleton: true,
      lazy: false,
      dependencies: ['settings'],
      factory: ({ resolved }) => new InputSystem({ settings: resolved['settings'] })
    },
    {
      name: 'player',
      singleton: true,
      lazy: false,
      dependencies: ['input'],
      factory: ({ resolved }) => new PlayerSystem({ input: resolved['input'] })
    },
    {
      name: 'xp-orbs',
      singleton: true,
      lazy: false,
      dependencies: ['player'],
      factory: ({ resolved }) => new XPOrbSystem({ player: resolved['player'] })
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
      factory: () => new PhysicsSystem()
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
      dependencies: ['audio', 'settings'],
      factory: ({ resolved }) =>
        new EffectsSystem({ audio: resolved['audio'], settings: resolved['settings'] })
    },
    {
      name: 'progression',
      singleton: true,
      lazy: false,
      dependencies: ['xp-orbs', 'player', 'ui', 'effects'],
      factory: ({ resolved }) =>
        new ProgressionSystem({
          xpOrbs: resolved['xp-orbs'],
          player: resolved['player'],
          ui: resolved['ui'],
          effects: resolved['effects']
        })
    },
    {
      name: 'enemies',
      singleton: true,
      lazy: false,
      dependencies: ['player', 'xp-orbs', 'progression', 'physics'],
      factory: ({ resolved }) =>
        new EnemySystem({
          player: resolved['player'],
          xpOrbs: resolved['xp-orbs'],
          progression: resolved['progression'],
          physics: resolved['physics']
        })
    },
    {
      name: 'combat',
      singleton: true,
      lazy: false,
      dependencies: ['player', 'enemies', 'physics'],
      factory: ({ resolved }) =>
        new CombatSystem({
          player: resolved['player'],
          enemies: resolved['enemies'],
          physics: resolved['physics']
        })
    },
    {
      name: 'world',
      singleton: true,
      lazy: false,
      dependencies: ['player', 'enemies', 'physics', 'progression'],
      factory: ({ resolved }) =>
        new WorldSystem({
          player: resolved['player'],
          enemies: resolved['enemies'],
          physics: resolved['physics'],
          progression: resolved['progression']
        })
    },
    {
      name: 'renderer',
      singleton: true,
      lazy: false,
      dependencies: [],
      factory: () => new RenderingSystem()
    },
    {
      name: 'menu-background',
      singleton: true,
      lazy: false,
      dependencies: ['settings'],
      factory: ({ resolved }) => new MenuBackgroundSystem({ settings: resolved['settings'] })
    }
  ];
}
