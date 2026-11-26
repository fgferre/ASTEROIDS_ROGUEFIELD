import { afterEach, describe, expect, it, vi } from 'vitest';
import { BossAttacks } from '../../src/modules/physics/BossAttacks.js';
import { isBossEnemy } from '../../src/modules/physics/bossTuning.js';
import ThrusterLoopManager from '../../src/modules/ThrusterLoopManager.js';

// Catches that hid real errors (outside audit 8, verdict B9): each now either
// says why it ignores one or lets it show.
describe('errors no catch hides', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a boss blast that failed to hurt an enemy, and goes on to the next', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hurt = vi.fn();
    const broken = {
      x: 10,
      y: 0,
      radius: 5,
      takeDamage() {
        throw new Error('broken');
      },
    };
    const next = { x: -10, y: 0, radius: 5, takeDamage: hurt };
    const attacks = new BossAttacks({
      impacts: {
        handleBossCollisionFeedback() {},
        emitBossPhysicsEvent() {},
      },
      contact: {},
      emit() {},
      resolveBossEntity: () => ({ x: 0, y: 0 }),
      enemySystem: () => null,
      getNearbyEnemies: () => [broken, next],
    });

    attacks.applyBossAreaDamage({
      position: { x: 0, y: 0 },
      radius: 100,
      damage: 10,
      includePlayer: false,
    });

    expect(error).toHaveBeenCalled();
    expect(hurt).toHaveBeenCalled();
  });

  it('puts a loop gain back in the pool even if it was already disconnected', () => {
    const manager = new ThrusterLoopManager();
    const gain = {
      disconnect() {
        throw new Error('already disconnected');
      },
    };
    const pool = { returnGain: vi.fn() };
    manager.activeLoops.set('main', {
      oscillators: [],
      source: { stop() {} },
      gains: [gain],
      filters: [],
    });

    manager.cleanup(pool);

    expect(pool.returnGain).toHaveBeenCalledWith(gain);
  });

  it('lets a broken boss tag check show instead of calling it no boss', () => {
    const enemy = {
      hasTag() {
        throw new Error('broken');
      },
    };
    expect(() => isBossEnemy(enemy)).toThrow('broken');
  });
});
