// src/modules/enemies/systems/EnemyRandomScopes.js
// EnemySystem's random scopes: the spawn/variants/fragments forks, the forks
// asked for by name (wave-manager, enemy-rewards, ...), their seeds and the
// per-scope sequence counters.
import RandomService from '../../../core/RandomService.js';
import { resolveService } from '../../../core/serviceUtils.js';

export class EnemyRandomScopes {
  /**
   * @param {object} kit
   * @param {object} kit.dependencies EnemySystem's dependency map.
   * @param {() => object|null} kit.getRandom EnemySystem's random service.
   * @param {(random: object) => void} kit.setRandom
   * @param {() => object|null} kit.getWaveManager
   * @param {() => object|null} kit.getRewardManager
   */
  constructor({
    dependencies,
    getRandom,
    setRandom,
    getWaveManager,
    getRewardManager,
  }) {
    this.dependencies = dependencies;
    this._getRandom = getRandom;
    this._setRandom = setRandom;
    this._getWaveManager = getWaveManager;
    this._getRewardManager = getRewardManager;

    this.randomScopes = null;
    this.randomSequences = null;
    this.randomScopeSeeds = {};
    this.randomScopeLabels = {
      spawn: 'enemy-system:spawn',
      variants: 'enemy-system:variants',
      fragments: 'enemy-system:fragments',
    };
    this._fallbackRandom = null;
  }

  get random() {
    return this._getRandom();
  }

  set random(randomService) {
    this._setRandom(randomService);
  }

  get waveManager() {
    return this._getWaveManager();
  }

  get rewardManager() {
    return this._getRewardManager();
  }

  // Forced refreshes (resets, wave starts, attach*) reseed the random scopes.
  refreshServiceState({ force = false } = {}) {
    this.setupRandomGenerators();

    if (force) {
      this.reseedRandomScopes({ resetSequences: true });
    }
  }

  setupRandomGenerators() {
    let randomService = this.random || this.dependencies.random;

    if (!randomService) {
      randomService = resolveService('random', this.dependencies);
      if (randomService) {
        this.dependencies.random = randomService;
        this.random = randomService;
      }
    }

    if (!randomService) {
      if (!this._fallbackRandom) {
        this._fallbackRandom = new RandomService('enemy-system:fallback');
      }
      randomService = this._fallbackRandom;
      this.random = randomService;
    }

    if (this.randomScopes && this.randomScopes.base === randomService) {
      if (!this.randomSequences) {
        this.randomSequences = { spawn: 0, variants: 0, fragments: 0 };
      }
      return;
    }

    this.randomScopes = {
      base: randomService,
      spawn: randomService.fork(this.randomScopeLabels.spawn),
      variants: randomService.fork(this.randomScopeLabels.variants),
      fragments: randomService.fork(this.randomScopeLabels.fragments),
    };

    this.captureRandomScopeSeeds();

    this.randomSequences = {
      spawn: 0,
      variants: 0,
      fragments: 0,
    };
  }

  getRandomService() {
    this.setupRandomGenerators();
    return this.randomScopes?.base || this._fallbackRandom || null;
  }

  getRandomScope(scope, { parentScope = 'base', label } = {}) {
    this.setupRandomGenerators();

    if (!this.randomScopes) {
      return null;
    }

    if (this.randomScopes[scope]) {
      return this.randomScopes[scope];
    }

    const forkLabel = label || `enemy-system:${scope}`;
    const parent = this.randomScopes[parentScope] || this.randomScopes.base;
    if (parent && typeof parent.fork === 'function') {
      const forked = parent.fork(forkLabel);
      this.randomScopes[scope] = forked;
      this.registerRandomScopeLabel(scope, forkLabel);
      this.captureRandomScopeSeed(scope, forked);
      if (!this.randomSequences) {
        this.randomSequences = {};
      }
      if (this.randomSequences[scope] === undefined) {
        this.randomSequences[scope] = 0;
      }
      return forked;
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService('enemy-system:fallback');
    }

    const fallbackFork = this._fallbackRandom.fork(forkLabel);
    this.randomScopes[scope] = fallbackFork;
    this.registerRandomScopeLabel(scope, forkLabel);
    this.captureRandomScopeSeed(scope, fallbackFork);
    if (!this.randomSequences) {
      this.randomSequences = {};
    }
    if (this.randomSequences[scope] === undefined) {
      this.randomSequences[scope] = 0;
    }

    return this.randomScopes[scope];
  }

