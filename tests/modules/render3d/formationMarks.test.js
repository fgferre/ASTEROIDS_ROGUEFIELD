import { describe, expect, it, vi } from 'vitest';

import { FormationMarks } from '../../../src/modules/render3d/formationMarks.js';

const at = (x, y) => ({ x, y, vx: 0, vy: 50 });

describe('FormationMarks', () => {
  it('marks each unit’s point until its warning runs out', () => {
    const marks = new FormationMarks();
    marks.add({ points: [at(100, 40), at(200, 40)], warn: 1, edge: null });
    const ribbons = { circle: vi.fn(), segment: vi.fn() };
    marks.update(0.5, ribbons, [1, 0, 0]);
    expect(ribbons.circle).toHaveBeenCalledTimes(2);
    expect(ribbons.circle.mock.calls[0].slice(0, 2)).toEqual([100, 40]);
    expect(ribbons.segment).toHaveBeenCalledTimes(2); // the way in
    marks.update(0.6, ribbons, [1, 0, 0]);
    expect(ribbons.circle).toHaveBeenCalledTimes(2);
  });

  it('lights the edge where an edge formation comes in, its flares spread apart, none for a ring', () => {
    const marks = new FormationMarks();
    const pack = [at(300, 40), at(320, 50), at(310, 60)];
    expect(marks.add({ points: pack, warn: 1, edge: 'top' })).toEqual([
      { x: 300, y: 0 },
    ]);
    const row = Array.from({ length: 9 }, (_, i) => at(40 + i * 60, 40));
    const flares = marks.add({ points: row, warn: 1, edge: 'top' });
    expect(flares.length).toBe(4);
    for (let i = 1; i < flares.length; i += 1) {
      expect(flares[i].x - flares[i - 1].x).toBeGreaterThanOrEqual(120);
    }
    expect(marks.add({ points: row, warn: 1, edge: null })).toEqual([]);
  });
});
