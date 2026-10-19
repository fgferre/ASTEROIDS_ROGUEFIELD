// Commit gate (scripts/tocados.mjs): selection follows imports transitively,
// through test helpers, vi.mock and import.meta.glob, without touching git or
// the disk.

import { describe, it, expect } from 'vitest';
import { buildGraph, selectTests } from '../../scripts/tocados.mjs';

const graph = buildGraph({
  'src/a.js': 'export const a = 1;',
  'src/b.js': 'export const b = 2;',
  'tests/__helpers__/h.js': "import { a } from '../../src/a.js';",
  'tests/x.test.js': "import { h } from './__helpers__/h.js';",
  'tests/y.test.js': "import { b } from '../src/b.js';",
  'tests/z.test.js': "vi.mock('../src/a.js');",
});

describe('tocados test selection', () => {
  it('reaches tests through a helper and through vi.mock', () => {
    expect(selectTests(graph, ['src/a.js'])).toEqual([
      'tests/x.test.js',
      'tests/z.test.js',
    ]);
  });

  it('selects only the tests that import the touched file', () => {
    expect(selectTests(graph, ['src/b.js'])).toEqual(['tests/y.test.js']);
  });

  it('keeps a touched test and leaves unreached src unguarded', () => {
    expect(selectTests(graph, ['tests/y.test.js'])).toEqual([
      'tests/y.test.js',
    ]);
    expect(selectTests(buildGraph({ 'src/c.js': '' }), ['src/c.js'])).toEqual(
      []
    );
  });

  it('follows import.meta.glob, so a content file reaches the registry tests', () => {
    const content = buildGraph({
      'src/content/registry.js':
        "const modules = import.meta.glob('./*/*.js', { eager: true });",
      'src/content/enemies/caster.js': 'export default { id: "caster" };',
      'src/content/hulls/lib/panels.js': 'export const panels = [];',
      'src/data/biomes.js':
        "import { listContent } from '../content/registry.js';",
      'tests/content/registry.test.js':
        "const files = import.meta.glob('../../src/content/*/*.js', { eager: true });",
      'tests/data/biomes.test.js':
        "import { x } from '../../src/data/biomes.js';",
      'tests/other.test.js': '',
    });
    expect(selectTests(content, ['src/content/enemies/caster.js'])).toEqual([
      'tests/content/registry.test.js',
      'tests/data/biomes.test.js',
    ]);
    expect(selectTests(content, ['src/content/hulls/lib/panels.js'])).toEqual(
      []
    );
  });
});
