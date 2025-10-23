import { describe, it, expect, vi, afterEach } from 'vitest';

import GameSessionService from '../../src/services/GameSessionService.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
// Optimization: use centralized createRandomServiceStatefulStub()
import { createRandomServiceStatefulStub } from '../__helpers__/stubs.js';

function createServiceHarness() {
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
    showGameUI: vi.fn(),
    showScreen: vi.fn(),
    resetLevelUpState: vi.fn()
  };

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
      expect.objectContaining({ screen: 'playing', source: 'session.start' })
    ]);
    service.setRetryCount(2);
    vi.useFakeTimers();

    service.handlePlayerDeath({ reason: 'spec' });

    expect(service.getScreen()).toBe('playing');
    expect(getScreenEvents()).toEqual([
      expect.objectContaining({ screen: 'playing', source: 'session.start' })
    ]);

    vi.advanceTimersByTime(3000);

    expect(service.getScreen()).toBe('gameover');
    expect(getScreenEvents()).toEqual([
      expect.objectContaining({ screen: 'playing', source: 'session.start' }),
      expect.objectContaining({
        screen: 'gameover',
        source: 'player-died',
        data: { reason: 'spec' }
      })
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
        data: { reason: 'spec' }
      }),
      expect.objectContaining({ screen: 'playing', source: 'retry-complete' })
    ]);
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
    expect(restoreSpy).toHaveBeenCalledWith({ snapshot: service.deathSnapshot });
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
});
