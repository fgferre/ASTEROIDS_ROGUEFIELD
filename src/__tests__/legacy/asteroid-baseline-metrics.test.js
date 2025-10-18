import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { EnemySystem } from '../../modules/EnemySystem.js';
import { ServiceRegistry } from '../../core/ServiceRegistry.js';
import { GamePools } from '../../core/GamePools.js';
import * as CONSTANTS from '../../core/GameConstants.js';

const TEST_SEED = 123456;
const SAMPLE_ASTEROID_COUNT = 1000;

let originalGameEvents;

class TestEventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);
  }

  off(eventName, callback) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).delete(callback);
    }
  }

  emit(eventName, payload) {
    if (this.listeners.has(eventName)) {
      for (const callback of this.listeners.get(eventName)) {
        callback(payload);
      }
    }
  }

  emitSilently(eventName, payload) {
    this.emit(eventName, payload);
  }
}

beforeAll(() => {
  originalGameEvents = globalThis.gameEvents;
  globalThis.gameEvents = new TestEventBus();
});

afterAll(() => {
  globalThis.gameEvents = originalGameEvents;
});

function createEnemySystemHarness(seed = TEST_SEED) {
  if (GamePools.asteroids?.releaseAll) {
    GamePools.asteroids.releaseAll();
  }
  if (typeof GamePools.destroy === 'function') {
    GamePools.destroy();
  }

  const worldBounds = {
    width: CONSTANTS.GAME_WIDTH,
    height: CONSTANTS.GAME_HEIGHT
  };

  const world = {
    getBounds: () => ({ ...worldBounds }),
    handlePlayerDeath: () => {
      world.playerAlive = false;
    },
    playerAlive: true
  };

  const player = {
    position: {
      x: worldBounds.width / 2,
      y: worldBounds.height / 2
    },
    velocity: { x: 0, y: 0 },
    getHullBoundingRadius: () => 24,
    takeDamage: () => {},
    isAlive: () => true
  };

  const xpOrbs = {
    createXPOrb: () => {}
  };

  const healthHearts = {
    awardHeart: () => {},
    removeHeart: () => {},
    isEnabled: () => false
  };

  const progression = {
    getDifficulty: () => 1,
    getCurrentWave: () => 1
  };

  const physics = {
    registerEnemy: () => {},
    unregisterEnemy: () => {},
    bootstrapFromEnemySystem: () => {},
    attachEnemySystem: () => {},
    detachEnemySystem: () => {}
  };

  const container = ServiceRegistry.createTestContainer({
    randomSeed: seed,
    world,
    player,
    progression,
    physics,
    'xp-orbs': xpOrbs,
    healthHearts
  });

  const random = container.resolve('random');

  const enemySystem = new EnemySystem({
    world,
    player,
    progression,
    physics,
    'xp-orbs': xpOrbs,
    random
  });

  enemySystem.sessionActive = true;
  enemySystem.waveState = enemySystem.createInitialWaveState();
  enemySystem.waveState.current = 1;
  enemySystem.asteroids = [];

  Object.assign(enemySystem.services, {
    world,
    player,
    progression,
    xpOrbs,
    healthHearts,
    physics,
    random
  });

  enemySystem.refreshInjectedServices({ force: true, suppressWarnings: true });
  enemySystem.reseedRandomScopes({ resetSequences: true });

  if (enemySystem.waveManager && typeof enemySystem.waveManager.reset === 'function') {
    enemySystem.waveManager.reset();
  }

  return {
    enemySystem,
    container,
    services: { world, player, progression, physics, xpOrbs, random }
  };
}

