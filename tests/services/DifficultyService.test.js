import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../__helpers__/headlessGame.js';
import DifficultyService, {
  DAILY_STORAGE_KEY,
  dailyLabel,
  dailySeed,
  seedLink,
} from '../../src/services/DifficultyService.js';
import GameSessionService from '../../src/services/GameSessionService.js';
import { DIFFICULTY_PRESETS } from '../../src/data/difficulty.js';

const settingsWith = (difficulty) => ({
  getSetting: (category, key) =>
    category === 'gameplay' && key === 'difficulty' ? difficulty : undefined,
});

const at = (iso) => () => new Date(iso);

describe('DifficultyService', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreDom();
  });

  it('reads the preset from the setting, Veteran by default', () => {
    expect(
      new DifficultyService({ settings: settingsWith('warden') }).getModifiers()
    ).toBe(DIFFICULTY_PRESETS.warden);
    expect(
      new DifficultyService({
        settings: settingsWith(undefined),
      }).getDifficulty()
    ).toBe('veteran');
  });

  it('locks the preset when a run begins', () => {
    const settings = settingsWith('pilot');
    const service = new DifficultyService({ settings });
    service.beginRun({ daily: false });
    settings.getSetting = () => 'warden';
    expect(service.getDifficulty()).toBe('pilot');
    service.beginRun();
    expect(service.getDifficulty()).toBe('warden');
  });

  it('takes ?seed= as the boot seed and ?difficulty= over the setting', () => {
    window.location.search = '?seed=2229850880&difficulty=warden';
    const { seed, source } = GameSessionService.deriveInitialSeed();
    expect({ seed, source }).toEqual({ seed: 2229850880, source: 'url' });

    const service = new DifficultyService({
      settings: settingsWith('pilot'),
      bootSeed: seed,
    });
    expect(service.beginRun({ daily: false })).toBe(2229850880);
    expect(service.getDifficulty()).toBe('warden');
    expect(service.runLabel()).toBe('SEED 2229850880 · WARDEN');
  });

  it('keeps the boot seed for the first run, then draws a fresh seed per run', () => {
    vi.spyOn(crypto, 'getRandomValues')
      .mockImplementationOnce((buffer) => Object.assign(buffer, [111]))
      .mockImplementationOnce((buffer) => Object.assign(buffer, [222]));
    const service = new DifficultyService({
      settings: settingsWith('veteran'),
      bootSeed: 7,
      bootSeedSource: 'crypto',
    });
    expect(service.beginRun({ daily: false })).toBe(7);
    expect(service.beginRun()).toBe(111);
    expect(service.getRunSeed()).toBe(111);
    expect(service.beginRun()).toBe(222);
  });

  it.each(['url', 'localStorage', 'replay', 'profile-harness'])(
    'keeps a %s boot seed for every run',
    (bootSeedSource) => {
      const service = new DifficultyService({
        settings: settingsWith('veteran'),
        bootSeed: 7,
        bootSeedSource,
      });
      expect(service.beginRun({ daily: false })).toBe(7);
      expect(service.beginRun()).toBe(7);
      expect(service.beginRun()).toBe(7);
    }
  );

  it('builds the shareable seed link', () => {
    expect(
      seedLink('https://x.io', '/ASTEROIDS_ROGUEFIELD/', 42, 'veteran')
    ).toBe('https://x.io/ASTEROIDS_ROGUEFIELD/?seed=42&difficulty=veteran');
  });

  it('derives a stable Daily Field seed per UTC date, different across dates', () => {
    expect(dailySeed('2026-10-18')).toBe(dailySeed('2026-10-18'));
    expect(dailySeed('2026-10-18')).not.toBe(dailySeed('2026-10-19'));
    expect(dailyLabel('2026-10-18')).toBe('DAILY FIELD · 18 OCT');

    // 23:30 in UTC-3 is already the next UTC day.
    const service = new DifficultyService({
      settings: settingsWith('warden'),
      bootSeed: 1,
      now: at('2026-10-19T02:30:00.000Z'),
    });
    expect(service.beginRun({ daily: true })).toBe(dailySeed('2026-10-19'));
    expect(service.getDifficulty()).toBe('veteran');
    expect(service.runLabel()).toBe(
      `DAILY FIELD · 19 OCT · SEED ${dailySeed('2026-10-19')}`
    );
    // New Mission keeps the mode; Start leaves it.
    expect(service.beginRun()).toBe(dailySeed('2026-10-19'));
    expect(service.beginRun({ daily: false })).toBe(1);
    expect(service.getDifficulty()).toBe('warden');
  });

  it('keeps a separate Daily Field record that resets with the date', () => {
    let now = '2026-10-18T12:00:00.000Z';
    const service = new DifficultyService({
      settings: settingsWith('veteran'),
      now: () => new Date(now),
    });
    service.beginRun({ daily: false });
    expect(service.recordRun({ layer: 9, time: 300 })).toBeNull();
    expect(localStorage.getItem(DAILY_STORAGE_KEY)).toBeNull();

    service.beginRun({ daily: true });
    service.recordRun({ layer: 4, time: 120 });
    service.recordRun({ layer: 3, time: 200 });
    expect(service.getDailyRecord()).toEqual({
      date: '2026-10-18',
      bestLayer: 4,
      bestTime: 200,
    });

    now = '2026-10-19T00:10:00.000Z';
    expect(service.getDailyRecord().bestLayer).toBe(0);
  });

  it('plays a replay at its recorded difficulty, old ones at Veteran', () => {
    const service = new DifficultyService({ settings: settingsWith('pilot') });
    service.useReplay({ difficulty: 'warden' });
    service.beginRun({ daily: false });
    expect(service.getDifficulty()).toBe('warden');
    service.useReplay({});
    service.beginRun();
    expect(service.getDifficulty()).toBe('veteran');
  });
});
