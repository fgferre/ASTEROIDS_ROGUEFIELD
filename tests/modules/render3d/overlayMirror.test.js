import { describe, expect, it, vi } from 'vitest';
import {
  WardLinks,
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

describe('WardLinks', () => {
  it('snaps a link that drops: two halves pull back to their ends and are gone after', () => {
    const segment = vi.fn();
    const streak = vi.fn();
    const t = { ribbons: { segment, streak }, statusRgb: [0.7, 1, 0] };
    const ally = { id: 'ally', alive: true, x: 100, y: 0 };
    const aegis = { id: 'aegis', alive: true, x: 0, y: 0, wardRatio: 1 };
    aegis.wardLinks = [ally];
    const links = new WardLinks();
    const step = (dt) => {
      segment.mockClear();
      streak.mockClear();
      links.update(dt, t, [aegis, ally], 1);
      return segment.mock.calls.map(([ax, , bx]) => ({ ax, bx }));
    };

    expect(step(0.016)).toEqual([{ ax: 0, bx: 100 }]);

    aegis.wardLinks = [];
    const first = step(0.03);
    expect(first).toHaveLength(2);
    const [fromAegis, fromAlly] = first;
    expect(fromAegis.ax).toBe(0);
    expect(fromAlly.ax).toBe(100);
    expect(fromAegis.bx).toBeLessThan(fromAlly.bx); // broken between
    expect(streak).toHaveBeenCalled(); // sparks from the break

    const later = step(0.1);
    expect(later[0].bx).toBeLessThan(fromAegis.bx);
    expect(later[1].bx).toBeGreaterThan(fromAlly.bx);

    step(0.3);
    expect(segment).not.toHaveBeenCalled();
    expect(step(0.3)).toEqual([]);
    expect(streak).not.toHaveBeenCalled();
  });
});
