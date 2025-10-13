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
