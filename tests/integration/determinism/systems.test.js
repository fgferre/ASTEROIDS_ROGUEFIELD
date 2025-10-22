import { describe, expect, it, vi } from 'vitest';
import RenderingSystem from '../../../src/modules/RenderingSystem.js';
import { WaveManager } from '../../../src/modules/enemies/managers/WaveManager.js';
import { RewardManager } from '../../../src/modules/enemies/managers/RewardManager.js';
import { createTestContainer } from '../../__helpers__/setup.js';

function captureStarfieldSnapshot(seed) {
  const container = createTestContainer(seed);
  const random = container.resolve('random');
  const rendering = new RenderingSystem({ random });

  rendering.spaceSky.resize(800, 600);

  return {
    starCounts: rendering.spaceSky.layers.map((layer) => layer.stars.length),
    sampleStars: rendering.spaceSky.layers.map((layer) =>
      layer.stars.slice(0, 5).map((star) => ({
        x: Number(star.x.toFixed(4)),
        y: Number(star.y.toFixed(4)),
        phase: Number(star.phase.toFixed(6)),
        jitter: Number(star.jitter.toFixed(6))
      }))
    )
  };
}

function createEnemySystemStub(random) {
  const created = [];
  const randomScopes = new Map();
  const worldBounds = { width: 960, height: 720 };
  const world = {
    getBounds() {
      return { ...worldBounds };
    }
  };

  const enemySystem = {
    created,
    factory: {
      create(type, config) {
        created.push({
          type,
          x: Number(config.x.toFixed(4)),
          y: Number(config.y.toFixed(4))
        });
        return { type, ...config };
      }
    },
    getCachedWorld() {
      return world;
    },
    getCachedPlayer() {
      return { x: 200, y: 150 };
    },
    getRandomScope(scope) {
      if (!randomScopes.has(scope)) {
        randomScopes.set(scope, random.fork(`enemy.${scope}`));
      }
      return randomScopes.get(scope);
    }
  };

  return enemySystem;
}

function captureWaveSpawnSnapshot(seed) {
  const container = createTestContainer(seed);
  const random = container.resolve('random');
  const enemySystem = createEnemySystemStub(random);
  const eventBus = { emit: vi.fn() };

  const waveManager = new WaveManager({
    random,
    enemySystem,
    eventBus
  });

  waveManager.startNextWave();

  return {
    wave: waveManager.currentWave,
    totalSpawned: enemySystem.created.length,
    sampleSpawns: enemySystem.created.slice(0, 6)
  };
}

function captureOrbDropSnapshot(seed) {
  const container = createTestContainer(seed);
  const random = container.resolve('random');
  const xpOrbCalls = [];
  const xpOrbSystem = {
    createXPOrb(x, y, value, options = {}) {
      xpOrbCalls.push({
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        value,
        vx: Number((options.vx ?? 0).toFixed(4)),
        vy: Number((options.vy ?? 0).toFixed(4))
      });
      return {
        id: `${x}:${y}`,
        x,
        y,
        value
      };
    }
  };

  const rewardManager = new RewardManager({ random, xpOrbSystem });

  const enemy = {
    id: 'enemy-001',
    type: 'asteroid',
    variant: 'iron',
    size: 'medium',
    x: 512,
    y: 384,
    radius: 48,
    wave: 3
  };

  rewardManager.createXPOrbs(enemy, 5, 12);

  return {
    totalDrops: xpOrbCalls.length,
    sampleDrops: xpOrbCalls
  };
}

describe('deterministic systems', () => {
  it('produces identical starfield layouts for the same seed', () => {
    const first = captureStarfieldSnapshot(1337);
    const second = captureStarfieldSnapshot(1337);

    expect(second).toEqual(first);
  });

  it('spawns identical wave positions for the same seed', () => {
    const first = captureWaveSpawnSnapshot(2025);
    const second = captureWaveSpawnSnapshot(2025);

    expect(second).toEqual(first);
  });

  it('drops identical XP orbs for the same seed', () => {
    const first = captureOrbDropSnapshot(777);
    const second = captureOrbDropSnapshot(777);

    expect(second).toEqual(first);
  });
});
