import { describe, expect, it } from 'vitest';
import { BurnMarks } from '../../../src/modules/render3d/burnMarks.js';
import { DECAL_KIND } from '../../../src/modules/render3d/scorchDecals.js';

describe('BurnMarks', () => {
  it('bites a burning hull once per tick, on the side facing the ship', () => {
    const marks = [];
    const sparks = [];
    const three = {
      smoke: { push() {} },
      decals: { hit: (view, nx, ny, kind) => marks.push({ nx, kind }) },
      enemies: { views: new Map([['hunter-1', { kind: 'hunter' }]]) },
    };
    const hitSparks = { emit: (...args) => sparks.push(args) };
    const enemy = {
      id: 'hunter-1',
      type: 'hunter',
      x: 300,
      y: 300,
      radius: 16,
    };
    const entry = { ticksLeft: 3 };
    const combat = {
      cards: { burns: new Map([[enemy, entry]]) },
      weapons: { hasApex: () => false },
    };
    const player = { position: { x: 100, y: 300 } };
    const burns = new BurnMarks();

    burns.update(1 / 60, combat, player, three, hitSparks);
    burns.update(1 / 60, combat, player, three, hitSparks);
    expect(marks).toHaveLength(1);
    expect(marks[0].kind).toBe(DECAL_KIND.burn);
    expect(marks[0].nx).toBeLessThan(0); // the ship is to its left
    expect(sparks).toHaveLength(1);

    entry.ticksLeft = 2;
    burns.update(1 / 60, combat, player, three, hitSparks);
    expect(marks).toHaveLength(2);
  });
});
