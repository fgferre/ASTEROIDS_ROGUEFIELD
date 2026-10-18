import { describe, expect, it } from 'vitest';
import { Targeting } from '../../../src/modules/combat/Targeting.js';

const enemy = (id, x, y) => ({
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  radius: 18,
  variant: 'common',
  size: 'medium',
  health: 50,
  maxHealth: 50,
});

describe('Targeting', () => {
  it('locks the closer of two enemies in range and announces it', () => {
    const near = enemy('near', 500, 300);
    const far = enemy('far', 700, 300);
    const player = {
      getPosition: () => ({ x: 400, y: 300 }),
      getVelocity: () => ({ x: 0, y: 0 }),
      getShieldRadius: () => 16,
    };
    const emitted = [];
    const targeting = new Targeting({
      player: () => player,
      enemies: () => ({ forEachActiveEnemy: (cb) => [far, near].forEach(cb) }),
      emit: (name, payload) => emitted.push({ name, payload }),
      playerStats: () => ({ multishot: 1, damage: 10 }),
      bulletSpeed: () => 550,
      spreadMode: () => 'concentrated',
      computeParallelOffset: () => ({ x: 0, y: 0 }),
    });

    targeting.findBestTarget();

    expect(targeting.currentTarget).toBe(near);
    expect(emitted).toEqual([
      {
        name: 'combat-target-lock',
        payload: expect.objectContaining({ enemyId: 'near' }),
      },
    ]);
  });
});
