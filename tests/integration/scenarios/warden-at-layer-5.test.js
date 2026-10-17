/**
 * Jumping to layer 5 spawns the Warden Prime boss while the invulnerable
 * pilot lives; the boss announces an attack (charge or fan telegraph).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

const BOSS_WINDOW_STEPS = 20 * 60;
const MAX_STEPS = 60 * 60;

function playToLayer5() {
  const game = createHeadlessGame();
  game.session.startNewRun({ source: 'test' });
  const { player, enemies } = game.services;
  player.setInvulnerableTimer(1e9);
  enemies.releaseAllAsteroidsToPool();
  enemies.waveManager.currentWave = 4;
  enemies.waveManager.waveInProgress = false;
  enemies.startNextWave();

  const telegraphs = [];
  game.eventBus.on('boss-telegraph', (payload) => {
    telegraphs.push(payload.telegraph?.type);
  });
  let boss = null;
  let bossStep = null;
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    game.step();
    boss ??= enemies.getActiveEnemies().find((e) => e.type === 'boss');
    if (boss) bossStep ??= step;
    if (boss && step - bossStep >= BOSS_WINDOW_STEPS) break;
  }
  return { enemies, player, boss, telegraphs };
}

describe('layer 5 scenario', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
    vi.restoreAllMocks();
  });

  it('spawns the boss on layer 5 and the pilot survives 20 s of it', () => {
    const { enemies, player, boss } = playToLayer5();

    expect(enemies.waveManager.currentWave).toBe(5);
    expect(boss).toBeTruthy();
    // Boss instances expose no displayName (the HUD falls back to 'Boss').
    expect(boss.constructor.name).toBe('BossEnemy');
    expect(player.health).toBeGreaterThan(0);
  });

  // KNOWN BUG: with components active BossEnemy never runs its spread/charge
  // cycles, so no telegraph is emitted. Remove `.fails` when it is fixed.
  it.fails('telegraphs a charge or fan within 20 s', () => {
    const { telegraphs } = playToLayer5();

    expect(telegraphs.some((t) => ['charge', 'fan'].includes(t))).toBe(true);
  });
});
