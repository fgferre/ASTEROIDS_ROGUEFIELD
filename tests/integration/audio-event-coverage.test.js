import { describe, expect, it, vi } from 'vitest';
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
export function resolveRealAudioService() {
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

  return { audio, eventBus };
}

export function deriveRegisteredAudioEvents() {
  const { audio } = resolveRealAudioService();

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
    const { entry, constructed } = assertManagerWired(
      createServiceManifest(),
      'audio',
      ['event-bus', 'settings', 'random'],
      { sentinels }
    );
    expect(entry.name).toBe('audio');

    // Plan 02.06/02.07: the audio factory composes ALL of the extracted managers
    // from the same three deps (no new manifest deps — they live inside the
    // factory). Construction must succeed (assertManagerWired never swallows a
    // throw) and expose each manager instance — the FIX-05 "manager silently
    // absent" guard. Plan 02.07 adds the SFXBus to this composition.
    expect(constructed.musicMixer).toBeDefined();
    expect(constructed.fileTrackManager).toBeDefined();
    expect(constructed.duckingController).toBeDefined();
    expect(constructed.sfxBus).toBeDefined();
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

describe('boss-warning → MusicMixer delegation (plan 02.05)', () => {
  // Registration proves a listener exists; delegation proves the listener
  // actually drives the MusicMixer (review fix: registration ≠ delegation).
  // Emitting through the REAL container must call the COMPOSED mixer instance.
  it('emitting boss-warning invokes musicMixer.setIntensityFromBossEvent exactly once', () => {
    const { audio, eventBus } = resolveRealAudioService();
    expect(audio.musicMixer).toBeDefined();

    const spy = vi.spyOn(audio.musicMixer, 'setIntensityFromBossEvent');
    eventBus.emit('boss-warning', { wave: 4, nextBossWave: 5 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('boss-warning');

    spy.mockRestore();
    if (typeof audio.destroy === 'function') audio.destroy();
  });

  it('pause-state-changed delegates to musicMixer.pause()', () => {
    const { audio, eventBus } = resolveRealAudioService();
    const spy = vi.spyOn(audio.musicMixer, 'pause');

    eventBus.emit('pause-state-changed', { isPaused: true });
    expect(spy).toHaveBeenCalledWith(true);

    eventBus.emit('pause-state-changed', { isPaused: false });
    expect(spy).toHaveBeenCalledWith(false);

    spy.mockRestore();
    if (typeof audio.destroy === 'function') audio.destroy();
  });
});

describe('player-health-changed → DuckingController EDGE delegation (plan 02.06)', () => {
  // The low-HP duck fires on the CROSSING into ≤25% HP only (edge detection,
  // review fix). Emitting through the REAL container must call the COMPOSED
  // DuckingController exactly once per crossing — not once per below-threshold
  // event. No count LITERALS are asserted against the fixture; the assertions are
  // pure delegation/edge behavior on the composed instance.
  it('three consecutive below-threshold events produce EXACTLY ONE duck (edge crossing)', () => {
    const { audio, eventBus } = resolveRealAudioService();
    expect(audio.duckingController).toBeDefined();

    const spy = vi.spyOn(audio.duckingController, 'duck');

    // Three events, all below 25% — only the FIRST (the crossing) ducks.
    eventBus.emit('player-health-changed', { health: 20, maxHealth: 100 });
    eventBus.emit('player-health-changed', { health: 15, maxHealth: 100 });
    eventBus.emit('player-health-changed', { health: 10, maxHealth: 100 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ bus: 'music' });

    spy.mockRestore();
    if (typeof audio.destroy === 'function') audio.destroy();
  });

  it('recovery above threshold re-arms the edge so the next dip ducks again', () => {
    const { audio, eventBus } = resolveRealAudioService();
    const spy = vi.spyOn(audio.duckingController, 'duck');

    eventBus.emit('player-health-changed', { health: 20, maxHealth: 100 }); // duck 1
    eventBus.emit('player-health-changed', { health: 50, maxHealth: 100 }); // recover (re-arm)
    eventBus.emit('player-health-changed', { health: 20, maxHealth: 100 }); // duck 2

    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
    if (typeof audio.destroy === 'function') audio.destroy();
  });
});

describe('screen-changed → FileTrackManager delegation (plan 02.06)', () => {
  it('screen-changed to menu delegates to fileTrackManager.playTrack (the menu track)', () => {
    const { audio, eventBus } = resolveRealAudioService();
    expect(audio.fileTrackManager).toBeDefined();

    const spy = vi.spyOn(audio.fileTrackManager, 'playTrack');
    eventBus.emit('screen-changed', { screen: 'menu' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('menu-opening');

    spy.mockRestore();
    if (typeof audio.destroy === 'function') audio.destroy();
  });
});

describe('SFX event → SFXBus delegation (plan 02.07 — registration ≠ delegation)', () => {
  // The SFX synthesis relocated into SFXBus; emitting each SFX event through the
  // REAL container must invoke the corresponding SFXBus method EXACTLY once on
  // the COMPOSED instance (a spy on registration would only prove a listener
  // exists). No count literals are asserted against the fixture — these are pure
  // delegation assertions on the composed SFXBus. The synthesis bodies do not run
  // (the facade is not initialized, so the ensureRunning gate early-returns) —
  // only the delegation edge is exercised, which is exactly what this locks.

  /**
   * Emit `event` with `payload` through the real container and assert the named
   * SFXBus method fired exactly once.
   */
  function expectDelegates(event, payload, method, argMatcher) {
    const { audio, eventBus } = resolveRealAudioService();
    expect(audio.sfxBus, 'audio service must compose an SFXBus').toBeDefined();
    expect(
      typeof audio.sfxBus[method],
      `SFXBus must expose '${method}'`
    ).toBe('function');

    const spy = vi.spyOn(audio.sfxBus, method);
    eventBus.emit(event, payload);

    expect(
      spy,
      `'${event}' must delegate to sfxBus.${method} exactly once`
    ).toHaveBeenCalledTimes(1);
    if (typeof argMatcher === 'function') argMatcher(spy.mock.calls[0]);

    spy.mockRestore();
    if (typeof audio.destroy === 'function') audio.destroy();
  }

  it('weapon-fired → playLaserShot', () => {
    expectDelegates('weapon-fired', { targeting: { lockCount: 1 } }, 'playLaserShot');
  });

  it('combat-target-lock → playTargetLock', () => {
    expectDelegates('combat-target-lock', { lockCount: 2 }, 'playTargetLock');
  });

  it('enemy-destroyed → playAsteroidBreak', () => {
    expectDelegates('enemy-destroyed', { size: 'small' }, 'playAsteroidBreak');
  });

  it('asteroid-volatile-exploded → playBigExplosion', () => {
    expectDelegates('asteroid-volatile-exploded', {}, 'playBigExplosion');
  });

  it('player-leveled-up → playLevelUp', () => {
    expectDelegates('player-leveled-up', {}, 'playLevelUp');
  });

  it('xp-collected → playXPCollect', () => {
    expectDelegates('xp-collected', {}, 'playXPCollect');
  });

  it('xp-orb-fused → playOrbFusion', () => {
    expectDelegates('xp-orb-fused', { toClass: 'xp-green' }, 'playOrbFusion', (call) => {
      expect(call[0]).toBe('xp-green');
    });
  });

  it('enemy-spawned (gold) → playGoldSpawn', () => {
    expectDelegates(
      'enemy-spawned',
      { enemy: { variant: 'gold' } },
      'playGoldSpawn'
    );
  });

  it('enemy-fired (drone) → playDroneFire', () => {
    expectDelegates('enemy-fired', { enemyType: 'drone' }, 'playDroneFire');
  });

  it('enemy-fired (hunter) → playHunterBurst', () => {
    expectDelegates('enemy-fired', { enemyType: 'hunter' }, 'playHunterBurst');
  });

  it('mine-exploded → playMineExplosion', () => {
    expectDelegates('mine-exploded', { radius: 120, damage: 40 }, 'playMineExplosion');
  });

  it('bullet-hit (damage) → playBulletHit', () => {
    expectDelegates('bullet-hit', { effectiveDamage: 5, killed: false }, 'playBulletHit');
  });

  it('bullet-hit (boss invuln deflect) → playBossShieldDeflect', () => {
    expectDelegates(
      'bullet-hit',
      { blocked: true, invulnerable: true },
      'playBossShieldDeflect'
    );
  });

  it('player-took-damage → playShipHit', () => {
    expectDelegates('player-took-damage', {}, 'playShipHit');
  });

  it('shield-activated → playShieldActivate', () => {
    expectDelegates('shield-activated', {}, 'playShieldActivate');
  });

  it('shield-hit → playShieldImpact', () => {
    expectDelegates('shield-hit', {}, 'playShieldImpact');
  });

  it('shield-broken → playShieldBreak', () => {
    expectDelegates('shield-broken', {}, 'playShieldBreak');
  });

  it('shield-recharged → playShieldRecharged', () => {
    expectDelegates('shield-recharged', {}, 'playShieldRecharged');
  });

  it('shield-activation-failed → playShieldFail', () => {
    expectDelegates('shield-activation-failed', {}, 'playShieldFail');
  });

  it('shield-shockwave → playShieldShockwave', () => {
    expectDelegates('shield-shockwave', {}, 'playShieldShockwave');
  });

  it('upgrade-applied → playUpgradeSelect', () => {
    expectDelegates('upgrade-applied', { rarity: 'rare' }, 'playUpgradeSelect', (call) => {
      expect(call[0]).toBe('rare');
    });
  });

  it('input-confirmed → playUISelect', () => {
    expectDelegates('input-confirmed', {}, 'playUISelect');
  });

  it('game-started → playUIStartGame', () => {
    expectDelegates('game-started', {}, 'playUIStartGame');
  });

  it('ui-hover → playUIHover (debounced — first hover delegates)', () => {
    expectDelegates('ui-hover', {}, 'playUIHover');
  });

  it('thruster-effect → SFXBus.startThrusterLoop (requires init; loop ownership lives in the bus)', () => {
    const { audio, eventBus } = resolveRealAudioService();
    // handleThrusterEffect early-returns when uninitialized; mark initialized so
    // the delegation edge into SFXBus.startThrusterLoop is exercised.
    audio.initialized = true;
    const spy = vi.spyOn(audio.sfxBus, 'startThrusterLoop');

    eventBus.emit('thruster-effect', {
      type: 'main',
      intensity: 0.8,
      isAutomatic: true,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('main');

    spy.mockRestore();
    if (typeof audio.destroy === 'function') audio.destroy();
  });
});
