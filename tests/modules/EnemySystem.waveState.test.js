/**
 * WaveManager owns the layer's rock counts: EnemySystem.waveState is a
 * read-only copy of them and EnemySpawnSystem keeps none of its own.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createEnemySystemHarness,
  prepareWave,
} from '../__helpers__/asteroid-helpers.js';

const TRICKLE_STEPS = 120; // 2 s at 60 Hz

describe('EnemySystem.waveState', () => {
  let harness;

  afterEach(() => {
    harness?.container?.dispose?.();
    GamePools.releaseAll();
  });

  it("reports the trickle's rocks from WaveManager; the spawn system counts none", () => {
    harness = createEnemySystemHarness();
    const { enemySystem } = harness;
    prepareWave(enemySystem, 3);
    const { waveManager } = enemySystem;

    for (let step = 0; step < TRICKLE_STEPS; step += 1) {
      waveManager.updateRockTrickle(1 / 60);
    }

    expect(waveManager.rocksSpawned).toBeGreaterThan(1);
    expect(enemySystem.waveState.asteroidsSpawned).toBe(
      waveManager.rocksSpawned
    );
    expect(Object.keys(enemySystem.spawnSystem)).toEqual(['facade']);
    expect(Object.hasOwn(enemySystem, 'waveState')).toBe(false);
  });

  it('does not reward a mine that detonates itself, but rewards one destroyed by the player', () => {
    harness = createEnemySystemHarness();
    const { enemySystem } = harness;
    const dropRewards = vi.spyOn(enemySystem.rewardManager, 'dropRewards');
    const mine = { type: 'mine' };

    enemySystem.eventBus.emit('enemy-destroyed', {
      enemy: mine,
      source: { cause: 'mine-detonation' },
    });
    expect(dropRewards).not.toHaveBeenCalled();

    enemySystem.eventBus.emit('enemy-destroyed', {
      enemy: mine,
      source: { cause: 'damage' },
    });
    expect(dropRewards).toHaveBeenCalledOnce();
  });

  it('clears Warden HUD state when the field resets during a boss fight', () => {
    harness = createEnemySystemHarness();
    const { enemySystem } = harness;
    enemySystem.bosses.handleBossWaveStarted({ wave: 5 });
    expect(enemySystem.getBossHudState().upcoming).toBe(true);

    enemySystem.reset();

    expect(enemySystem.getBossHudState()).toEqual(
      enemySystem.bosses.createInitialBossHudState()
    );
  });
});
