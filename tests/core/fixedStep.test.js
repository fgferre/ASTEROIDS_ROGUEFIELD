import { describe, it, expect } from 'vitest';
import {
  createFixedStepper,
  FIXED_STEP_SECONDS,
  MAX_STEPS_PER_FRAME,
} from '../../src/core/fixedStep.js';

describe('createFixedStepper', () => {
  it('runs one step per 1/60 s frame and carries the remainder', () => {
    const s = createFixedStepper();
    expect(s.advance(FIXED_STEP_SECONDS)).toBe(1);
    expect(s.advance(FIXED_STEP_SECONDS / 2)).toBe(0);
    expect(s.advance(FIXED_STEP_SECONDS / 2)).toBe(1);
    expect(s.alpha).toBeCloseTo(0, 6);
  });

  it('catches up after a slow frame instead of slowing the game down', () => {
    const s = createFixedStepper();
    expect(s.advance(FIXED_STEP_SECONDS * 3)).toBe(3);
  });

  it('caps the catch-up and drops the backlog on a very long frame', () => {
    const s = createFixedStepper();
    expect(s.advance(1.0)).toBe(MAX_STEPS_PER_FRAME);
    expect(s.alpha).toBe(0);
  });

  it('ignores negative, NaN and zero deltas', () => {
    const s = createFixedStepper();
    expect(s.advance(-1)).toBe(0);
    expect(s.advance(Number.NaN)).toBe(0);
    expect(s.advance(0)).toBe(0);
    expect(s.alpha).toBe(0);
  });

  it('exposes the leftover fraction as alpha and can reset', () => {
    const s = createFixedStepper();
    s.advance(FIXED_STEP_SECONDS * 1.25);
    expect(s.alpha).toBeCloseTo(0.25, 6);
    s.reset();
    expect(s.alpha).toBe(0);
  });
});
