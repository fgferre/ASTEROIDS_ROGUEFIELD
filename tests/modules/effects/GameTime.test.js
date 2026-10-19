import { describe, expect, it } from 'vitest';
import { GameTime } from '../../../src/modules/effects/GameTime.js';

describe('GameTime', () => {
  it('runs the world at the hit-stop scale, easing back to full speed', () => {
    const time = new GameTime({ emit: () => {}, motionReduced: () => false });
    const step = 1 / 120;

    // A small kill: 0.05 s starting at 30 % speed.
    time.addHitStop('small');
    expect(time.update(step)).toBeCloseTo(
      step * (0.3 + 0.7 * (step / 0.05)),
      10
    );

    for (let i = 0; i < 5; i += 1) time.update(step);
    expect(time.update(step)).toBe(step);
  });

  it('drops a running slow motion on reset (a new run or the menu)', () => {
    const time = new GameTime({ emit: () => {}, motionReduced: () => false });
    const step = 1 / 120;
    time.applyTimeDilation(0.4, { holdDuration: 1, duration: 0.5 });
    expect(time.update(step)).toBeCloseTo(step * 0.4, 10);
    time.reset();
    expect(time.update(step)).toBe(step);
  });
});
