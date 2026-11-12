import { describe, expect, it } from 'vitest';
import { listContent } from '../../src/content/registry.js';
import { BIOMES, biomeForLayer } from '../../src/data/biomes.js';
import { FIELD_EVENTS, FORMATIONS } from '../../src/data/layerParts.js';
import { directorFor } from '../../src/data/layers.js';
import {
  SECTORS,
  chapterSectors,
  localLayer,
  nextSector,
  sectorById,
  sectorStage,
} from '../../src/data/sectors.js';

const ROLES = new Set(listContent('enemies').flatMap(({ roles }) => roles));

describe('sector table', () => {
  it('fits each sector inside its biome, ending on a Warden layer', () => {
    expect(SECTORS.map((s) => [s.chapter, s.code])).toEqual([
      [1, 'A'],
      [1, 'B'],
      [1, 'C'],
      [2, 'A'],
      [2, 'B'],
      [2, 'C'],
      [3, 'A'],
      [3, 'B'],
      [3, 'C'],
      [4, 'A'],
    ]);
    expect(SECTORS.slice(3).map((s) => [s.id, s.order, s.name])).toEqual([
      ['furnace-drift', 4, 'FURNACE DRIFT'],
      ['crystal-choir', 5, 'CRYSTAL CHOIR'],
      ['dense-core', 6, 'RESONANCE CHAMBER'],
      ['assembly-graveyard', 7, 'ASSEMBLY GRAVEYARD'],
      ['quarantine-grid', 8, 'QUARANTINE GRID'],
      ['wardens-reach', 9, 'NULL BOUNDARY'],
      ['the-crucible', 10, 'THE CRUCIBLE'],
    ]);
    SECTORS.forEach((sector) => {
      const biome = listContent('biomes').find((b) => b.id === sector.biome);
      const [first, last] = sector.layers;
      expect(first).toBeGreaterThanOrEqual(biome.layers[0]);
      expect(last).toBeLessThanOrEqual(biome.layers[1]);
      expect(first).toBeLessThanOrEqual(last);
      expect(directorFor(last).warden).toBe(true);
    });
  });

  it('keeps chapters in order, each starting past the one before', () => {
    const chapters = [...new Set(SECTORS.map((s) => s.chapter))];
    chapters.slice(1).forEach((chapter, index) => {
      const [previous] = chapterSectors(chapters[index]);
      expect(chapterSectors(chapter)[0].layers[0]).toBeGreaterThan(
        previous.layers[1]
      );
    });
  });

  it('gives a sector one stage per layer, the Warden flag only on the last, with known parts', () => {
    SECTORS.filter((s) => s.stages).forEach(({ id, layers, stages }) => {
      const [first, last] = layers;
      expect(stages, id).toHaveLength(last - first + 1);
      stages.forEach((stage, i) => {
        expect(stage.warden, `${id} stage ${i + 1}`).toBe(first + i === last);
        // HUD, music and warnings read the global flag for the same layer.
        expect(stage.warden).toBe(directorFor(first + i).warden);
        const roles = [
          ...stage.roster.map((entry) => entry.role),
          ...stage.formations.map((entry) => entry.role),
          ...stage.surges.flatMap((surge) => surge.roles),
        ].filter((role) => role !== 'asteroid');
        roles.forEach((role) => expect(ROLES.has(role), role).toBe(true));
        stage.formations.forEach(({ kind }) =>
          expect(FORMATIONS[kind]).toBeTruthy()
        );
        stage.events.forEach(({ kind }) =>
          expect(FIELD_EVENTS[kind]).toBeTruthy()
        );
      });
    });
  });

  it('plays its own stage on its layers only, cast from its last layer, its boss on the last', () => {
    const wake = sectorById('debris-wake');
    expect(sectorStage(wake, 2)).toMatchObject({
      formations: [expect.objectContaining({ kind: 'swarm', at: 15 })],
      castLayer: 5,
    });
    expect(sectorStage(wake, 2).bossKind).toBeUndefined();
    expect(sectorStage(wake, 5)).toMatchObject({
      warden: true,
      bossKind: 'quarry-maw',
    });
    expect(sectorStage(wake, 6)).toBeNull();
    expect(sectorStage(sectorById('salvage-lanes'), 5)).toMatchObject({
      warden: true,
      bossKind: 'gatekeeper',
    });
    const furnace = sectorById('furnace-drift');
    expect(sectorStage(furnace, 6)).toMatchObject({
      roster: [expect.objectContaining({ role: 'skirmisher', count: 2 })],
      castLayer: 10,
    });
    expect(sectorStage(furnace, 8).herald).toBe('heat');
    expect(sectorStage(furnace, 9).bossKind).toBeUndefined();
    expect(sectorStage(furnace, 10)).toMatchObject({
      warden: true,
      bossKind: 'kiln-engine',
    });
    expect(sectorStage(furnace, 5)).toBeNull();
    const crystal = sectorById('crystal-choir');
    expect(sectorStage(crystal, 6)).toMatchObject({
      roster: [expect.objectContaining({ role: 'sniper', count: 1 })],
      castLayer: 10,
    });
    expect(sectorStage(crystal, 8).formations).toEqual([
      expect.objectContaining({
        kind: 'sweep',
        role: 'minelayer',
        spacing: 200,
      }),
    ]);
    expect(sectorStage(crystal, 9).events).toEqual([
      expect.objectContaining({ kind: 'gravity-well', at: 35 }),
    ]);
    expect(sectorStage(crystal, 10)).toMatchObject({
      warden: true,
      bossKind: 'prism-crown',
    });
    const graveyard = sectorById('assembly-graveyard');
    expect(sectorStage(graveyard, 11)).toMatchObject({
      roster: [
        expect.objectContaining({ role: 'skirmisher', count: 2 }),
        expect.objectContaining({ role: 'carrier', count: 1 }),
      ],
      castLayer: 15,
    });
    expect(sectorStage(graveyard, 12).formations).toEqual([
      expect.objectContaining({ kind: 'swarm', role: 'swarmer', count: 8 }),
    ]);
    expect(sectorStage(graveyard, 13).events).toEqual([
      expect.objectContaining({ kind: 'sensor-jam', at: 30 }),
    ]);
    expect(sectorStage(graveyard, 14).roster[0]).toMatchObject({
      role: 'tank',
      elite: 0.2,
    });
    expect(sectorStage(graveyard, 15)).toMatchObject({
      warden: true,
      bossKind: 'foundry-mother',
    });
    const grid = sectorById('quarantine-grid');
    expect(sectorStage(grid, 11).roster).toEqual([
      expect.objectContaining({ role: 'marksman', count: 1 }),
      expect.objectContaining({ role: 'flanker', count: 1 }),
    ]);
    expect(sectorStage(grid, 12)).toMatchObject({
      formations: [
        expect.objectContaining({
          kind: 'sweep',
          role: 'minelayer',
          count: 3,
          spacing: 200,
        }),
      ],
      events: [expect.objectContaining({ kind: 'sensor-jam', at: 30 })],
    });
    expect(sectorStage(grid, 13).herald).toBe('silence');
    expect(sectorStage(grid, 14)).toMatchObject({
      formations: [
        expect.objectContaining({ kind: 'ring', role: 'swarmer', count: 10 }),
      ],
      events: [expect.objectContaining({ kind: 'gravity-well', at: 35 })],
    });
    expect(sectorStage(grid, 15)).toMatchObject({
      warden: true,
      bossKind: 'interdictor',
      castLayer: 15,
    });
    const crucible = sectorById('the-crucible');
    expect(sectorStage(crucible, 16)).toMatchObject({ castLayer: 20 });
    expect(sectorStage(crucible, 18).herald).toBe('heat');
    expect(sectorStage(crucible, 19).roster).toHaveLength(4);
    expect(sectorStage(crucible, 20)).toMatchObject({
      warden: true,
      bossKind: 'sovereign',
    });
    expect(sectorStage(crucible, 15)).toBeNull();
    expect(sectorStage(sectorById('prime-gate'), 2)).toBeNull();
    expect(sectorStage(null, 2)).toBeNull();
  });

  it('numbers layers inside a sector and walks to the next one', () => {
    const dense = sectorById('dense-core');
    expect(localLayer(dense, 6)).toBe(1);
    expect(localLayer(dense, 10)).toBe(5);
    expect(nextSector(sectorById('debris-wake')).id).toBe('salvage-lanes');
    expect(nextSector(sectorById('prime-gate')).id).toBe('furnace-drift');
    expect(nextSector(sectorById('furnace-drift')).id).toBe('crystal-choir');
    expect(nextSector(sectorById('crystal-choir')).id).toBe('dense-core');
    expect(nextSector(dense).id).toBe('assembly-graveyard');
    expect(nextSector(sectorById('assembly-graveyard')).id).toBe(
      'quarantine-grid'
    );
    expect(nextSector(sectorById('quarantine-grid')).id).toBe('wardens-reach');
    expect(nextSector(sectorById('wardens-reach')).id).toBe('the-crucible');
    expect(nextSector(sectorById('the-crucible'))).toBeNull();
    expect(sectorById('nowhere')).toBeNull();
  });

  it("lays a sector's look over its biome on its own layers only", () => {
    const wake = sectorById('debris-wake');
    const ring = BIOMES.find((b) => b.id === 'outer-ring');
    const place = biomeForLayer(2, wake);
    Object.keys(ring).forEach((field) =>
      expect(place[field]).toEqual(wake.look[field] ?? ring[field])
    );
    expect(place.place).toBe('debris-wake');
    expect(biomeForLayer(6, wake)).toBe(biomeForLayer(6));
    const bare = { ...sectorById('prime-gate'), look: undefined };
    expect(biomeForLayer(2, bare)).toBe(ring);
    expect(biomeForLayer(2)).toBe(ring);
  });

  it('flies the Crucible in its own place, which the descent never reaches', () => {
    const crucible = sectorById('the-crucible');
    expect(crucible).toMatchObject({ chapter: 4, layers: [16, 20] });
    expect(biomeForLayer(16, crucible).id).toBe('crucible');
    expect(biomeForLayer(20, crucible).title).toBe('FINALE — THE CRUCIBLE');
    expect(biomeForLayer(16).id).toBe('wardens-reach');
    expect(biomeForLayer(21, crucible).id).toBe('wardens-reach');
    expect(BIOMES.map((b) => b.id)).not.toContain('crucible');
  });
});