  nextRandomSequence(scope) {
    if (!this.randomSequences) {
      this.randomSequences = {};
    }

    if (typeof this.randomSequences[scope] !== 'number') {
      this.randomSequences[scope] = 0;
    }

    const sequence = this.randomSequences[scope];
    this.randomSequences[scope] += 1;
    return sequence;
  }

  createScopedRandom(scope = 'spawn', label = scope) {
    const generator = this.getRandomScope(scope);
    const sequence = this.nextRandomSequence(scope);

    if (generator && typeof generator.fork === 'function') {
      return {
        random: generator.fork(`enemy-system:${label}:${sequence}`),
        sequence,
      };
    }

    const fallbackBase =
      this.getRandomService() ||
      this._fallbackRandom ||
      new RandomService('enemy-system:fallback');
    return {
      random:
        typeof fallbackBase.fork === 'function'
          ? fallbackBase.fork(`enemy-system:${label}:${sequence}:fallback`)
          : fallbackBase,
      sequence,
    };
  }

  registerRandomScopeLabel(scope, label) {
    if (!this.randomScopeLabels) {
      this.randomScopeLabels = {};
    }

    if (label) {
      this.randomScopeLabels[scope] = label;
    }
  }

  captureRandomScopeSeed(scope, generator) {
    if (!generator || typeof generator.seed !== 'number') {
      return;
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
    }

    this.randomScopeSeeds[scope] = generator.seed >>> 0;
  }

  captureRandomScopeSeeds(scopes = this.randomScopes) {
    if (!scopes) {
      return;
    }

    Object.entries(scopes).forEach(([scope, generator]) => {
      this.captureRandomScopeSeed(scope, generator);
    });
  }

  reseedRandomScopes({ resetSequences = false } = {}) {
    if (!this.randomScopes) {
      return;
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
      this.captureRandomScopeSeeds();
    }

    Object.entries(this.randomScopes).forEach(([scope, generator]) => {
      if (
        scope === 'base' ||
        !generator ||
        typeof generator.reset !== 'function'
      ) {
        return;
      }

      const storedSeed = this.randomScopeSeeds?.[scope];
      if (storedSeed !== undefined) {
        generator.reset(storedSeed);
      }
    });

    if (resetSequences && this.randomSequences) {
      Object.keys(this.randomSequences).forEach((scope) => {
        this.randomSequences[scope] = 0;
      });
    }

    // Managers are built after the first (constructor) reseed.
    if (this.waveManager) {
      this.waveManager.reseedRandomScopes({ resetSequences });
    }

    if (this.rewardManager) {
      const rewardRandom = this.randomScopes?.['enemy-rewards'];
      this.rewardManager.reseedRandom(rewardRandom);
    }
  }

  captureRandomSnapshot() {
    const base = this.getRandomService();
    const baseSeed =
      base && typeof base.seed === 'number' ? base.seed >>> 0 : null;

    return {
      baseSeed,
      scopeSeeds: this.randomScopeSeeds ? { ...this.randomScopeSeeds } : null,
      sequences: this.randomSequences ? { ...this.randomSequences } : null,
    };
  }

  restoreRandomFromSnapshot(snapshot) {
    this.setupRandomGenerators();

    const base = this.getRandomService();
    if (base && typeof snapshot?.baseSeed === 'number') {
      if (typeof base.reset === 'function') {
        base.reset(snapshot.baseSeed);
      } else {
        base.seed = snapshot.baseSeed >>> 0;
      }
    }

    if (snapshot?.scopeSeeds && typeof snapshot.scopeSeeds === 'object') {
      this.randomScopeSeeds = { ...snapshot.scopeSeeds };
      this.reseedRandomScopes({ resetSequences: false });
    } else {
      this.reseedRandomScopes({ resetSequences: true });
    }

    if (snapshot?.sequences && typeof snapshot.sequences === 'object') {
      this.randomSequences = { ...snapshot.sequences };
    }
  }
}
