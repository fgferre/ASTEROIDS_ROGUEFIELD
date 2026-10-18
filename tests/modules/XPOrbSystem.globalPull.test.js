import { describe, expect, it } from 'vitest';
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
