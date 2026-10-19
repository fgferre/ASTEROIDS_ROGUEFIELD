// AudioSystem's seeded RNG scopes: one fork per sound family plus the
// cache/batcher forks and their noise-buffer forks, created without moving the
// base RNG; capture records their seeds, reseed rewinds them for a new run or a
// replay. The facade keeps `random` and `randomScopes`; these read and write
// them (and the cache/batcher instances, through the facade's accessors).
import { IS_DEV } from '../../core/env.js';

export function createRandomScopes(baseRandom) {
  const canFork = baseRandom && typeof baseRandom.fork === 'function';
  if (!canFork) {
    return {
      base: baseRandom,
      cache: null,
      families: {},
      bufferFamilies: {},
      batcher: null,
    };
  }

  const supportsSnapshot =
    typeof baseRandom?.debugSnapshot === 'function' &&
    typeof baseRandom?.restore === 'function';
  const snapshot = supportsSnapshot ? baseRandom.debugSnapshot() : null;

  let families = {};
  let cacheRandom = null;
  let bufferFamilies = {};
  let batcherRandom = null;

  try {
    families = {
      laser: baseRandom.fork('audio:family:laser'),
      explosion: baseRandom.fork('audio:family:explosion'),
      shield: baseRandom.fork('audio:family:shield'),
      asteroid: baseRandom.fork('audio:family:asteroid'),
      xp: baseRandom.fork('audio:family:xp'),
      impact: baseRandom.fork('audio:family:impact'),
      music: baseRandom.fork('audio:family:music'),
      ui: baseRandom.fork('audio:family:ui'),
      uiHover: baseRandom.fork('audio:family:ui:hover'),
      uiSelect: baseRandom.fork('audio:family:ui:select'),
      uiStartGame: baseRandom.fork('audio:family:ui:startgame'),
      thruster: baseRandom.fork('audio:family:thruster'),
      thrusterMain: baseRandom.fork('audio:family:thruster:main'),
      thrusterRetro: baseRandom.fork('audio:family:thruster:retro'),
      thrusterSide: baseRandom.fork('audio:family:thruster:side'),
    };

    cacheRandom = baseRandom.fork('audio:cache');
    batcherRandom = baseRandom.fork('audio:batcher');

    bufferFamilies = Object.fromEntries(
      Object.entries({
        ...families,
        generic: cacheRandom,
      }).map(([name, rng]) => [
        name,
        rng && typeof rng.fork === 'function'
          ? rng.fork(`audio:buffer:${name}`)
          : null,
      ])
    );
  } finally {
    if (snapshot) {
      try {
        baseRandom.restore(snapshot);
      } catch (error) {
        console.warn(
          '[Audio] Failed to restore base RNG state after creating audio scopes:',
          error
        );
      }
    }
  }

  return {
    base: baseRandom,
    cache: cacheRandom,
    families,
    bufferFamilies,
    batcher: batcherRandom,
  };
}

export function captureRandomScopes(audio, { refreshForks = false } = {}) {
  if (!audio.random) {
    return null;
  }

  if (!audio.randomScopes || refreshForks) {
    const refreshed = createRandomScopes(audio.random);
    audio.randomScopes = {
      ...refreshed,
      seeds: audio.randomScopes?.seeds ?? null,
      cacheSnapshot: audio.randomScopes?.cacheSnapshot ?? null,
      batcherSnapshot: audio.randomScopes?.batcherSnapshot ?? null,
    };
  }

  if (refreshForks) {
    if (audio.cache) {
      audio.cache.random = audio.randomScopes.cache;
      if (typeof audio.cache.clearCache === 'function') {
        audio.cache.clearCache('all');
      }
      if (typeof audio.cache.resetStats === 'function') {
        audio.cache.resetStats();
      }
    }

    if (audio.batcher) {
      audio.batcher.random = audio.randomScopes.batcher;
      if (typeof audio.batcher._initializeRandomForks === 'function') {
        audio.batcher.randomForks = audio.batcher._initializeRandomForks(
          audio.randomScopes.batcher
        );
      }
      if (typeof audio.batcher.resetStats === 'function') {
        audio.batcher.resetStats();
      }
    }
  }

  const seeds = {
    base:
      typeof audio.random.seed === 'number' ? audio.random.seed >>> 0 : null,
    cache:
      audio.randomScopes?.cache &&
      typeof audio.randomScopes.cache.seed === 'number'
        ? audio.randomScopes.cache.seed >>> 0
        : null,
    batcher:
      audio.randomScopes?.batcher &&
      typeof audio.randomScopes.batcher.seed === 'number'
        ? audio.randomScopes.batcher.seed >>> 0
        : null,
    families: {},
    bufferFamilies: {},
  };

  Object.entries(audio.randomScopes?.families || {}).forEach(([name, rng]) => {
    seeds.families[name] =
      rng && typeof rng.seed === 'number' ? rng.seed >>> 0 : null;
  });

  Object.entries(audio.randomScopes?.bufferFamilies || {}).forEach(
    ([name, rng]) => {
      seeds.bufferFamilies[name] =
        rng && typeof rng.seed === 'number' ? rng.seed >>> 0 : null;
    }
  );

  audio.randomScopes.seeds = seeds;

  if (audio.cache && typeof audio.cache.captureNoiseSeeds === 'function') {
    audio.randomScopes.cacheSnapshot = audio.cache.captureNoiseSeeds();
  }

  if (
    audio.batcher &&
    typeof audio.batcher.captureRandomForkSeeds === 'function'
  ) {
    audio.randomScopes.batcherSnapshot = audio.batcher.captureRandomForkSeeds();
  }

  audio._exposeRandomDebugControls();
  return { ...seeds };
}

