/**
 * Wave random scopes
 *
 * The WaveManager's random streams: spawn, variants and fragments forked from
 * one base, a sequence per scope so each fork gets its own label, and the
 * seeds that put them back (reseedRandomScopes).
 */

import RandomService from '../../../core/RandomService.js';

export class WaveRandom {
  /**
   * @param {Object} random - The WaveManager's base random service
   */
  constructor(random) {
    this.random = random;
    this.randomScopeLabels = {
      spawn: 'wave-manager:spawn',
      variants: 'wave-manager:variants',
      fragments: 'wave-manager:fragments',
    };
    this.randomScopeSeeds = {};
    this.randomScopes = this.createRandomScopes(this.random);
    this.randomSequences = { spawn: 0, variants: 0, fragments: 0 };
    this._fallbackRandom = null;
  }

  resolveScopedRandom(random, scope = 'base', label = scope) {
    if (random && typeof random.float === 'function') {
      return random;
    }

    const scoped = this.createScopedRandom(scope, label);
    if (scoped?.random && typeof scoped.random.float === 'function') {
      return scoped.random;
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService('wave-manager:fallback');
    }

    return this._fallbackRandom;
  }

  createRandomScopes(random) {
    let baseRandom = random;
    if (!baseRandom || typeof baseRandom.fork !== 'function') {
      baseRandom = new RandomService();
      this._fallbackRandom = baseRandom;
    }

    const spawnLabel = this.randomScopeLabels?.spawn || 'wave-manager:spawn';
    const variantLabel =
      this.randomScopeLabels?.variants || 'wave-manager:variants';
    const fragmentLabel =
      this.randomScopeLabels?.fragments || 'wave-manager:fragments';

    const scopes = {
      base: baseRandom,
      spawn: baseRandom.fork(spawnLabel),
      variants: baseRandom.fork(variantLabel),
      fragments: baseRandom.fork(fragmentLabel),
    };

    this.captureRandomScopeSeeds(scopes);

    return scopes;
  }

  getRandomService() {
    return this.getRandomScope('base');
  }

  // createRandomScopes captures the new scopes' seeds.
  getRandomScope(scope) {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
    }

    return this.randomScopes[scope] || this.randomScopes.base;
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

  createLegacyAsteroidScopedRandom() {
    const generator = this.getRandomScope('spawn');
    const sequence = this.nextRandomSequence('spawn');
    const label = `enemy-system:asteroid-spawn:${sequence}`;

    if (generator && typeof generator.fork === 'function') {
      return {
        random: generator.fork(label),
        sequence,
      };
    }

    const fallbackBase =
      this.getRandomService() ||
      this._fallbackRandom ||
      new RandomService('wave-manager:fallback');

    if (typeof fallbackBase.fork === 'function') {
      return {
        random: fallbackBase.fork(`${label}:fallback`),
        sequence,
      };
    }

    return {
      random: fallbackBase,
      sequence,
    };
  }

  createScopedRandom(scope = 'spawn', label = scope) {
    const generator = this.getRandomScope(scope);
    const sequence = this.nextRandomSequence(scope);

    if (generator && typeof generator.fork === 'function') {
      return {
        random: generator.fork(`wave-manager:${label}:${sequence}`),
        sequence,
      };
    }

    const fallback = this._fallbackRandom || new RandomService();
    this._fallbackRandom = fallback;

    return {
      random: fallback.fork(`wave-manager:${label}:${sequence}`),
      sequence,
    };
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
      this.randomScopes = this.createRandomScopes(this.random);
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
  }
}
