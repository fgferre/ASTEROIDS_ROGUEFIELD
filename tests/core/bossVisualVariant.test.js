import { describe, expect, it } from 'vitest';

import {
  BOSS_COMPONENTS,
  BOSS_VISUAL_VARIANT,
  BOSS_VISUAL_CONFIG,
} from '../../src/data/enemies/boss.js';

describe('boss visual variant', () => {
  it('resolves render strategy from BOSS_VISUAL_VARIANT', () => {
    if (BOSS_VISUAL_VARIANT === 'retro-saucer') {
      expect(BOSS_COMPONENTS.render.strategy).toBe('svg-sprite-boss');
    } else {
      expect(BOSS_COMPONENTS.render.strategy).toBe('procedural-boss');
    }
  });

  it('includes visual config in BOSS_COMPONENTS.render when variant is retro-saucer', () => {
    if (BOSS_VISUAL_VARIANT === 'retro-saucer') {
      expect(BOSS_COMPONENTS.render.visual).toBeTruthy();
      expect(BOSS_COMPONENTS.render.visual.type).toBe('svg-sprite');
      expect(typeof BOSS_COMPONENTS.render.visual.source).toBe('string');
      expect(BOSS_COMPONENTS.render.visual.source.length).toBeGreaterThan(0);
    } else {
      expect(BOSS_COMPONENTS.render.visual).toBeNull();
    }
  });

  it('BOSS_VISUAL_CONFIG has a valid data URL source', () => {
    expect(BOSS_VISUAL_CONFIG.source).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('BOSS_VISUAL_CONFIG dimensions are positive and proportional to SVG viewBox', () => {
    expect(BOSS_VISUAL_CONFIG.width).toBeGreaterThan(0);
    expect(BOSS_VISUAL_CONFIG.height).toBeGreaterThan(0);
    // SVG viewBox is 636×698, aspect ratio ~0.911
    const aspect = BOSS_VISUAL_CONFIG.width / BOSS_VISUAL_CONFIG.height;
    expect(aspect).toBeCloseTo(636 / 698, 1);
  });

  it('legacy procedural-boss strategy name is preserved in components', () => {
    // The render.shape should always be 'boss' regardless of variant
    expect(BOSS_COMPONENTS.render.shape).toBe('boss');
  });
});
