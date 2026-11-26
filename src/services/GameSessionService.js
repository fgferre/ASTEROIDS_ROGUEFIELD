import { GAME_HEIGHT, GAME_WIDTH } from '../core/GameConstants.js';
import { debugLog } from '../core/debugLogging.js';
import { DEFAULT_HULL_ID, getShipModelById } from '../data/shipModels.js';
import { bossRushStage } from '../data/layers.js';
import { runModeFor } from '../core/runMode.js';
import { updateRecords } from './runRecords.js';
import {
  RandomScopes,
  deriveInitialSeed,
  logRandomSnapshot,
  persistLastSeed,
} from './session/randomScopes.js';
import { DeathSnapshot } from './session/deathSnapshot.js';
import { RunEnd } from './session/runEnd.js';
import { HeadStart } from './session/headStart.js';
import { RetryCountdown } from './session/retryCountdown.js';
import { MenuButtons } from './session/menuButtons.js';
import { resolveService } from '../core/serviceUtils.js';

/**
 * GameSessionService orchestrates lifecycle state for a single game run.
 *
 * Beyond exposing pause/screen getters for legacy consumers, it centralizes
 * deterministic RNG management, seed persistence and integration with
 * auxiliary systems (audio, UI, etc.).
 */
export default class GameSessionService {
  /**
   * @param {Object} options
   * @param {Object} options.eventBus - Global event bus instance
   * @param {Object} options.random - Seeded random service
   * @param {Object} options.gameStateFacade - Legacy-facing game-state facade
   * @param {Object} options.services - Systems coordinated by the session
   * @param {Object} [options.gameState] - Raw game state reference used during bootstrap
   */
  /**
   * `playLink({ options, hullName, button, onConnect, eventBus })`: plays the
   * way into a run started from the menu (app.js gives ui/remoteLink.js);
   * without it, as headless, the run starts at once.
   */
  constructor({
    eventBus,
    random,
    gameStateFacade,
    services = {},
    gameState,
    playLink,
  }) {
    if (!eventBus) {
      throw new Error('[GameSessionService] Missing event bus instance');
    }

    if (!random) {
      throw new Error('[GameSessionService] Missing random service');
    }

    this.eventBus = eventBus;
    this.random = random;
    this.services = services;
    this.gameStateFacade = gameStateFacade || null;
    this.gameState = gameState || {};

    this.audioService = services?.audio || null;
    this.canvas = null;
    // Recording of the current/last run (src/core/replay.js); set by the
    // replay controller, read by the F9 download.
    this.replayRecorder = null;
    // `{ daily, bossRush, sector }` of the replay armed for the next run; set by the
    // replay controller, it wins over the mode the run is started with.
    this.replayStart = null;
    this.sessionState = 'menu';
    this.quitExplosionTimeoutId = null;
    this.quitExplosionPlayerRef = null;

    this.globalEventUnsubscribes = [];
    this._suppressWaveKickoff = false;
    this.globalEventHandlers = {
      screenChanged: (data) => this.handleScreenChangedEvent(data),
      playerDied: (data) => this.handlePlayerDiedEvent(data),
      togglePause: (payload) => this.handleTogglePauseEvent(payload),
      // The window lost focus mid-run (InputSystem released the keys): pause.
      inputFocusLost: () => {
        if (this.isRunning() && !this.retry.isRetryCountdownActive) {
          this.togglePause({ source: 'focus-lost' });
        }
      },
      exitToMenuRequested: (payload) => this.exitToMenu(payload || {}),
      activateShieldPressed: () => this.handleActivateShieldPressedEvent(),
      progressionReset: (payload) => this.handleProgressionResetEvent(payload),
      bossDefeated: (payload) => this.runEnd.handleBossDefeatedEvent(payload),
      // A sector run is not a deep run: it raises no layer record.
      waveStarted: (payload) => {
        if (this.mode.writesRushRecord) {
          updateRecords({ bossRushStage: bossRushStage(payload?.wave) });
        } else if (this.mode.writesLayerRecord) {
          updateRecords({ layer: payload?.wave });
        }
      },
      transmissionShown: () => {
        this.runEnd.transmissionOnAir = true;
      },
      transmissionFinished: () => {
        this.runEnd.transmissionOnAir = false;
        this.runEnd.openRunEndScreen?.();
      },
    };

    this.initializeSessionState();

    // The session's subjects (src/services/session/), each handed what it
    // needs by name.
    this.randomScopes = new RandomScopes({
      random: this.random,
      gameState: this.gameState,
      audio: () => this.audioService,
    });
    this.snapshots = new DeathSnapshot({
      random: this.random,
      gameState: this.gameState,
      seedInfo: this.randomScopes.seedInfo,
      currentRandomSnapshot: () => this.randomScopes.currentRandomSnapshot,
      prepareRandomForScope: (scope, options) =>
        this.prepareRandomForScope(scope, options),
      services: this.services,
      getConfiguredHullId: () => this.getConfiguredHullId(),
      applyConfiguredPlayerHull: (options) =>
        this.applyConfiguredPlayerHull(options),
    });
    this.runEnd = new RunEnd({
      eventBus: this.eventBus,
      services: this.services,
      getSessionState: () => this.getSessionState(),
      setSessionState: (state, meta) => this.setSessionState(state, meta),
      setScreen: (screen) => this.setScreen(screen),
      emitScreenChanged: (screen, meta) => this.emitScreenChanged(screen, meta),
      getConfiguredHullId: () => this.getConfiguredHullId(),
      findSafeSpawnPoint: () => this.retry.findSafeSpawnPoint(),
    });
    this.headStart = new HeadStart({
      eventBus: this.eventBus,
      services: this.services,
    });
    this.retry = new RetryCountdown({
      eventBus: this.eventBus,
      gameState: this.gameState,
      canvas: () => this.canvas,
      services: this.services,
      hasDeathSnapshot: () => this.snapshots.hasDeathSnapshot(),
      getDeathSnapshot: () => this.snapshots.getDeathSnapshot(),
      restoreFromSnapshot: (options) =>
        this.snapshots.restoreFromSnapshot(options),
      prepareRandomForScope: (scope, options) =>
        this.prepareRandomForScope(scope, options),
      clearPendingGameOverTransition: () =>
        this.runEnd.clearPendingGameOverTransition(),
      setScreen: (screen) => this.setScreen(screen),
      emitScreenChanged: (screen, meta) => this.emitScreenChanged(screen, meta),
      setSessionState: (state, meta) => this.setSessionState(state, meta),
    });
    this.menuButtons = new MenuButtons({
      eventBus: this.eventBus,
      startNewRun: (options) => this.startNewRun(options),
      requestRetry: (options) => this.retry.requestRetry(options),
      exitToMenu: (payload) => this.exitToMenu(payload),
      continueBeyondVictory: () => this.runEnd.continueBeyondVictory(),
      linkIn:
        playLink &&
        ((options, start, button) =>
          playLink({
            options,
            hullName: this.resolveHullDefinition()?.name,
            button,
            onConnect: start,
            eventBus: this.eventBus,
          })),
    });

    if (
      this.gameStateFacade &&
      typeof this.gameStateFacade.__attachSessionService === 'function'
    ) {
      this.gameStateFacade.__attachSessionService(this);
    }
  }

