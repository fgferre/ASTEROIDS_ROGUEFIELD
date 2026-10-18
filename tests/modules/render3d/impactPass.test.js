import { describe, expect, it } from 'vitest';
import {
  IMPACT_MAX_ABERRATION_PX,
  IMPACT_MAX_BLUR,
  ImpactKick,
} from '../../../src/modules/render3d/impactPass.js';

describe('ImpactKick', () => {
  it('peaks on the frame after a kick and is gone within ~180 ms', () => {
    const impact = new ImpactKick();
    impact.kick(5);
    expect(impact.update(1 / 60, true, true)).toBe(true);
    expect(impact.aberration).toBe(IMPACT_MAX_ABERRATION_PX);
    expect(impact.blur).toBe(IMPACT_MAX_BLUR);
    let active = true;
    for (let t = 1 / 60; t < 0.2; t += 1 / 60) {
      active = impact.update(1 / 60, true, true);
    }
    expect(active).toBe(false);
  });

  it('stays off when post-processing or motion is off; aberration follows its toggle', () => {
    const impact = new ImpactKick();
    impact.kick(1);
    expect(impact.update(0, false, true)).toBe(false);
    expect(impact.update(0, true, false)).toBe(true);
    expect(impact.aberration).toBe(0);
    expect(impact.blur).toBeGreaterThan(0);
  });
});
