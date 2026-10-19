// What every content item owes the registry, whatever its kind: an id equal to
// its file name, and a unique numeric `order` when it has one. Each kind's own
// fields are checked in tests/content/<kind>.test.js. The content files'
// imports are checked here too, from their text (CONTENT.md, "The rule").
import { posix } from 'node:path';
import { describe, it, expect } from 'vitest';
import { listContent, getContent } from '../../src/content/registry.js';

const files = import.meta.glob('../../src/content/*/*.js', { eager: true });
const items = Object.entries(files).map(([path, module]) => {
  const [kind, file] = path.split('/').slice(-2);
  return { kind, file: file.replace(/\.js$/, ''), item: module.default };
});

// What a content file may import: other content files, deepFreeze, layerParts
// and the constants, except constants/visual.js, which reads the registry
// (importing it closes an import cycle that crashes every test at load).
const sources = import.meta.glob(
  ['../../src/content/*/*.js', '../../src/content/*/lib/*.js'],
  { query: '?raw', import: 'default', eager: true }
);
const IMPORT =
  /^\s*(?:(?:import|export)\b[^'"]*?\bfrom|import)\s*['"]([^'"]+)['"]/gm;
const allowed = (target) =>
  /^\.\.\/\.\.\/src\/content\/[^/]+\/(lib\/)?[^/]+\.js$/.test(target) ||
  target === '../../src/utils/deepFreeze.js' ||
  target === '../../src/data/layerParts.js' ||
  (target.startsWith('../../src/data/constants/') &&
    target !== '../../src/data/constants/visual.js');

describe('content registry', () => {
  it('has content files import only what the rule allows', () => {
    const imports = Object.entries(sources).flatMap(([path, source]) =>
      [...source.matchAll(IMPORT)].map(([, specifier]) => ({
        path,
        specifier,
        target: posix.join(posix.dirname(path), specifier),
      }))
    );
    expect(imports.length).toBeGreaterThan(0);
    const outside = imports
      .filter(({ target }) => !allowed(target))
      .map(({ path, specifier }) => `${path} imports '${specifier}'`);
    expect(outside).toEqual([]);
  });

  it.each(items)(
    '$kind/$file exports an item named after its file',
    (entry) => {
      expect(entry.item?.id).toBe(entry.file);
      expect(getContent(entry.kind, entry.file)).toBe(entry.item);
    }
  );

  it('lists each kind by order, with no order used twice', () => {
    for (const kind of new Set(items.map((entry) => entry.kind))) {
      const orders = listContent(kind)
        .map((item) => item.order)
        .filter((order) => order !== undefined);
      expect(orders.every(Number.isFinite)).toBe(true);
      expect(new Set(orders).size).toBe(orders.length);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    }
  });
});