  initializeSessionState() {
    if (!this.gameState || typeof this.gameState !== 'object') {
      this.gameState = {};
    }

    if (!Object.prototype.hasOwnProperty.call(this.gameState, 'randomSeed')) {
      this.gameState.randomSeed = null;
    }

    if (
      !Object.prototype.hasOwnProperty.call(this.gameState, 'randomSeedSource')
    ) {
      this.gameState.randomSeedSource = 'unknown';
    }

    if (
      !Object.prototype.hasOwnProperty.call(this.gameState, 'randomSnapshot')
    ) {
      this.gameState.randomSnapshot = null;
    }

    if (!Object.prototype.hasOwnProperty.call(this.gameState, 'randomScope')) {
      this.gameState.randomScope = 'uninitialized';
    }

    if (!Object.prototype.hasOwnProperty.call(this.gameState, 'screen')) {
      this.gameState.screen = 'menu';
    }

    if (!Object.prototype.hasOwnProperty.call(this.gameState, 'isPaused')) {
      this.gameState.isPaused = false;
    }

    if (!Object.prototype.hasOwnProperty.call(this.gameState, 'sessionState')) {
      this.gameState.sessionState = 'menu';
    }

    this.sessionState = this.gameState.sessionState;
  }

  /**
   * Bootstraps session metadata including seed provenance and the canvas.
   * @param {Object} [options]
   * @param {*} [options.seed]
   * @param {string} [options.source]
   * @param {{ seed: *, source?: string }} [options.seedInfo]
   * @param {HTMLCanvasElement} [options.canvas]
   */
  initialize({ seed, source, seedInfo, canvas } = {}) {
    const normalizedSeedInfo =
      typeof seedInfo === 'object' && seedInfo !== null ? { ...seedInfo } : {};

    if (
      typeof normalizedSeedInfo.seed === 'undefined' &&
      typeof seed !== 'undefined'
    ) {
      normalizedSeedInfo.seed = seed;
    }

    if (
      typeof normalizedSeedInfo.source === 'undefined' &&
      typeof source === 'string'
    ) {
      normalizedSeedInfo.source = source;
    }

    const bootSeed = this.randomScopes.seedInfo;
    if (Object.prototype.hasOwnProperty.call(normalizedSeedInfo, 'seed')) {
      bootSeed.seed = normalizedSeedInfo.seed;
      if (this.gameState) {
        this.gameState.randomSeed = normalizedSeedInfo.seed;
      }
    }

    if (typeof normalizedSeedInfo.source === 'string') {
      bootSeed.source = normalizedSeedInfo.source;
    }

    if (this.gameState) {
      this.gameState.randomSeedSource = bootSeed.source;
    }

    if (canvas) {
      this.canvas = canvas;
    }

    if (typeof bootSeed.seed !== 'undefined' && bootSeed.seed !== null) {
      persistLastSeed(bootSeed.seed, bootSeed.source);
      debugLog(
        `[Random] Boot seed (${bootSeed.source}): ${String(bootSeed.seed)}`
      );
    }

    this.menuButtons.setupDomEventListeners();
    this.setupGlobalEventListeners();
  }

