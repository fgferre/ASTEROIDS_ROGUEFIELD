import { describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { RUN_FINAL_LAYER } from '../../src/data/constants/gameplay.js';
import {
  BOSS_RUSH_LAYERS,
  FIELD_EVENTS,
  LAYERS,
  bossRushDirectorFor,
  bossRushStage,
  bossRushStageTitle,
  directorFor,
  nextBossRushLayer,
} from '../../src/data/layers.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';

const SUPPORT_KINDS = [
  'drone',
  'mine',
  'hunter',
  'husk',
  'ram',
  'bulwark',
  'weaver',
  'caster',
  'shade',
  'leech',
];

const scheduledCount = (layer) =>
  layer.roster.reduce((sum, entry) => sum + entry.count, 0) +
  layer.surges.reduce((sum, surge) => sum + surge.count, 0);

describe('layer table', () => {
  it('has one entry per layer of the run, Wardens on 5, 10 and 15', () => {
    expect(LAYERS).toHaveLength(RUN_FINAL_LAYER);
    const wardens = LAYERS.flatMap((layer, i) => (layer.warden ? [i + 1] : []));
    expect(wardens).toEqual([5, 10, 15]);
  });

  it('sends one Herald per biome: Dust on 3, Heat on 8, Silence on 13', () => {
    const heralds = LAYERS.flatMap((layer, i) =>
      layer.herald ? [[i + 1, layer.herald]] : []
    );
    expect(heralds).toEqual([
      [3, 'dust'],
      [8, 'heat'],
      [13, 'silence'],
    ]);
    expect(directorFor(18).herald).toBeUndefined();
  });

  it('lists only registered kinds, support kinds in rosters', () => {
    const restoreDom = installDomStubs();
    try {
      const { factory } = createHeadlessGame().services.enemies;
      for (const layer of LAYERS) {
        for (const { kind } of layer.roster) {
          expect(SUPPORT_KINDS).toContain(kind);
          expect(factory.hasType(kind)).toBe(true);
        }
        for (const surge of layer.surges) {
          for (const kind of surge.kinds) {
            expect(factory.hasType(kind)).toBe(true);
          }
        }
        if (layer.herald) expect(factory.hasType('herald')).toBe(true);
      }
    } finally {
      GamePools.releaseAll();
      restoreDom();
    }
  });

  it('never thins out: rocks and scheduled enemies grow layer to layer', () => {
    const regular = LAYERS.filter((layer) => !layer.warden);
    for (let i = 1; i < LAYERS.length; i += 1) {
      expect(LAYERS[i].rocks).toBeGreaterThanOrEqual(LAYERS[i - 1].rocks);
    }
    for (let i = 1; i < regular.length; i += 1) {
      expect(scheduledCount(regular[i])).toBeGreaterThanOrEqual(
        scheduledCount(regular[i - 1])
      );
    }
  });

  it('gives every surge a label and valid timing', () => {
    for (const layer of LAYERS) {
      for (const surge of layer.surges) {
        expect(surge.label).toMatch(/\S/);
        expect(surge.count).toBeGreaterThan(0);
        expect(surge.at).toBeGreaterThan(0);
      }
      for (const entry of layer.roster) {
        expect(entry.count).toBeGreaterThan(0);
        expect(entry.every).toBeGreaterThan(0);
        expect(entry.elite).toBeGreaterThanOrEqual(0);
        expect(entry.elite).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('directorFor', () => {
  it('opens on rock only with a Rockfall surge', () => {
    const first = directorFor(1);
    expect(first.roster).toEqual([]);
    expect(first.surges).toEqual([
      { at: 40, kinds: ['asteroid'], count: 6, label: 'Rockfall' },
    ]);
    expect(first.rocks).toBe(6);
  });

  it('brings Motes on 4, Seekers and Bulwarks from 11, Weavers from 13', () => {
    const kindsOn = (n) => directorFor(n).roster.map((entry) => entry.kind);
    expect(kindsOn(4)).toEqual(['drone']);
    expect(kindsOn(10)).toEqual(['drone']);
    expect(kindsOn(11)).toEqual(expect.arrayContaining(['hunter', 'bulwark']));
    expect(kindsOn(12)).not.toContain('weaver');
    expect(kindsOn(13)).toContain('weaver');
    expect(directorFor(13).surges[0]).toMatchObject({
      at: 30,
      label: 'Full field',
    });
  });

  it('brings Casters from 6 and Shades from 8, never to a Warden layer', () => {
    const kindsOn = (n) => directorFor(n).roster.map((entry) => entry.kind);
    expect(kindsOn(5)).not.toContain('caster');
    expect(kindsOn(6)).toContain('caster');
    expect(kindsOn(7)).not.toContain('shade');
    expect(kindsOn(8)).toEqual(expect.arrayContaining(['caster', 'shade']));
    expect(kindsOn(10)).not.toContain('caster');
    expect(kindsOn(14)).toEqual(expect.arrayContaining(['caster', 'shade']));
  });

  it('brings Leeches from 7, never to a Warden layer, and Scavengers on 9', () => {
    const kindsOn = (n) => directorFor(n).roster.map((entry) => entry.kind);
    expect(kindsOn(6)).not.toContain('leech');
    expect(kindsOn(7)).toContain('leech');
    expect(kindsOn(10)).not.toContain('leech');
    expect(kindsOn(14)).toContain('leech');
    expect(directorFor(15).roster.map((entry) => entry.kind)).not.toContain(
      'leech'
    );
    const scavengers = directorFor(9).surges.find(
      (surge) => surge.label === 'Scavengers'
    );
    expect(scavengers.kinds).toEqual(['leech', 'asteroid']);
    expect(scavengers.count).toBe(4); // two Leeches, two rocks to feed them
  });

  it('escorts the final Warden with Seekers', () => {
    const final = directorFor(15);
    expect(final.warden).toBe(true);
    expect(final.roster.map((entry) => entry.kind)).toEqual(['hunter']);
  });

  it('continues past the table: Wardens every fifth layer, rosters growing', () => {
    expect(directorFor(20).warden).toBe(true);
    const later = directorFor(18);
    expect(later.warden).toBe(false);
    expect(scheduledCount(later)).toBeGreaterThan(
      scheduledCount(directorFor(14))
    );
    expect(Object.isFrozen(later.roster[0])).toBe(true);
  });

  it('schedules field events of known kinds, never on a Warden layer', () => {
    const layers = [
      ...LAYERS,
      ...Array.from({ length: 15 }, (_, i) => directorFor(16 + i)),
    ];
    for (const layer of layers) {
      if (layer.warden) expect(layer.events).toEqual([]);
      for (const event of layer.events) {
        expect(Object.keys(FIELD_EVENTS)).toContain(event.kind);
        expect(event.label).toBe(FIELD_EVENTS[event.kind].label);
        expect(event.at).toBeGreaterThan(0);
      }
    }
    expect(directorFor(16).events).toHaveLength(1);
    expect(directorFor(16).events).toEqual(directorFor(16).events);
  });
});

describe('Boss Rush', () => {
  it('runs the three Warden layers in order, each named by its Warden', () => {
    expect(BOSS_RUSH_LAYERS).toEqual([5, 10, 15]);
    expect([0, 5, 10, 15].map(nextBossRushLayer)).toEqual([
      5,
      10,
      15,
      undefined,
    ]);
    expect([5, 10, 15, 6].map(bossRushStage)).toEqual([1, 2, 3, 0]);
    expect([1, 2, 3].map(bossRushStageTitle)).toEqual([
      'WARDEN 1 OF 3 — PRIME',
      'WARDEN 2 OF 3 — CHOIR',
      'WARDEN 3 OF 3 — NULL',
    ]);
  });

  it("keeps each Warden layer's Warden and escort, with few rocks and no surges or events", () => {
    for (const layer of BOSS_RUSH_LAYERS) {
      const rush = bossRushDirectorFor(layer);
      expect(rush.warden).toBe(true);
      expect(rush.roster).toEqual(directorFor(layer).roster);
      expect(rush.rocks).toBeLessThan(directorFor(layer).rocks);
      expect(rush.surges).toEqual([]);
      expect(rush.events).toEqual([]);
    }
  });
});