export function reseedRandomScopes(audio, { refreshForks = false } = {}) {
  if (!audio.random) {
    return null;
  }

  if (!audio.randomScopes || refreshForks) {
    audio.captureRandomScopes({ refreshForks: true });
  }

  if (!audio.randomScopes?.seeds) {
    audio.captureRandomScopes();
  }

  const seeds = audio.randomScopes?.seeds;
  if (!seeds) {
    return null;
  }

  const applySeed = (rng, seed) => {
    if (rng && typeof rng.reset === 'function' && typeof seed === 'number') {
      rng.reset(seed);
    }
  };

  const canPreserveBaseState =
    typeof audio.random?.debugSnapshot === 'function' &&
    typeof audio.random?.restore === 'function';
  const baseSnapshot = canPreserveBaseState
    ? audio.random.debugSnapshot()
    : null;

  try {
    applySeed(audio.randomScopes?.cache, seeds.cache);
    applySeed(audio.randomScopes?.batcher, seeds.batcher);

    Object.entries(audio.randomScopes?.families || {}).forEach(
      ([name, rng]) => {
        applySeed(rng, seeds.families?.[name]);
      }
    );

    Object.entries(audio.randomScopes?.bufferFamilies || {}).forEach(
      ([name, rng]) => {
        applySeed(rng, seeds.bufferFamilies?.[name]);
      }
    );

    if (audio.cache) {
      audio.cache.random = audio.randomScopes?.cache || audio.cache.random;
      if (typeof audio.cache.reseedNoiseGenerators === 'function') {
        audio.cache.reseedNoiseGenerators(audio.randomScopes?.cacheSnapshot);
      }
    }

    if (audio.batcher) {
      audio.batcher.random =
        audio.randomScopes?.batcher || audio.batcher.random;
      if (
        refreshForks &&
        typeof audio.batcher._initializeRandomForks === 'function'
      ) {
        audio.batcher.randomForks = audio.batcher._initializeRandomForks(
          audio.batcher.random
        );
      }
      if (typeof audio.batcher.reseedRandomForks === 'function') {
        audio.batcher.reseedRandomForks();
      }
    }
  } finally {
    if (baseSnapshot) {
      try {
        audio.random.restore(baseSnapshot);
      } catch (error) {
        console.warn(
          '[Audio] Failed to restore base RNG state after reseeding audio scopes:',
          error
        );
      }
    }
  }

  audio.captureRandomScopes();
  return { ...seeds };
}

// INFRA-03: the window.__AUDIO_RANDOM_DEBUG__ global exposes internal RNG state
// (Information Disclosure) and must NOT cross into production builds. Defense in
// depth: (1) the build-time `__AUDIO_DEBUG_BUILD__` define (false in prod) lets
// Vite dead-code-eliminate this whole body — the assignment STRING is removed,
// not just unreachable; (2) the runtime `!IS_DEV` gate below is a second layer.
// The gate is the RUNTIME-reachability CI test (tests/process/no-dev-globals.test.js),
// NOT a dist string grep — the minified string survives behind a dead gate, so a
// grep is a false positive (see 02-RESEARCH Pitfall 3). The `typeof` guard keeps
// non-Vite execution (e.g. vitest module eval) from a ReferenceError on the define.
export function exposeRandomDebugControls(audio) {
  // Build-time gate (layer 1): in prod the define folds to `if (false) { ... }`
  // and Vite drops the entire block, removing the window.__AUDIO_RANDOM_DEBUG__
  // assignment STRING from the bundle. The `typeof` guard means a non-Vite eval
  // (no define) treats it as truthy and falls through to the runtime gate.
  if (typeof __AUDIO_DEBUG_BUILD__ === 'undefined' || __AUDIO_DEBUG_BUILD__) {
    // Runtime gate (layer 2): even in dev/test the global is only exposed in a
    // real dev environment with a window present.
    if (typeof window === 'undefined' || !IS_DEV) {
      return;
    }

    const debugData = {
      seed: audio.random?.seed ?? null,
      debugSnapshot: () => audio.random?.debugSnapshot(),
      forks: {},
      seeds: audio.randomScopes?.seeds || null,
    };

    Object.entries(audio.randomScopes?.families || {}).forEach(
      ([name, rng]) => {
        debugData.forks[name] = {
          seed: rng?.seed ?? null,
          debugSnapshot: () => rng?.debugSnapshot(),
        };
      }
    );

    if (!debugData.forks.cache && audio.randomScopes?.cache) {
      debugData.forks.cache = {
        seed: audio.randomScopes.cache.seed ?? null,
        debugSnapshot: () => audio.randomScopes.cache.debugSnapshot(),
      };
    }

    window.__AUDIO_RANDOM_DEBUG__ = debugData;
  }
}

export function clearRandomDebugControls() {
  if (typeof window === 'undefined') {
    return;
  }

  delete window.__AUDIO_RANDOM_DEBUG__;
}
