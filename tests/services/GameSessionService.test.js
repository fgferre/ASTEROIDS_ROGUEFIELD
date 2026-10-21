import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import GameSessionService from '../../src/services/GameSessionService.js';
import DifficultyService from '../../src/services/DifficultyService.js';
import { BULLET_SIZE } from '../../src/core/GameConstants.js';
import {
  BASTION_HULL_ID,
  DEFAULT_HULL_ID,
  SOLAR_SLICER_HULL_ID,
  getShipModelById,
} from '../../src/data/shipModels.js';
import { BOSS_PHYSICS_CONFIG } from '../../src/data/enemies/boss.js';
import { RUN_FINAL_LAYER } from '../../src/data/constants/gameplay.js';
import PhysicsSystem from '../../src/modules/PhysicsSystem.js';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
// Optimization: use centralized createRandomServiceStatefulStub()
import { createRandomServiceStatefulStub } from '../__helpers__/stubs.js';

const ASTEROID_POOL_ID = Symbol.for('ASTEROIDS_ROGUEFIELD:asteroidPoolId');

function createServiceHarness(options = {}) {
  const { selectedHull = DEFAULT_HULL_ID } = options;

  // Optimization: use centralized createEventBusMock() instead of inline helper
  const eventBus = createEventBusMock();
  const random = createRandomServiceStatefulStub();

  const player = {
    maxHealth: 100,
    health: 75,
    position: { x: 10, y: 15 },
    upgrades: [],
    respawn: vi.fn(),
    reset: vi.fn(),
    getPosition: vi.fn(() => ({ x: 10, y: 15 })),
    activateShield: vi.fn(),
    currentHull: getShipModelById(DEFAULT_HULL_ID),
  };
  player.setHull = vi.fn((hullDefinition) => {
    player.currentHull = hullDefinition;
    return true;
  });

  const settingsState = {
    gameplay: {
      selectedHull,
    },
  };
  const settings = {
    getCategoryValues: vi.fn((categoryId) => {
      const values = settingsState[categoryId];
      return values ? { ...values } : null;
    }),
    getSetting: vi.fn((categoryId, key) => settingsState[categoryId]?.[key]),
  };

  const world = { reset: vi.fn() };
  const progression = {
    serialize: vi.fn(() => ({ level: 3 })),
    restoreState: vi.fn(() => true),
    reset: vi.fn(),
    applyUpgradeEffects: vi.fn(),
    getAllUpgrades: vi.fn(() => []),
    refreshInjectedServices: vi.fn(),
  };

  const enemies = {
    getSnapshotState: vi.fn(() => ({ waves: [] })),
    restoreSnapshotState: vi.fn(() => true),
    reset: vi.fn(),
    getAsteroids: vi.fn(() => []),
  };

  const physics = {
    getSnapshotState: vi.fn(() => ({ active: [] })),
    restoreSnapshotState: vi.fn(() => true),
    reset: vi.fn(),
  };

  const audio = {
    init: vi.fn(),
    reset: vi.fn(),
    reseedRandomScopes: vi.fn(),
  };

  const ui = {
    showGameUI: vi.fn(),
    showScreen: vi.fn(),
    resetLevelUpState: vi.fn(),
  };

  const xpOrbs = { reset: vi.fn(), resetMagnetism: vi.fn() };
  const healthHearts = { reset: vi.fn() };
  const effects = {
    reset: vi.fn(),
    createEpicShipExplosion: vi.fn(),
  };

  const combat = { reset: vi.fn() };
  const renderer = { reset: vi.fn() };

  const gameStateFacade = { __attachSessionService: vi.fn() };
  const gameState = {
    canvas: { width: 800, height: 600 },
    screen: 'menu',
    isPaused: false,
    sessionState: 'menu',
  };

  const service = new GameSessionService({
    eventBus,
    random,
    gameStateFacade,
    services: {
      audio,
      ui,
      settings,
      player,
      progression,
      enemies,
      physics,
      xpOrbs,
      healthHearts,
      world,
      effects,
      combat,
      renderer,
      difficulty: new DifficultyService({ settings, bootSeed: 1 }),
    },
    gameState,
  });

  service.initialize({ seedInfo: { seed: 99, source: 'test' } });
  service.retryCountElement = { textContent: '0', isConnected: true };
  service.retryButtonElement = {
    disabled: false,
    style: {},
    isConnected: true,
  };
  service.retryCountdownElement = {
    textContent: '',
    isConnected: true,
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
    },
  };

  return {
    service,
    eventBus,
    random,
    player,
    world,
    enemies,
    progression,
    physics,
    audio,
    ui,
    effects,
    combat,
    renderer,
    gameState,
    settings,
    settingsState,
  };
}

