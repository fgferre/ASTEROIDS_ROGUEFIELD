import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as CONSTANTS from '../../../src/core/GameConstants.js';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  setupGlobalMocks,
  cleanupGlobalState,
} from '../../__helpers__/setup.js';
import {
  createEnemySystemHarness,
  computeAverageFragmentsForSize,
  computeFragmentExpectationBounds,
  FRAGMENT_SAMPLE_COUNT,
  FRAGMENT_ANALYSIS_WAVE,
  getFragmentRuleForVariant,
} from '../../__helpers__/asteroid-helpers.js';
import {
  ASTEROID_TEST_CONFIGS,
  FRAGMENT_VARIANT_SAMPLES,
  SIZE_TEST_SAMPLES,
} from '../../__fixtures__/enemies.js';

describe('Asteroid Metrics - Fragmentation', () => {
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

  describe('Fragmentation Rules', () => {
    FRAGMENT_VARIANT_SAMPLES.forEach((variant) => {
      ['large', 'medium'].forEach((size) => {
        test(`${variant} ${size} fragmentation count matches rules`, () => {
          const rules =
            getFragmentRuleForVariant(variant) ??
            CONSTANTS.ASTEROID_FRAGMENT_RULES.default;
          if (!rules) {
            return;
          }

          const { enemySystem } = harness;
          enemySystem.waveState.current = 1;
          enemySystem.reseedRandomScopes?.({ resetSequences: true });

          const key = `${size}${variant[0].toUpperCase()}${variant.slice(1)}`;
          const config = ASTEROID_TEST_CONFIGS[key];
          const asteroid = enemySystem.acquireAsteroid({
            ...config,
            size,
            variant,
            randomScope: 'spawn',
          });

          const fragments = enemySystem.destroyAsteroid(asteroid, {
            createFragments: true,
            triggerExplosion: false,
          });

          const countRange = rules.countBySize?.[size] ??
            rules.countBySize?.default ?? [0, 0];
          const [minRaw, maxRaw] = Array.isArray(countRange)
            ? countRange
            : [countRange, countRange];
          const min = Math.floor(minRaw);
          const max = Math.floor(maxRaw);

          expect(fragments.length).toBeGreaterThanOrEqual(min);
          expect(fragments.length).toBeLessThanOrEqual(max);

          fragments.forEach((fragment) => {
            expect(fragment.size).not.toBe(size);

            const parentSpeed = Math.hypot(asteroid.vx, asteroid.vy);
            expect(parentSpeed).toBeGreaterThanOrEqual(0);

            const inheritVelocity = rules.inheritVelocity ?? 0;
            const parentContribution = {
              vx: asteroid.vx * inheritVelocity,
              vy: asteroid.vy * inheritVelocity,
            };

            const residual = {
              vx: fragment.vx - parentContribution.vx,
              vy: fragment.vy - parentContribution.vy,
            };

            const residualSpeed = Math.hypot(residual.vx, residual.vy);
            expect(Number.isFinite(residualSpeed)).toBe(true);
            expect(residualSpeed).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  describe('Average fragments per destruction', () => {
    test('mean fragment output per size is stable', () => {
      SIZE_TEST_SAMPLES.forEach((size) => {
        const mean = computeAverageFragmentsForSize(
          harness.enemySystem,
          size,
          FRAGMENT_ANALYSIS_WAVE,
          FRAGMENT_SAMPLE_COUNT
        );

        const bounds = computeFragmentExpectationBounds(
          harness.enemySystem,
          size,
          FRAGMENT_ANALYSIS_WAVE
        );

        const guardBand = 0.05;
        const closeness = Math.max(0.05, (bounds.max - bounds.min) * 0.25);

        expect(mean).toBeGreaterThanOrEqual(bounds.min - guardBand);
        expect(mean).toBeLessThanOrEqual(bounds.max + guardBand);
        expect(Math.abs(mean - bounds.mean)).toBeLessThanOrEqual(closeness);
      });
    });
  });
});
