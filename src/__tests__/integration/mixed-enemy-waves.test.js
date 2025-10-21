import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RandomService from '../../core/RandomService.js';
import * as CONSTANTS from '../../core/GameConstants.js';
import { WaveManager } from '../../modules/enemies/managers/WaveManager.js';
import { RewardManager } from '../../modules/enemies/managers/RewardManager.js';
import { EnemySystem } from '../../modules/EnemySystem.js';
import { Drone } from '../../modules/enemies/types/Drone.js';
import { Mine } from '../../modules/enemies/types/Mine.js';
import { Hunter } from '../../modules/enemies/types/Hunter.js';

class TestEventBus {
  constructor() {
    this.listeners = new Map();
    this.events = [];
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emit(event, payload) {
    this.events.push({ event, payload });
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        handler(payload);
      });
    }
  }
}

class DeterministicRandom {
  fork() {
    return this;
  }

  float() {
    return 0.5;
  }

  range(min, max) {
    return (min + max) / 2;
  }

  chance(probability) {
    return probability >= 0.5;
  }

  int(min, max) {
    return Math.floor((min + max) / 2);
  }
}

function createWaveManager(overrides = {}) {
  const bus = overrides.eventBus ?? new TestEventBus();
  const random = overrides.random ?? new DeterministicRandom();
  const defaultEnemySystem = {
    getRandomScope: () => random,
    getCachedWorld: () => ({ getBounds: () => ({ width: 800, height: 600 }) }),
    getCachedPlayer: () => ({ position: { x: 400, y: 300 }, velocity: { vx: 0, vy: 0 } }),
    getPlayerPositionSnapshot: () => ({ x: 400, y: 300 }),
    acquireEnemyViaFactory: (type, config) => ({ type, ...config, destroyed: false }),
    registerActiveEnemy: () => true,
  };
  const enemySystem = overrides.enemySystem ?? defaultEnemySystem;

  return new WaveManager({ enemySystem, random, eventBus: bus });
}

function withWaveOverrides({ useManager = true, managerHandlesAsteroids = true }, callback) {
  const previousUse = globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
  const previousHandles = globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;

  globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = useManager;
  globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ = managerHandlesAsteroids;

  try {
    return callback();
  } finally {
    if (previousUse === undefined) {
      delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
    } else {
      globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = previousUse;
    }

    if (previousHandles === undefined) {
      delete globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;
    } else {
      globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ = previousHandles;
    }
  }
}

let eventBus;
const activeSystems = [];

beforeEach(() => {
  eventBus = new TestEventBus();
  globalThis.gameEvents = eventBus;
});

afterEach(() => {
  while (activeSystems.length) {
    const system = activeSystems.pop();
    if (system?.destroy) {
      system.destroy();
    }
  }

  delete globalThis.gameEvents;
  delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
  delete globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;
  vi.restoreAllMocks();
});

describe('Wave progression', () => {
  it('unlocks support enemies at configured progression thresholds', () => {
    withWaveOverrides({ useManager: true, managerHandlesAsteroids: true }, () => {
      const manager = createWaveManager({ eventBus });
      manager.currentWave = CONSTANTS.SUPPORT_ENEMY_PROGRESSION.drone.startWave;
      const droneWave = manager.generateDynamicWave(manager.currentWave);
      expect(droneWave.enemies.some((group) => group.type === 'drone')).toBe(true);
      expect(droneWave.enemies.some((group) => group.type === 'mine')).toBe(false);

      manager.currentWave = CONSTANTS.SUPPORT_ENEMY_PROGRESSION.mine.startWave;
      const mineWave = manager.generateDynamicWave(manager.currentWave);
      expect(mineWave.enemies.some((group) => group.type === 'drone')).toBe(true);
      expect(mineWave.enemies.some((group) => group.type === 'mine')).toBe(true);
      expect(mineWave.enemies.some((group) => group.type === 'hunter')).toBe(false);

      manager.currentWave = CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.startWave;
      const hunterWave = manager.generateDynamicWave(manager.currentWave);
      expect(hunterWave.enemies.some((group) => group.type === 'hunter')).toBe(true);
    });
  });
});

describe('Enemy spawning integration', () => {
  it('spawns support groups through the EnemySystem factory pathway', () => {
    const spawnLog = [];

    withWaveOverrides({ useManager: true, managerHandlesAsteroids: true }, () => {
      const enemySystem = {
        getCachedWorld: () => ({ getBounds: () => ({ width: 800, height: 600 }) }),
        getCachedPlayer: () => ({ position: { x: 400, y: 300 } }),
        getPlayerPositionSnapshot: () => ({ x: 400, y: 300 }),
        acquireEnemyViaFactory: vi.fn((type, config) => {
          const enemy = { type, config, destroyed: false };
          spawnLog.push({ type, config });
          return enemy;
        }),
        registerActiveEnemy: vi.fn(() => true),
      };

      const manager = createWaveManager({ enemySystem, eventBus });
      const waveNumber = CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.startWave + 1;
      manager.currentWave = waveNumber;
      const config = manager.generateDynamicWave(waveNumber);
      manager.spawnWave(config);

      const spawnedTypes = spawnLog.map((entry) => entry.type);
      expect(spawnedTypes).toContain('drone');
      expect(spawnedTypes).toContain('mine');
      expect(spawnedTypes).toContain('hunter');
    });
  });

  it('emits legacy fallback totals when asteroid spawning is legacy-controlled', () => {
    withWaveOverrides({ useManager: true, managerHandlesAsteroids: false }, () => {
      const manager = createWaveManager({ eventBus });
      manager.currentWave = CONSTANTS.SUPPORT_ENEMY_PROGRESSION.mine.startWave;
      manager.startNextWave();

      const startedEvent = eventBus.events.find((entry) => entry.event === 'wave-started');
      expect(startedEvent?.payload?.legacyFallbackActive).toBe(true);
      expect(startedEvent?.payload?.managerTotals?.all).toBeGreaterThan(0);
      expect(startedEvent?.payload?.legacyFallbackTotals?.all).toBeGreaterThan(0);
    });
  });
});

