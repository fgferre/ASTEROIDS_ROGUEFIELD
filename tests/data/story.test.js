import { describe, expect, it } from 'vitest';
import { STORY } from '../../src/data/story.js';
import { BIOMES } from '../../src/data/biomes.js';
import { chapterTransmission } from '../../src/modules/ui/transmissions.js';
import { HERALD_KINDS } from '../../src/data/enemies/herald.js';
import { SECTORS } from '../../src/data/sectors.js';

const allLines = () => [
  ...Object.values(STORY.chapter),
  ...Object.values(STORY.sector),
  ...Object.values(STORY.warden).flatMap((moments) => Object.values(moments)),
  ...Object.values(STORY.herald).flatMap((moments) => Object.values(moments)),
  ...STORY.death,
  STORY.victory,
  ...Object.values(STORY.travel).flatMap((lines) =>
    lines.map((line) => line.text)
  ),
];

describe('story', () => {
  it('has a chapter line per biome and the Warden lines per Warden layer', () => {
    expect(Object.keys(STORY.chapter).sort()).toEqual(
      BIOMES.map((b) => b.id).sort()
    );
    expect(Object.keys(STORY.warden)).toEqual(['5', '10', '15']);
    [5, 10].forEach((layer) => {
      expect(STORY.warden[layer].warning).toBeTruthy();
      expect(STORY.warden[layer].defeated).toBeTruthy();
    });
    expect(STORY.warden[15].warning).toBeTruthy();
    expect(STORY.death).toHaveLength(4);
    expect(STORY.victory).toBeTruthy();
    ['ring', 5, 10, 15].forEach((who) =>
      expect(STORY.speaker[who]).toBeTruthy()
    );
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
    expect(chapterTransmission('outer-ring', 'prime-gate')).toMatchObject({
      key: 'chapter:outer-ring',
      text: STORY.chapter['outer-ring'],
    });
    expect(chapterTransmission('outer-ring').text).toBe(
      STORY.chapter['outer-ring']
    );
  });

  it('flies to every sector with its journey, spoken by the Wake or the Ring', () => {
    // The journey into the last chapter waits for its sector's cycle.
    expect(Object.keys(STORY.travel).sort()).toEqual(
      SECTORS.filter((sector) => sector.chapter <= 3)
        .map((sector) => sector.id)
        .sort()
    );
    Object.values(STORY.travel).forEach((lines) => {
      expect(lines.length).toBeGreaterThan(0);
      lines.forEach((line) => expect(['wake', 'ring']).toContain(line.speaker));
    });
    expect(STORY.speaker.wake).toBe('WAKE');
  });

  it('keeps every line within 90 characters and never repeats one', () => {
    const lines = allLines();
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(90));
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(STORY.warden[5])).toBe(true);
    expect(Object.isFrozen(STORY.death)).toBe(true);
  });
});
