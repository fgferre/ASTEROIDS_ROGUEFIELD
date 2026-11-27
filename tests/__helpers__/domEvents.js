/**
 * A DOM event imitator for node tests: window, document and elements as one
 * tree, so several screens can listen at once as they do in the browser.
 * Listeners take capture and bubble (and `once`); a dispatch runs capture
 * (window down), the target (its capture listeners, then the others), then
 * bubble (up to window), and honours stopPropagation (the rest of that node
 * and phase still runs), stopImmediatePropagation and preventDefault. Each
 * node and phase runs the listeners it had when the step began.
 * No layout (every rect is 0) and no default actions: Enter or Space on a
 * focused button does not click it. innerHTML builds elements from simple
 * markup (tags and attributes; text lands in textContent).
 * This file imports nothing from src/.
 */

const optionsOf = (options) =>
  typeof options === 'boolean'
    ? { capture: options, once: false }
    : { capture: Boolean(options?.capture), once: Boolean(options?.once) };

export class FakeEvent {
  constructor(type, init = {}) {
    Object.assign(this, { bubbles: false, cancelable: true }, init);
    this.type = type;
    this.target = null;
    this.currentTarget = null;
    this.eventPhase = 0;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    this.immediateStopped = false;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }

  stopImmediatePropagation() {
    this.propagationStopped = true;
    this.immediateStopped = true;
  }
}

export class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, fn, options) {
    if (!fn) return;
    const { capture, once } = optionsOf(options);
    const list = this.listeners.get(type) ?? [];
    if (list.some((l) => l.fn === fn && l.capture === capture)) return;
    list.push({ fn, capture, once, removed: false });
    this.listeners.set(type, list);
  }

  removeEventListener(type, fn, options) {
    const { capture } = optionsOf(options);
    const list = this.listeners.get(type) ?? [];
    const at = list.findIndex((l) => l.fn === fn && l.capture === capture);
    if (at < 0) return;
    list[at].removed = true;
    list.splice(at, 1);
  }

  /** How many listeners of `type` this node has (`capture`: only those). */
  listenerCount(type, capture) {
    return (this.listeners.get(type) ?? []).filter(
      (l) => capture === undefined || l.capture === capture
    ).length;
  }

  /** The next node up the event path. */
  get eventParent() {
    return null;
  }

  dispatchEvent(event) {
    const path = [];
    for (let node = this; node; node = node.eventParent) path.push(node);
    event.target = this;
    const run = (node, phase, capture) => {
      if (event.propagationStopped) return;
      event.currentTarget = node;
      event.eventPhase = phase;
      for (const entry of [...(node.listeners.get(event.type) ?? [])]) {
        if (entry.removed || entry.capture !== capture) continue;
        if (entry.once) node.removeEventListener(event.type, entry.fn, capture);
        entry.fn.call(node, event);
        if (event.immediateStopped) return;
      }
    };
    for (let i = path.length - 1; i > 0; i -= 1) run(path[i], 1, true);
    run(this, 2, true);
    run(this, 2, false);
    if (event.bubbles) {
      for (let i = 1; i < path.length; i += 1) run(path[i], 3, false);
    }
    event.currentTarget = null;
    event.eventPhase = 0;
    return !event.defaultPrevented;
  }
}

// --- selectors: tag, #id, .class, [attr], [attr="v"], :not(...), lists,
// and the descendant and child combinators.

