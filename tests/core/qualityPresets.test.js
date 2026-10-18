import { describe, it, expect } from 'vitest';
import {
  AutoQuality,
  FAST_FRAME_MS,
  FAST_HOLD_SECONDS,
  MIN_CHANGE_GAP_SECONDS,
  QUALITY_LEVELS,
  QUALITY_PRESETS,
  SLOW_FRAME_MS,
  SLOW_HOLD_SECONDS,
} from '../../src/core/qualityPresets.js';

const SLOW = SLOW_FRAME_MS + 5;
const FAST = FAST_FRAME_MS - 3;
const BETWEEN = (SLOW_FRAME_MS + FAST_FRAME_MS) / 2;

function run(q, seconds, frameMs, dt = 0.1) {
  for (let t = 0; t < seconds - 1e-9; t += dt) q.update(dt, frameMs);
}

function tracked(mode) {
  const changes = [];
  const q = new AutoQuality({ mode, onChange: (c) => changes.push(c) });
  return { q, changes };
}

describe('AutoQuality', () => {
  it('starts at the best preset and steps down after sustained slow frames', () => {
    const { q, changes } = tracked('auto');
    expect(q.preset).toBe(QUALITY_LEVELS[0]);
    run(q, SLOW_HOLD_SECONDS - 0.5, SLOW);
    expect(q.preset).toBe('ultra');
    run(q, 1, SLOW);
    expect(q.preset).toBe('high');
    expect(changes).toEqual([{ preset: 'high', auto: true }]);
  });

  it('a short spike does not count: the slow time must be continuous', () => {
    const { q } = tracked('auto');
    for (let i = 0; i < 10; i += 1) {
      run(q, SLOW_HOLD_SECONDS - 1, SLOW);
      run(q, 0.2, FAST);
    }
    expect(q.preset).toBe('ultra');
  });

  it('changes at most one level per gap', () => {
    const { q } = tracked('auto');
    run(q, MIN_CHANGE_GAP_SECONDS - 0.5, SLOW);
    expect(q.preset).toBe('high');
    run(q, MIN_CHANGE_GAP_SECONDS + 0.5, SLOW);
    expect(q.preset).toBe('medium');
  });

  it('steps back up only after sustained fast frames, never in between', () => {
    const { q } = tracked('auto');
    run(q, SLOW_HOLD_SECONDS + 0.5, SLOW);
    expect(q.preset).toBe('high');
    run(q, FAST_HOLD_SECONDS * 4, BETWEEN);
    expect(q.preset).toBe('high');
    // ultra already failed once: the way back takes twice as long
    run(q, FAST_HOLD_SECONDS + 1, FAST);
    expect(q.preset).toBe('high');
    run(q, FAST_HOLD_SECONDS, FAST);
    expect(q.preset).toBe('ultra');
  });

  it('a manual preset pins the level and disables auto', () => {
    const { q, changes } = tracked('low');
    expect(q.preset).toBe('low');
    expect(q.auto).toBe(false);
    run(q, FAST_HOLD_SECONDS * 10, FAST);
    expect(q.preset).toBe('low');
    q.setMode('auto');
    run(q, FAST_HOLD_SECONDS + 1, FAST);
    expect(q.preset).toBe('medium');
    expect(changes.at(-1)).toEqual({ preset: 'medium', auto: true });
  });

  it('dims fill and hemisphere only where shadows are on', () => {
    QUALITY_LEVELS.forEach((level) => {
      const { shadows, fillScale, hemiScale } = QUALITY_PRESETS[level];
      expect([fillScale, hemiScale]).toEqual(
        shadows > 0 ? [0.85, 0.9] : [1, 1]
      );
    });
  });
});
