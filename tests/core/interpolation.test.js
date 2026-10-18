import { describe, it, expect } from 'vitest';
import {
  StepInterpolator,
  TELEPORT_DISTANCE,
  lerp,
  lerpAngle,
} from '../../src/core/interpolation.js';

function step(interp, captures) {
  interp.beginStep();
  captures.forEach(([key, x, y, angle, id]) =>
    interp.capture(key, x, y, angle, id)
  );
  interp.endStep();
}

describe('lerp / lerpAngle', () => {
  it('interpolates linearly', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('turns along the shortest arc across the wrap', () => {
    const a = Math.PI - 0.1;
    const b = -Math.PI + 0.1;
    // halfway is at ±π, not at 0
    expect(Math.abs(Math.cos(lerpAngle(a, b, 0.5)) + 1)).toBeLessThan(1e-9);
    expect(lerpAngle(0.1, -0.1, 0.5)).toBeCloseTo(0, 9);
    expect(lerpAngle(0, 4 * Math.PI + 0.2, 0.5)).toBeCloseTo(0.1, 9);
  });
});

describe('StepInterpolator', () => {
  it('draws between the last two steps at alpha', () => {
    const interp = new StepInterpolator();
    const e = {};
    step(interp, [[e, 0, 0, 0]]);
    step(interp, [[e, 10, 20, 1]]);
    const out = interp.sample(e, 10, 20, 1, 0.25, {});
    expect(out.x).toBeCloseTo(2.5, 9);
    expect(out.y).toBeCloseTo(5, 9);
    expect(out.angle).toBeCloseTo(0.25, 9);
  });

  it('snaps on first sight: no slide-in', () => {
    const interp = new StepInterpolator();
    const e = {};
    step(interp, [[e, 50, 60, 0]]);
    expect(interp.sample(e, 50, 60, 0, 0, {})).toMatchObject({ x: 50, y: 60 });
  });

  it('snaps on teleports and on a pooled object with a new id', () => {
    const interp = new StepInterpolator();
    const e = {};
    step(interp, [[e, 0, 0, 0, 1]]);
    step(interp, [[e, TELEPORT_DISTANCE + 1, 0, 0, 1]]);
    expect(interp.sample(e, TELEPORT_DISTANCE + 1, 0, 0, 0, {}).x).toBe(
      TELEPORT_DISTANCE + 1
    );
    step(interp, [[e, TELEPORT_DISTANCE + 5, 0, 0, 2]]);
    expect(interp.sample(e, TELEPORT_DISTANCE + 5, 0, 0, 0, {}).x).toBe(
      TELEPORT_DISTANCE + 5
    );
  });

  it('forgets what a step did not capture and draws live what moved outside a step', () => {
    const interp = new StepInterpolator();
    const a = {};
    const b = {};
    step(interp, [
      [a, 0, 0, 0],
      [b, 0, 0, 0],
    ]);
    step(interp, [[a, 5, 0, 0]]);
    expect(interp.sample(b, 0, 0, 0, 0.5, {})).toBeNull();
    expect(interp.sample(a, 7, 0, 0, 0.5, {})).toBeNull();
  });
});
