import { describe, expect, it } from 'vitest';
import RandomService from '../../src/core/RandomService.js';
import XPOrbSystem from '../../src/modules/XPOrbSystem.js';

// Just the state updateGlobalPull reads; the ship sits at the origin.
function pullField(orb) {
  return {
    xpOrbs: [orb],
    cachedPlayer: { getPosition: () => ({ x: 0, y: 0 }) },
    isOrbActive: () => true,
    invalidateSpatialIndex() {},
  };
}

describe('XPOrbSystem global pull', () => {
  it('pulls toward a given world point instead of the ship (Gravity Well)', () => {
    const orb = { x: 100, y: 100, isFusing: false };
    const field = pullField(orb);
    XPOrbSystem.prototype.startGlobalPull.call(field, 8, 50, 0, 1, {
      x: 300,
      y: 100,
    });

    XPOrbSystem.prototype.updateGlobalPull.call(field, 1);

    expect(orb).toMatchObject({ x: 150, y: 100 });
  });
});

describe('XPOrbSystem drift (Magnetic Storm)', () => {
  it('moves every spark driftSpeed px/s on a seeded heading until cleared', () => {
    const orb = { x: 100, y: 100, isFusing: false };
    const field = pullField(orb);
    const params = { driftSpeed: 45, driftTurn: 6, pullScale: 0.6 };
    XPOrbSystem.prototype.setDrift.call(
      field,
      params,
      new RandomService('storm')
    );

    XPOrbSystem.prototype.updateDrift.call(field, 1);

    expect(Math.hypot(orb.x - 100, orb.y - 100)).toBeCloseTo(45);
    expect(field.drift.pullScale).toBe(0.6);
    XPOrbSystem.prototype.setDrift.call(field, null);
    expect(field.drift).toBeNull();
  });
});
