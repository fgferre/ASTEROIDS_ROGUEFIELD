import { describe, expect, it, vi } from 'vitest';
import {
  magnetRingGain,
  mirrorOverlays,
} from '../../../src/modules/render3d/overlayMirror.js';

const orb = (x, collected = false) => ({ x, y: 0, collected });

describe('magnetRingGain', () => {
  it('is 0 with no orbs or only far ones', () => {
    expect(magnetRingGain([], 0, 0, 100)).toBe(0);
    expect(magnetRingGain([orb(500)], 0, 0, 100)).toBe(0);
  });

  it('is full inside the pull radius and fades to 0 at 1.5 radii', () => {
    expect(magnetRingGain([orb(60)], 0, 0, 100)).toBe(0.25);
    expect(magnetRingGain([orb(125)], 0, 0, 100)).toBeCloseTo(0.125);
    expect(magnetRingGain([orb(150)], 0, 0, 100)).toBe(0);
  });

  it('ignores collected orbs', () => {
    expect(magnetRingGain([orb(10, true), orb(500)], 0, 0, 100)).toBe(0);
  });
});

describe('mirrorOverlays magnet ring', () => {
  const draw = (orbX) => {
    const circle = vi.fn();
    const t = { ribbons: { circle }, accentRgb: [1, 1, 1], texts: [] };
    const player = {
      position: { x: 0, y: 0 },
      getMagnetismRadius: () => 100,
    };
    const xpOrbs = { xpOrbs: [orb(orbX)], getMagnetismRadius: () => 100 };
    mirrorOverlays(t, player, null, xpOrbs, null, 1);
    return circle;
  };

  it('draws the ring only while an orb is near', () => {
    expect(draw(50)).toHaveBeenCalledTimes(1);
    expect(draw(400)).not.toHaveBeenCalled();
  });
});
