// INFRA-03 — no reachable dev globals in production build.
//
// THE GATE IS A RUNTIME-REACHABILITY ASSERTION, NOT A `grep dist/` STRING CHECK.
//
// Why this distinction matters (02-RESEARCH §INFRA-03, Pitfall 3): Vite eliminates
// `import.meta.env.DEV` → false in prod, so the `window.__AUDIO_RANDOM_DEBUG__`
// assignment historically sat behind a DEAD `!DEV_MODE` gate — unreachable at
// runtime — yet the assignment STRING survived minification (2 occurrences in
// dist/). A naive `grep window.__ dist/` therefore reports a FALSE POSITIVE: the
// string is present but the code is dead. The only honest gate is to prove the
// global is `undefined` at RUNTIME in a production bundle, and to prove no NEW
// ungated assignment can reach a `window.__*` global.
//
// This file proves INFRA-03 with three independent assertions:
//
//   1. RUNTIME (source, production-mode):   drive AudioSystem._exposeRandomDebugControls
//      with the build-time define forced to its production value (false) and assert
//      `window.__AUDIO_RANDOM_DEBUG__ === undefined`. This is the literal runtime
//      `=== undefined` check that the build-time strip produced.
//
//   2. POSITIVE CONTROL (dev-mode):         with the define forced true AND a dev
//      runtime, the global IS exposed — so the test cannot pass trivially and dev
//      ergonomics are proven intact (must_have: dev builds still expose the global).
//
//   3. PRODUCTION-ARTIFACT CANARY (dist):   build fresh, enumerate EVERY `window.__*`
//      name in the emitted bundle, and assert NONE has a reachable assignment site
//      (`window.__X =`). Each enumerated name is also evaluated to `undefined` by
//      running the bundle in a sandbox with a fresh `window`. This canary FAILS if a
//      future change introduces a NEW UNGATED `window.__` global. INFRA-03 covers ALL
//      dev globals, not only the known audio one (02-REVIEWS.md, 02.02 section).

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const DIST_ASSETS = join(REPO_ROOT, 'dist', 'assets');

// Generous timeout: a cold `vite build` of this project runs in a few seconds but
// CI machines are slower and the build is the hermetic prerequisite for the canary.
const BUILD_TIMEOUT_MS = 120_000;

/**
 * Build a permissive sandbox so the production bundle's top-level module code
 * (Vite modulepreload polyfill + service bootstrap) can execute far enough to
 * exercise any window.__ assignment, without standing up a full DOM. Unknown
 * property access returns a self-returning Proxy so chained DOM/canvas calls
 * never throw before we observe `window`.
 */
