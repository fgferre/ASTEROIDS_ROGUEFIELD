import { describe, expect, it } from 'vitest';
import { STORY } from '../../src/data/story.js';
import { BIOMES } from '../../src/data/biomes.js';
import { HERALD_KINDS } from '../../src/data/enemies/herald.js';

const allLines = () => [
  ...Object.values(STORY.chapter),
  ...Object.values(STORY.warden).flatMap((moments) => Object.values(moments)),
  ...Object.values(STORY.herald).flatMap((moments) => Object.values(moments)),
  ...STORY.death,
  STORY.victory,
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
