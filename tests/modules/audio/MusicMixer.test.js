import { afterEach, describe, expect, it, vi } from 'vitest';
import MusicMixer, {
  computeRunIntensity,
  smoothIntensity,
} from '../../../src/modules/audio/MusicMixer.js';

describe('MusicMixer — the run danger the recorded scores follow', () => {
  afterEach(() => vi.useRealTimers());

  it('rises with wave progress, enemy density and low HP', () => {
    const calm = computeRunIntensity({ wave: 1, enemyCount: 0 });
    const busy = computeRunIntensity({ wave: 8, enemyCount: 14 });
    const full = computeRunIntensity({ wave: 15, enemyCount: 20 });
    expect(calm).toBeLessThan(busy);
    expect(busy).toBeLessThan(full);
    expect(full).toBeLessThanOrEqual(1);
    expect(
      computeRunIntensity({ wave: 6, enemyCount: 10, healthRatio: 0.2 })
    ).toBeGreaterThan(computeRunIntensity({ wave: 6, enemyCount: 10 }));
  });

  it('smooths up faster than it falls', () => {
    const up = smoothIntensity(0, 1, 1) - 0;
    const down = 1 - smoothIntensity(1, 0, 1);
    expect(up).toBeGreaterThan(down);
  });

  it('follows the run state on a timer and stops once converged', () => {
    vi.useFakeTimers();
    const mixer = new MusicMixer();
    mixer.setRunState({ wave: 15, enemyCount: 20 });
    vi.advanceTimersByTime(30000);
    expect(mixer.runIntensity).toBeCloseTo(
      computeRunIntensity({ wave: 15, enemyCount: 20 }),
      5
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('holds still while paused and starts over on resetRun', () => {
    vi.useFakeTimers();
    const mixer = new MusicMixer();
    mixer.pause(true);
    mixer.setRunState({ wave: 15, enemyCount: 20 });
    vi.advanceTimersByTime(5000);
    expect(mixer.runIntensity).toBe(0);
    mixer.pause(false);
    vi.advanceTimersByTime(5000);
    expect(mixer.runIntensity).toBeGreaterThan(0);
    mixer.resetRun();
    expect(mixer.runIntensity).toBe(0);
    expect(mixer.runState.wave).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
