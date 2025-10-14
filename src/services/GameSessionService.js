/* global gameServices */

import * as CONSTANTS from '../core/GameConstants.js';

/**
 * GameSessionService orchestrates lifecycle state for a single game run.
 *
 * Beyond exposing pause/screen getters for legacy consumers, it centralizes
 * deterministic RNG management, seed persistence and integration with
 * auxiliary systems (audio, UI, etc.).
 */
const RANDOM_STORAGE_KEYS = {
  override: 'roguefield.seedOverride',
  last: 'roguefield.lastSeed'
};

export default class GameSessionService {
  /**
   * @param {Object} options
   * @param {Object} options.eventBus - Global event bus instance
   * @param {Object} options.random - Seeded random service
   * @param {Object} options.gameStateFacade - Legacy-facing game-state facade
   * @param {Object} options.services - Systems coordinated by the session
   * @param {Object} [options.gameState] - Raw game state reference used during bootstrap
   */
  constructor({ eventBus, random, gameStateFacade, services = {}, gameState }) {
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
    this.ctx = null;
    this.seedInfo = {
      seed: null,
      source: 'unknown'
    };
    this.currentRandomSnapshot = null;
    this.currentRandomScope = 'uninitialized';
    this.randomSnapshot = null;
    this.deathSnapshot = null;
    this.sessionState = 'menu';
    this.quitExplosionTimeoutId = null;
    this.quitExplosionPlayerRef = null;
    this.isRetryCountdownActive = false;

    this.retryCountdownElement = this.lookupDomElement('retry-countdown');
    this.retryButtonElement = this.lookupDomElement('retry-game-btn');
    this.retryCountElement = this.lookupDomElement('retry-count');
    this.retryCountdownHideTimeout = null;
    this.retryCountdownFollowupTimeout = null;

    this.domClickHandler = (event) => this.handleDocumentClick(event);
    this.domClickUnsubscribe = null;
    this.globalEventUnsubscribes = [];
    this.globalEventHandlers = {
      screenChanged: (data) => this.handleScreenChangedEvent(data),
      playerDied: (data) => this.handlePlayerDiedEvent(data),
      togglePause: (payload) => this.handleTogglePauseEvent(payload),
      exitToMenuRequested: (payload) => this.exitToMenu(payload || {}),
      activateShieldPressed: () => this.handleActivateShieldPressedEvent()
    };

    this.initializeSessionState();

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

    if (!Object.prototype.hasOwnProperty.call(this.gameState, 'randomSeedSource')) {
      this.gameState.randomSeedSource = 'unknown';
    }

    if (!Object.prototype.hasOwnProperty.call(this.gameState, 'randomSnapshot')) {
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

  lookupDomElement(id) {
    if (typeof document === 'undefined' || !id) {
      return null;
    }

    try {
      const element = document.getElementById(id);
      return element || null;
    } catch (error) {
      console.warn(`[GameSessionService] Failed to lookup DOM element "${id}":`, error);
      return null;
    }
  }

  /**
   * Bootstraps session metadata including seed provenance and canvas context.
   * @param {Object} [options]
   * @param {*} [options.seed]
   * @param {string} [options.source]
   * @param {{ seed: *, source?: string }} [options.seedInfo]
   * @param {HTMLCanvasElement} [options.canvas]
   * @param {CanvasRenderingContext2D} [options.ctx]
   */
  initialize({ seed, source, seedInfo, canvas, ctx } = {}) {
    const normalizedSeedInfo = typeof seedInfo === 'object' && seedInfo !== null
      ? { ...seedInfo }
      : {};

    if (typeof normalizedSeedInfo.seed === 'undefined' && typeof seed !== 'undefined') {
      normalizedSeedInfo.seed = seed;
    }

    if (typeof normalizedSeedInfo.source === 'undefined' && typeof source === 'string') {
      normalizedSeedInfo.source = source;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedSeedInfo, 'seed')) {
      this.seedInfo.seed = normalizedSeedInfo.seed;
      if (this.gameState) {
        this.gameState.randomSeed = normalizedSeedInfo.seed;
      }
    }

    if (typeof normalizedSeedInfo.source === 'string') {
      this.seedInfo.source = normalizedSeedInfo.source;
    }

    if (this.gameState) {
      this.gameState.randomSeedSource = this.seedInfo.source;
    }

    if (canvas) {
      this.canvas = canvas;
    }

    if (ctx) {
      this.ctx = ctx;
    }

    if (typeof this.seedInfo.seed !== 'undefined' && this.seedInfo.seed !== null) {
      GameSessionService.persistLastSeed(this.seedInfo.seed, this.seedInfo.source);
      console.log(`[Random] Boot seed (${this.seedInfo.source}): ${String(this.seedInfo.seed)}`);
    }

    this.setupDomEventListeners();
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
    return this.getScreen() === 'playing' && !this.isPaused();
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
      ...meta
    });
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
      ...meta
    });

    return nextState;
  }

  getSessionState() {
    return this.sessionState;
  }

  synchronizeLegacyState() {
    if (!this.gameState || typeof this.gameState !== 'object') {
      return;
    }

    const screen = this.getScreen();
    if (typeof screen === 'string') {
      this.gameState.screen = screen;
    }

    this.gameState.isPaused = this.isPaused();
    this.gameState.sessionState = this.sessionState;

    if (Object.prototype.hasOwnProperty.call(this.seedInfo, 'seed')) {
      this.gameState.randomSeed = this.seedInfo.seed;
    }

    if (Object.prototype.hasOwnProperty.call(this.seedInfo, 'source')) {
      this.gameState.randomSeedSource = this.seedInfo.source;
    }

    if (this.currentRandomSnapshot) {
      this.gameState.randomSnapshot = this.currentRandomSnapshot;
    }

    if (typeof this.currentRandomScope === 'string') {
      this.gameState.randomScope = this.currentRandomScope;
    }
  }

  emitSessionRetryCountdown(payload = {}) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return;
    }

    this.eventBus.emit('session-retry-countdown', { ...payload });
  }

  setupDomEventListeners() {
    if (typeof document === 'undefined') {
      return;
    }

    this.teardownDomEventListeners();

    document.addEventListener('click', this.domClickHandler);
    this.domClickUnsubscribe = () => {
      document.removeEventListener('click', this.domClickHandler);
      this.domClickUnsubscribe = null;
    };
  }

  teardownDomEventListeners() {
    if (typeof this.domClickUnsubscribe === 'function') {
      try {
        this.domClickUnsubscribe();
      } catch (error) {
        console.warn('[GameSessionService] Failed to remove DOM listener:', error);
      }
    }

    this.domClickUnsubscribe = null;
  }

  handleDocumentClick(event) {
    if (!event) {
      return;
    }

    const { target } = event;
    if (!target) {
      return;
    }

    if (typeof Element !== 'undefined' && !(target instanceof Element)) {
      return;
    }

    const elementTarget = /** @type {Element} */ (target);

    const button = typeof elementTarget.closest === 'function'
      ? elementTarget.closest('button')
      : null;
    if (!button) {
      return;
    }

    const { id } = button;
    if (!id) {
      return;
    }

    const preventDefault = () => {
      try {
        event.preventDefault();
      } catch (error) {
        console.warn('[GameSessionService] Failed to prevent default action:', error);
      }
    };

    switch (id) {
      case 'start-game-btn':
      case 'restart-game-btn': {
        preventDefault();
        this.emitCreditsMenuRequest({ open: false, source: id });
        this.startNewRun({ source: id });
        break;
      }
      case 'retry-game-btn': {
        preventDefault();
        if (!this.requestRetry({ source: id })) {
          console.warn('[Retry] Request rejected - verify retry availability.');
        }
        break;
      }
      case 'quit-game-btn': {
        preventDefault();
        this.exitToMenu({ source: 'gameover' });
        break;
      }
      case 'open-settings-btn': {
        preventDefault();
        this.emitSettingsMenuRequest({ source: 'menu' });
        break;
      }
      case 'menu-credits-btn': {
        preventDefault();
        this.emitCreditsMenuRequest({
          open: true,
          source: 'menu',
          triggerId: 'menu-credits-btn'
        });
        break;
      }
      default:
        break;
    }
  }

  emitCreditsMenuRequest({ open, source, restoreFocus = false, triggerId } = {}) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return;
    }

    this.eventBus.emit('credits-menu-requested', {
      open,
      restoreFocus,
      source,
      triggerId
    });
  }

  emitSettingsMenuRequest(payload = {}) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return;
    }

    this.eventBus.emit('settings-menu-requested', { ...payload });
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
    register('exit-to-menu-requested', this.globalEventHandlers.exitToMenuRequested);
    register('activate-shield-pressed', this.globalEventHandlers.activateShieldPressed);
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
        console.warn('[GameSessionService] Failed to remove event listener:', error);
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

    const player = this.resolveServiceInstance('player');
    if (player && typeof player.activateShield === 'function') {
      try {
        player.activateShield();
      } catch (error) {
        console.warn('[GameSessionService] Failed to activate shield:', error);
      }
    }
  }

  startNewRun({ source = 'unknown' } = {}) {
    try {
      this.prepareRandomForScope('run.start', { mode: 'reset' });
    } catch (error) {
      console.warn('[GameSessionService] Failed to prepare RNG for run start:', error);
    }

    this.clearRetryCountdownTimers();
    this.isRetryCountdownActive = false;
    this.clearDeathSnapshot();
    this.hideRetryCountdown();
    this.setRetryCount(1);
    this.setRetryButtonEnabled(true);

    try {
      this.resetSystems({ manageRandom: false });
    } catch (error) {
      console.error('[GameSessionService] Failed to reset systems during start:', error);
    }

    const ui = this.resolveServiceInstance('ui');
    if (ui && typeof ui.showGameUI === 'function') {
      try {
        ui.showGameUI({ emitEvent: false });
      } catch (error) {
        console.error('[GameSessionService] Failed to show game UI:', error);
      }
    }

    const audio = this.audioService || this.resolveServiceInstance('audio');
    if (!this.audioService && audio) {
      this.audioService = audio;
    }

    if (audio && typeof audio.init === 'function') {
      try {
        audio.init();
      } catch (error) {
        console.error('[GameSessionService] Failed to initialize audio:', error);
      }
    }

    this.setScreen('playing');
    this.emitScreenChanged('playing', { source: 'session.start' });

    const wasPaused = this.isPaused();
    this.setPaused(false);
    if (wasPaused) {
      this.emitPauseState({ source: 'session.start' });
    }

    this.setSessionState('running', { reason: 'start-new-run' });

    if (this.gameState) {
      this.gameState.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    console.log('[GameSessionService] Run started successfully!', { source });
  }

  handlePlayerDeath(data = {}) {
    if (this.isPaused()) {
      this.setPaused(false);
      this.emitPauseState({ source: 'player-died' });
    }

    if (!this.hasDeathSnapshot()) {
      this.createDeathSnapshot();
    }

    const retriesRemaining = this.getRetryCount();
    if (retriesRemaining <= 0) {
      if (retriesRemaining < 0) {
        this.setRetryCount(0);
      }
      this.setRetryButtonEnabled(false);
    } else {
      this.setRetryButtonEnabled(true);
    }

    this.setSessionState('player-died', {
      reason: 'player-died',
      data
    });
  }

  requestRetry({ source = 'unknown' } = {}) {
    if (this.isRetryCountdownActive) {
      console.warn('[Retry] Countdown already active - ignoring duplicate request.');
      return false;
    }

    const started = this.beginRetryCountdown({ source });
    if (!started) {
      this.emitSessionRetryCountdown({
        phase: 'aborted',
        reason: 'validation-failed',
        source
      });
    }

    return started;
  }

  beginRetryCountdown({ source = 'unknown' } = {}) {
    if (this.isRetryCountdownActive) {
      return false;
    }

    const retries = this.getRetryCount();
    if (retries <= 0) {
      console.warn('[Retry] No retries remaining.');
      this.setRetryButtonEnabled(false);
      return false;
    }

    if (!this.hasDeathSnapshot()) {
      console.error('[Retry] Cannot begin countdown - missing snapshot');
      this.setRetryButtonEnabled(true);
      return false;
    }

    this.isRetryCountdownActive = true;

    this.setRetryButtonEnabled(false);
    this.setRetryCount(Math.max(0, retries - 1));

    this.emitSessionRetryCountdown({
      phase: 'start',
      total: 3,
      source
    });

    const gameoverScreen = this.lookupDomElement('gameover-screen');
    if (gameoverScreen) {
      gameoverScreen.classList.add('hidden');
    }

    const gameUI = this.lookupDomElement('game-ui');
    if (gameUI) {
      gameUI.classList.remove('hidden');
    }

    const player = this.resolveServiceInstance('player');
    if (player) {
      player.isRetrying = true;
    }

    this.hideRetryCountdown();

    const countdownValues = [3, 2, 1];

    const advanceCountdown = (index = 0) => {
      if (index >= countdownValues.length) {
        this.emitSessionRetryCountdown({ phase: 'complete', source });
        this.completeRetryRespawn();
        return;
      }

      const value = countdownValues[index];
      this.emitSessionRetryCountdown({
        phase: 'tick',
        value,
        index,
        remaining: countdownValues.length - index - 1,
        total: countdownValues.length,
        source
      });

      this.showRetryCountdownNumber(value, () => advanceCountdown(index + 1));
    };

    advanceCountdown(0);

    this.setSessionState('retrying', { reason: 'retry-countdown', source });

    return true;
  }

  completeRetryRespawn() {
    this.isRetryCountdownActive = false;

    const snapshot = this.getDeathSnapshot();

    if (!snapshot) {
      console.error('[Retry] Cannot respawn - missing snapshot');
      this.setRetryButtonEnabled(true);
      return false;
    }

    try {
      if (snapshot.random) {
        this.prepareRandomForScope('retry.respawn', {
          mode: 'restore',
          snapshot: snapshot.random
        });
      } else {
        this.prepareRandomForScope('retry.respawn', { mode: 'reset' });
      }
    } catch (error) {
      console.warn('[Retry] Failed to configure RNG for retry:', error);
    }

    const player = this.resolveServiceInstance('player');
    const world = this.resolveServiceInstance('world');

    if (!player || !world) {
      console.error('[Retry] Cannot respawn - missing services');
      this.setRetryButtonEnabled(true);
      return false;
    }

    const restored = this.restoreFromSnapshot({ snapshot });
    if (!restored) {
      console.error('[Retry] Failed to restore snapshot');
      this.setRetryButtonEnabled(true);
      return false;
    }

    const safeSpawn = this.findSafeSpawnPoint();

    if (typeof player.respawn === 'function') {
      try {
        player.respawn(safeSpawn, 3);
      } catch (error) {
        console.error('[Retry] Failed to respawn player:', error);
        this.setRetryButtonEnabled(true);
        return false;
      }
    }

    if (typeof world.reset === 'function') {
      try {
        world.reset();
      } catch (error) {
        console.warn('[Retry] Failed to reset world during respawn:', error);
      }
    }

    const gameoverScreen = this.lookupDomElement('gameover-screen');
    if (gameoverScreen) {
      gameoverScreen.classList.add('hidden');
    }

    this.hideRetryCountdown();

    const gameUI = this.lookupDomElement('game-ui');
    if (gameUI) {
      gameUI.classList.remove('hidden');
    }

    this.setSessionState('running', { reason: 'retry-complete' });

    return true;
  }

  togglePause({ source = 'toggle-pause' } = {}) {
    const currentScreen = this.getScreen();

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

        console.log('[GameSessionService] Quit from pause - triggering epic explosion...');

        const player = this.resolveServiceInstance('player');
        const effects = this.resolveServiceInstance('effects');
        const ui = this.resolveServiceInstance('ui');

        const wasPaused = this.isPaused();
        this.setPaused(false);
        if (wasPaused) {
          this.emitPauseState({ source: 'exit-to-menu' });
        }

        if (ui && typeof ui.showScreen === 'function') {
          try {
            ui.showScreen('playing', { emitEvent: false });
          } catch (error) {
            console.warn('[GameSessionService] Failed to show playing screen before quit:', error);
          }
        }

        const playerPosition =
          player && typeof player.getPosition === 'function'
            ? player.getPosition()
            : player && player.position
              ? { ...player.position }
              : {
                  x: CONSTANTS.GAME_WIDTH / 2,
                  y: CONSTANTS.GAME_HEIGHT / 2
                };

        if (effects && typeof effects.createEpicShipExplosion === 'function') {
          try {
            effects.createEpicShipExplosion(playerPosition);
          } catch (error) {
            console.warn('[GameSessionService] Failed to create quit explosion:', error);
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
      console.warn('[GameSessionService] Failed to prepare RNG for menu exit:', error);
    }

    try {
      this.resetSystems({ manageRandom: false });
    } catch (error) {
      console.error('[GameSessionService] Failed to reset systems during exit:', error);
    }

    this.resetForMenu();

    const ui = this.resolveServiceInstance('ui');
    if (ui) {
      if (typeof ui.resetLevelUpState === 'function') {
        try {
          ui.resetLevelUpState();
        } catch (error) {
          console.warn('[GameSessionService] Failed to reset UI level-up state:', error);
        }
      }

      if (typeof ui.showScreen === 'function') {
        try {
          ui.showScreen('menu', { emitEvent: false });
        } catch (error) {
          console.error('[GameSessionService] Failed to show menu screen:', error);
        }
      }
    }

    this.setScreen('menu');
    this.emitScreenChanged('menu', { source: payload?.source || 'unknown' });

    const wasPaused = this.isPaused();
    this.setPaused(false);
    if (wasPaused) {
      this.emitPauseState({ source: 'exit-to-menu' });
    }

    if (payload?.source) {
      console.log(`Retornando ao menu (origem: ${payload.source}).`);
    } else {
      console.log('Retornando ao menu.');
    }

    this.setSessionState('menu', { reason: 'exit-to-menu', source: payload?.source });
  }

  /**
   * Retrieves the stored boot seed information.
   * @returns {{ seed: *, source: string }}
   */
  getSeedInfo() {
    return { ...this.seedInfo };
  }

  /**
   * Returns the most recent RNG snapshot captured by the session.
   * @returns {Object|null}
   */
  getRandomSnapshot() {
    return this.currentRandomSnapshot;
  }

  /**
   * Synchronizes RNG forks maintained by the audio subsystem.
   * @param {Object} [options]
   * @param {boolean} [options.refreshForks=false]
   */
  synchronizeAudioRandomScopes({ refreshForks = false } = {}) {
    const audio = this.audioService;

    if (!audio) {
      return;
    }

    if (typeof audio.reseedRandomScopes === 'function') {
      audio.reseedRandomScopes({ refreshForks });
      return;
    }

    if (refreshForks && typeof audio.captureRandomScopes === 'function') {
      audio.captureRandomScopes({ refreshForks: true });
    } else if (typeof audio.captureRandomScopes === 'function') {
      audio.captureRandomScopes();
    }
  }

  /**
   * Logs a formatted RNG snapshot message preserving legacy output.
   * @param {string} scope
   * @param {Object|null} snapshot
   * @param {Object} [options]
   * @param {string} [options.mode='reset']
   */
  logRandomSnapshot(scope, snapshot, { mode = 'reset' } = {}) {
    GameSessionService.logRandomSnapshot(scope, snapshot, { mode });
  }

  /**
   * Prepares the seeded RNG for a deterministic scope.
   * @param {string} scope
   * @param {Object} [options]
   * @param {string} [options.mode='reset']
   * @param {Object} [options.snapshot]
   * @returns {Object|null}
   */
  prepareRandomForScope(scope, { mode = 'reset', snapshot } = {}) {
    if (!this.random || typeof this.random.serialize !== 'function') {
      console.warn(`[Random] Cannot prepare RNG for scope "${scope}" - service unavailable.`);
      return null;
    }

    const seed = this.gameState?.randomSeed ?? this.seedInfo.seed;
    let effectiveMode = mode;

    if (effectiveMode === 'restore' && snapshot) {
      try {
        this.random.restore(snapshot);
      } catch (error) {
        console.warn(`[Random] Failed to restore RNG snapshot for scope "${scope}":`, error);
        if (typeof this.random.reset === 'function') {
          this.random.reset(seed);
        }
        effectiveMode = 'reset';
      }
    } else if (typeof this.random.reset === 'function') {
      this.random.reset(seed);
    }

    this.synchronizeAudioRandomScopes({ refreshForks: true });

    if (typeof this.random.serialize !== 'function') {
      return this.random;
    }

    const currentSnapshot = this.random.serialize();
    this.currentRandomSnapshot = currentSnapshot;
    this.currentRandomScope = scope;

    if (this.gameState) {
      this.gameState.randomSnapshot = currentSnapshot;
      this.gameState.randomScope = scope;
    }

    this.logRandomSnapshot(scope, currentSnapshot, { mode: effectiveMode });
    return this.random;
  }

  resolveServiceInstance(name) {
    if (!name) {
      return null;
    }

    const aliasMap = {
      audio: 'audio',
      ui: 'ui',
      player: 'player',
      progression: 'progression',
      enemies: 'enemies',
      physics: 'physics',
      'xp-orbs': 'xpOrbs',
      xpOrbs: 'xpOrbs',
      healthHearts: 'healthHearts',
      world: 'world',
      effects: 'effects',
      combat: 'combat',
      renderer: 'renderer'
    };

    const directKey = aliasMap[name] || name;
    let instance = null;

    if (this.services && Object.prototype.hasOwnProperty.call(this.services, directKey)) {
      instance = this.services[directKey];
    }

    if (!instance && directKey !== name && this.services) {
      if (Object.prototype.hasOwnProperty.call(this.services, name)) {
        instance = this.services[name];
      }
    }

    if (!instance && typeof gameServices !== 'undefined' && gameServices) {
      try {
        if (typeof gameServices.has === 'function' && !gameServices.has(name)) {
          return instance;
        }

        if (typeof gameServices.get === 'function') {
          instance = gameServices.get(name);
        } else if (Object.prototype.hasOwnProperty.call(gameServices, name)) {
          instance = gameServices[name];
        }
      } catch (error) {
        console.warn(`[GameSessionService] Failed to resolve service "${name}":`, error);
        return null;
      }
    }

    return instance || null;
  }

  clearDeathSnapshot() {
    this.deathSnapshot = null;
    this.randomSnapshot = null;

    if (this.gameState) {
      this.gameState.deathSnapshot = null;
      this.gameState.randomSnapshot = null;
    }
  }

  hasDeathSnapshot() {
    return Boolean(this.deathSnapshot || this.gameState?.deathSnapshot);
  }

  getDeathSnapshot() {
    return this.deathSnapshot || this.gameState?.deathSnapshot || null;
  }

  getRetryCount() {
    let element = this.retryCountElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-count');
      this.retryCountElement = element;
    }

    if (!element) {
      return 0;
    }

    const parsed = parseInt(element.textContent || '0', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  setRetryCount(value) {
    let element = this.retryCountElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-count');
      this.retryCountElement = element;
    }

    if (!element) {
      return;
    }

    const numeric = Number.isFinite(value) ? value : parseInt(String(value || '0'), 10);
    const safeValue = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    element.textContent = String(safeValue);
  }

  setRetryButtonEnabled(enabled = true) {
    let element = this.retryButtonElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-game-btn');
      this.retryButtonElement = element;
    }

    if (!element) {
      return;
    }

    const allow = Boolean(enabled);
    element.disabled = !allow;
    if (element.style) {
      element.style.opacity = allow ? '1' : '0.5';
    }
  }

  ensureRetryCountdownElement() {
    let element = this.retryCountdownElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-countdown');
      if (!element && typeof document !== 'undefined') {
        element = document.createElement('div');
        element.id = 'retry-countdown';
        element.className = 'wave-countdown';
        document.body.appendChild(element);
      }
      this.retryCountdownElement = element || null;
    }

    return element || null;
  }

  clearRetryCountdownTimers() {
    if (this.retryCountdownHideTimeout) {
      clearTimeout(this.retryCountdownHideTimeout);
      this.retryCountdownHideTimeout = null;
    }

    if (this.retryCountdownFollowupTimeout) {
      clearTimeout(this.retryCountdownFollowupTimeout);
      this.retryCountdownFollowupTimeout = null;
    }
  }

  hideRetryCountdown() {
    this.clearRetryCountdownTimers();

    let element = this.retryCountdownElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-countdown');
      this.retryCountdownElement = element;
    }

    if (element) {
      element.classList.add('hidden');
    }

    this.emitSessionRetryCountdown({ phase: 'hidden' });
  }

  showRetryCountdownNumber(number, onComplete) {
    const countdown = this.ensureRetryCountdownElement();
    if (!countdown) {
      if (typeof onComplete === 'function') {
        setTimeout(onComplete, 0);
      }
      return;
    }

    countdown.textContent = String(number);
    countdown.classList.remove('hidden');

    this.clearRetryCountdownTimers();

    this.retryCountdownHideTimeout = setTimeout(() => {
      countdown.classList.add('hidden');
      this.retryCountdownHideTimeout = null;
      this.retryCountdownFollowupTimeout = setTimeout(() => {
        this.retryCountdownFollowupTimeout = null;
        if (typeof onComplete === 'function') {
          onComplete();
        }
      }, 100);
    }, 900);
  }

  resetSystems({ manageRandom = true } = {}) {
    if (manageRandom) {
      this.prepareRandomForScope('systems.reset', { mode: 'reset' });
    } else {
      const snapshot =
        this.currentRandomSnapshot ||
        this.randomSnapshot ||
        this.gameState?.randomSnapshot ||
        null;

      if (snapshot) {
        this.logRandomSnapshot('systems.reset (pre-managed)', snapshot, {
          mode: 'snapshot'
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
      'audio'
    ];

    servicesToReset.forEach((serviceName) => {
      const instance = this.resolveServiceInstance(serviceName);
      if (!instance || typeof instance.reset !== 'function') {
        return;
      }

      try {
        instance.reset();
      } catch (error) {
        console.warn(`Não foi possível resetar o serviço "${serviceName}":`, error);
      }
    });
  }

  createDeathSnapshot() {
    const player = this.resolveServiceInstance('player');
    const enemies = this.resolveServiceInstance('enemies');
    const physics = this.resolveServiceInstance('physics');
    const progression = this.resolveServiceInstance('progression');

    if (!player || !enemies || !physics || !progression) {
      console.warn('[Retry] Unable to capture snapshot - required services unavailable.');
      return null;
    }

    let randomSnapshot = null;
    if (this.random && typeof this.random.serialize === 'function') {
      try {
        randomSnapshot = this.random.serialize();
      } catch (error) {
        console.warn('[Random] Failed to serialize RNG during death snapshot:', error);
      }
    }

    if (!randomSnapshot) {
      randomSnapshot = this.currentRandomSnapshot || this.gameState?.randomSnapshot || null;
    }

    if (randomSnapshot) {
      this.logRandomSnapshot('death.snapshot', randomSnapshot, { mode: 'snapshot' });
    }

    const playerSnapshot = {
      maxHealth: Number.isFinite(player.maxHealth) ? player.maxHealth : null,
      health: Number.isFinite(player.health) ? player.health : null,
      position: player.position ? { ...player.position } : null,
    };

    if (Array.isArray(player.upgrades)) {
      playerSnapshot.upgrades = [...player.upgrades];
    }

    const progressionSnapshot =
      typeof progression.serialize === 'function' ? progression.serialize() : null;

    const enemySnapshot =
      typeof enemies.getSnapshotState === 'function'
        ? enemies.getSnapshotState()
        : typeof enemies.exportState === 'function'
          ? enemies.exportState()
          : null;

    const physicsSnapshot =
      typeof physics.getSnapshotState === 'function'
        ? physics.getSnapshotState()
        : typeof physics.exportState === 'function'
          ? physics.exportState()
          : null;

    const snapshot = {
      player: playerSnapshot,
      progression: progressionSnapshot,
      enemies: enemySnapshot,
      physics: physicsSnapshot,
      timestamp: Date.now(),
      randomSeed: this.gameState?.randomSeed ?? this.seedInfo.seed,
      random: randomSnapshot,
    };

    this.deathSnapshot = snapshot;
    this.randomSnapshot = randomSnapshot;

    if (this.gameState) {
      this.gameState.deathSnapshot = snapshot;
      if (randomSnapshot) {
        this.gameState.randomSnapshot = randomSnapshot;
      }
    }

    console.log('[Retry] Death snapshot created', snapshot);
    return snapshot;
  }

  restoreFromSnapshot({ snapshot } = {}) {
    const payload = snapshot || this.deathSnapshot || this.gameState?.deathSnapshot;

    if (!payload) {
      console.warn('[Retry] No snapshot available');
      return false;
    }

    const player = this.resolveServiceInstance('player');
    const enemies = this.resolveServiceInstance('enemies');
    const physics = this.resolveServiceInstance('physics');
    const progression = this.resolveServiceInstance('progression');

    if (!player || !enemies || !physics || !progression) {
      console.warn('[Retry] Cannot restore snapshot - missing services');
      return false;
    }

    const rngSnapshot =
      payload.random || this.randomSnapshot || this.currentRandomSnapshot || null;

    if (rngSnapshot) {
      this.prepareRandomForScope('snapshot.restore', {
        mode: 'restore',
        snapshot: rngSnapshot
      });
    } else {
      this.prepareRandomForScope('snapshot.restore', { mode: 'reset' });
    }

    let hadFallback = false;

    if (typeof player.reset === 'function') {
      try {
        player.reset();
      } catch (error) {
        console.warn('[Retry] Failed to reset player before restoration:', error);
      }
    }

    if (payload.player) {
      const { maxHealth, health, position, upgrades } = payload.player;

      const hasValidMaxHealth = Number.isFinite(maxHealth) && maxHealth > 0;
      if (hasValidMaxHealth) {
        player.maxHealth = maxHealth;
      }

      if (Array.isArray(upgrades)) {
        player.upgrades = [...upgrades];
      }

      let nextHealth = null;
      if (hasValidMaxHealth) {
        nextHealth = maxHealth;
      } else if (Number.isFinite(health) && health > 0) {
        nextHealth = health;
      }

      if (Number.isFinite(nextHealth)) {
        player.health = nextHealth;
      } else if (Number.isFinite(player.maxHealth) && player.maxHealth > 0) {
        player.health = player.maxHealth;
      }

      if (position && typeof position === 'object') {
        if (!player.position) {
          player.position = { x: 0, y: 0 };
        }

        if (Number.isFinite(position.x)) {
          player.position.x = position.x;
        }

        if (Number.isFinite(position.y)) {
          player.position.y = position.y;
        }
      }
    } else {
      hadFallback = true;
      console.warn('[Retry] Player snapshot missing - player reset to defaults.');
    }

    let progressionRestored = false;
    if (payload.progression && typeof progression.restoreState === 'function') {
      try {
        progressionRestored = progression.restoreState(payload.progression) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to restore progression snapshot:', error);
      }
    } else if (payload.progression && typeof progression.deserialize === 'function') {
      try {
        progression.deserialize(payload.progression, { suppressEvents: false });
        progressionRestored = true;
      } catch (error) {
        console.warn('[Retry] Failed to deserialize progression snapshot:', error);
      }
    }

    if (!progressionRestored) {
      hadFallback = true;
      console.warn('[Retry] Progression snapshot unavailable - performing reset.');
      if (typeof progression.reset === 'function') {
        progression.reset();
      }
    }

    if (progressionRestored) {
      const {
        reapplied: reappliedUpgrades,
        total: totalUpgradeLevels,
        errors: upgradeReapplyErrors
      } = this.reapplyProgressionUpgrades({
        progression,
        snapshot: payload.progression
      });

      if (totalUpgradeLevels > 0) {
        if (upgradeReapplyErrors > 0) {
          hadFallback = true;
          console.warn(
            '[Retry] Failed to fully reapply upgrade effects after restoration.',
            {
              reapplied: reappliedUpgrades,
              total: totalUpgradeLevels,
              errors: upgradeReapplyErrors
            }
          );
        } else {
          console.log(
            '[Retry] Reapplied upgrade effects after snapshot restore:',
            reappliedUpgrades
          );
        }
      }
    }

    let enemiesRestored = false;
    if (payload.enemies && typeof enemies.restoreSnapshotState === 'function') {
      try {
        enemiesRestored = enemies.restoreSnapshotState(payload.enemies) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to restore enemy snapshot:', error);
      }
    } else if (payload.enemies && typeof enemies.importState === 'function') {
      try {
        enemiesRestored = enemies.importState(payload.enemies) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to import enemy snapshot:', error);
      }
    }

    if (!enemiesRestored) {
      hadFallback = true;
      console.warn('[Retry] Enemy snapshot unavailable - performing reset.');
      if (typeof enemies.reset === 'function') {
        enemies.reset();
      }
    }

    let physicsRestored = false;
    if (payload.physics && typeof physics.restoreSnapshotState === 'function') {
      try {
        physicsRestored = physics.restoreSnapshotState(payload.physics) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to restore physics snapshot:', error);
      }
    } else if (payload.physics && typeof physics.importState === 'function') {
      try {
        physicsRestored = physics.importState(payload.physics) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to import physics snapshot:', error);
      }
    }

    if (!physicsRestored) {
      hadFallback = true;
      console.warn('[Retry] Physics snapshot unavailable - performing reset.');
      if (typeof physics.reset === 'function') {
        physics.reset();
      }
    }

    this.deathSnapshot = payload;
    if (payload.random) {
      this.randomSnapshot = payload.random;
      if (this.gameState) {
        this.gameState.randomSnapshot = payload.random;
      }
    }

    if (!hadFallback) {
      console.log('[Retry] Game state restored from snapshot');
    } else {
      console.warn('[Retry] Snapshot restore completed with fallbacks.');
    }

    return true;
  }

  reapplyProgressionUpgrades({ progression, snapshot } = {}) {
    if (!progression || typeof progression.applyUpgradeEffects !== 'function') {
      return { reapplied: 0, total: 0, errors: 0 };
    }

    let entries = [];

    if (Array.isArray(snapshot?.appliedUpgrades)) {
      entries = snapshot.appliedUpgrades
        .map((entry) => {
          if (Array.isArray(entry) && entry.length >= 2) {
            return [entry[0], entry[1]];
          }

          if (entry && typeof entry === 'object') {
            return [entry.id, entry.level];
          }

          return null;
        })
        .filter((entry) => entry && typeof entry[0] === 'string');
    }

    if (entries.length === 0 && typeof progression.getAllUpgrades === 'function') {
      entries = Array.from(progression.getAllUpgrades().entries());
    }

    if (!entries.length) {
      return { reapplied: 0, total: 0, errors: 0 };
    }

    if (typeof progression.refreshInjectedServices === 'function') {
      try {
        progression.refreshInjectedServices(true);
      } catch (error) {
        console.warn('[Retry] Failed to refresh progression services before reapply:', error);
      }
    }

    let reapplied = 0;
    let total = 0;
    let errors = 0;

    const upgradeLookup = progression && progression.upgradeLookup;

    entries.forEach(([upgradeId, level]) => {
      if (!upgradeId || !Number.isFinite(level)) {
        return;
      }

      const normalizedLevel = Math.max(0, Math.floor(level));
      if (normalizedLevel <= 0) {
        return;
      }

      const definition =
        upgradeLookup && typeof upgradeLookup.get === 'function'
          ? upgradeLookup.get(upgradeId)
          : null;
      if (!definition) {
        total += normalizedLevel;
        errors += normalizedLevel;
        console.warn('[Retry] Missing upgrade definition during reapply:', upgradeId);
        return;
      }

      const levels = Array.isArray(definition.levels) ? definition.levels : [];

      for (let index = 0; index < normalizedLevel; index += 1) {
        total += 1;
        const levelDefinition = levels[index];

        if (!levelDefinition) {
          errors += 1;
          console.warn(
            '[Retry] Missing level definition during upgrade reapply:',
            upgradeId,
            'level',
            index + 1
          );
          continue;
        }

        try {
          progression.applyUpgradeEffects(definition, levelDefinition, index + 1);
          reapplied += 1;
        } catch (error) {
          errors += 1;
          console.warn(
            '[Retry] Failed to apply upgrade effect during reapply:',
            upgradeId,
            'level',
            index + 1,
            error
          );
        }
      }
    });

    return { reapplied, total, errors };
  }

  findSafeSpawnPoint() {
    const fallback = {
      x: CONSTANTS.GAME_WIDTH / 2,
      y: CONSTANTS.GAME_HEIGHT / 2
    };

    const enemies = this.resolveServiceInstance('enemies');
    const canvas = this.canvas || this.gameState?.canvas || null;

    if (!enemies || !canvas) {
      return fallback;
    }

    const asteroids =
      typeof enemies.getAsteroids === 'function' ? enemies.getAsteroids() : [];

    const width = Number.isFinite(canvas.width) ? canvas.width : CONSTANTS.GAME_WIDTH;
    const height = Number.isFinite(canvas.height) ? canvas.height : CONSTANTS.GAME_HEIGHT;

    const safeDistance =
      CONSTANTS.PLAYER_SAFE_SPAWN_DISTANCE ??
      CONSTANTS.DEFAULT_SAFE_SPAWN_DISTANCE ??
      300;

    const center = { x: width / 2, y: height / 2 };

    const isSafe = (point) =>
      asteroids.every((ast) => {
        if (!ast) {
          return true;
        }

        const ax = Number.isFinite(ast.x) ? ast.x : Number(ast.position?.x);
        const ay = Number.isFinite(ast.y) ? ast.y : Number(ast.position?.y);

        if (!Number.isFinite(ax) || !Number.isFinite(ay)) {
          return true;
        }

        const dx = ax - point.x;
        const dy = ay - point.y;
        return Math.hypot(dx, dy) > safeDistance;
      });

    if (isSafe(center)) {
      return center;
    }

    const quadrants = [
      { x: width * 0.25, y: height * 0.25 },
      { x: width * 0.75, y: height * 0.25 },
      { x: width * 0.25, y: height * 0.75 },
      { x: width * 0.75, y: height * 0.75 }
    ];

    for (let index = 0; index < quadrants.length; index += 1) {
      if (isSafe(quadrants[index])) {
        return quadrants[index];
      }
    }

    return center;
  }

  resetForMenu() {
    this.clearRetryCountdownTimers();
    this.isRetryCountdownActive = false;
    this.hideRetryCountdown();
    this.setRetryCount(0);
    this.setRetryButtonEnabled(false);
    this.clearDeathSnapshot();

    if (this.gameState) {
      this.gameState.randomScope = 'menu';
    }
  }

  /**
   * Normalizes arbitrary seed inputs into deterministic values.
   * @param {*} value
   * @returns {*|null}
   */
  static parseSeedCandidate(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    return trimmed;
  }

  /**
   * Derives the initial seed and its provenance.
   * @returns {{ seed: *, source: string }}
   */
  static deriveInitialSeed() {
    let source = 'crypto';
    let seed = null;

    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get('seed');
        const parsedUrlSeed = GameSessionService.parseSeedCandidate(fromUrl);
        if (parsedUrlSeed !== null) {
          source = 'url';
          seed = parsedUrlSeed;
          return { seed, source };
        }
      } catch (error) {
        console.warn('[Random] Failed to parse seed from URL:', error);
      }

      try {
        const storage = window.localStorage;
        if (storage) {
          const override = storage.getItem(RANDOM_STORAGE_KEYS.override);
          const parsedOverride = GameSessionService.parseSeedCandidate(override);
          if (parsedOverride !== null) {
            source = 'localStorage';
            seed = parsedOverride;
            return { seed, source };
          }
        }
      } catch (error) {
        console.warn('[Random] Failed to read seed override from localStorage:', error);
      }

      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        const buffer = new Uint32Array(1);
        window.crypto.getRandomValues(buffer);
        seed = buffer[0];
        return { seed, source };
      }
    }

    source = 'math-random';
    seed = Math.floor(Math.random() * 0xffffffff);
    return { seed, source };
  }

  /**
   * Persists the latest seed snapshot to localStorage for diagnostics.
   * @param {*} seed
   * @param {string} source
   */
  static persistLastSeed(seed, source) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(
        RANDOM_STORAGE_KEYS.last,
        JSON.stringify({
          seed: typeof seed === 'number' ? seed : String(seed),
          source: source || 'unknown',
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.warn('[Random] Failed to persist last seed snapshot:', error);
    }
  }

  /**
   * Outputs a formatted snapshot log message.
   * @param {string} scope
   * @param {Object|null} snapshot
   * @param {Object} [options]
   * @param {string} [options.mode='reset']
   */
  static logRandomSnapshot(scope, snapshot, { mode = 'reset' } = {}) {
    if (!snapshot) {
      return;
    }

    const { seed, state } = snapshot;
    const stateHex =
      typeof state === 'number' ? `0x${state.toString(16).padStart(8, '0')}` : state;
    console.log(`[Random] ${scope} (${mode}) → seed=${seed} state=${stateHex}`);
  }
}
