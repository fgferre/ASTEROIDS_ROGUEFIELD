import { describe, expect, it } from 'vitest';
import { ENDING_SECTOR, STORY } from '../../src/data/story.js';
import { BIOMES } from '../../src/data/biomes.js';
import { BOSS_KINDS } from '../../src/data/enemies/boss.js';
import {
  chapterTransmission,
  stageTransmission,
} from '../../src/modules/ui/transmissions.js';
import { HERALD_KINDS } from '../../src/data/enemies/herald.js';
import { SECTORS } from '../../src/data/sectors.js';

const allLines = () => [
  ...Object.values(STORY.chapter),
  ...Object.values(STORY.sector),
  ...Object.values(STORY.boss).flatMap((moments) => Object.values(moments)),
  ...Object.values(STORY.herald).flatMap((moments) => Object.values(moments)),
  ...STORY.death,
  STORY.victory,
  ...Object.values(STORY.stage).flatMap((stages) =>
    Object.values(stages).map((line) => line.text)
  ),
  ...Object.values(STORY.travel).flatMap((lines) =>
    lines.map((line) => line.text)
  ),
  ...Object.values(STORY.ending).flatMap(
    ({ choice, stakes, epitaph, lines }) => [
      choice,
      epitaph,
      ...Object.values(stakes),
      ...lines.map((line) => line.text),
    ]
  ),
];

describe('story', () => {
  it('has a chapter line per biome and three lines per boss kind', () => {
    expect(Object.keys(STORY.chapter).sort()).toEqual(
      BIOMES.map((b) => b.id).sort()
    );
    expect(Object.keys(STORY.boss).sort()).toEqual(
      Object.keys(BOSS_KINDS).sort()
    );
    Object.entries(STORY.boss).forEach(([kind, lines]) => {
      expect(Object.keys(lines)).toEqual(['warning', 'last', 'defeated']);
      expect(STORY.speaker[kind]).toBeTruthy();
    });
    expect(STORY.death).toHaveLength(4);
    expect(STORY.victory).toBeTruthy();
    expect(STORY.speaker.ring).toBeTruthy();
  });

  it('gives each Herald a speaker and a line as it appears and as it falls', () => {
    expect(Object.keys(STORY.herald)).toEqual(Object.keys(HERALD_KINDS));
    Object.keys(HERALD_KINDS).forEach((kind) => {
      expect(STORY.speaker[kind]).toBe(
        HERALD_KINDS[kind].displayName.toUpperCase()
      );
      expect(STORY.herald[kind].spawned).toBeTruthy();
      expect(STORY.herald[kind].defeated).toBeTruthy();
    });
  });

  it("names a sector by its own line, and by its biome's when it has none", () => {
    expect(chapterTransmission('outer-ring', 'debris-wake')).toMatchObject({
      key: 'chapter:debris-wake',
      text: STORY.sector['debris-wake'],
    });
    expect(chapterTransmission('outer-ring', 'no-such-sector')).toMatchObject({
      key: 'chapter:outer-ring',
      text: STORY.chapter['outer-ring'],
    });
    expect(chapterTransmission('outer-ring').text).toBe(
      STORY.chapter['outer-ring']
    );
  });

  it('flies to every sector with its journey, spoken by the Wake or the Ring', () => {
    expect(Object.keys(STORY.travel).sort()).toEqual(
      SECTORS.map((sector) => sector.id).sort()
    );
    Object.values(STORY.travel).forEach((lines) => {
      expect(lines.length).toBeGreaterThan(0);
      lines.forEach((line) => expect(['wake', 'ring']).toContain(line.speaker));
    });
    expect(STORY.speaker.wake).toBe('WAKE');
  });

  it('ends on two endings, each a title, a choice, its stakes, an epitaph and a line from the Ring then the Wake', () => {
    expect(Object.keys(STORY.ending)).toEqual(['severance', 'stewardship']);
    Object.values(STORY.ending).forEach((ending) => {
      const { title, choice, stakes, epitaph, lines } = ending;
      expect(title).toBeTruthy();
      expect(choice).toBeTruthy();
      expect(epitaph).toBeTruthy();
      expect(Object.keys(stakes)).toEqual(['ring', 'archive', 'wake']);
      expect(lines.map((line) => line.speaker)).toEqual(['ring', 'wake']);
    });
    expect(SECTORS.some((sector) => sector.id === ENDING_SECTOR)).toBe(true);
  });

  it('has a line at the third stage of every sector, and in no other place', () => {
    expect(Object.keys(STORY.stage).sort()).toEqual(
      SECTORS.map((sector) => sector.id).sort()
    );
    expect(stageTransmission('debris-wake', 3)).toMatchObject({
      key: 'stage:debris-wake:3',
      speaker: 'WAKE',
      text: STORY.stage['debris-wake'][3].text,
    });
    expect(stageTransmission('debris-wake', 2)).toBeNull();
    expect(stageTransmission(undefined, null)).toBeNull();
  });

  it('keeps every line within 90 characters and never repeats one', () => {
    const lines = allLines();
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(90));
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(STORY.boss.prime)).toBe(true);
    expect(Object.isFrozen(STORY.death)).toBe(true);
  });
});