describe('Support enemy behaviour', () => {
  it('updates drones so they pursue and fire at the player', () => {
    const random = new DeterministicRandom();
    const system = {
      getRandomScope: () => random,
      getCachedPlayer: () => ({ position: { x: 120, y: 0 }, velocity: { vx: 0, vy: 0 } }),
      getPlayerPositionSnapshot: () => ({ x: 120, y: 0 }),
    };

    const drone = new Drone(system, {
      fireRate: 0.2,
      fireVariance: 0,
      targetingRange: 500,
    });
    drone.x = 0;
    drone.y = 0;
    drone.fireTimer = 0;

    eventBus.events.length = 0;
    drone.onUpdate(0.3);

    expect(drone.vx).not.toBe(0);
    const firedEvent = eventBus.events.find((entry) => entry.event === 'enemy-fired');
    expect(firedEvent).toBeTruthy();
  });

  it('arms and detonates mines when the player enters proximity', () => {
    const random = new DeterministicRandom();
    const system = {
      getRandomScope: () => random,
      getCachedPlayer: () => ({ position: { x: 10, y: 0 } }),
      getPlayerPositionSnapshot: () => ({ x: 10, y: 0 }),
    };

    const mine = new Mine(system, { proximityRadius: 40 });
    mine.x = 0;
    mine.y = 0;
    mine.armTimer = -0.1;

    eventBus.events.length = 0;
    mine.onUpdate(0.2);

    expect(mine.detonated).toBe(true);
    const explosionEvent = eventBus.events.find((entry) => entry.event === 'mine-exploded');
    expect(explosionEvent).toBeTruthy();
  });

  it('executes hunter burst cycles and emits firing events', () => {
    const random = new DeterministicRandom();
    const system = {
      getRandomScope: () => random,
      getCachedPlayer: () => ({
        position: { x: 150, y: 0 },
        velocity: { vx: 0, vy: 0 },
      }),
      getPlayerPositionSnapshot: () => ({ x: 150, y: 0 }),
    };

    const hunter = new Hunter(system, {
      preferredDistance: 150,
      fireRange: 400,
      burstCount: 1,
      burstInterval: 0.1,
      burstDelay: 0,
    });
    hunter.x = 0;
    hunter.y = 0;
    hunter.burstCooldown = 0;
    hunter.burstShotsRemaining = 1;
    hunter.burstDelayTimer = 0;

    eventBus.events.length = 0;
    hunter.onUpdate(0.16);

    const firedEvent = eventBus.events.find((entry) => entry.event === 'enemy-fired');
    expect(firedEvent).toBeTruthy();
    expect(typeof hunter.turretAngle).toBe('number');
  });
});

describe('Combat integration', () => {
  it('routes enemy-fired payloads to the CombatSystem', () => {
    const combat = {
      handleEnemyProjectile: vi.fn(),
    };
    const physics = {
      handleMineExplosion: vi.fn(),
    };

    withWaveOverrides({ useManager: false, managerHandlesAsteroids: false }, () => {
      const enemySystem = new EnemySystem({
        combat,
        physics,
        eventBus,
        random: new RandomService('combat'),
      });
      activeSystems.push(enemySystem);

      const payload = {
        enemyType: 'drone',
        projectile: { damage: 10, speed: 200 },
      };
      const routed = enemySystem.handleEnemyProjectile(payload);

      expect(routed).toBe(true);
      expect(combat.handleEnemyProjectile).toHaveBeenCalled();

      enemySystem.handleMineExplosion({ position: { x: 0, y: 0 }, radius: 80, damage: 50 });
      expect(physics.handleMineExplosion).toHaveBeenCalled();
    });
  });
});

describe('Reward handling', () => {
  it('drops wave completion bonus XP using RewardManager', () => {
    const xpOrbSystem = {
      createXPOrb: vi.fn(),
    };

    const enemySystem = {
      getCachedWorld: () => ({ getBounds: () => ({ width: 800, height: 600 }) }),
    };

    const manager = new RewardManager({ enemySystem, xpOrbSystem, random: new RandomService('rewards') });
    manager.handleWaveRewards(5, { damageTaken: 0, duration: 25 });

    expect(xpOrbSystem.createXPOrb).toHaveBeenCalledWith(
      400,
      300,
      250,
      expect.objectContaining({ wave: 5, waveBonus: true })
    );
  });
});

describe('Deterministic wave generation', () => {
  it('produces identical support group compositions for identical seeds', () => {
    withWaveOverrides({ useManager: true, managerHandlesAsteroids: true }, () => {
      const seed = 'mixed-wave-seed';
      const eventBusA = new TestEventBus();
      const eventBusB = new TestEventBus();
      const randomA = new RandomService(seed);
      const randomB = new RandomService(seed);

      const managerA = createWaveManager({ eventBus: eventBusA, random: randomA });
      const managerB = createWaveManager({ eventBus: eventBusB, random: randomB });

      const waveNumber = CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.startWave + 3;
      managerA.currentWave = waveNumber;
      managerB.currentWave = waveNumber;

      const configA = managerA.generateDynamicWave(waveNumber);
      const configB = managerB.generateDynamicWave(waveNumber);

      expect(configA.enemies).toEqual(configB.enemies);
    });
  });
});
