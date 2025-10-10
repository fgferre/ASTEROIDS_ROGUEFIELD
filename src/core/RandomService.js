const UINT32_MAX = 0xffffffff;
const UINT32_FACTOR = 1 / (UINT32_MAX + 1);
const SEED_HISTORY_LIMIT = 10;

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // Force to 32 bits
  }
  return hash >>> 0;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export default class RandomService {
  constructor(seed = Date.now()) {
    this._stats = {
      calls: {
        reset: 0,
        float: 0,
        int: 0,
        range: 0,
        chance: 0,
        pick: 0,
        weightedPick: 0,
        uuid: 0,
        fork: 0,
        serialize: 0,
        restore: 0,
      },
      seeds: {
        initial: null,
        current: null,
        history: [],
        forks: {},
      },
    };

    this.reset(seed);
  }

  _normalizeSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      return seed >>> 0;
    }

    if (typeof seed === 'string') {
      return hashString(seed);
    }

    if (typeof seed === 'bigint') {
      return Number(seed & BigInt(UINT32_MAX));
    }

    throw new TypeError(`Unsupported seed type: ${typeof seed}`);
  }

  _recordCall(method) {
    if (this._stats.calls[method] !== undefined) {
      this._stats.calls[method] += 1;
    }
  }

  _pushSeedHistory(seed) {
    const history = this._stats.seeds.history;
    history.push(seed);
    if (history.length > SEED_HISTORY_LIMIT) {
      history.shift();
    }
  }

  _nextUint32() {
    // Mulberry32 algorithm
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  reset(seed = this.seed) {
    this._recordCall('reset');
    const normalized = this._normalizeSeed(seed);
    this.seed = normalized;
    this._state = normalized >>> 0;

    if (this._stats.seeds.initial === null) {
      this._stats.seeds.initial = normalized;
    }

    this._stats.seeds.current = normalized;
    this._pushSeedHistory(normalized);
    return normalized;
  }

  float() {
    this._recordCall('float');
    return this._nextUint32() * UINT32_FACTOR;
  }

  int(min, max) {
    this._recordCall('int');
    if (typeof min !== 'number' || typeof max !== 'number') {
      throw new TypeError('int(min, max) expects numeric bounds');
    }
    let low = min;
    let high = max;
    if (high < low) {
      [low, high] = [high, low];
    }
    const span = high - low + 1;
    const value = Math.floor(this._nextUint32() * (span * UINT32_FACTOR));
    return low + value;
  }

  range(min, max) {
    this._recordCall('range');
    if (typeof min !== 'number' || typeof max !== 'number') {
      throw new TypeError('range(min, max) expects numeric bounds');
    }
    if (max === min) {
      return min;
    }
    const [low, high] = max > min ? [min, max] : [max, min];
    return low + (high - low) * this.float();
  }

  chance(probability) {
    this._recordCall('chance');
    if (typeof probability !== 'number') {
      throw new TypeError('chance(probability) expects a number');
    }
    if (probability <= 0) {
      return false;
    }
    if (probability >= 1) {
      return true;
    }
    return this.float() < probability;
  }

  pick(array) {
    this._recordCall('pick');
    if (!Array.isArray(array)) {
      throw new TypeError('pick(array) expects an array');
    }
    if (array.length === 0) {
      return undefined;
    }
    const index = this.int(0, array.length - 1);
    return array[index];
  }

  weightedPick(weights) {
    this._recordCall('weightedPick');
    let entries;

    if (weights instanceof Map) {
      entries = Array.from(weights.entries()).map(([value, weight]) => ({
        value,
        weight,
      }));
    } else if (Array.isArray(weights)) {
      entries = weights.map((item, index) => {
        if (Array.isArray(item)) {
          const [value, weight] = item;
          return { value, weight };
        }
        if (isPlainObject(item)) {
          const { value, weight } = item;
          return { value, weight };
        }
        return { value: item, weight: 1 };
      });
    } else if (isPlainObject(weights)) {
      entries = Object.entries(weights).map(([value, weight]) => ({
        value,
        weight,
      }));
    } else {
      throw new TypeError('weightedPick expects a Map, array, or object');
    }

    const total = entries.reduce((sum, { weight }) => sum + (Number(weight) || 0), 0);
    if (!Number.isFinite(total) || total <= 0) {
      return undefined;
    }

    let threshold = this.range(0, total);
    for (const { value, weight } of entries) {
      const w = Number(weight) || 0;
      if (w <= 0) {
        continue;
      }
      if (threshold < w) {
        return value;
      }
      threshold -= w;
    }
    return entries[entries.length - 1]?.value;
  }

  uuid(scope = 'global') {
    this._recordCall('uuid');
    const prefix = String(scope ?? 'global');
    const segment = () => this._nextUint32().toString(16).padStart(8, '0');
    const partA = segment();
    const partB = segment();
    return `${prefix}-${partA.slice(0, 8)}-${partB.slice(0, 8)}`;
  }

  fork(scopeOrSeed) {
    this._recordCall('fork');
    let derivedSeed;
    let scopeLabel = 'fork';

    if (scopeOrSeed === undefined) {
      derivedSeed = this._nextUint32();
    } else if (typeof scopeOrSeed === 'number' || typeof scopeOrSeed === 'bigint') {
      derivedSeed = this._normalizeSeed(scopeOrSeed);
      scopeLabel = `seed:${String(scopeOrSeed)}`;
    } else {
      scopeLabel = `scope:${String(scopeOrSeed)}`;
      const scopeSeed = this._normalizeSeed(String(scopeOrSeed));
      derivedSeed = this._nextUint32() ^ scopeSeed;
    }

    const normalizedDerived = derivedSeed >>> 0;
    this._stats.seeds.forks[scopeLabel] = normalizedDerived;
    this._pushSeedHistory(normalizedDerived);

    return new RandomService(normalizedDerived);
  }

  serialize() {
    this._recordCall('serialize');
    return {
      seed: this.seed >>> 0,
      state: this._state >>> 0,
      stats: JSON.parse(JSON.stringify(this._stats)),
    };
  }

  restore(snapshot) {
    this._recordCall('restore');
    if (!snapshot || typeof snapshot !== 'object') {
      throw new TypeError('restore(snapshot) expects an object');
    }
    const { seed, state, stats } = snapshot;
    if (typeof seed !== 'number' || typeof state !== 'number') {
      throw new TypeError('Invalid snapshot payload');
    }

    this.seed = seed >>> 0;
    this._state = state >>> 0;
    if (stats) {
      this._stats = JSON.parse(JSON.stringify(stats));
    } else {
      this._stats.seeds.current = this.seed;
      this._pushSeedHistory(this.seed);
    }
  }

  debugSnapshot() {
    return {
      seed: this.seed >>> 0,
      state: this._state >>> 0,
      stats: JSON.parse(JSON.stringify(this._stats)),
    };
  }
}
