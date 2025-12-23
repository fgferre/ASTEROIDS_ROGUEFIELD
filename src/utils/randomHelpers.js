import RandomService from '../core/RandomService.js';

function assertGetRandomFork(getRandomFork) {
  if (typeof getRandomFork !== 'function') {
    throw new TypeError(
      'createRandomHelpers requires a getRandomFork function'
    );
  }
}

export function createRandomHelpers({
  getRandomFork,
  random = null,
  fallbackSeedPrefix = 'random-helper',
} = {}) {
  assertGetRandomFork(getRandomFork);

  let fallbackRandom = null;
  const fallbackForks = new Map();

  function resolveFallbackBase() {
    if (!fallbackRandom) {
      if (random && typeof random.fork === 'function') {
        fallbackRandom = random.fork(`${fallbackSeedPrefix}:fallback-base`);
      } else {
        fallbackRandom = new RandomService(
          `${fallbackSeedPrefix}:fallback-base`
        );
      }
    }
    return fallbackRandom;
  }

  function ensureRandom(name = 'base') {
    const fork = getRandomFork(name);
    if (fork && typeof fork.float === 'function') {
      return fork;
    }

    if (!fallbackForks.has(name)) {
      const base = resolveFallbackBase();
      const source =
        random && typeof random.fork === 'function'
          ? random.fork(`${fallbackSeedPrefix}:fallback:${name}`)
          : base.fork(`${fallbackSeedPrefix}:fallback:${name}`);
      fallbackForks.set(name, source);
    }

    return fallbackForks.get(name);
  }

  function getFork(name = 'base') {
    const fork = getRandomFork(name);
    return fork && typeof fork.float === 'function' ? fork : null;
  }

  function randomFloat(name = 'base') {
    return ensureRandom(name).float();
  }

  function randomRange(min, max, name = 'base') {
    const fork = getFork(name);
    if (fork && typeof fork.range === 'function') {
      return fork.range(min, max);
    }

    const start = Number.isFinite(min) ? min : 0;
    const end = Number.isFinite(max) ? max : start;

    if (end === start) {
      return start;
    }

    const low = Math.min(start, end);
    const high = Math.max(start, end);
    return low + randomFloat(name) * (high - low);
  }

  function randomInt(min, max, name = 'base') {
    const fork = getFork(name);
    if (fork && typeof fork.int === 'function') {
      return fork.int(min, max);
    }

    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + Math.floor((high - low + 1) * randomFloat(name));
  }

  function randomChance(probability, name = 'base') {
    if (probability <= 0) {
      return false;
    }

    if (probability >= 1) {
      return true;
    }

    const fork = getFork(name);
    if (fork && typeof fork.chance === 'function') {
      return fork.chance(probability);
    }

    return randomFloat(name) < probability;
  }

  function randomCentered(span = 1, name = 'base') {
    return (randomFloat(name) - 0.5) * span;
  }

  function randomPick(array, name = 'base') {
    if (!Array.isArray(array) || array.length === 0) {
      return undefined;
    }

    const fork = getFork(name);
    if (fork && typeof fork.pick === 'function') {
      return fork.pick(array);
    }

    return array[randomInt(0, array.length - 1, name)];
  }

  const helpers = {
    ensureRandom,
    randomFloat,
    randomRange,
    randomInt,
    randomChance,
    randomCentered,
    randomPick,
  };

  const boundHelpers = {};
  Object.entries(helpers).forEach(([key, fn]) => {
    if (typeof fn === 'function') {
      boundHelpers[key] = fn.bind(null);
    }
  });

  return Object.freeze(boundHelpers);
}

