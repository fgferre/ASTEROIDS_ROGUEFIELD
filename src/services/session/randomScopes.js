// src/services/session/randomScopes.js
//
// The session's seeded RNG: the boot seed and where it came from (URL,
// localStorage override, crypto, clock), and each deterministic scope (run
// start, retry, menu exit) the RNG is reset or restored for. Scope labels and
// their order are part of replays and of the seeded run.

import { debugLog } from '../../core/debugLogging.js';

const RANDOM_STORAGE_KEYS = {
  override: 'roguefield.seedOverride',
  last: 'roguefield.lastSeed',
};

/**
 * Normalizes arbitrary seed inputs into deterministic values.
 * @param {*} value
 * @returns {*|null}
 */
export function parseSeedCandidate(value) {
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
export function deriveInitialSeed() {
  let source = 'crypto';
  let seed = null;

  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('seed');
      const parsedUrlSeed = parseSeedCandidate(fromUrl);
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
        const parsedOverride = parseSeedCandidate(override);
        if (parsedOverride !== null) {
          source = 'localStorage';
          seed = parsedOverride;
          return { seed, source };
        }
      }
    } catch (error) {
      console.warn(
        '[Random] Failed to read seed override from localStorage:',
        error
      );
    }

    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      seed = buffer[0];
      return { seed, source };
    }
  }

  source = 'clock';
  seed = Date.now() >>> 0;
  return { seed, source };
}

/**
 * Persists the latest seed snapshot to localStorage for diagnostics.
 * @param {*} seed
 * @param {string} source
 */
export function persistLastSeed(seed, source) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(
      RANDOM_STORAGE_KEYS.last,
      JSON.stringify({
        seed: typeof seed === 'number' ? seed : String(seed),
        source: source || 'unknown',
        timestamp: Date.now(),
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
export function logRandomSnapshot(scope, snapshot, { mode = 'reset' } = {}) {
  if (!snapshot) {
    return;
  }

  const { seed, state } = snapshot;
  const stateHex =
    typeof state === 'number'
      ? `0x${state.toString(16).padStart(8, '0')}`
      : state;
  debugLog(`[Random] ${scope} (${mode}) → seed=${seed} state=${stateHex}`);
}

export class RandomScopes {
  /**
   * `random`: the seeded random service.
   * `gameState`: the raw game state; mirrors the snapshot and scope.
   * `audio()`: the audio service, or none; its RNG forks follow every scope.
   */
  constructor({ random, gameState, audio }) {
    this.random = random;
    this.gameState = gameState;
    this.audio = audio;
    this.seedInfo = {
      seed: null,
      source: 'unknown',
    };
    this.currentRandomSnapshot = null;
    this.currentRandomScope = 'uninitialized';
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
    const audio = this.audio();

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
   * Prepares the seeded RNG for a deterministic scope.
   * @param {string} scope
   * @param {Object} [options]
   * @param {string} [options.mode='reset']
   * @param {Object} [options.snapshot]
   * @returns {Object|null}
   */
  prepareRandomForScope(scope, { mode = 'reset', snapshot } = {}) {
    if (!this.random || typeof this.random.serialize !== 'function') {
      console.warn(
        `[Random] Cannot prepare RNG for scope "${scope}" - service unavailable.`
      );
      return null;
    }

    const seed = this.gameState?.randomSeed ?? this.seedInfo.seed;
    let effectiveMode = mode;

    if (effectiveMode === 'restore' && snapshot) {
      try {
        this.random.restore(snapshot);
      } catch (error) {
        console.warn(
          `[Random] Failed to restore RNG snapshot for scope "${scope}":`,
          error
        );
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

    logRandomSnapshot(scope, currentSnapshot, { mode: effectiveMode });
    return this.random;
  }
}
