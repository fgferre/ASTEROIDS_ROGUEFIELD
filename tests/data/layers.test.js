import { describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { RUN_FINAL_LAYER } from '../../src/data/constants/gameplay.js';
import { FIELD_EVENTS, LAYERS, directorFor } from '../../src/data/layers.js';
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
