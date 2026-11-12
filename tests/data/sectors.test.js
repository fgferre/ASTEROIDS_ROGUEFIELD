import { describe, expect, it } from 'vitest';
import { listContent } from '../../src/content/registry.js';
import { BIOMES } from '../../src/data/biomes.js';
import { FIELD_EVENTS, FORMATIONS } from '../../src/data/layerParts.js';
import { LAYERS } from '../../src/data/layers.js';
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
      [2, 'C'],
      [3, 'A'],
    ]);
    // order 5 is kept for a later chapter-two sector
    expect(SECTORS.slice(3).map((s) => [s.id, s.order, s.name])).toEqual([
      ['furnace-drift', 4, 'FURNACE DRIFT'],
      ['dense-core', 6, 'RESONANCE CHAMBER'],
      ['wardens-reach', 7, "WARDEN'S REACH"],
    ]);
    SECTORS.forEach((sector) => {
      const biome = BIOMES.find((b) => b.id === sector.biome);
      const [first, last] = sector.layers;
      expect(first).toBeGreaterThanOrEqual(biome.layers[0]);
      expect(last).toBeLessThanOrEqual(biome.layers[1]);
      expect(first).toBeLessThanOrEqual(last);
      expect(LAYERS[last - 1].warden).toBe(true);
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
        expect(stage.warden).toBe(LAYERS[first + i - 1].warden);
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
    expect(sectorStage(sectorById('prime-gate'), 2)).toBeNull();
    expect(sectorStage(null, 2)).toBeNull();
  });

  it('numbers layers inside a sector and walks to the next one', () => {
    const dense = sectorById('dense-core');
    expect(localLayer(dense, 6)).toBe(1);
    expect(localLayer(dense, 10)).toBe(5);
    expect(nextSector(sectorById('debris-wake')).id).toBe('salvage-lanes');
    expect(nextSector(sectorById('prime-gate')).id).toBe('furnace-drift');
    expect(nextSector(sectorById('furnace-drift')).id).toBe('dense-core');
    expect(nextSector(dense).id).toBe('wardens-reach');
    expect(nextSector(sectorById('wardens-reach'))).toBeNull();
    expect(sectorById('nowhere')).toBeNull();
  });
});
