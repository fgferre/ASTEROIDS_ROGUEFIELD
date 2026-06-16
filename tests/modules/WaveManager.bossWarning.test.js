import { describe, expect, it, vi } from 'vitest';
import { WaveManager } from '../../src/modules/enemies/managers/WaveManager.js';
import { createDeterministicRandom } from '../__helpers__/stubs.js';
import { withWaveOverrides } from '../__helpers__/setup.js';

/**
 * D-04 (02-CONTEXT): WaveManager must emit a NEW `boss-warning` event exactly
 * one wave BEFORE each boss wave so the MusicIntensityResolver (plan 02.05) can
 * raise tension pre-boss. Bosses spawn every WAVE_BOSS_INTERVAL=5, so pre-boss
 * waves are 4, 9, 14, ... This producer-only change has no consumer yet; these
 * tests lock the emit TIMING and PAYLOAD via the observable emit stream.
 *
 * Phase 1 LEARNINGS: assert on OBSERVABLE event emission (recorded emit array),
 * not internal state; cover BOTH the positive (pre-boss emits) AND negative
 * (non-pre-boss does NOT emit) cases; use an ISOLATED WaveManager per case to
 * avoid shared-instance state leakage (Codex flag).
 */

/**
 * Build a fresh WaveManager wired to a recording event-bus that captures every
 * emit as { event, payload }. Each call returns an isolated instance so no
 * wave state leaks between test cases.
 *
 * @returns {{ manager: WaveManager, emits: Array<{ event: string, payload: any }> }}
 */
function createRecordingWaveManager() {
  const emits = [];
  const eventBus = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn((event, payload) => {
      emits.push({ event, payload });
    }),
  };

  const random = createDeterministicRandom({ floatValue: 0.5 });
  const activeEnemies = [];
  let supportSequence = 0;

  const enemySystem = {
    asteroids: activeEnemies,
    getRandomScope: () => random,
    getCachedWorld: () => ({
      getBounds: () => ({ width: 800, height: 600 }),
    }),
    getCachedPlayer: () => ({
      position: { x: 400, y: 300 },
      velocity: { vx: 0, vy: 0 },
    }),
    getPlayerPositionSnapshot: () => ({ x: 400, y: 300 }),
    spawnBoss: vi.fn((config) => {
      const boss = {
        id: 'boss',
        type: 'boss',
        alive: true,
        destroyed: false,
        wave: config.wave,
      };
      activeEnemies.push(boss);
      return boss;
    }),
    acquireEnemyViaFactory: vi.fn((type, config) => ({
      id: `${type}-${supportSequence++}`,
      type,
      alive: true,
      destroyed: false,
      wave: config.wave,
    })),
    registerActiveEnemy: vi.fn((enemy) => {
      if (!activeEnemies.includes(enemy)) {
        activeEnemies.push(enemy);
      }
      return enemy;
    }),
  };

  const manager = new WaveManager({ enemySystem, random, eventBus });
  return { manager, emits };
}

/**
 * Drive WaveManager to start exactly the requested wave number and return the
 * recorded emit stream for that wave start.
 *
 * @param {number} targetWave - The wave number to start.
 * @returns {Array<{ event: string, payload: any }>} Recorded emits.
 */
function startWaveAndRecord(targetWave) {
  const { manager, emits } = createRecordingWaveManager();
  // startNextWave() increments currentWave first, so seed one wave below target.
  manager.currentWave = targetWave - 1;
  expect(manager.startNextWave()).toBe(true);
  expect(manager.currentWave).toBe(targetWave);
  return emits;
}

const findEmit = (emits, eventName) =>
  emits.find((entry) => entry.event === eventName);

describe('WaveManager boss-warning timing (D-04)', () => {
  it('emits boss-warning on wave 4 (one wave before boss wave 5) with { wave, nextBossWave }', async () => {
    await withWaveOverrides({ useManager: true }, () => {
      const emits = startWaveAndRecord(4);

      const bossWarning = findEmit(emits, 'boss-warning');
      expect(bossWarning).toBeTruthy();
      expect(bossWarning.payload).toMatchObject({ wave: 4, nextBossWave: 5 });

      // Regression guard: wave-started still fires on this (and every) wave.
      expect(findEmit(emits, 'wave-started')).toBeTruthy();
    });
  });

  it('emits boss-warning on wave 9 (one wave before boss wave 10) with { wave, nextBossWave }', async () => {
    await withWaveOverrides({ useManager: true }, () => {
      const emits = startWaveAndRecord(9);

      const bossWarning = findEmit(emits, 'boss-warning');
      expect(bossWarning).toBeTruthy();
      expect(bossWarning.payload).toMatchObject({ wave: 9, nextBossWave: 10 });

      expect(findEmit(emits, 'wave-started')).toBeTruthy();
    });
  });

  it.each([1, 2, 3])(
    'does NOT emit boss-warning on non-pre-boss wave %i',
    async (wave) => {
      await withWaveOverrides({ useManager: true }, () => {
        const emits = startWaveAndRecord(wave);

        expect(findEmit(emits, 'boss-warning')).toBeUndefined();
        // wave-started still fires every wave (regression guard).
        expect(findEmit(emits, 'wave-started')).toBeTruthy();
      });
    }
  );

  it('does NOT emit boss-warning on boss wave 5 itself (that is the boss-spawn path)', async () => {
    await withWaveOverrides({ useManager: true }, () => {
      const emits = startWaveAndRecord(5);

      expect(findEmit(emits, 'boss-warning')).toBeUndefined();
      // Boss waves emit boss-wave-started + wave-started, never boss-warning.
      expect(findEmit(emits, 'boss-wave-started')).toBeTruthy();
      expect(findEmit(emits, 'wave-started')).toBeTruthy();
    });
  });

  it('does NOT emit boss-warning on wave 10 (post-boss, not pre-boss)', async () => {
    await withWaveOverrides({ useManager: true }, () => {
      const emits = startWaveAndRecord(10);

      expect(findEmit(emits, 'boss-warning')).toBeUndefined();
      expect(findEmit(emits, 'wave-started')).toBeTruthy();
    });
  });
});
