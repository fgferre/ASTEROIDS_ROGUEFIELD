import { describe, expect, it, vi } from 'vitest';

import Ram from '../../../src/modules/enemies/types/Ram.js';
import {
  RAM_CHARGE_SECONDS,
  RAM_RECOVER_SECONDS,
  RAM_WINDUP_SECONDS,
} from '../../../src/data/enemies/ram.js';

const speedOf = (enemy) => Math.hypot(enemy.vx, enemy.vy);

describe('Ram', () => {
  it('goes windup → charge → recover, charging faster than it approaches', () => {
    const player = { position: { x: 500, y: 100 } };
    const eventBus = { emit: vi.fn() };
    const ram = new Ram(
      { eventBus, getCachedPlayer: () => player },
      { id: 'ram-1', x: 100, y: 100 }
    );

    ram.onUpdate(1 / 60);
    expect(ram.state).toBe('approach');
    const approachSpeed = speedOf(ram);
    expect(approachSpeed).toBeGreaterThan(0);

    ram.x = 300; // inside the engage distance
    ram.onUpdate(1 / 60);
    expect(ram.state).toBe('windup');
    expect(speedOf(ram)).toBe(0);
    expect(ram.telegraph).toMatchObject({ type: 'charge' });
    expect(eventBus.emit).toHaveBeenCalledWith(
      'boss-telegraph',
      expect.objectContaining({ enemy: ram })
    );

    ram.onUpdate(RAM_WINDUP_SECONDS + 0.01);
    expect(ram.state).toBe('charge');
    expect(ram.telegraph).toBeNull();
    expect(ram.vx).toBeGreaterThan(0); // toward the player
    expect(speedOf(ram)).toBeGreaterThan(approachSpeed);

    ram.onUpdate(RAM_CHARGE_SECONDS + 0.01);
    expect(ram.state).toBe('recover');

    ram.onUpdate(RAM_RECOVER_SECONDS + 0.01);
    expect(ram.state).toBe('approach');
  });
});
