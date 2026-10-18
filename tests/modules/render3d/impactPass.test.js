import { describe, expect, it } from 'vitest';
import {
  IMPACT_MAX_ABERRATION_PX,
  FILM_GRAIN,
  IMPACT_MAX_BLUR,
  ImpactKick,
  VIGNETTE,
} from '../../../src/modules/render3d/impactPass.js';
import Renderer3D from '../../../src/modules/render3d/Renderer3D.js';

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

describe('ImpactKick grain and vignette', () => {
  const pass = () => ({
    enabled: false,
    uniforms: {
      uTexel: { value: { set() {} } },
      uAberration: { value: 0 },
      uBlur: { value: 0 },
      uGrain: { value: 0 },
      uSeed: { value: 0 },
      uVignette: { value: 0 },
    },
  });

  it('runs the pass every frame with grain on, a new seed each frame, no kick', () => {
    const impact = new ImpactKick();
    const p = pass();
    impact.apply(p, 800, 600, impact.update(1 / 60, true, true), true);
    expect(p.enabled).toBe(true);
    expect(p.uniforms.uGrain.value).toBe(FILM_GRAIN);
    expect(p.uniforms.uVignette.value).toBe(VIGNETTE);
    expect(p.uniforms.uBlur.value).toBe(0);
    const seed = p.uniforms.uSeed.value;
    impact.apply(p, 800, 600, false, true);
    expect(p.uniforms.uSeed.value).not.toBe(seed);
    expect(FILM_GRAIN).toBeLessThanOrEqual(0.035);
    expect(VIGNETTE).toBeLessThanOrEqual(0.35);
  });

  it('with grain off (low preset) the pass only runs for a kick', () => {
    const impact = new ImpactKick();
    const p = pass();
    impact.apply(p, 800, 600, false, false);
    expect(p.enabled).toBe(false);
    impact.kick(1);
    impact.apply(p, 800, 600, impact.update(0, true, true), false);
    expect(p.enabled).toBe(true);
    expect(p.uniforms.uGrain.value).toBe(0);
    expect(p.uniforms.uVignette.value).toBe(0);
  });
});

describe('Reduce Flashing in 3D', () => {
  it('scales lens kicks to 30 % and the shield break flare with them, live', () => {
    const renderer = new Renderer3D();
    renderer.applyAccessibilityPreferences({ reduceFlashing: true });
    renderer.impact.kick(1);
    expect(renderer.impact.strength).toBeCloseTo(0.3, 5);
    expect(renderer.flashScale).toBe(0.3);

    renderer.applyAccessibilityPreferences({ reduceFlashing: false });
    renderer.impact.kick(1);
    expect(renderer.impact.strength).toBe(1);
  });
});
