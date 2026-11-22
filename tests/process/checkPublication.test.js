// The deploy's check (scripts/check-publication.mjs): a publication without a
// new number, or with the coming version's list left unstamped, stays off the site.

import { describe, it, expect } from 'vitest';
import { publicationProblems } from '../../scripts/check-publication.mjs';

const EMPTY = { new: [], improved: [], fixed: [] };

describe('the publication check', () => {
  it('lets a new number with an empty coming list through', () => {
    expect(
      publicationProblems({
        version: '0.7.0',
        previousVersion: '0.6.1',
        next: EMPTY,
      })
    ).toEqual([]);
  });

  it('stops a publication that kept the old number', () => {
    const problems = publicationProblems({
      version: '0.6.1',
      previousVersion: '0.6.1',
      next: EMPTY,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('não mudou');
  });

  it('stops a publication whose coming list was not moved into the new version', () => {
    const problems = publicationProblems({
      version: '0.7.0',
      previousVersion: '0.6.1',
      next: { ...EMPTY, fixed: ['A line.'] },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('1 linha');
  });

  it('counts the unseen sentences too: they go with the list into the new version', () => {
    const problems = publicationProblems({
      version: '0.7.1',
      previousVersion: '0.7.0',
      next: { ...EMPTY, unseen: ['A sentence.'] },
    });
    expect(problems).toHaveLength(1);
  });
});
