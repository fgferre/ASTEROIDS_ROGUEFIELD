// The changelog (src/data/changelog.js): the number the menu shows is the newest
// published entry's, and a list stays readable as several branches add to it.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NEXT, RELEASES } from '../../src/data/changelog.js';

const GROUPS = ['new', 'improved', 'fixed'];
const numbers = (v) => v.split('.').map(Number);
const lines = (entry) => GROUPS.flatMap((g) => entry[g]);
// The sentences for changes nobody sees: never in the game, kept for Felipe.
const unseen = (entry) => entry.unseen ?? [];

describe('the changelog', () => {
  it("tops with the game's own version (package.json, as the menu shows it)", () => {
    expect(RELEASES[0].version).toBe(__GAME_VERSION__);
  });

  it('numbers each publication 0.x.y, newest first, never twice', () => {
    RELEASES.forEach(({ version, date }, i) => {
      expect(version).toMatch(/^0\.\d+\.\d+$/);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (i === 0) return;
      const [, mid, last] = numbers(version);
      const [, newerMid, newerLast] = numbers(RELEASES[i - 1].version);
      expect(newerMid > mid || (newerMid === mid && newerLast > last)).toBe(
        true
      );
      expect(RELEASES[i - 1].date >= date).toBe(true);
    });
  });

  it('gives every publication at least one line, and only the three groups', () => {
    for (const entry of [NEXT, ...RELEASES]) {
      for (const g of GROUPS) expect(Array.isArray(entry[g])).toBe(true);
      expect(Array.isArray(unseen(entry))).toBe(true);
    }
    expect(Array.isArray(NEXT.unseen)).toBe(true);
    for (const entry of RELEASES)
      expect(lines(entry).length).toBeGreaterThan(0);
  });

  it('never lists a line twice (a branch merged after a publication brings old lines back)', () => {
    const all = [NEXT, ...RELEASES].flatMap((e) => [...lines(e), ...unseen(e)]);
    const twice = all.filter((line, i) => all.indexOf(line) !== i);
    expect(twice).toEqual([]);
  });

  it('keeps lines still waiting for Felipe out of the published versions', () => {
    const source = readFileSync(
      new URL('../../src/data/changelog.js', import.meta.url),
      'utf8'
    );
    const published = source.slice(source.indexOf('export const RELEASES'));
    expect(published).not.toContain('not confirmed');
  });
});
