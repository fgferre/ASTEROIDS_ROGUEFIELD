import { describe, expect, it } from 'vitest';

import { BOSS_COMPONENTS } from '../../src/data/enemies/boss.js';

describe('boss visual (Warden Prime)', () => {
  it('draws through the procedural boss look, not an SVG sprite', () => {
    expect(BOSS_COMPONENTS.render.strategy).toBe('procedural-boss');
    expect(BOSS_COMPONENTS.render.shape).toBe('boss');
    expect(BOSS_COMPONENTS.render.visual).toBeUndefined();
  });
});
