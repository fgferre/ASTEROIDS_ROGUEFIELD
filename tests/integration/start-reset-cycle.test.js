import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RandomService from '../../src/core/RandomService.js';
import { GamePools } from '../../src/core/GamePools.js';
import EffectsSystem from '../../src/modules/EffectsSystem.js';
import XPOrbSystem from '../../src/modules/XPOrbSystem.js';
import { EnemySystem } from '../../src/modules/EnemySystem.js';

function createEventBus() {
  const listeners = new Map();
  return {
    on(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(handler);
    },
    off(event, handler) {
      const set = listeners.get(event);
      if (!set) {
        return;
      }
      set.delete(handler);
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) {
        return;
      }
      for (const handler of Array.from(set)) {
        try {
          handler(payload);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(`[test-event-bus] listener for ${event} threw`, error);
        }
      }
    },
    clear() {
      listeners.clear();
    }
  };
}

function cloneSeeds(seeds = {}) {
  return Object.fromEntries(Object.entries(seeds).map(([key, value]) => [key, value]));
}

const originalPerformance = globalThis.performance;

beforeAll(() => {
  if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = { now: () => 0 };
  } else if (typeof globalThis.performance.now !== 'function') {
    globalThis.performance.now = () => 0;
  }

  if (!GamePools.initialized) {
    GamePools.initialize();
  }
});

afterAll(() => {
  GamePools.releaseAll();
  if (!originalPerformance) {
    delete globalThis.performance;
  } else {
    globalThis.performance = originalPerformance;
  }
});

function runStartResetCycle(seed) {
  const previousServices = globalThis.gameServices;
  const previousEvents = globalThis.gameEvents;

  const serviceMap = new Map();
  const gameServices = {
    register(name, service) {
      serviceMap.set(name, service);
    },
    get(name) {
      return serviceMap.get(name);
    },
    has(name) {
      return serviceMap.has(name);
    }
  };

  const eventBus = createEventBus();

  globalThis.gameServices = gameServices;
  globalThis.gameEvents = eventBus;

  const random = new RandomService(seed);
  const audioStub = { play: () => {}, stop: () => {}, init: () => {} };
  const settingsStub = {
    getCategoryValues: () => null
  };
  const progressionStub = {
    getLevel: () => 1
  };
  const playerStub = {
    x: 0,
    y: 0,
    getVelocity: () => ({ x: 0, y: 0 })
  };
  const physicsStub = {
    bootstrapFromEnemySystem: () => {}
  };
  const worldStub = {
    getBounds: () => ({ width: 960, height: 720 })
  };
  const healthHeartsStub = {
    spawnHeart: () => {}
  };

  const effects = new EffectsSystem({ random, audio: audioStub, settings: settingsStub });
  const xpOrbSystem = new XPOrbSystem({ random, player: playerStub, progression: progressionStub });
  const enemySystem = new EnemySystem({
    random,
    player: playerStub,
    world: worldStub,
    progression: progressionStub,
    physics: physicsStub,
    healthHearts: healthHeartsStub,
    'xp-orbs': xpOrbSystem,
  });

  random.reset(seed);
  effects.reset();
  xpOrbSystem.reset();
  enemySystem.reset();

  const asteroidSnapshot = enemySystem.asteroids.slice(0, 4).map((asteroid) => ({
    id: asteroid.id,
    x: Number(asteroid.x.toFixed(4)),
    y: Number(asteroid.y.toFixed(4)),
    vx: Number(asteroid.vx.toFixed(6)),
    vy: Number(asteroid.vy.toFixed(6)),
    rotation: Number(asteroid.rotation.toFixed(6)),
    rotationSpeed: Number(asteroid.rotationSpeed.toFixed(6)),
    crackSeed: asteroid.crackSeed,
  }));

  const snapshot = {
    effectsSeeds: cloneSeeds(effects.randomForkSeeds),
    xpOrbSeeds: cloneSeeds(xpOrbSystem.randomForkSeeds),
    enemySeeds: cloneSeeds(enemySystem.randomScopeSeeds),
    waveSeeds: enemySystem.waveManager?.randomScopeSeeds
      ? cloneSeeds(enemySystem.waveManager.randomScopeSeeds)
      : null,
    rewardSeed: enemySystem.rewardManager?.initialRandomSeed ?? null,
    asteroidSnapshot,
  };

  GamePools.releaseAll();
  if (typeof enemySystem.destroy === 'function') {
    enemySystem.destroy();
  }

  eventBus.clear();
  serviceMap.clear();

  globalThis.gameServices = previousServices;
  globalThis.gameEvents = previousEvents;

  return snapshot;
}

describe('game start/reset cycle determinism', () => {
  it('replays the same state after start → reset → start with fixed seed', () => {
    const first = runStartResetCycle(2025);
    const second = runStartResetCycle(2025);

    expect(second).toEqual(first);
  });
});
