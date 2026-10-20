// The node test environment has no DOM: just enough element for the HUD's
// instrument models. querySelector returns one stable fake per selector and
// querySelectorAll ten, so a model's mount finds every part it looks up.

export function fakeElement() {
  const classes = new Set();
  const parts = new Map();
  const part = (key) => {
    if (!parts.has(key)) parts.set(key, fakeElement());
    return parts.get(key);
  };
  const el = {
    parent: null,
    children: [],
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
    },
    dataset: {},
    attributes: {},
    textContent: '',
    innerHTML: '',
    offsetWidth: 0,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, on = !classes.has(name)) =>
        on ? classes.add(name) : classes.delete(name),
    },
    set className(value) {
      classes.clear();
      String(value)
        .split(' ')
        .filter(Boolean)
        .forEach((name) => classes.add(name));
    },
    get className() {
      return [...classes].join(' ');
    },
    // Feed rows read their label and value spans from these.
    get firstChild() {
      return el.children[0] ?? part('first');
    },
    get lastChild() {
      return part('last');
    },
    setAttribute(name, value) {
      el.attributes[name] = String(value);
    },
    appendChild(child) {
      child.parent = el;
      el.children.push(child);
      return child;
    },
    prepend(child) {
      if (child.parent === el) {
        el.children = el.children.filter((c) => c !== child);
      }
      child.parent = el;
      el.children.unshift(child);
    },
    replaceChildren(...children) {
      el.children = [];
      children.forEach((child) => el.appendChild(child));
    },
    remove() {
      if (el.parent) {
        el.parent.children = el.parent.children.filter((c) => c !== el);
      }
      el.parent = null;
    },
    querySelector: (selector) => part(selector),
    querySelectorAll: (selector) =>
      Array.from({ length: 10 }, (_, i) => part(`${selector} ${i}`)),
  };
  return el;
}

/** A stand-in for `document` while a model mounts (vi.stubGlobal). */
export const fakeDocument = () => ({
  createElement: fakeElement,
  createElementNS: (_ns, _name) => fakeElement(),
});

/**
 * A HUD layer with one fake container per slot: `root.querySelector`
 * answers `[data-slot="<slot>"]`; `slots` maps slot → container.
 */
export function fakeHudRoot() {
  const slots = new Map();
  const root = {
    slots,
    dataset: {},
    querySelector(selector) {
      const slot = /data-slot="([^"]+)"/.exec(selector)?.[1];
      if (!slot) return null;
      if (!slots.has(slot)) slots.set(slot, fakeElement());
      return slots.get(slot);
    },
  };
  return root;
}