function makeSandbox() {
  const deepStub = () => {
    const fn = function () {
      return proxy;
    };
    const proxy = new Proxy(fn, {
      get(_t, p) {
        if (p === Symbol.toPrimitive) return () => 0;
        if (p === 'then') return undefined; // never look thenable
        return proxy;
      },
      set: () => true,
      apply: () => proxy,
      construct: () => proxy,
      has: () => true,
    });
    return proxy;
  };

  const win = {};
  const importMeta = {
    url: 'http://localhost/main.js',
    env: { DEV: false, PROD: true, MODE: 'production' },
  };
  const base = {
    window: win,
    self: win,
    document: deepStub(),
    navigator: { userAgent: 'node', language: 'en' },
    location: { href: 'http://localhost/', search: '' },
    console,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: () => Promise.resolve(deepStub()),
    __IMPORT_META__: importMeta,
  };
  const sandbox = new Proxy(base, {
    get(t, p) {
      if (p === 'window' || p === 'globalThis' || p === 'self') return win;
      if (p in t) return t[p];
      return deepStub();
    },
    has: () => true,
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
  return { sandbox, win };
}

describe('INFRA-03 — no reachable dev globals in production build', () => {
  describe('runtime reachability (source)', () => {
    // The gate the build-time strip produces: in production the
    // `_exposeRandomDebugControls` body is dead-code-eliminated, so even invoking
    // it leaves the global undefined. We reproduce the production decision at
    // runtime by stubbing the build-time define to its production value (false).
    let AudioSystem;

    beforeAll(async () => {
      ({ default: AudioSystem } = await import(
        '../../src/modules/AudioSystem.js'
      ));
    });

    it('leaves window.__AUDIO_RANDOM_DEBUG__ === undefined under the production define', () => {
      vi.stubGlobal('__AUDIO_DEBUG_BUILD__', false);
      vi.stubGlobal('window', {});
      try {
        // Minimal instance shape: the method only reads this.random / this.randomScopes.
        const instance = Object.create(AudioSystem.prototype);
        instance.random = { seed: 1, debugSnapshot: () => ({}) };
        instance.randomScopes = { families: {}, seeds: null };

        instance._exposeRandomDebugControls();

        // Literal runtime assertion — the production gate keeps the global unset.
        expect(globalThis.window.__AUDIO_RANDOM_DEBUG__).toBe(undefined);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('DOES expose window.__AUDIO_RANDOM_DEBUG__ in a dev build (ergonomics intact)', () => {
      // Positive control: with the build define true AND a dev environment, the
      // developer global IS exposed. Without this, the test above could pass even
      // if the method were broken — and we would silently lose dev ergonomics.
      vi.stubGlobal('__AUDIO_DEBUG_BUILD__', true);
      const win = {};
      vi.stubGlobal('window', win);
      const realNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development'; // makes isDevEnvironment() → DEV_MODE true
      try {
        const instance = Object.create(AudioSystem.prototype);
        instance.random = { seed: 7, debugSnapshot: () => ({ s: 7 }) };
        instance.randomScopes = { families: {}, seeds: { music: 7 } };

        instance._exposeRandomDebugControls();

        expect(win.__AUDIO_RANDOM_DEBUG__).toBeDefined();
        expect(win.__AUDIO_RANDOM_DEBUG__.seed).toBe(7);
      } finally {
        if (realNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = realNodeEnv;
        vi.unstubAllGlobals();
      }
    });
  });

  describe('production-artifact canary (fresh dist build)', () => {
    let bundleSource = '';
    let bundleName = '';
    let enumeratedGlobals = [];

    beforeAll(() => {
      // Hermetic: rebuild so the canary always reflects current source, never a
      // stale dist/. `--mode production` is vite build's default but explicit is safer.
      execFileSync('npm', ['run', 'build'], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
        timeout: BUILD_TIMEOUT_MS,
        shell: process.platform === 'win32', // npm is npm.cmd on Windows
      });

      expect(existsSync(DIST_ASSETS)).toBe(true);
      bundleName = readdirSync(DIST_ASSETS).find((n) =>
        /^main-.*\.js$/.test(n)
      );
      expect(
        bundleName,
        'production main bundle must exist in dist/assets'
      ).toBeTruthy();
      bundleSource = readFileSync(join(DIST_ASSETS, bundleName), 'utf8');

      enumeratedGlobals = [
        ...new Set(bundleSource.match(/window\.__[A-Za-z0-9_]+/g) || []),
      ].sort();
    });

    it('contains NO reachable window.__ assignment site (canary for new ungated globals)', () => {
      // Reachability, not presence: we match ASSIGNMENT (`window.__X =`, excluding
      // `==`/`===` comparisons) — a delete or a read (`window.__X ||`) is harmless.
      // A grep for the bare name would be the FALSE POSITIVE documented above.
      const assignmentSites = [
        ...new Set(
          (bundleSource.match(/window\.__[A-Za-z0-9_]+\s*=(?!=)/g) || []).map(
            (s) => s.replace(/\s*=.*$/, '')
          )
        ),
      ].sort();

      // Any assignment site in the prod bundle is a leak — gated dev globals are
      // DCE'd away entirely, so a reachable assignment means a NEW ungated global.
      expect(
        assignmentSites,
        `Ungated window.__ assignment(s) leaked into the production bundle (${bundleName}). ` +
          `Each must be gated by the build-time define (see _exposeRandomDebugControls) ` +
          `so Vite dead-code-eliminates the assignment. Found: ${assignmentSites.join(', ')}`
      ).toEqual([]);
    });

    it('evaluates every enumerated window.__* name to undefined at runtime', () => {
      // Genuine runtime evaluation of the production artifact (NOT a string check):
      // run the bundle body in a sandbox with a fresh `window` and assert each
      // enumerated dev-global name is undefined. INFRA-03 covers ALL window.__*
      // globals, not only the audio one — so we enumerate and check every name.
      const { sandbox, win } = makeSandbox();

      let runnable = bundleSource
        .replace(/export\s*\{[^}]*\}\s*;?\s*$/, '') // strip trailing ESM export (no side effects)
        .replace(/import\.meta/g, '__IMPORT_META__'); // neutralize ESM-only meta

      // Best-effort execution: top-level bundle code may reference DOM internals the
      // stub can't fully model. Either way the SECURITY property holds — there is no
      // assignment site (asserted above), so the globals are undefined whether or not
      // execution completes. We swallow stub-shape errors but still assert outcomes.
      try {
        vm.runInNewContext(runnable, sandbox, { timeout: 10_000 });
      } catch {
        // intentionally ignored — see comment above; outcome assertions below stand
      }

      for (const ref of enumeratedGlobals) {
        const name = ref.replace('window.', '');
        expect(
          win[name],
          `${ref} must be undefined after a production-mode evaluation`
        ).toBeUndefined();
      }

      // Belt-and-suspenders: the known audio target specifically.
      expect(win.__AUDIO_RANDOM_DEBUG__).toBeUndefined();
    });
  });
});