  /**
   * Indicates whether the session is currently paused.
   * @returns {boolean}
   */
  isPaused() {
    return Boolean(this.gameState?.isPaused);
  }

  /**
   * Indicates whether gameplay should be processed during the current frame.
   * @returns {boolean}
   */
  isRunning() {
    return (
      this.getScreen() === 'playing' &&
      !this.isPaused() &&
      this.getSessionState() !== 'quitting'
    );
  }

  /**
   * Updates the paused state and synchronizes the raw reference.
   * @param {boolean} value
   * @returns {boolean}
   */
  setPaused(value) {
    const paused = Boolean(value);
    if (this.gameState) {
      this.gameState.isPaused = paused;
    }
    return paused;
  }

  /**
   * Retrieves the currently active screen identifier.
   * @returns {string|null}
   */
  getScreen() {
    if (!this.gameState) {
      return null;
    }
    return this.gameState.screen ?? null;
  }

  /**
   * Sets the current screen and keeps the raw object in sync.
   * @param {string} screen
   * @returns {string}
   */
  setScreen(screen) {
    if (this.gameState) {
      this.gameState.screen = screen;
    }
    return screen;
  }

  emitScreenChanged(screen, meta = {}) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return;
    }

    this.eventBus.emit('screen-changed', { screen, ...meta });
  }

  emitPauseState(meta = {}) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return;
    }

    this.eventBus.emit('pause-state-changed', {
      isPaused: this.isPaused(),
      ...meta,
    });
  }

  emitGameStarted(meta = {}) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return;
    }

    this.eventBus.emit('game-started', { ...meta });
  }

  setSessionState(state, meta = {}) {
    const nextState = state || 'unknown';
    const previous = this.sessionState;

    if (this.gameState) {
      this.gameState.sessionState = nextState;
    }

    this.sessionState = nextState;

    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return nextState;
    }

    if (previous === nextState && !meta.forceEmit) {
      return nextState;
    }

    this.eventBus.emit('session-state-changed', {
      state: nextState,
      previousState: previous,
      ...meta,
    });

    return nextState;
  }

  getSessionState() {
    return this.sessionState;
  }

  setupGlobalEventListeners() {
    if (!this.eventBus || typeof this.eventBus.on !== 'function') {
      return;
    }

    this.teardownGlobalEventListeners();

    const register = (eventName, handler) => {
      if (typeof handler !== 'function') {
        return;
      }

      this.eventBus.on(eventName, handler);
      this.globalEventUnsubscribes.push(() => {
        if (this.eventBus && typeof this.eventBus.off === 'function') {
          this.eventBus.off(eventName, handler);
        }
      });
    };

    register('screen-changed', this.globalEventHandlers.screenChanged);
    register('player-died', this.globalEventHandlers.playerDied);
    register('toggle-pause', this.globalEventHandlers.togglePause);
    register('input-focus-lost', this.globalEventHandlers.inputFocusLost);
    register(
      'exit-to-menu-requested',
      this.globalEventHandlers.exitToMenuRequested
    );
    register(
      'activate-shield-pressed',
      this.globalEventHandlers.activateShieldPressed
    );
    register('progression-reset', this.globalEventHandlers.progressionReset);
    register('boss-defeated', this.globalEventHandlers.bossDefeated);
    register('wave-started', this.globalEventHandlers.waveStarted);
    register('transmission-shown', this.globalEventHandlers.transmissionShown);
    register(
      'transmission-finished',
      this.globalEventHandlers.transmissionFinished
    );
  }

  teardownGlobalEventListeners() {
    if (!Array.isArray(this.globalEventUnsubscribes)) {
      this.globalEventUnsubscribes = [];
      return;
    }

    this.globalEventUnsubscribes.forEach((unsubscribe) => {
      try {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      } catch (error) {
        console.warn(
          '[GameSessionService] Failed to remove event listener:',
          error
        );
      }
    });

    this.globalEventUnsubscribes = [];
  }

  handleScreenChangedEvent(data) {
    if (!data || typeof data.screen !== 'string') {
      return;
    }

    const nextScreen = data.screen;
    const previousScreen = this.getScreen();
    if (nextScreen && previousScreen !== nextScreen) {
      this.setScreen(nextScreen);
    }

    if (nextScreen !== 'playing') {
      const wasPaused = this.isPaused();
      if (wasPaused) {
        this.setPaused(false);
        this.emitPauseState({ source: 'screen-changed' });
      }

      if (nextScreen === 'menu') {
        this.setSessionState('menu', { reason: 'screen-changed' });
      }
      return;
    }

    this.setSessionState('running', { reason: 'screen-changed' });
  }

  handlePlayerDiedEvent(data) {
    this.handlePlayerDeath(data);
  }

  handleTogglePauseEvent(payload = {}) {
    this.togglePause({ source: payload?.source || 'toggle-pause' });
  }

  handleActivateShieldPressedEvent() {
    if (this.getScreen() !== 'playing') {
      return;
    }

    const player = resolveService('player', this.services);
    if (player && typeof player.activateShield === 'function') {
      try {
        player.activateShield();
      } catch (error) {
        console.warn('[GameSessionService] Failed to activate shield:', error);
      }
    }
  }

  handleProgressionResetEvent(payload = {}) {
    if (this._suppressWaveKickoff) {
      return;
    }
    this.ensureWaveKickoff({ reason: 'progression-reset', payload });
  }

  ensureWaveKickoff({ reason = 'unknown' } = {}) {
    if (this._suppressWaveKickoff) {
      return false;
    }

    const enemies = resolveService('enemies', this.services);
    if (!enemies || typeof enemies.startNextWave !== 'function') {
      return false;
    }

    if (reason === 'progression-reset') {
      const screen = this.getScreen();
      if (screen !== 'playing') {
        return false;
      }
    }

    if (enemies.waveManager?.waveInProgress) {
      return false;
    }

    try {
      enemies.startNextWave();
    } catch (error) {
      console.error(
        '[GameSessionService] Failed to start wave via WaveManager:',
        error
      );
      return false;
    }

    return true;
  }

  /**
   * `daily`: see DifficultyService.beginRun. `bossRush` true starts a Boss
   * Rush, false any other run; undefined keeps the last mode. `sector` (a
   * sector id) starts a sector run, never daily nor Boss Rush; null any other
   * run; undefined keeps the last one, unless `daily` or `bossRush` is given
   * (a mode picked without a sector). An armed replay (`replayStart`) starts
   * in its recorded mode and hull, on its Hangar setup (kept through a Retry;
   * any other run drops it), whatever started the run, and announces itself
   * with `replay: true` on 'game-started': a replayed run has no side effects
   * on the viewer's save (Salvage) or pad (rumble).
   */
  startNewRun({ source = 'unknown', daily, bossRush, sector, carry } = {}) {
    const replay = Boolean(this.replayStart);
    let hullId;
    if (replay) {
      ({ daily, bossRush, sector, hull: hullId } = this.replayStart);
      this.replayStart = null;
    } else resolveService('hangar', this.services).useReplaySetup(null);
    // The run's kind is settled here, once (src/core/runMode.js). How it was
    // launched stays out of it: the story only from the map's launch button
    // and the journey only from the map or Next Sector (runCinematics.js),
    // New Mission keeping the last mode (the undefined options, read against
    // the last mode), an armed replay winning over the mode picked (above).
    this.runEnd.mode = runModeFor({ daily, bossRush, sector }, this.mode);
    const difficulty = resolveService('difficulty', this.services);
    const seed = difficulty.beginRun({ mode: this.mode });
    if (this.gameState) {
      this.gameState.randomSeed = seed;
    }

    try {
      this.prepareRandomForScope('run.start', { mode: 'reset' });
    } catch (error) {
      console.warn(
        '[GameSessionService] Failed to prepare RNG for run start:',
        error
      );
    }

    this.retry.clearRetryCountdownTimers();
    this.runEnd.clearPendingGameOverTransition();
    this.runEnd.transmissionOnAir = false;
    this.retry.isRetryCountdownActive = false;
    this.snapshots.clearDeathSnapshot();
    this.retry.hideRetryCountdown();
    this.retry.setRetryCount(1);
    this.retry.setRetryButtonEnabled(true);

    // The reset below must not start the first layer (a progression reset
    // does, on the playing screen): this run starts it, or its head start.
    this._suppressWaveKickoff = true;
    this.runEnd.endless = false;
    this.runEnd.bossRushWardens = 0;
    updateRecords({ newRun: true });
    // `carry` (the victory screen's next sector): the ship keeps its build.
    const build = carry && !replay ? this.snapshots.captureBuild() : null;
    // Before the reset: the first layer's rock count already follows it.
    const waveManager = resolveService('enemies', this.services)?.waveManager;
    if (waveManager) {
      waveManager.mode = this.mode;
    }

    try {
      this.resetSystems({ manageRandom: false });
    } catch (error) {
      console.error(
        '[GameSessionService] Failed to reset systems during start:',
        error
      );
    }

    this.applyConfiguredPlayerHull({ hullId });
    // A carried build already holds its starting card.
    if (build) this.snapshots.restoreBuild(build);
    else resolveService('progression', this.services).applyStartingCard();
    this._suppressWaveKickoff = false;

    // A head start holds the first layer until its picks are made; a carried
    // build only takes the picks it is short of.
    const levelsCarried = build
      ? resolveService('progression', this.services).level - 1
      : 0;
    const headStart = Math.max(0, this.mode.headStart - levelsCarried);
    const owed = build?.owed ?? [];
    if (!headStart && owed.length === 0) {
      this.ensureWaveKickoff({ reason: 'session-start' });
    }

    const ui = resolveService('ui', this.services);
    if (ui && typeof ui.showGameUI === 'function') {
      try {
        ui.showGameUI({ emitEvent: false });
      } catch (error) {
        console.error('[GameSessionService] Failed to show game UI:', error);
      }
    }

    const audio = this.audioService || resolveService('audio', this.services);
    if (!this.audioService && audio) {
      this.audioService = audio;
    }

    if (audio && typeof audio.init === 'function') {
      try {
        audio.init();
      } catch (error) {
        console.error(
          '[GameSessionService] Failed to initialize audio:',
          error
        );
      }
    }

    this.setScreen('playing');
    this.emitScreenChanged('playing', { source: 'session.start' });

    // Emit game-started event for audio feedback
    this.emitGameStarted({
      source,
      timestamp: Date.now(),
      bossRush: this.bossRush,
      sector: this.sector?.id ?? null,
      mode: this.mode,
      replay,
      carried: Boolean(build),
    });
    if (this.mode.usesTodaysSeed) {
      this.eventBus.emit('daily-started', { seed });
    }

    const wasPaused = this.isPaused();
    this.setPaused(false);
    if (wasPaused) {
      this.emitPauseState({ source: 'session.start' });
    }

    this.setSessionState('running', { reason: 'start-new-run' });
    this.headStart.begin(headStart, owed);

    if (this.gameState) {
      this.gameState.lastTime =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    debugLog('[GameSessionService] Run started successfully!', { source });
  }

  handlePlayerDeath(data = {}) {
    if (['victory', 'quitting'].includes(this.getSessionState())) {
      return;
    }

    if (this.isPaused()) {
      this.setPaused(false);
      this.emitPauseState({ source: 'player-died' });
    }

    if (!this.snapshots.hasDeathSnapshot()) {
      this.snapshots.createDeathSnapshot();
    }

    this.runEnd.scheduleGameOverScreenTransition({
      ...data,
      ...this.runEnd.recordRunReached(data),
    });

    const retriesRemaining = this.retry.getRetryCount();
    if (retriesRemaining <= 0) {
      if (retriesRemaining < 0) {
        this.retry.setRetryCount(0);
      }
      this.retry.setRetryButtonEnabled(false);
    } else {
      this.retry.setRetryButtonEnabled(true);
    }

    this.setSessionState('player-died', {
      reason: 'player-died',
      data,
    });
  }

  togglePause({ source = 'toggle-pause' } = {}) {
    const currentScreen = this.getScreen();

    if (['victory', 'quitting'].includes(this.getSessionState())) {
      return false;
    }

    if (currentScreen !== 'playing') {
      const wasPaused = this.isPaused();
      if (wasPaused) {
        this.setPaused(false);
        this.emitPauseState({ source });
        this.setSessionState('running', { reason: source });
      }
      return this.isPaused();
    }

    const previous = this.isPaused();
    const next = !previous;

    if (next === previous) {
      return next;
    }

    this.setPaused(next);
    this.emitPauseState({ source });
    this.setSessionState(next ? 'paused' : 'running', { reason: source });
    return next;
  }

  cancelQuitExplosionTimer({ restorePlayer = true } = {}) {
    if (!this.quitExplosionTimeoutId) {
      return;
    }

    clearTimeout(this.quitExplosionTimeoutId);
    this.quitExplosionTimeoutId = null;

    if (restorePlayer && this.quitExplosionPlayerRef) {
      this.quitExplosionPlayerRef._quitExplosionHidden = false;
    }

    this.quitExplosionPlayerRef = null;
  }

  exitToMenu(payload = {}) {
    const { source } = payload || {};

    try {
      if (source === 'pause-menu' && this.getScreen() === 'playing') {
        if (this.quitExplosionTimeoutId) {
          return;
        }

        debugLog(
          '[GameSessionService] Quit from pause - triggering epic explosion...'
        );

        const player = resolveService('player', this.services);
        const effects = resolveService('effects', this.services);
        const ui = resolveService('ui', this.services);

        this.setSessionState('quitting', { reason: 'exit-to-menu' });
        // Quitting pays the Salvage the run earned (HangarService).
        this.eventBus.emit(
          'run-abandoned',
          resolveService('world', this.services)?.buildRunSummary() ?? {}
        );
        this.runEnd.clearPendingGameOverTransition();
        const wasPaused = this.isPaused();
        this.setPaused(false);
        if (wasPaused) {
          this.emitPauseState({ source: 'exit-to-menu' });
        }

        if (ui && typeof ui.showScreen === 'function') {
          try {
            ui.showScreen('playing', { emitEvent: false });
          } catch (error) {
            console.warn(
              '[GameSessionService] Failed to show playing screen before quit:',
              error
            );
          }
        }

        const playerPosition =
          player && typeof player.getPosition === 'function'
            ? player.getPosition()
            : player && player.position
              ? { ...player.position }
              : {
                  x: GAME_WIDTH / 2,
                  y: GAME_HEIGHT / 2,
                };

        if (effects && typeof effects.createEpicShipExplosion === 'function') {
          try {
            effects.createEpicShipExplosion(playerPosition);
          } catch (error) {
            console.warn(
              '[GameSessionService] Failed to create quit explosion:',
              error
            );
          }
        }

        if (player) {
          player._quitExplosionHidden = true;
          this.quitExplosionPlayerRef = player;
        }

        this.quitExplosionTimeoutId = setTimeout(() => {
          if (this.quitExplosionPlayerRef) {
            this.quitExplosionPlayerRef._quitExplosionHidden = false;
          }
          this.quitExplosionPlayerRef = null;
          this.quitExplosionTimeoutId = null;
          this.performExitToMenu(payload);
        }, 3500);

        return;
      }

      this.performExitToMenu(payload);
    } catch (error) {
      console.error('[GameSessionService] Failed to exit to menu:', error);
      this.performExitToMenu(payload);
    }
  }

  performExitToMenu(payload = {}) {
    this.cancelQuitExplosionTimer({ restorePlayer: false });

    try {
      this.prepareRandomForScope('menu.exit', { mode: 'reset' });
    } catch (error) {
      console.warn(
        '[GameSessionService] Failed to prepare RNG for menu exit:',
        error
      );
    }

    this._suppressWaveKickoff = true;

    try {
      this.resetSystems({ manageRandom: false });
      // The field's pickups, chests and Overcharge go with the run (outside
      // audit 8, verdict A5); not in resetSystems, whose reset at every run
      // start would add an event the recorded runs do not have ('game-started'
      // resets them there).
      resolveService('pickups', this.services).reset();
    } catch (error) {
      console.error(
        '[GameSessionService] Failed to reset systems during exit:',
        error
      );
    }

    this._suppressWaveKickoff = false;

    this.resetForMenu();

    const ui = resolveService('ui', this.services);
    if (ui) {
      if (typeof ui.resetLevelUpState === 'function') {
        try {
          ui.resetLevelUpState();
        } catch (error) {
          console.warn(
            '[GameSessionService] Failed to reset UI level-up state:',
            error
          );
        }
      }

      if (typeof ui.showScreen === 'function') {
        try {
          ui.showScreen('menu', { emitEvent: false });
        } catch (error) {
          console.error(
            '[GameSessionService] Failed to show menu screen:',
            error
          );
        }
      }
    }

    this.runEnd.clearPendingGameOverTransition();
    this.setScreen('menu');
    this.emitScreenChanged('menu', { source: payload?.source || 'unknown' });

    const wasPaused = this.isPaused();
    this.setPaused(false);
    if (wasPaused) {
      this.emitPauseState({ source: 'exit-to-menu' });
    }

    resolveService('difficulty', this.services).endRun();
    debugLog(`Retornando ao menu (origem: ${payload?.source ?? 'unknown'}).`);

    this.setSessionState('menu', {
      reason: 'exit-to-menu',
      source: payload?.source,
    });
  }

  getConfiguredHullId() {
    const settings = resolveService('settings', this.services);
    const gameplaySettings =
      settings && typeof settings.getCategoryValues === 'function'
        ? settings.getCategoryValues('gameplay') || null
        : null;

    const selected =
      typeof gameplaySettings?.selectedHull === 'string'
        ? gameplaySettings.selectedHull
        : DEFAULT_HULL_ID;
    // A hull locked in the Hangar flies as the default one.
    return (
      resolveService('hangar', this.services)?.hullFor(selected) ?? selected
    );
  }

  resolveHullDefinition(hullId) {
    return getShipModelById(
      typeof hullId === 'string' && hullId.trim().length > 0
        ? hullId
        : this.getConfiguredHullId()
    );
  }

  applyConfiguredPlayerHull({ hullId } = {}) {
    const player = resolveService('player', this.services);
    if (!player || typeof player.setHull !== 'function') {
      return null;
    }

    const hullDefinition = this.resolveHullDefinition(hullId);

    try {
      player.setHull(hullDefinition);
      return hullDefinition;
    } catch (error) {
      console.warn(
        '[GameSessionService] Failed to apply configured hull:',
        error
      );
      return null;
    }
  }

  resetSystems({ manageRandom = true } = {}) {
    if (manageRandom) {
      this.prepareRandomForScope('systems.reset', { mode: 'reset' });
    } else {
      const snapshot =
        this.randomScopes.currentRandomSnapshot ||
        this.snapshots.randomSnapshot ||
        this.gameState?.randomSnapshot ||
        null;

      if (snapshot) {
        logRandomSnapshot('systems.reset (pre-managed)', snapshot, {
          mode: 'snapshot',
        });
      }
    }

    const servicesToReset = [
      'player',
      'combat',
      'enemies',
      'physics',
      'progression',
      'xp-orbs',
      'healthHearts',
      'effects',
      'renderer',
      'world',
      'audio',
    ];

    servicesToReset.forEach((serviceName) => {
      const instance = resolveService(serviceName, this.services);
      if (!instance || typeof instance.reset !== 'function') {
        return;
      }

      try {
        instance.reset();
      } catch (error) {
        console.warn(
          `Não foi possível resetar o serviço "${serviceName}":`,
          error
        );
      }
    });
  }

  resetForMenu() {
    this.retry.clearRetryCountdownTimers();
    this.runEnd.clearPendingGameOverTransition();
    this.runEnd.transmissionOnAir = false;
    this.retry.isRetryCountdownActive = false;
    this.retry.hideRetryCountdown();
    this.retry.setRetryCount(0);
    this.retry.setRetryButtonEnabled(false);
    this.snapshots.clearDeathSnapshot();

    if (this.gameState) {
      this.gameState.randomScope = 'menu';
    }
  }

  // What moved to src/services/session/ and is still called from outside the
  // session (app, replay glue, the UI) keeps its name here; the rest is
  // reached through its part (this.retry, this.snapshots, this.runEnd).

  getSeedInfo() {
    return this.randomScopes.getSeedInfo();
  }

  getRandomSnapshot() {
    return this.randomScopes.getRandomSnapshot();
  }

  prepareRandomForScope(scope, options) {
    return this.randomScopes.prepareRandomForScope(scope, options);
  }

  /** The kind of run being played (src/core/runMode.js). */
  get mode() {
    return this.runEnd.mode;
  }

  // Until the run's other parts ask `mode` (item 8, this branch).
  get bossRush() {
    return this.mode.kind === 'bossRush';
  }

  get sector() {
    return this.mode.sector;
  }

  static deriveInitialSeed() {
    return deriveInitialSeed();
  }

  static persistLastSeed(seed, source) {
    return persistLastSeed(seed, source);
  }
}
