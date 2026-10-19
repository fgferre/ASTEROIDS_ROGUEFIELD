// What every content item owes the registry, whatever its kind: an id equal to
// its file name, and a unique numeric `order` when it has one. Each kind's own
// fields are checked in tests/content/<kind>.test.js.
import { describe, it, expect } from 'vitest';
import { listContent, getContent } from '../../src/content/registry.js';

const files = import.meta.glob('../../src/content/*/*.js', { eager: true });
const items = Object.entries(files).map(([path, module]) => {
  const [kind, file] = path.split('/').slice(-2);
  return { kind, file: file.replace(/\.js$/, ''), item: module.default };
});

describe('content registry', () => {
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
