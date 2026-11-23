/**
 * DOM stand-ins for tests that do not boot the game.
 * This file imports nothing from src/.
 */

export function keyEvent(code) {
  return {
    key: code.slice(3).toLowerCase(),
    code,
    preventDefault() {},
    stopPropagation() {},
  };
}

export function installDomStubs() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
  };
  const noop = () => {};
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    key: (index) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  };
  globalThis.document = {
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: () => null,
    querySelector: () => null,
    activeElement: null,
  };
  globalThis.window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { search: previous.window?.location?.search ?? '' },
    localStorage: globalThis.localStorage,
  };
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}