function splitOutside(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (depth === 0 && separator.test(c)) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const COMPOUND_PART =
  /^(?:(\*|[a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*\]|:not\()/;

function parseCompound(text) {
  const compound = { tag: null, ids: [], classes: [], attrs: [], nots: [] };
  let rest = text;
  while (rest) {
    const m = COMPOUND_PART.exec(rest);
    if (!m) throw new Error(`domEvents: unsupported selector "${text}"`);
    if (m[0] === ':not(') {
      let depth = 1;
      let i = 5;
      for (; depth > 0; i += 1) {
        if (rest[i] === '(') depth += 1;
        if (rest[i] === ')') depth -= 1;
      }
      compound.nots.push(parseList(rest.slice(5, i - 1)));
      rest = rest.slice(i);
      continue;
    }
    if (m[1]) compound.tag = m[1] === '*' ? null : m[1].toUpperCase();
    if (m[2]) compound.ids.push(m[2]);
    if (m[3]) compound.classes.push(m[3]);
    if (m[4]) compound.attrs.push({ name: m[4], value: m[5] ?? m[6] ?? m[7] });
    rest = rest.slice(m[0].length);
  }
  return compound;
}

function parseComplex(text) {
  const steps = [];
  let combinator = null;
  for (const token of splitOutside(text.replace(/>/g, ' > '), /\s/)) {
    if (token === '>') combinator = '>';
    else {
      steps.push({ compound: parseCompound(token), combinator });
      combinator = ' ';
    }
  }
  return steps;
}

const parseList = (text) => splitOutside(text, /,/).map(parseComplex);

function matchesCompound(el, c) {
  return (
    (!c.tag || el.tagName === c.tag) &&
    c.ids.every((id) => el.id === id) &&
    c.classes.every((name) => el.classList.contains(name)) &&
    c.attrs.every(({ name, value }) => {
      const actual = el.getAttribute(name);
      return actual !== null && (value === undefined || actual === value);
    }) &&
    c.nots.every((list) => !matchesList(el, list))
  );
}

function matchesComplex(el, steps, index = steps.length - 1) {
  if (!matchesCompound(el, steps[index].compound)) return false;
  if (index === 0) return true;
  const { combinator } = steps[index];
  for (let up = el.parentElement; up; up = up.parentElement) {
    if (matchesComplex(up, steps, index - 1)) return true;
    if (combinator === '>') return false;
  }
  return false;
}

const matchesList = (el, list) =>
  list.some((steps) => matchesComplex(el, steps));

// --- markup: enough of innerHTML for the screens' templates.

const VOID_TAGS = new Set(['br', 'img', 'input', 'hr', 'meta', 'link']);
const TAG =
  /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|<!--[\s\S]*?-->/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function buildMarkup(parent, html) {
  const doc = parent.ownerDocument;
  const stack = [parent];
  let last = 0;
  const text = (chunk) => {
    const top = stack[stack.length - 1];
    top.textValue += chunk.replace(/\s+/g, ' ');
  };
  for (const m of html.matchAll(TAG)) {
    text(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (!m[2]) continue; // a comment
    const name = m[2].toLowerCase();
    if (m[1]) {
      const at = stack.findLastIndex((el) => el.tagName === name.toUpperCase());
      if (at > 0) stack.length = at;
      continue;
    }
    const el = doc.createElement(name);
    for (const a of m[3].matchAll(ATTR)) {
      el.setAttribute(a[1], a[2] ?? a[3] ?? a[4] ?? '');
    }
    stack[stack.length - 1].appendChild(el);
    if (!m[4] && !VOID_TAGS.has(name)) stack.push(el);
  }
  text(html.slice(last));
}

// --- elements

class FakeClassList {
  constructor() {
    this.names = new Set();
  }
  add(...names) {
    names.forEach((name) => this.names.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }
  contains(name) {
    return this.names.has(name);
  }
  toggle(name, force = !this.names.has(name)) {
    if (force) this.names.add(name);
    else this.names.delete(name);
    return force;
  }
  replace(from, to) {
    if (!this.names.delete(from)) return false;
    this.names.add(to);
    return true;
  }
}

const dataKey = (name) =>
  name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const RECT = Object.freeze({
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
});

export class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.id = '';
    this.dataset = {};
    this.attributes = {};
    this.classList = new FakeClassList();
    this.style = { setProperty() {}, removeProperty() {} };
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this.type = '';
    this.textValue = '';
    this.markup = '';
  }

  get className() {
    return [...this.classList.names].join(' ');
  }
  set className(value) {
    this.classList.names = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get textContent() {
    return this.textValue + this.children.map((c) => c.textContent).join('');
  }
  set textContent(value) {
    this.replaceChildren();
    this.textValue = String(value ?? '');
  }

  get innerHTML() {
    return this.markup;
  }
  set innerHTML(value) {
    this.replaceChildren();
    this.textValue = '';
    this.markup = String(value ?? '');
    buildMarkup(this, this.markup);
  }

  get parentElement() {
    return this.parentNode instanceof FakeElement ? this.parentNode : null;
  }
  get eventParent() {
    return this.parentNode;
  }
  get isConnected() {
    let node = this;
    while (node instanceof FakeElement) node = node.parentNode;
    return node === this.ownerDocument;
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }

  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    if (name === 'disabled') return this.disabled ? '' : null;
    if (name === 'hidden') return this.hidden ? '' : null;
    if (name === 'type') return this.type || null;
    if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null;
    return this.attributes[name] ?? null;
  }
  setAttribute(name, value) {
    const text = String(value);
    if (name === 'id') this.id = text;
    else if (name === 'class') this.className = text;
    else if (name === 'disabled') this.disabled = true;
    else if (name === 'hidden') this.hidden = true;
    else if (name === 'type') this.type = text;
    else if (name.startsWith('data-')) this.dataset[dataKey(name)] = text;
    else this.attributes[name] = text;
  }
  removeAttribute(name) {
    if (name === 'disabled') this.disabled = false;
    else if (name === 'hidden') this.hidden = false;
    else if (name.startsWith('data-')) delete this.dataset[dataKey(name)];
    else delete this.attributes[name];
  }
  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }

  appendChild(child) {
    if (child.tagName === '#FRAGMENT') {
      [...child.children].forEach((node) => this.appendChild(node));
      return child;
    }
    child.remove?.();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }
  prepend(...nodes) {
    nodes.reverse().forEach((node) => {
      node.remove();
      node.parentNode = this;
      this.children.unshift(node);
    });
  }
  replaceChildren(...nodes) {
    this.children.forEach((child) => (child.parentNode = null));
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    const parent = this.parentNode;
    if (!parent) return;
    if (this.contains(this.ownerDocument.activeElement)) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
    parent.children = parent.children.filter((c) => c !== this);
    this.parentNode = null;
  }
  contains(node) {
    for (let up = node; up; up = up.parentNode) if (up === this) return true;
    return false;
  }

  matches(selector) {
    return matchesList(this, parseList(selector));
  }
  closest(selector) {
    const list = parseList(selector);
    for (let up = this; up; up = up.parentElement) {
      if (matchesList(up, list)) return up;
    }
    return null;
  }
  querySelectorAll(selector) {
    const list = parseList(selector);
    const found = [];
    const visit = (el) =>
      el.children.forEach((child) => {
        if (matchesList(child, list)) found.push(child);
        visit(child);
      });
    visit(this);
    return found;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  /** Focuses a connected element: focus, then focusin (bubbles). */
  focus() {
    const doc = this.ownerDocument;
    if (!this.isConnected || doc.activeElement === this) return;
    doc.activeElement = this;
    this.dispatchEvent(new FakeEvent('focus'));
    this.dispatchEvent(new FakeEvent('focusin', { bubbles: true }));
  }
  blur() {
    const doc = this.ownerDocument;
    if (doc.activeElement === this) doc.activeElement = doc.body;
  }
  /** A script click: none on a disabled button (detail 0, as the browser). */
  click() {
    if (this.disabled) return;
    this.dispatchEvent(
      new FakeEvent('click', { bubbles: true, detail: 0, button: 0 })
    );
  }

  /** Laid out: connected, and no `hidden` class or attribute up the tree. */
  getClientRects() {
    for (let up = this; up; up = up.parentElement) {
      if (up.hidden || up.classList.contains('hidden')) return [];
    }
    return this.isConnected ? [RECT] : [];
  }
  checkVisibility() {
    return this.getClientRects().length > 0;
  }
  getBoundingClientRect() {
    return RECT;
  }
  scrollIntoView() {}
  scrollBy() {}
}

class FakeDocument extends FakeEventTarget {
  constructor(window) {
    super();
    this.defaultView = window;
    this.documentElement = new FakeElement('html', this);
    this.documentElement.parentNode = this;
    this.head = this.documentElement.appendChild(this.createElement('head'));
    this.body = this.documentElement.appendChild(this.createElement('body'));
    this.activeElement = this.body;
    this.hidden = false;
    this.fullscreenElement = null;
    this.fonts = { check: () => false };
  }
  get eventParent() {
    return this.defaultView;
  }
  createElement(tag) {
    return new FakeElement(tag, this);
  }
  createElementNS(_ns, tag) {
    return this.createElement(tag);
  }
  createDocumentFragment() {
    return this.createElement('#fragment');
  }
  createTextNode(text) {
    const node = this.createElement('#text');
    node.textContent = text;
    return node;
  }
  getElementById(id) {
    return this.querySelector(`#${id}`);
  }
  querySelector(selector) {
    return this.documentElement.matches(selector)
      ? this.documentElement
      : this.documentElement.querySelector(selector);
  }
  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }
  contains(node) {
    return node === this || this.documentElement.contains(node);
  }
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

// 'KeyS' -> 's', 'Digit1' -> '1', 'Space' -> ' '; other codes are their key.
const keyOf = (code) =>
  /^Key[A-Z]$/.test(code)
    ? code.slice(3).toLowerCase()
    : /^Digit\d$/.test(code)
      ? code.slice(5)
      : code === 'Space'
        ? ' '
        : code;

class InputElementStandIn {}
class TextAreaStandIn {}
class SelectStandIn {}

const GLOBALS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'Event',
  'KeyboardEvent',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
];

/**
 * Puts a window, a document (head, body) and their globals in place.
 * Frames wait in a queue until `frame()` runs them. Returns the helpers and
 * `restore()`, which puts the previous globals back.
 */
export function installDomEvents() {
  const previous = new Map(
    GLOBALS.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ])
  );
  const frames = new Map();
  let nextFrame = 1;
  const requestFrame = (fn) => {
    frames.set(nextFrame, fn);
    return nextFrame++;
  };
  const cancelFrame = (id) => frames.delete(id);
  const window = new FakeEventTarget();
  const document = new FakeDocument(window);
  Object.assign(window, {
    document,
    location: { search: '', origin: 'http://localhost', reload() {} },
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    requestAnimationFrame: requestFrame,
    cancelAnimationFrame: cancelFrame,
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (...args) => setInterval(...args),
    clearInterval: (id) => clearInterval(id),
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
    getComputedStyle: () => ({
      overflowY: 'visible',
      transformOrigin: '0 0',
      getPropertyValue: () => '',
    }),
  });
  const values = {
    window,
    document,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    HTMLElement: FakeElement,
    HTMLInputElement: InputElementStandIn,
    HTMLTextAreaElement: TextAreaStandIn,
    HTMLSelectElement: SelectStandIn,
    Event: FakeEvent,
    KeyboardEvent: FakeEvent,
    requestAnimationFrame: requestFrame,
    cancelAnimationFrame: cancelFrame,
    getComputedStyle: window.getComputedStyle,
  };
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }

  /** An element: `{ id, className, dataset, attrs, ... }`, put in `parent`. */
  const el = (tag, props = {}, parent = null) => {
    const { attrs = {}, dataset = {}, className, ...rest } = props;
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.assign(node.dataset, dataset);
    Object.entries(attrs).forEach(([name, value]) =>
      node.setAttribute(name, value)
    );
    Object.assign(node, rest);
    parent?.appendChild(node);
    return node;
  };

  // A key event at the focused element (the body when nothing is).
  const keyEvent = (type, code, init) => {
    const event = new FakeEvent(type, {
      bubbles: true,
      key: keyOf(code),
      code,
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      isTrusted: true,
      ...init,
    });
    const target = document.activeElement?.isConnected
      ? document.activeElement
      : document.body;
    target.dispatchEvent(event);
    return event;
  };

  return {
    window,
    document,
    el,
    keyDown: (code, init) => keyEvent('keydown', code, init),
    keyUp: (code, init) => keyEvent('keyup', code, init),
    /** Down then up; the keydown event, to read what it met. */
    tap(code, init) {
      const event = keyEvent('keydown', code, init);
      keyEvent('keyup', code, init);
      return event;
    },
    /** Runs the frames queued so far (the ones they queue wait). */
    frame(now) {
      const due = [...frames.entries()];
      frames.clear();
      due.forEach(([, fn]) => fn(now ?? performance.now()));
    },
    restore() {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}
