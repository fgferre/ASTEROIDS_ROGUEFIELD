import { describe, expect, it } from 'vitest';
import {
  GameTime,
  LEVEL_UP_SLOW_MO,
} from '../../../src/modules/effects/GameTime.js';

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

  it('runs the world the same with Reduced Motion (a replay does not record it); only the zoom pulse goes', () => {
    const play = (reduced) => {
      const emitted = [];
      const time = new GameTime({
        emit: (name) => emitted.push(name),
        motionReduced: () => reduced,
      });
      time.addHitStop('large');
      time.playSlowMotion(LEVEL_UP_SLOW_MO);
      const deltas = Array.from({ length: 120 }, () => time.update(1 / 120));
      return { deltas, emitted };
    };
    const full = play(false);
    const reduced = play(true);

    expect(reduced.deltas).toEqual(full.deltas);
    expect(full.emitted).toEqual(['camera-zoom-pulse']);
    expect(reduced.emitted).toEqual([]);
  });
});
