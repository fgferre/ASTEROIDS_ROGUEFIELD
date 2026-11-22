import { describe, expect, it } from 'vitest';
import { shotContact } from '../../../src/modules/render3d/effectEvents.js';

describe('shotContact', () => {
  const rock = { x: 100, y: 100, radius: 10 };

  it('finds where a shot caught inside the rock entered it', () => {
    const at = shotContact(rock, { x: 96, y: 106 }, 500, 0);
    expect(at.x).toBeCloseTo(-8, 5);
    expect(at.y).toBeCloseTo(6, 5);
  });

  it('falls back to straight out from the centre for a hit with no flight', () => {
    const at = shotContact(rock, { x: 100, y: 103 }, 0, 0);
    expect(at.x).toBeCloseTo(0, 5);
    expect(at.y).toBeCloseTo(10, 5);
  });
});