describe('GameSessionService lifecycle flows', () => {
  // Note: vi.restoreAllMocks() handled by global setup (tests/__helpers__/setup.js)
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs retry countdown to completion and respawns player', () => {
    const { service, eventBus, player, world, random } = createServiceHarness();

    service.setScreen('playing');
    service.setPaused(false);

    eventBus.emit.mockClear();
    service.startNewRun({ source: 'spec' });
    const getScreenEvents = () =>
      eventBus.emit.mock.calls
        .filter((call) => call[0] === 'screen-changed')
        .map((call) => call[1]);

    expect(getScreenEvents()).toEqual([
      expect.objectContaining({ screen: 'playing', source: 'session.start' }),
    ]);
    service.setRetryCount(2);
    vi.useFakeTimers();

    service.handlePlayerDeath({ reason: 'spec' });

    expect(service.getScreen()).toBe('playing');
    expect(getScreenEvents()).toEqual([
      expect.objectContaining({ screen: 'playing', source: 'session.start' }),
    ]);

    vi.advanceTimersByTime(3000);

    expect(service.getScreen()).toBe('gameover');
    expect(getScreenEvents()).toEqual([
      expect.objectContaining({ screen: 'playing', source: 'session.start' }),
      expect.objectContaining({
        screen: 'gameover',
        source: 'player-died',
        data: expect.objectContaining({ reason: 'spec' }),
      }),
    ]);

    expect(service.hasDeathSnapshot()).toBe(true);
    expect(random.serialize).toHaveBeenCalled();

    const started = service.requestRetry({ source: 'unit-test' });

    expect(started).toBe(true);
    expect(service.getRetryCount()).toBe(1);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'session-retry-countdown',
      expect.objectContaining({ phase: 'start' })
    );

    vi.runAllTimers();

    expect(player.respawn).toHaveBeenCalled();
    expect(world.reset).toHaveBeenCalled();
    expect(service.getSessionState()).toBe('running');
    expect(service.isRetryCountdownActive).toBe(false);
    expect(service.getScreen()).toBe('playing');
    expect(getScreenEvents()).toEqual([
      expect.objectContaining({ screen: 'playing', source: 'session.start' }),
      expect.objectContaining({
        screen: 'gameover',
        source: 'player-died',
        data: expect.objectContaining({ reason: 'spec' }),
      }),
      expect.objectContaining({ screen: 'playing', source: 'retry-complete' }),
    ]);
  });

  it('holds the game over screen while the death line plays, up to the cap', () => {
    const dieDuringLine = () => {
      const harness = createServiceHarness();
      harness.service.startNewRun({ source: 'spec' });
      harness.eventBus.emit('transmission-shown', { key: 'death:0' });
      harness.service.handlePlayerDeath({ reason: 'spec' });
      return harness;
    };
    vi.useFakeTimers();

    const heard = dieDuringLine();
    vi.advanceTimersByTime(3000);
    expect(heard.service.getScreen()).toBe('playing');
    heard.eventBus.emit('transmission-finished', { key: 'death:0' });
    expect(heard.service.getScreen()).toBe('gameover');

    const capped = dieDuringLine();
    vi.advanceTimersByTime(6499);
    expect(capped.service.getScreen()).toBe('playing');
    vi.advanceTimersByTime(1);
    expect(capped.service.getScreen()).toBe('gameover');
  });

  it('restores retry button and player state when snapshot restoration fails', () => {
    const { service, player } = createServiceHarness();

    player.isRetrying = true;
    service.retryButtonElement.disabled = true;
    service.retryButtonElement.style.opacity = '0.5';
    service.deathSnapshot = { random: null };

    const restoreSpy = vi
      .spyOn(service, 'restoreFromSnapshot')
      .mockReturnValue(false);

    const result = service.completeRetryRespawn();

    expect(result).toBe(false);
    expect(restoreSpy).toHaveBeenCalledWith({
      snapshot: service.deathSnapshot,
    });
    expect(player.isRetrying).toBe(false);
    expect(service.retryButtonElement.disabled).toBe(false);
    expect(service.retryButtonElement.style.opacity).toBe('1');
  });

  it('toggles pause state and emits pause events while playing', () => {
    const { service, eventBus } = createServiceHarness();

    service.setScreen('playing');
    service.setPaused(false);

    const paused = service.togglePause({ source: 'test' });

    expect(paused).toBe(true);
    expect(service.isPaused()).toBe(true);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'pause-state-changed',
      expect.objectContaining({ isPaused: true, source: 'test' })
    );

    const resumed = service.togglePause({ source: 'test' });

    expect(resumed).toBe(false);
    expect(service.isPaused()).toBe(false);
    expect(service.getSessionState()).toBe('running');
  });

  it('pauses a running game when the window loses focus, never unpauses', () => {
    const { service, eventBus } = createServiceHarness();

    service.setScreen('playing');
    service.setPaused(false);

    eventBus.emit('input-focus-lost');
    expect(service.isPaused()).toBe(true);

    eventBus.emit('input-focus-lost');
    expect(service.isPaused()).toBe(true);
  });

  it('schedules quit explosion before returning to menu from pause', () => {
    const { service, eventBus, player, effects, ui } = createServiceHarness();

    service.setScreen('playing');
    service.setPaused(true);

    const exitSpy = vi.spyOn(service, 'performExitToMenu');

    vi.useFakeTimers();

    service.exitToMenu({ source: 'pause-menu' });

    expect(effects.createEpicShipExplosion).toHaveBeenCalledWith({
      x: 10,
      y: 15,
    });
    expect(player._quitExplosionHidden).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(service.getSessionState()).toBe('quitting');
    expect(service.isRunning()).toBe(false);
    expect(service.togglePause()).toBe(false);
    expect(service.getSessionState()).toBe('quitting');
    service.handlePlayerDeath({ reason: 'collision-during-exit' });
    expect(service.hasDeathSnapshot()).toBe(false);

    vi.advanceTimersByTime(3500);
    vi.runAllTimers();

    expect(exitSpy).toHaveBeenCalledWith({ source: 'pause-menu' });
    expect(player._quitExplosionHidden).toBe(false);
    expect(service.getScreen()).toBe('menu');
    expect(ui.showScreen).toHaveBeenCalledWith('playing', { emitEvent: false });
    expect(ui.showScreen).toHaveBeenCalledWith('menu', { emitEvent: false });
    expect(eventBus.emit).toHaveBeenCalledWith(
      'screen-changed',
      expect.objectContaining({ screen: 'menu', source: 'pause-menu' })
    );
    expect(
      eventBus.emit.mock.calls.filter((call) => call[0] === 'screen-changed')
    ).toHaveLength(1);
  });

  it('emits screen-changed once when starting a new run', () => {
    const { service, eventBus, ui } = createServiceHarness();

    eventBus.emit.mockClear();

    service.startNewRun({ source: 'test' });

    expect(ui.showGameUI).toHaveBeenCalledWith({ emitEvent: false });

    const screenChangedCalls = eventBus.emit.mock.calls.filter(
      (call) => call[0] === 'screen-changed'
    );
    expect(screenChangedCalls).toHaveLength(1);
    expect(screenChangedCalls[0][1]).toEqual(
      expect.objectContaining({ screen: 'playing', source: 'session.start' })
    );
  });

  it.each([SOLAR_SLICER_HULL_ID, BASTION_HULL_ID])(
    'applies the configured hull %s when starting a new run',
    (hullId) => {
      const { service, player } = createServiceHarness({
        selectedHull: hullId,
      });

      service.startNewRun({ source: 'test' });

      expect(player.setHull).toHaveBeenCalledWith(getShipModelById(hullId));
      expect(player.currentHull.id).toBe(hullId);
    }
  );

  it('falls back to the default hull when the selected hull is invalid', () => {
    const { service, player } = createServiceHarness({
      selectedHull: 'unknown-hull',
    });

    service.startNewRun({ source: 'test' });

    expect(player.setHull).toHaveBeenCalledWith(
      getShipModelById(DEFAULT_HULL_ID)
    );
    expect(player.currentHull.id).toBe(DEFAULT_HULL_ID);
  });

  it('names the flown hull in the run-won payload', () => {
    const { service, eventBus } = createServiceHarness({
      selectedHull: BASTION_HULL_ID,
    });
    vi.useFakeTimers();
    service.startNewRun({ source: 'test' });

    service.handleBossDefeatedEvent({ wave: RUN_FINAL_LAYER });

    expect(eventBus.emit).toHaveBeenCalledWith('run-won', {
      wave: RUN_FINAL_LAYER,
      hullId: BASTION_HULL_ID,
    });
  });

  it('clears a transmission left on air when a new run starts', () => {
    const { service, eventBus } = createServiceHarness();
    service.startNewRun({ source: 'test' });
    eventBus.emit('transmission-shown', { key: 'death:0' });
    expect(service.transmissionOnAir).toBe(true);

    service.startNewRun({ source: 'test' });

    expect(service.transmissionOnAir).toBe(false);
  });

  it('restores the snapshot hull before retry state recovery completes', () => {
    const { service, player } = createServiceHarness();

    const restored = service.restoreFromSnapshot({
      snapshot: {
        random: null,
        player: {
          maxHealth: 100,
          health: 80,
          position: { x: 40, y: 50 },
          upgrades: [],
          hullId: SOLAR_SLICER_HULL_ID,
        },
        progression: { level: 3 },
        enemies: { waves: [] },
        physics: { active: [] },
      },
    });

    expect(restored).toBe(true);
    expect(player.setHull).toHaveBeenCalledWith(
      getShipModelById(SOLAR_SLICER_HULL_ID)
    );
    expect(player.currentHull.id).toBe(SOLAR_SLICER_HULL_ID);
  });

  it('rebuilds boss collision membership across the full retry restore flow', () => {
    const { service, eventBus } = createServiceHarness();
    const physics = new PhysicsSystem({ eventBus });
    const staleBoss = {
      id: 'boss-retry-flow',
      type: 'boss',
      x: -280,
      y: -200,
      vx: 0,
      vy: 0,
      radius: 60,
      destroyed: false,
    };
    const restoredBoss = {
      id: 'boss-retry-flow',
      type: 'boss',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 60,
      destroyed: false,
    };
    restoredBoss[ASTEROID_POOL_ID] = 501;

    let roster = [];
    const enemySystem = {
      activeBosses: new Map(),
      forEachActiveEnemy: (callback) => roster.forEach(callback),
      getAllAsteroids: () => roster,
      restoreSnapshotState: vi.fn(() => {
        roster = [restoredBoss];
        enemySystem.activeBosses = new Map([[restoredBoss.id, restoredBoss]]);
        return true;
      }),
      reset: vi.fn(),
    };

    physics.attachEnemySystem(enemySystem);
    physics.registerEnemy(staleBoss);

    service.services.enemies = enemySystem;
    service.services.physics = physics;

    const physicsRestoreSpy = vi.spyOn(physics, 'restoreSnapshotState');
    const restored = service.restoreFromSnapshot({
      snapshot: {
        random: null,
        player: {
          maxHealth: 100,
          health: 80,
          position: { x: 40, y: 50 },
          upgrades: [],
          hullId: DEFAULT_HULL_ID,
        },
        progression: { level: 3 },
        enemies: {
          bosses: [
            { id: restoredBoss.id, poolId: restoredBoss[ASTEROID_POOL_ID] },
          ],
          supportEnemies: [],
          waves: [],
        },
        physics: {
          asteroids: [
            {
              poolId: restoredBoss[ASTEROID_POOL_ID],
              x: 220,
              y: 180,
              vx: 0,
              vy: 0,
              radius: restoredBoss.radius,
            },
          ],
        },
      },
    });

    expect(restored).toBe(true);
    expect(enemySystem.restoreSnapshotState).toHaveBeenCalledTimes(1);
    expect(physicsRestoreSpy).toHaveBeenCalledTimes(1);
    expect(
      enemySystem.restoreSnapshotState.mock.invocationCallOrder[0]
    ).toBeLessThan(physicsRestoreSpy.mock.invocationCallOrder[0]);
    expect(physics.activeEnemies.size).toBe(1);
    expect(physics.activeBosses.size).toBe(1);
    expect(physics.activeEnemies.has(staleBoss)).toBe(false);
    expect(physics.activeBosses.has(staleBoss)).toBe(false);
    expect(physics.spatialHash.objects.has(staleBoss)).toBe(false);
    expect(physics.activeEnemies.has(restoredBoss)).toBe(true);
    expect(physics.activeBosses.has(restoredBoss)).toBe(true);
    expect(physics.spatialHash.objects.has(restoredBoss)).toBe(true);
    expect(restoredBoss.x).toBe(220);
    expect(restoredBoss.y).toBe(180);

    const bullet = {
      x:
        restoredBoss.x +
        restoredBoss.radius +
        BOSS_PHYSICS_CONFIG.collisionPadding +
        (BULLET_SIZE || 0) -
        1,
      y: restoredBoss.y,
      hit: false,
      damage: 20,
    };
    const collisions = [];

    physics.forEachBulletCollision([bullet], (_hitBullet, enemy) => {
      collisions.push(enemy);
    });

    expect(collisions).toEqual([restoredBoss]);
  });

  it('chooses the safest tested retry spawn point when every candidate is contested', () => {
    const { service, enemies } = createServiceHarness();

    enemies.getActiveEnemies = vi.fn(() => [
      { x: 400, y: 300 },
      { x: 200, y: 150 },
      { x: 600, y: 150 },
      { x: 200, y: 450 },
      { x: 650, y: 450 },
    ]);

    const spawnPoint = service.findSafeSpawnPoint();

    expect(spawnPoint).toEqual({ x: 600, y: 450 });
  });
});

describe('GameSessionService.resetSystems with the real service manifest', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
  });

  it("clears the previous run's player bullets when a new run starts", () => {
    const game = createHeadlessGame();
    const { combat } = game.services;
    game.session.startNewRun({ source: 'test' });
    combat.createBullet({ x: 100, y: 100 }, { x: 200, y: 100 }, 1);
    expect(combat.bullets).toHaveLength(1);

    game.session.startNewRun({ source: 'test' });

    expect(combat.bullets).toHaveLength(0);
  });

  it('clears field pickups and chests when a new run starts', () => {
    const game = createHeadlessGame();
    const { pickups } = game.services;
    game.session.startNewRun({ source: 'test' });
    pickups.spawnPickup('salvage', 100, 100);
    pickups.chests.spawn('warden', 200, 200);
    expect(pickups.getActivePickups()).toHaveLength(2);

    game.session.startNewRun({ source: 'test' });

    expect(pickups.getActivePickups()).toHaveLength(0);
  });
});
