import { expect } from 'vitest';

/**
 * Assert that a service manager is correctly wired in the DI service manifest.
 *
 * This is the reusable FIX-05 discipline helper (commit b7a31cc lesson: a
 * missing manifest dependency makes the manager silently no-op in the browser
 * while node tests still pass because mocks supply the dep). Every Phase 2
 * manager plan imports this to lock its own wiring.
 *
 * Checks, in order:
 *   1. The entry exists (defined) in the manifest.
 *   2. Every expected dependency is declared in `entry.dependencies`
 *      (the FIX-05 failure mode is a MISSING dep).
 *   3. Factory-source canary: the factory body references each expected-dep
 *      string literal. SECONDARY signal only — brittle by design (a rename of
 *      the kwarg silently passes; the sentinel flow-through below is the real
 *      behavioral check). Kept because it catches a factory that declares a dep
 *      but never reads it.
 *   4. If `sentinels` are provided: they must be COMPLETE (one per expected dep
 *      — fail fast on a missing sentinel BEFORE constructing). Then construct
 *      via `entry.factory({ resolved: sentinels })` with NO try/catch. A
 *      construction throw FAILS the test (review fix: a prior version swallowed
 *      construction errors, letting broken wiring pass). When the constructed
 *      instance exposes a `dependencies` map keyed by the manifest dep name,
 *      assert the sentinel flowed through.
 *
 * Note on key mapping: a manager's factory may map the kebab-case manifest dep
 * name (e.g. 'event-bus') to a camelCase constructor kwarg (e.g. `eventBus`).
 * In that case `constructed.dependencies` is keyed by the camelCase kwarg, not
 * the manifest name, so the flow-through assertion is applied only for dep
 * names that actually appear as keys on the constructed dependencies map. The
 * UNCONDITIONAL guarantee is that construction is never wrapped in try/catch.
 *
 * @param {Array<{name: string, dependencies: string[], factory: Function}>} manifest
 *   The array returned by createServiceManifest().
 * @param {string} serviceName - The manifest entry name to validate (e.g. 'audio').
 * @param {string[]} expectedDeps - Manifest dependency names that MUST be declared.
 * @param {{ sentinels?: Record<string, unknown> }} [options]
 *   When `sentinels` is provided, the helper additionally constructs the manager
 *   with those sentinel deps and asserts flow-through.
 * @returns {{ entry: object, constructed: object|null }}
 *   The located manifest entry and the constructed instance (or null when no
 *   sentinels were provided).
 * @example
 * import { createServiceManifest } from '../../src/bootstrap/serviceManifest.js';
 * import { assertManagerWired } from '../__helpers__/audio-manifest-wiring.js';
 * assertManagerWired(createServiceManifest(), 'audio', [
 *   'event-bus', 'settings', 'random',
 * ]);
 */
export function assertManagerWired(
  manifest,
  serviceName,
  expectedDeps,
  { sentinels } = {}
) {
  expect(Array.isArray(manifest)).toBe(true);
  expect(Array.isArray(expectedDeps)).toBe(true);

  // (1) Entry exists.
  const entry = manifest.find((item) => item && item.name === serviceName);
  expect(
    entry,
    `manifest has no entry named '${serviceName}'`
  ).toBeDefined();
  expect(Array.isArray(entry.dependencies)).toBe(true);
  expect(typeof entry.factory).toBe('function');

  // (2) Deps-complete: every expected dep is declared (FIX-05 failure mode).
  for (const dep of expectedDeps) {
    expect(
      entry.dependencies,
      `'${serviceName}' manifest entry is missing declared dependency '${dep}'`
    ).toContain(dep);
  }

  // (3) Factory-source canary (SECONDARY, brittle by design). Proves the
  // factory body at least references each dep literal — catches a dep that is
  // declared but never read. The sentinel flow-through (4) is the real check.
  const factorySrc = entry.factory.toString();
  for (const dep of expectedDeps) {
    expect(
      factorySrc,
      `'${serviceName}' factory body never references the '${dep}' dependency literal`
    ).toContain(dep);
  }

  // (4) Sentinel flow-through (behavioral). NEVER swallow a construction throw.
  let constructed = null;
  if (sentinels) {
    // Sentinels must be COMPLETE — fail fast before constructing so a missing
    // sentinel is reported as a wiring-test mistake, not masked by a partial
    // construction.
    for (const dep of expectedDeps) {
      expect(
        Object.prototype.hasOwnProperty.call(sentinels, dep),
        `assertManagerWired: missing sentinel for expected dep '${dep}' (sentinels must be complete)`
      ).toBe(true);
    }

    // No try/catch: a throw here FAILS the test (review fix). Broken wiring
    // that throws on construction must surface, never be swallowed.
    constructed = entry.factory({ resolved: sentinels });

    // When the manager exposes a dependencies map keyed by the manifest dep
    // name, assert the exact sentinel flowed through. Skipped for dep names the
    // factory remaps to a different kwarg (the construction-succeeds-without-
    // throwing guarantee already holds for those).
    if (constructed && constructed.dependencies) {
      for (const dep of expectedDeps) {
        if (
          Object.prototype.hasOwnProperty.call(constructed.dependencies, dep)
        ) {
          expect(
            constructed.dependencies[dep],
            `'${serviceName}' did not flow the '${dep}' sentinel into its dependencies map`
          ).toBe(sentinels[dep]);
        }
      }
    }
  }

  return { entry, constructed };
}
