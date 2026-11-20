import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(
  new URL('../../src/index.html', import.meta.url),
  'utf8'
);

// A stylesheet from another host blocks the page, and the scripts after it,
// until it arrives: a slow or stalled font service held the game at
// "Initializing... 0%" (outside audit, 19/11).
describe('index.html', () => {
  it('loads no stylesheet from another host as render-blocking', () => {
    const links = html.match(/<link\b[^>]*>/g) ?? [];
    const external = links.filter(
      (tag) => /rel="stylesheet"/.test(tag) && /href="https?:\/\//.test(tag)
    );
    expect(external.length).toBeGreaterThan(0);
    for (const tag of external) {
      expect(tag).toMatch(/media="print"/);
      expect(tag).toMatch(/onload="this\.media = 'all'"/);
    }
  });
});
