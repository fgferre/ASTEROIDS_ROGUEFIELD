import { describe, expect, it, vi } from 'vitest';

import Bulwark from '../../../src/modules/enemies/types/Bulwark.js';

describe('Bulwark', () => {
  it('drains the shield from the front, takes hull damage from behind, and stays broken', () => {
    const eventBus = { emit: vi.fn() };
    const player = { position: { x: 400, y: 100 } };
    const bulwark = new Bulwark(
      { eventBus, getCachedPlayer: () => player },
      { id: 'bulwark-1', x: 100, y: 100 }
    );
    bulwark.onUpdate(1 / 60); // faces the player (+x)
    const front = { hitPosition: { x: 120, y: 105 } };
    const rear = { hitPosition: { x: 80, y: 100 } };
    const hull = bulwark.health;
    const shield = bulwark.shieldHealth;
    const plate = (name) =>
      eventBus.emit.mock.calls.filter(([event]) => event === name);

    bulwark.takeDamage(30, front);
    expect(bulwark.health).toBe(hull);
    expect(bulwark.shieldHealth).toBe(shield - 30);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'shield-deflected',
      expect.any(Object)
    );
    expect(plate('bulwark-plate-hit')).toHaveLength(1);
    expect(plate('bulwark-plate-hit')[0][1]).toMatchObject({
      position: { x: 120, y: 105 },
    });

    bulwark.takeDamage(20, rear);
    expect(bulwark.health).toBe(hull - 20);
    expect(bulwark.shieldHealth).toBe(shield - 30);
    expect(plate('bulwark-plate-hit')).toHaveLength(1); // the hull: no clang

    bulwark.takeDamage(shield, front); // breaks it; the overflow hits the hull
    expect(bulwark.shieldBroken).toBe(true);
    expect(bulwark.health).toBe(hull - 20 - 30);
    expect(plate('bulwark-plate-broken')).toHaveLength(1);
    expect(plate('bulwark-plate-hit')).toHaveLength(1);

    bulwark.takeDamage(10, front);
    expect(bulwark.shieldBroken).toBe(true);
    expect(bulwark.shieldHealth).toBe(0);
    expect(bulwark.health).toBe(hull - 60);
    expect(plate('bulwark-plate-broken')).toHaveLength(1); // breaks once
  });
});
