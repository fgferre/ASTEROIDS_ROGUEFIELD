import { describe, expect, it } from 'vitest';
import { createServiceManifest } from '../../src/bootstrap/serviceManifest.js';
import { createAudioContextStub } from '../__helpers__/stubs.js';
import { assertManagerWired } from '../__helpers__/audio-manifest-wiring.js';
import eventInventory from '../fixtures/audio-event-inventory.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Source-derived audio event-coverage lock (plan 02.01 Task 3).
//
// The set of events the audio service registers is DERIVED FROM SOURCE at test
// time — never a hand-counted constant. Codex counted 32 events vs a claimed 33;
// that dispute is exactly why a manual count rots. The derivation resolves the
// REAL `audio` service through the manifest factory with REAL event-bus /
// settings / random instances (NOT sentinels) and reads the instance's
// `_eventListeners` registry (BaseSystem.registerEventListener is the runtime
// source of truth). The committed fixture (audio-event-inventory.json, produced
// by running this same derivation once) locks the reviewed baseline; drift in
// EITHER direction fails loudly and forces a conscious fixture update.
//
// FUTURE: later plans APPEND boss-warning (D-04), combo-broken, player-died to
// the fixture in their own reviewed diffs as those listeners are added. After
// decomposition (02.07 / 02.09) this test additionally asserts exactly-one-
// MANAGER delegation per event, extending the count===1 check below from "one
// listener on the facade" to "one owning manager".
// ---------------------------------------------------------------------------

/**
 * Resolve the real `audio` service via topological factory construction and
 * return the list of event names it registered (one entry per registered
 * listener — duplicates are intentional so callers can assert count===1).
 *
 * Uses the project manifest's REAL factories for event-bus / settings / random
 * (the FIX-05 discipline: real wiring, not mocks). A `createAudioContextStub`
 * is injected so any registration that touches the context runs in node. The
 * constructed instance is destroyed after derivation to remove its listeners
 * from the shared event-bus singleton (no cross-test leakage).
 *
 * @returns {string[]} Event names, one per registered listener.
 */
export function deriveRegisteredAudioEvents() {
  const manifest = createServiceManifest({
    context: { seed: 'audio-event-coverage' },
  });
  const find = (name) => {
    const entry = manifest.find((item) => item.name === name);
    if (!entry) {
      throw new Error(`manifest has no '${name}' entry`);
    }
    return entry;
  };

  // REAL dependency instances via their own manifest factories.
  const eventBus = find('event-bus').factory({ resolved: {}, context: {} });
  const random = find('random').factory({
    resolved: {},
    context: { seed: 'audio-event-coverage' },
  });
  const settings = find('settings').factory({
    resolved: { 'event-bus': eventBus },
    context: {},
  });

  const audio = find('audio').factory({
    resolved: { 'event-bus': eventBus, settings, random },
  });
  // Inject a stub context so context-dependent registration runs in node.
  audio.context = createAudioContextStub();

  const events = (audio._eventListeners || []).map(
    (listener) => listener.eventName
  );

  // Clean up listeners on the shared event-bus singleton.
  if (typeof audio.destroy === 'function') {
    audio.destroy();
  }

  return events;
}

describe('audio event coverage (source-derived)', () => {
  it('registers a non-empty set of events on the real audio service', () => {
    const derived = deriveRegisteredAudioEvents();
    expect(Array.isArray(derived)).toBe(true);
    expect(derived.length).toBeGreaterThan(0);
  });

  it('live-derived event set equals the committed fixture set (drift fails loudly in both directions)', () => {
    const derived = deriveRegisteredAudioEvents();
    const liveSet = new Set(derived);
    const fixtureSet = new Set(eventInventory);

    // Drift direction 1: a NEW listener was added without updating the fixture.
    const addedLive = [...liveSet].filter((name) => !fixtureSet.has(name));
    expect(
      addedLive,
      `audio service registers events absent from the fixture (add them in a reviewed diff): ${addedLive.join(', ')}`
    ).toEqual([]);

    // Drift direction 2: a listener was removed/renamed but the fixture still lists it.
    const droppedLive = [...fixtureSet].filter((name) => !liveSet.has(name));
    expect(
      droppedLive,
      `fixture lists events the audio service no longer registers (remove them in a reviewed diff): ${droppedLive.join(', ')}`
    ).toEqual([]);
  });

  it('registers each event exactly once on the audio facade', () => {
    const derived = deriveRegisteredAudioEvents();
    const counts = new Map();
    for (const name of derived) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const duplicated = [...counts.entries()]
      .filter(([, count]) => count !== 1)
      .map(([name, count]) => `${name} (x${count})`);
    expect(
      duplicated,
      `events registered more than once on the audio facade: ${duplicated.join(', ')}`
    ).toEqual([]);
  });

  it('fixture is a sorted array of unique event-name strings', () => {
    expect(Array.isArray(eventInventory)).toBe(true);
    expect(eventInventory.length).toBeGreaterThan(0);
    eventInventory.forEach((name) => expect(typeof name).toBe('string'));

    const unique = new Set(eventInventory);
    expect(unique.size).toBe(eventInventory.length);

    const sorted = [...eventInventory].sort();
    expect(eventInventory).toEqual(sorted);
  });
});

describe('audio manifest wiring (assertManagerWired first consumer)', () => {
  it('audio entry declares event-bus/settings/random and flows real deps through', () => {
    // First real consumer of the Task 2 helper. Validates the known-good `audio`
    // entry: deps-complete + factory-source canary + sentinel flow-through with
    // no swallowed construction failure.
    const sentinels = {
      'event-bus': { __sentinel: 'event-bus', on() {}, off() {}, emit() {} },
      settings: { __sentinel: 'settings', getCategoryValues: () => null },
      random: { __sentinel: 'random' },
    };
    const { entry } = assertManagerWired(
      createServiceManifest(),
      'audio',
      ['event-bus', 'settings', 'random'],
      { sentinels }
    );
    expect(entry.name).toBe('audio');
  });

  it('throws when a sentinel is missing for an expected dep (fail-fast, never swallowed)', () => {
    // Proves the helper fails fast on an incomplete sentinel set rather than
    // masking it via a partial construction.
    const incomplete = {
      'event-bus': { on() {}, off() {}, emit() {} },
      settings: { getCategoryValues: () => null },
      // random deliberately omitted
    };
    expect(() =>
      assertManagerWired(
        createServiceManifest(),
        'audio',
        ['event-bus', 'settings', 'random'],
        { sentinels: incomplete }
      )
    ).toThrow();
  });
});
