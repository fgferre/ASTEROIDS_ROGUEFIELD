import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  setupGlobalMocks,
  cleanupGlobalState,
} from '../../__helpers__/setup.js';
import { expectWithinTolerance } from '../../__helpers__/assertions.js';
import {
  createEnemySystemHarness,
  sampleVariants,
  computeExpectedVariantBreakdown,
  VARIANT_SAMPLE_COUNT,
  WAVE_VARIANT_SAMPLE_COUNT,
} from '../../__helpers__/asteroid-helpers.js';
import {
  SIZE_TEST_SAMPLES,
  WAVE_TEST_SAMPLES,
} from '../../__fixtures__/enemies.js';

describe('Asteroid Metrics - Variant Distribution', () => {
  /** @type {{ enemySystem: any, container: any }} */
  let harness;

  beforeEach(() => {
    setupGlobalMocks();
    harness = createEnemySystemHarness();
  });

  afterEach(() => {
    if (GamePools.asteroids?.releaseAll) {
      GamePools.asteroids.releaseAll();
    }
    if (typeof GamePools.destroy === 'function') {
      GamePools.destroy();
    }
    harness?.container?.dispose?.();
    cleanupGlobalState();
  });

  describe('Variant Distribution by Size', () => {
    const toleranceFor = (expected) =>
      Math.max(0.01, Math.min(0.05, Math.abs(expected) * 0.3 || 0));

    SIZE_TEST_SAMPLES.forEach((size) => {
      test(`${size} variant mix matches availability-aware distribution`, () => {
        const results = sampleVariants(
          harness.enemySystem,
          size,
          1,
          VARIANT_SAMPLE_COUNT
        );
        const totalVariants = Object.values(results).reduce(
          (accumulator, value) => accumulator + value,
          0
        );

        expect(totalVariants).toBe(VARIANT_SAMPLE_COUNT);

        const expected = computeExpectedVariantBreakdown(
          harness.enemySystem,
          size,
          1
        );
        const actualSpecial = 1 - (results.common ?? 0) / totalVariants;
        expectWithinTolerance(
          actualSpecial,
          expected.specialChance,
          toleranceFor(expected.specialChance)
        );

        for (const [variant, probability] of Object.entries(
          expected.probabilities
        )) {
          const actual = (results[variant] ?? 0) / totalVariants;
          expectWithinTolerance(actual, probability, toleranceFor(probability));
        }

        for (const variant of expected.excluded) {
          expect(results[variant] ?? 0).toBe(0);
        }
      });
    });

    test('parasite remains unavailable before wave 4', () => {
      const results = sampleVariants(
        harness.enemySystem,
        'medium',
        3,
        VARIANT_SAMPLE_COUNT
      );
      expect(results.parasite ?? 0).toBe(0);
    });

    test('parasite participates in the distribution from wave 4 onward', () => {
      const results = sampleVariants(
        harness.enemySystem,
        'medium',
        4,
        VARIANT_SAMPLE_COUNT
      );
      const expected = computeExpectedVariantBreakdown(
        harness.enemySystem,
        'medium',
        4
      );
      const actualParasite = (results.parasite ?? 0) / VARIANT_SAMPLE_COUNT;
      expectWithinTolerance(
        actualParasite,
        expected.probabilities.parasite,
        toleranceFor(expected.probabilities.parasite)
      );
    });

    test('gold variant never spawns for large asteroids', () => {
      const results = sampleVariants(
        harness.enemySystem,
        'large',
        6,
        VARIANT_SAMPLE_COUNT
      );
      expect(results.gold ?? 0).toBe(0);
    });

    test('denseCore variant absent for small asteroids', () => {
      const results = sampleVariants(
        harness.enemySystem,
        'small',
        6,
        VARIANT_SAMPLE_COUNT
      );
      expect(results.denseCore ?? 0).toBe(0);
    });
  });

  describe('Variant Wave Scaling', () => {
    WAVE_TEST_SAMPLES.forEach((waveNumber) => {
      test(`medium asteroid special rate scales at wave ${waveNumber}`, () => {
        const results = sampleVariants(
          harness.enemySystem,
          'medium',
          waveNumber,
          WAVE_VARIANT_SAMPLE_COUNT
        );
        const total = Object.values(results).reduce(
          (accumulator, value) => accumulator + value,
          0
        );
        const actualSpecial = 1 - (results.common ?? 0) / total;
        const expected = computeExpectedVariantBreakdown(
          harness.enemySystem,
          'medium',
          waveNumber
        );
        const tolerance = Math.max(
          0.003,
          Math.min(0.02, expected.specialChance * 0.2)
        );
        expect(
          Math.abs(actualSpecial - expected.specialChance)
        ).toBeLessThanOrEqual(tolerance);
      });
    });
  });
});
