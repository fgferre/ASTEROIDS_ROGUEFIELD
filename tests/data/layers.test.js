import { describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { RUN_FINAL_LAYER } from '../../src/data/constants/gameplay.js';
import { FORMATIONS } from '../../src/data/layerParts.js';
import {
  BOSS_RUSH_LAYERS,
  FIELD_EVENTS,
  LAYERS,
  bossRushDirectorFor,
  bossRushStage,
  bossRushStageTitle,
  directorFor,
  enemiesFor,
  nextBossRushLayer,
} from '../../src/data/layers.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';

const rolesOf = (layer) => [
  ...layer.roster.map(({ role }) => role),
  ...layer.surges.flatMap(({ roles }) => roles),
  ...layer.formations.map(({ role }) => role),
];

// The enemies layer n's roster can bring (each roster role's enemies).
const kindsOn = (n) =>
  directorFor(n).roster.flatMap(({ role }) =>
    enemiesFor(role, n).map(({ id }) => id)
  );

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

  it('asks for roles some enemy fills on that layer, enemies the factory builds', () => {
    const restoreDom = installDomStubs();
    try {
      const { factory } = createHeadlessGame().services.enemies;
      LAYERS.forEach((layer, i) => {
        for (const role of rolesOf(layer)) {
          const kinds =
            role === 'asteroid'
              ? [role]
              : enemiesFor(role, i + 1).map(({ id }) => id);
          expect(kinds.length, `${role} on layer ${i + 1}`).toBeGreaterThan(0);
          for (const kind of kinds) expect(factory.hasType(kind)).toBe(true);
        }
        if (layer.herald) expect(factory.hasType('herald')).toBe(true);
      });
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

describe('formations', () => {
  const unitsOn = (layer) =>
    layer.formations.reduce((sum, { count }) => sum + count, 0);

  it('come in known shapes, with a role, units and a time, never on a Warden layer', () => {
    for (const layer of LAYERS) {
      if (layer.warden) expect(layer.formations).toEqual([]);
      for (const entry of layer.formations) {
        expect(FORMATIONS[entry.kind], entry.kind).toBeDefined();
        expect(entry.role).toMatch(/\S/);
        expect(entry.count).toBeGreaterThanOrEqual(
          entry.kind === 'wall' ? 2 : 1
        );
        expect(entry.at).toBeGreaterThan(0);
        expect(entry.elite).toBeGreaterThanOrEqual(0);
        expect(entry.elite).toBeLessThanOrEqual(1);
      }
    }
  });

  it('use every shape on two layers or more, all four only on the deepest, more units deeper', () => {
    for (const kind of Object.keys(FORMATIONS)) {
      const layers = LAYERS.filter((layer) =>
        layer.formations.some((entry) => entry.kind === kind)
      );
      expect(layers.length, kind).toBeGreaterThanOrEqual(2);
    }
    const shapesOn = (layer) =>
      new Set(layer.formations.map(({ kind }) => kind)).size;
    expect(shapesOn(LAYERS[13])).toBe(Object.keys(FORMATIONS).length);
    const deepest = unitsOn(LAYERS[13]);
    LAYERS.slice(0, 13).forEach((layer) => {
      expect(shapesOn(layer)).toBeLessThan(Object.keys(FORMATIONS).length);
      expect(unitsOn(layer)).toBeLessThan(deepest);
    });
  });
});

describe('directorFor', () => {
  it('opens on rock only with a Rockfall surge', () => {
    const first = directorFor(1);
    expect(first.roster).toEqual([]);
    expect(first.surges).toEqual([
      { at: 40, roles: ['asteroid'], count: 6, label: 'Rockfall' },
    ]);
    expect(first.rocks).toBe(6);
  });

  it('brings Motes on 4, Seekers and Bulwarks from 11, Weavers from 13', () => {
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
    expect(kindsOn(5)).not.toContain('caster');
    expect(kindsOn(6)).toContain('caster');
    expect(kindsOn(7)).not.toContain('shade');
    expect(kindsOn(8)).toEqual(expect.arrayContaining(['caster', 'shade']));
    expect(kindsOn(10)).not.toContain('caster');
    expect(kindsOn(14)).toEqual(expect.arrayContaining(['caster', 'shade']));
  });

  it('brings Leeches from 7, never to a Warden layer, and Scavengers on 9', () => {
    expect(kindsOn(6)).not.toContain('leech');
    expect(kindsOn(7)).toContain('leech');
    expect(kindsOn(10)).not.toContain('leech');
    expect(kindsOn(14)).toContain('leech');
    expect(kindsOn(15)).not.toContain('leech');
    const scavengers = directorFor(9).surges.find(
      (surge) => surge.label === 'Scavengers'
    );
    expect(scavengers.roles).toEqual(['scavenger', 'asteroid']);
    expect(scavengers.count).toBe(4); // two Leeches, two rocks to feed them
  });

  it('escorts the final Warden with Seekers', () => {
    const final = directorFor(15);
    expect(final.warden).toBe(true);
    expect(kindsOn(15)).toEqual(['hunter']);
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

  it("keeps each Warden layer's Warden and escort, with few rocks and no surges, formations or events", () => {
    for (const layer of BOSS_RUSH_LAYERS) {
      const rush = bossRushDirectorFor(layer);
      expect(rush.warden).toBe(true);
      expect(rush.roster).toEqual(directorFor(layer).roster);
      expect(rush.rocks).toBeLessThan(directorFor(layer).rocks);
      expect(rush.surges).toEqual([]);
      expect(rush.formations).toEqual([]);
      expect(rush.events).toEqual([]);
    }
  });
});
