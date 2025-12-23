import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import EffectsSystem from '../../../src/modules/EffectsSystem.js';
import XPOrbSystem from '../../../src/modules/XPOrbSystem.js';
import { EnemySystem } from '../../../src/modules/EnemySystem.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';
import {
  setupGlobalMocks,
  cleanupGlobalState,
  createTestContainer,
} from '../../__helpers__/setup.js';

function cloneSeeds(seeds = {}) {
  return Object.fromEntries(
    Object.entries(seeds).map(([key, value]) => [key, value])
  );
}

let eventBus;

beforeAll(() => {
  if (!GamePools.initialized) {
    GamePools.initialize();
  }
});

// Optimization: vi.useFakeTimers() to avoid real delays
beforeEach(() => {
  vi.useFakeTimers();
  eventBus = createEventBusMock();
  setupGlobalMocks();
});

afterEach(() => {
  try {
    cleanupGlobalState();
  } finally {
    vi.useRealTimers();
  }
});

afterAll(() => {
  GamePools.releaseAll();
});

function runStartResetCycle(seed) {
  const container = createTestContainer(seed);
  const random = container.resolve('random');

  const audioStub = { play: () => {}, stop: () => {}, init: () => {} };
  const settingsStub = {
    getCategoryValues: () => null,
  };
  const progressionStub = {
    getLevel: () => 1,
  };
  const playerStub = {
    x: 0,
    y: 0,
    getVelocity: () => ({ x: 0, y: 0 }),
  };
  const physicsStub = {
    bootstrapFromEnemySystem: () => {},
  };
  const worldStub = {
    getBounds: () => ({ width: 960, height: 720 }),
  };
  const healthHeartsStub = {
    spawnHeart: () => {},
  };

  const effects = new EffectsSystem({
    eventBus,
    random,
    audio: audioStub,
    settings: settingsStub,
  });
  const xpOrbSystem = new XPOrbSystem({
    eventBus,
    random,
    player: playerStub,
    progression: progressionStub,
  });
  const enemySystem = new EnemySystem({
    eventBus,
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

  const asteroidSnapshot = enemySystem.asteroids
    .slice(0, 4)
    .map((asteroid) => ({
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

  return snapshot;
}

describe('game start/reset cycle determinism', () => {
  it('replays the same state after start → reset → start with fixed seed', () => {
    const first = runStartResetCycle(2025);
    vi.runAllTimers();
    const second = runStartResetCycle(2025);
    vi.runAllTimers();

    expect(second).toEqual(first);
  });
});