describe('WaveManager compatibility metrics', () => {
  let harness;
  let originalCompatibilityFn;

  const setCompatibilityMode = (enabled) => {
    if (!harness?.enemySystem?.waveManager) {
      throw new Error('WaveManager must be initialized before setting compatibility mode');
    }

    harness.enemySystem.waveManager.isLegacyAsteroidCompatibilityEnabled = () =>
      Boolean(enabled);
  };

  beforeEach(() => {
    harness = createEnemySystemHarness();
    originalCompatibilityFn =
      harness?.enemySystem?.waveManager?.isLegacyAsteroidCompatibilityEnabled;
  });

  afterEach(() => {
    if (
      harness?.enemySystem?.waveManager &&
      originalCompatibilityFn
    ) {
      harness.enemySystem.waveManager.isLegacyAsteroidCompatibilityEnabled =
        originalCompatibilityFn;
    }
    if (harness?.enemySystem) {
      harness.enemySystem.destroy();
    }
    if (harness?.container && typeof harness.container.destroy === 'function') {
      harness.container.destroy();
    }
  });

  test('buildAsteroidSpawnSequence preserves legacy distribution when enabled', () => {
    setCompatibilityMode(true);

    harness.enemySystem.reseedRandomScopes({ resetSequences: true });
    const waveManager = harness.enemySystem.waveManager;
    const { counts } = waveManager.buildAsteroidSpawnSequence(
      SAMPLE_ASTEROID_COUNT,
      waveManager.getAsteroidDistributionWeights(true)
    );

    const ratios = {
      large: counts.large / SAMPLE_ASTEROID_COUNT,
      medium: counts.medium / SAMPLE_ASTEROID_COUNT,
      small: counts.small / SAMPLE_ASTEROID_COUNT,
    };

    expect(ratios.large).toBeGreaterThan(0.45);
    expect(ratios.large).toBeLessThan(0.55);
    expect(ratios.medium).toBeGreaterThan(0.25);
    expect(ratios.medium).toBeLessThan(0.35);
    expect(ratios.small).toBeGreaterThan(0.15);
    expect(ratios.small).toBeLessThan(0.25);
  });

  test('buildAsteroidSpawnSequence honors optimized distribution when disabled', () => {
    setCompatibilityMode(false);

    harness.enemySystem.reseedRandomScopes({ resetSequences: true });
    const waveManager = harness.enemySystem.waveManager;
    const { counts } = waveManager.buildAsteroidSpawnSequence(
      SAMPLE_ASTEROID_COUNT,
      waveManager.getAsteroidDistributionWeights(false)
    );

    const ratios = {
      large: counts.large / SAMPLE_ASTEROID_COUNT,
      medium: counts.medium / SAMPLE_ASTEROID_COUNT,
      small: counts.small / SAMPLE_ASTEROID_COUNT,
    };

    expect(ratios.large).toBeGreaterThan(0.25);
    expect(ratios.large).toBeLessThan(0.35);
    expect(ratios.medium).toBeGreaterThan(0.35);
    expect(ratios.medium).toBeLessThan(0.45);
    expect(ratios.small).toBeGreaterThan(0.25);
    expect(ratios.small).toBeLessThan(0.35);
  });

  test('updateWaveManagerLogic syncs asteroid-only totals when compatibility enabled', () => {
    setCompatibilityMode(true);

    const { enemySystem } = harness;
    enemySystem.waveState = enemySystem.createInitialWaveState();

    const managerState = {
      currentWave: 3,
      inProgress: true,
      spawned: 6,
      killed: 4,
      total: 9,
      totals: { asteroids: 7, all: 9 },
      counts: {
        spawned: { asteroids: 5, all: 6 },
        killed: { asteroids: 4, all: 5 },
      },
    };

    const updateSpy = vi
      .spyOn(enemySystem.waveManager, 'update')
      .mockImplementation(() => {});
    const stateSpy = vi
      .spyOn(enemySystem.waveManager, 'getState')
      .mockReturnValue(managerState);

    enemySystem.updateWaveManagerLogic(0.5);

    expect(enemySystem.waveState.current).toBe(3);
    expect(enemySystem.waveState.isActive).toBe(true);
    expect(enemySystem.waveState.totalAsteroids).toBe(7);
    expect(enemySystem.waveState.asteroidsSpawned).toBe(5);
    expect(enemySystem.waveState.asteroidsKilled).toBe(4);

    updateSpy.mockRestore();
    stateSpy.mockRestore();
  });

  test('updateWaveManagerLogic syncs all-enemy totals when compatibility disabled', () => {
    setCompatibilityMode(false);

    const { enemySystem } = harness;
    enemySystem.waveState = enemySystem.createInitialWaveState();

    const managerState = {
      currentWave: 8,
      inProgress: true,
      spawned: 12,
      killed: 9,
      total: 15,
      totals: { asteroids: 9, all: 15 },
      counts: {
        spawned: { asteroids: 7, all: 12 },
        killed: { asteroids: 5, all: 9 },
      },
    };

    const updateSpy = vi
      .spyOn(enemySystem.waveManager, 'update')
      .mockImplementation(() => {});
    const stateSpy = vi
      .spyOn(enemySystem.waveManager, 'getState')
      .mockReturnValue(managerState);

    enemySystem.updateWaveManagerLogic(0.5);

    expect(enemySystem.waveState.totalAsteroids).toBe(15);
    expect(enemySystem.waveState.asteroidsSpawned).toBe(12);
    expect(enemySystem.waveState.asteroidsKilled).toBe(9);

    updateSpy.mockRestore();
    stateSpy.mockRestore();
  });

  test('handleWaveManagerWaveComplete preserves asteroid totals when compatibility enabled', () => {
    setCompatibilityMode(true);

    const { enemySystem } = harness;
    enemySystem.waveState = enemySystem.createInitialWaveState();
    enemySystem.waveState.current = 4;

    enemySystem.waveManager.totalAsteroidEnemiesThisWave = 11;
    enemySystem.waveManager.totalEnemiesThisWave = 16;
    enemySystem.waveManager.enemiesKilledThisWave = 13;

    enemySystem.handleWaveManagerWaveComplete({ wave: 4, enemiesKilled: 12 });

    expect(enemySystem.waveState.totalAsteroids).toBe(11);
    expect(enemySystem.waveState.asteroidsKilled).toBe(11);
    expect(enemySystem.waveState.asteroidsKilledRaw).toBe(13);
  });

  test('handleWaveManagerWaveComplete uses all-enemy totals when compatibility disabled', () => {
    setCompatibilityMode(false);

    const { enemySystem } = harness;
    enemySystem.waveState = enemySystem.createInitialWaveState();
    enemySystem.waveState.current = 9;

    enemySystem.waveManager.totalAsteroidEnemiesThisWave = 14;
    enemySystem.waveManager.totalEnemiesThisWave = 20;
    enemySystem.waveManager.enemiesKilledThisWave = 18;

    enemySystem.handleWaveManagerWaveComplete({ wave: 9, enemiesKilled: 17 });

    expect(enemySystem.waveState.totalAsteroids).toBe(20);
    expect(enemySystem.waveState.asteroidsKilled).toBe(20);
    expect(enemySystem.waveState.asteroidsKilledRaw).toBe(20);
  });
});
