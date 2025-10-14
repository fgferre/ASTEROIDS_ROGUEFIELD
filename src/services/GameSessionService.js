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

    this.retryCountdownElement = this.lookupDomElement('retry-countdown');
    this.retryButtonElement = this.lookupDomElement('retry-game-btn');
    this.retryCountElement = this.lookupDomElement('retry-count');
    this.retryCountdownHideTimeout = null;
    this.retryCountdownFollowupTimeout = null;

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
   * @param {HTMLCanvasElement} [options.canvas]
   * @param {CanvasRenderingContext2D} [options.ctx]
   */
  initialize({ seed, source, canvas, ctx } = {}) {
    if (typeof seed !== 'undefined') {
      this.seedInfo.seed = seed;
      if (this.gameState) {
        this.gameState.randomSeed = seed;
      }
    }

    if (typeof source === 'string') {
      this.seedInfo.source = source;
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

    GameSessionService.persistLastSeed(this.seedInfo.seed, this.seedInfo.source);
    console.log(`[Random] Boot seed (${this.seedInfo.source}): ${String(this.seedInfo.seed)}`);
  }

  /**
   * Indicates whether the session is currently paused.
   * @returns {boolean}
   */
  isPaused() {
    return Boolean(this.gameState?.isPaused);
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
