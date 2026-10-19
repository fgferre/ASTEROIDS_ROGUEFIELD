// Content registry (PLAN.md, Rodada 0): content is data, behavior is a small
// library, and this file links the two. Every file under src/content/<kind>/ is
// one item, `export default { id, ... }`, with the id equal to the file name:
// creating the file registers the item, and nothing in the engine lists content
// by hand. Items are listed by `order` (where the order decides a draw, so the
// sequence of a run never depends on file names), then by id.
const modules = import.meta.glob('./*/*.js', { eager: true });

const lists = new Map();
const indexes = new Map();

for (const [path, module] of Object.entries(modules)) {
  const kind = path.split('/')[1];
  if (!lists.has(kind)) {
    lists.set(kind, []);
    indexes.set(kind, new Map());
  }
  lists.get(kind).push(module.default);
  indexes.get(kind).set(module.default.id, module.default);
}

// Plain code-unit comparison, not localeCompare: the order must not depend on
// the browser's locale.
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
for (const items of lists.values()) {
  items.sort(
    (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || byId(a, b)
  );
}

/** Every item of a kind (`enemies`, `weapons`, `cards`, ...), in order. */
export function listContent(kind) {
  return lists.get(kind) ?? [];
}

/** One item by kind and id, or undefined. */
export function getContent(kind, id) {
  return indexes.get(kind)?.get(id);
}
