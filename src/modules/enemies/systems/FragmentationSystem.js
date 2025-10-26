import { ASTEROID_SPEEDS } from '../../../data/constants/physics.js';

/**
 * FragmentationSystem centralizes logic for generating enemy fragments.
 *
 * Accepts an entity descriptor and optional ruleset to produce deterministic
 * fragment descriptors. Designed to be reusable across asteroid variants and
 * future enemies that split into smaller units.
 */
export class FragmentationSystem {
  /**
   * Creates a seeded pseudo-random generator using a xorshift-like algorithm.
   * Ensures deterministic fragment patterns for a given seed.
   *
   * @param {number} seed
   * @returns {() => number} Function returning values in [0, 1).
   */
  static createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Samples a numeric value from a [min, max] range using the provided random
   * generator. Falls back to a default value when the range is invalid.
   *
   * @param {[number, number] | number} range
   * @param {number} fallback
   * @param {() => number} random
   * @returns {number}
   */
  static sampleRange(range, fallback, random) {
    if (Array.isArray(range) && range.length === 2) {
      const [min, max] = range;
      const low = Number.isFinite(min) ? min : fallback ?? 0;
      const high = Number.isFinite(max) ? max : low;
      if (high <= low) {
        return low;
      }
      return low + (high - low) * random();
    }

    if (Number.isFinite(range)) {
      return range;
    }

    return fallback ?? 0;
  }

  /**
   * Resolves a whole number count from the supplied range definition.
   *
   * @param {[number, number] | number} range
   * @param {() => number} random
   * @returns {number}
   */
  static resolveCount(range, random) {
    if (Array.isArray(range) && range.length === 2) {
      const min = Math.floor(Number.isFinite(range[0]) ? range[0] : 0);
      const max = Math.floor(Number.isFinite(range[1]) ? range[1] : min);
      if (max <= min) {
        return Math.max(0, min);
      }
      return min + Math.floor(random() * (max - min + 1));
    }

    const numeric = Number(range);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    return Math.max(0, Math.round(numeric));
  }

  /**
   * Generates fragment descriptors for the supplied entity.
   *
   * @param {Object} entity
   * @param {string} entity.size
   * @param {number} entity.x
   * @param {number} entity.y
   * @param {number} entity.vx
   * @param {number} entity.vy
   * @param {number} entity.radius
   * @param {number} [entity.wave]
   * @param {string|number} [entity.id]
   * @param {number} [entity.generation]
   * @param {number} [entity.crackSeed]
   * @param {Object} [entity.fragmentProfile]
   * @param {string} [entity.fragmentProfileKey]
   * @param {Object} [fragmentRules]
   * @returns {Array<Object>}
   */
  static generateFragments(entity, fragmentRules) {
    if (entity.size === 'small') {
      return [];
    }

    const newSize = entity.size === 'large' ? 'medium' : 'small';
    const rules = fragmentRules || entity.fragmentProfile || {};

    const currentGeneration = entity.generation ?? 0;
    const maxGeneration = rules?.maxGeneration;
    if (Number.isFinite(maxGeneration) && currentGeneration + 1 > maxGeneration) {
      return [];
    }

    const countRange =
      rules?.countBySize?.[entity.size] ||
      rules?.countBySize?.default ||
      [2, 3];

    const seededRandom = FragmentationSystem.createSeededRandom(
      (entity.crackSeed ?? 0) ^ 0x5e17
    );

    const fragmentCount = FragmentationSystem.resolveCount(countRange, seededRandom);
    if (fragmentCount <= 0) {
      return [];
    }

    const fragments = [];
    const baseSpeed = ASTEROID_SPEEDS[newSize] || 40;
    const speedRange =
      rules?.speedMultiplierBySize?.[newSize] ||
      rules?.speedMultiplierBySize?.default ||
      [0.85, 1.2];
    const inheritVelocity = rules?.inheritVelocity ?? 0.4;
    const angleJitter = rules?.angleJitter ?? Math.PI / 6;
    const radialRange = rules?.radialDistanceRange || [0.45, 0.9];
    const offsetJitter = rules?.radialOffsetJitter ?? 0.2;

    const parentVx = Number.isFinite(entity.vx) ? entity.vx : 0;
    const parentVy = Number.isFinite(entity.vy) ? entity.vy : 0;
    const angleOffset = seededRandom() * Math.PI * 2;

    for (let i = 0; i < fragmentCount; i += 1) {
      const baseAngle =
        angleOffset + (i / Math.max(1, fragmentCount)) * Math.PI * 2;
      const travelAngle =
        baseAngle + (seededRandom() - 0.5) * 2 * angleJitter;
      const spawnAngle =
        travelAngle + (seededRandom() - 0.5) * 2 * offsetJitter;
      const distance =
        entity.radius *
        FragmentationSystem.sampleRange(radialRange, 0.6, seededRandom);
      const speedMultiplier = FragmentationSystem.sampleRange(
        speedRange,
        1,
        seededRandom
      );
      const vx =
        Math.cos(travelAngle) * baseSpeed * speedMultiplier +
        parentVx * inheritVelocity;
      const vy =
        Math.sin(travelAngle) * baseSpeed * speedMultiplier +
        parentVy * inheritVelocity;

      fragments.push({
        x: entity.x + Math.cos(spawnAngle) * distance,
        y: entity.y + Math.sin(spawnAngle) * distance,
        vx,
        vy,
        size: newSize,
        wave: entity.wave,
        spawnedBy: entity.id,
        generation: currentGeneration + 1,
      });
    }

    return fragments;
  }
}

export default FragmentationSystem;
