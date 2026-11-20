import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDebugPreference,
  resolveDebugPreference,
} from '../../src/core/debugLogging.js';
import { persistLastSeed } from '../../src/services/session/randomScopes.js';

// Chrome's "block site data": reading window.localStorage itself throws.
describe('boot with blocked site data', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('settles the debug preference and the seed log without throwing', () => {
    const window = { location: { search: '' } };
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, {
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    }
    vi.stubGlobal('window', window);

    expect(() => applyDebugPreference(resolveDebugPreference())).not.toThrow();
    expect(() => persistLastSeed(7, 'crypto')).not.toThrow();
  });
});
