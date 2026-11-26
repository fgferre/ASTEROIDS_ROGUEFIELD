import { describe, expect, it } from 'vitest';
import {
  FIRST_RUN_MODE,
  replayModeOptions,
  runModeFor,
} from '../../src/core/runMode.js';

describe('the kind of run', () => {
  it('a sector wins over daily and Boss Rush', () => {
    const mode = runModeFor({ sector: 'dense-core', bossRush: true });
    expect(mode.kind).toBe('sector');
    expect(mode.sector.id).toBe('dense-core');
  });

  it('New Mission (nothing given) keeps the last kind, sector included', () => {
    for (const options of [
      { sector: 'debris-wake' },
      { bossRush: true },
      { daily: true },
      { daily: false, bossRush: false },
    ]) {
      const last = runModeFor(options);
      expect(runModeFor({}, last).kind).toBe(last.kind);
      expect(runModeFor({}, last).sector).toBe(last.sector);
    }
  });

  it('a mode picked without a sector drops the last sector', () => {
    const last = runModeFor({ sector: 'debris-wake' });
    expect(runModeFor({ daily: true }, last).kind).toBe('daily');
    expect(runModeFor({ bossRush: false }, last).kind).toBe('descent');
  });

  it('a recording reopens in the kind it kept', () => {
    for (const options of [
      { daily: true },
      { bossRush: true },
      { daily: false, bossRush: false },
    ]) {
      const mode = runModeFor(options);
      expect(runModeFor(replayModeOptions(mode.replayMode)).kind).toBe(
        mode.kind
      );
    }
  });

  it('starts as the Descent', () => {
    expect(FIRST_RUN_MODE.kind).toBe('descent');
  });

  // The Daily Field is the Descent with today's seed: it answers every other
  // question the Descent's way, so the two cannot drift apart unnoticed.
  it("the Daily Field answers as the Descent but for today's seed", () => {
    const SWAPS = [
      'kind',
      'usesTodaysSeed',
      'forcedDifficulty',
      'writesTodaysRecord',
      'replayMode',
    ];
    const daily = runModeFor({ daily: true });
    const descent = runModeFor({ daily: false, bossRush: false });
    const others = Object.keys(descent).filter((key) => !SWAPS.includes(key));
    expect(Object.keys(daily).sort()).toEqual(Object.keys(descent).sort());
    for (const key of others)
      expect([key, daily[key]]).toEqual([key, descent[key]]);
    expect(SWAPS.filter((key) => daily[key] === descent[key])).toEqual([]);
  });
});
