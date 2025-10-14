import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import GameSessionService from '../../services/GameSessionService.js';

function createEventBus() {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  };
}

function createRandomStub() {
  return {
    serialize: vi.fn(() => ({ scope: 'stub', value: 123 })),
    restore: vi.fn(),
    reset: vi.fn(),
    seed: 123
  };
}

function createServiceHarness() {
  const eventBus = createEventBus();
  const random = createRandomStub();

  const player = {
    maxHealth: 100,
    health: 75,
    position: { x: 10, y: 15 },
    upgrades: [],
    respawn: vi.fn(),
    reset: vi.fn(),
    getPosition: vi.fn(() => ({ x: 10, y: 15 })),
    activateShield: vi.fn()
  };

  const world = { reset: vi.fn() };
  const progression = {
    serialize: vi.fn(() => ({ level: 3 })),
    restoreState: vi.fn(() => true),
    reset: vi.fn(),
    applyUpgradeEffects: vi.fn(),
    getAllUpgrades: vi.fn(() => []),
    refreshInjectedServices: vi.fn()
  };

  const enemies = {
    getSnapshotState: vi.fn(() => ({ waves: [] })),
    restoreSnapshotState: vi.fn(() => true),
    reset: vi.fn(),
    getAsteroids: vi.fn(() => [])
  };

  const physics = {
    getSnapshotState: vi.fn(() => ({ active: [] })),
    restoreSnapshotState: vi.fn(() => true),
    reset: vi.fn()
  };

  const audio = {
    init: vi.fn(),
    reset: vi.fn(),
    reseedRandomScopes: vi.fn()
  };

  const ui = {
    resetLevelUpState: vi.fn(),
    showScreen: vi.fn((screen, options = {}) => {
      if (options?.suppressEvent) {
        return;
      }

      const payload = { screen };
      if (options?.eventPayload && typeof options.eventPayload === 'object') {
        Object.assign(payload, options.eventPayload);
      }

      eventBus.emit('screen-changed', payload);
    })
  };

  ui.showGameUI = vi.fn((options = {}) => {
    ui.resetLevelUpState();
    ui.showScreen('playing', options);
  });

  const xpOrbs = { reset: vi.fn() };
  const healthHearts = { reset: vi.fn() };
  const effects = {
    reset: vi.fn(),
    createEpicShipExplosion: vi.fn()
  };

  const combat = { reset: vi.fn() };
  const renderer = { reset: vi.fn() };

  const gameStateFacade = { __attachSessionService: vi.fn() };
  const gameState = {
    canvas: { width: 800, height: 600 },
    ctx: null,
    screen: 'menu',
    isPaused: false,
    sessionState: 'menu'
  };

  const service = new GameSessionService({
    eventBus,
    random,
    gameStateFacade,
    services: {
      audio,
      ui,
      player,
      progression,
      enemies,
      physics,
      xpOrbs,
      healthHearts,
      world,
      effects,
      combat,
      renderer
    },
    gameState
  });

  service.initialize({ seedInfo: { seed: 99, source: 'test' } });
  service.retryCountElement = { textContent: '0', isConnected: true };
  service.retryButtonElement = { disabled: false, style: {}, isConnected: true };
  service.retryCountdownElement = {
    textContent: '',
    isConnected: true,
    classList: {
      add: vi.fn(),
      remove: vi.fn()
    }
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
    gameState
  };
}

describe('GameSessionService lifecycle flows', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a single screen change when starting a new run', () => {
    const { service, eventBus } = createServiceHarness();

    service.startNewRun({ source: 'spec' });

    const screenChangeCalls = eventBus.emit.mock.calls.filter(
      ([eventName]) => eventName === 'screen-changed'
    );

    expect(screenChangeCalls).toHaveLength(1);
    expect(screenChangeCalls[0][1]).toEqual(
      expect.objectContaining({ screen: 'playing', source: 'session.start' })
    );
  });

  it('runs retry countdown to completion and respawns player', () => {
    const { service, eventBus, player, world, random } = createServiceHarness();

    service.setScreen('playing');
    service.setPaused(false);

    service.startNewRun({ source: 'spec' });
    service.setRetryCount(2);
    service.handlePlayerDeath({ reason: 'spec' });

    expect(service.hasDeathSnapshot()).toBe(true);
    expect(random.serialize).toHaveBeenCalled();

    vi.useFakeTimers();

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

  it('schedules quit explosion before returning to menu from pause', () => {
    const { service, eventBus, player, effects, ui } = createServiceHarness();

    service.setScreen('playing');
    service.setPaused(true);

    const exitSpy = vi.spyOn(service, 'performExitToMenu');

    vi.useFakeTimers();

    service.exitToMenu({ source: 'pause-menu' });

    expect(effects.createEpicShipExplosion).toHaveBeenCalledWith({ x: 10, y: 15 });
    expect(player._quitExplosionHidden).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3500);
    vi.runAllTimers();

    expect(exitSpy).toHaveBeenCalledWith({ source: 'pause-menu' });
    expect(player._quitExplosionHidden).toBe(false);
    expect(service.getScreen()).toBe('menu');
    const menuCall = ui.showScreen.mock.calls.find(([name]) => name === 'menu');
    expect(menuCall).toBeTruthy();
    expect(menuCall[1]).toEqual(
      expect.objectContaining({
        eventPayload: expect.objectContaining({ source: 'pause-menu' })
      })
    );
    expect(menuCall[1]?.suppressEvent).not.toBe(true);

    const screenChangeCalls = eventBus.emit.mock.calls.filter(
      ([eventName]) => eventName === 'screen-changed'
    );

    expect(screenChangeCalls).toHaveLength(1);
    expect(screenChangeCalls[0][1]).toEqual(
      expect.objectContaining({ screen: 'menu', source: 'pause-menu' })
    );
  });
});
