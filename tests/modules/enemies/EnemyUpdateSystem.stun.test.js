import { describe, expect, it, vi } from 'vitest';
import { EnemyUpdateSystem } from '../../../src/modules/enemies/systems/EnemyUpdateSystem.js';

describe('EnemyUpdateSystem stun', () => {
  it('freezes a stunned enemy until its stun runs out (Solar Flare)', () => {
    const drone = { type: 'drone', stunTimer: 1, onUpdate: vi.fn() };
    const system = new EnemyUpdateSystem({ facade: {}, asteroids: [drone] });

    system.updateSupportEnemies(0.6);
    expect(drone.onUpdate).not.toHaveBeenCalled();
    system.updateSupportEnemies(0.6);
    expect(drone.onUpdate).not.toHaveBeenCalled();
    system.updateSupportEnemies(0.1);
    expect(drone.onUpdate).toHaveBeenCalledWith(0.1);
  });
});
