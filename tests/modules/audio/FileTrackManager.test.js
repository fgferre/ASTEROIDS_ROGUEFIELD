import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FileTrackManager from '../../../src/modules/audio/FileTrackManager.js';
import {
  createAudioContextStub,
  createMediaElementStub,
} from '../../__helpers__/stubs.js';

// ---------------------------------------------------------------------------
// Plan 02.06 Task 1 — FileTrackManager (INFRA-02).
//
// The whole Web Audio graph + media element are stubbed. Tests assert OBSERVABLE
// OUTCOMES (which gain a fade scheduled on, FIFO flush order, source-created-once,
// no unhandled rejection, post-dispose disconnects), never internal formulas.
//
// Topology under test (single writer per AudioParam):
//   trackGain[id]  (writer: FileTrackManager fades ONLY)
//     → targetNode (duck stage / slider — the manager NEVER writes its gain).
// ---------------------------------------------------------------------------

const MENU = 'menu-opening';

/** A gain-param spy recording every scheduled write (single-writer assertions). */
function makeGainParamSpy(initial = 0) {
  const calls = [];
  const param = {
    value: initial,
    setValueAtTime: vi.fn((v, t) => {
      calls.push({ method: 'setValueAtTime', value: v, time: t });
      param.value = v;
    }),
    linearRampToValueAtTime: vi.fn((v, t) => {
      calls.push({ method: 'linearRampToValueAtTime', value: v, time: t });
      param.value = v;
    }),
    exponentialRampToValueAtTime: vi.fn((v, t) => {
      calls.push({ method: 'exponentialRampToValueAtTime', value: v, time: t });
      param.value = v;
    }),
    cancelScheduledValues: vi.fn((t) => {
      calls.push({ method: 'cancelScheduledValues', time: t });
    }),
  };
  return { param, calls };
}

/** A targetNode (duck/slider) whose gain records every write — assertion target. */
function makeTargetStub() {
  const { param, calls } = makeGainParamSpy(0.6);
  return {
    node: { gain: param, connect: vi.fn(), disconnect: vi.fn() },
    writeCalls: () => calls.filter((c) => c.method !== 'cancelScheduledValues'),
  };
}

/**
 * Build a context whose createMediaElementSource is a counting spy (per-element
 * reuse assertion) and whose createGain returns spied gains.
 */
function makeContext(options = {}) {
  const context = createAudioContextStub(options);
  context.createMediaElementSource = vi.fn((el) => ({
    mediaElement: el,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  return context;
}

/**
 * A deterministic facade-style ensureRunning gate matching the real one:
 *   - state==='running' → invoke the thunk synchronously.
 *   - otherwise → queue FIFO and trigger one resume(); flush in request order
 *     on resolve, each thunk exactly once.
 */
function makeEnsureRunning(context) {
  const queue = [];
  let resumePromise = null;
  const flush = () => {
    if (context.state !== 'running') {
      queue.length = 0;
      return;
    }
    const pending = queue.splice(0);
    pending.forEach((thunk) => thunk());
  };
  const ensureRunning = (thunk) => {
    if (context.state === 'running' && !resumePromise) {
      thunk();
      return;
    }
    queue.push(thunk);
    if (!resumePromise) {
      resumePromise = context
        .resume()
        .catch(() => {})
        .finally(() => {
          resumePromise = null;
          flush();
        });
    }
  };
  return { ensureRunning, queue };
}

function makeManager() {
  return new FileTrackManager();
}

/**
 * A manager with a single EAGER track whose media element is a controllable
 * stub, injected before init so init's eager graph build uses the stub (no real
 * `new Audio()` / asset URL). Returns the manager + the injected element.
 */
function makeManagerWithStubTrack(id = 'menu-opening', mediaOptions = {}) {
  const manager = new FileTrackManager({
    catalog: {
      [id]: {
        src: `${id}.mp3`,
        loop: true,
        fadeInMs: 1500,
        fadeOutMs: 800,
        preloadPolicy: 'eager',
      },
    },
  });
  const media = createMediaElementStub({ src: `${id}.mp3`, ...mediaOptions });
  // Pre-seed the element so warmupTrack/ensureTrackGraph reuse it (no real Audio).
  manager.tracks[id].audioElement = media;
  manager.tracks[id].warmupRequested = true;
  return { manager, media, id };
}

describe('FileTrackManager — Task 1: streaming + lifecycle + resume-race', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor does NO AudioContext work (construction-timing safety)', () => {
    it('constructs with no context and builds no graph', () => {
      const manager = makeManager();
      expect(manager).toBeInstanceOf(FileTrackManager);
      expect(manager.initialized).toBe(false);
      expect(manager.context).toBeNull();
      // No per-track graph nodes until init/ensureTrackGraph.
      expect(manager.tracks[MENU].trackGain).toBeNull();
      expect(manager.tracks[MENU].sourceNode).toBeNull();
    });
  });

  describe('init()/dispose() lifecycle', () => {
    it('init builds the eager track graph and is idempotent', () => {
      const context = makeContext();
      const target = makeTargetStub();
      const { manager } = makeManagerWithStubTrack();

      manager.init(context, target.node, () => {});
      expect(manager.initialized).toBe(true);
      const sourceCallsAfterFirst =
        context.createMediaElementSource.mock.calls.length;
      expect(sourceCallsAfterFirst).toBe(1); // eager track graph built once

      // Second init is a no-op (no duplicate graph).
      manager.init(context, target.node, () => {});
      expect(context.createMediaElementSource.mock.calls.length).toBe(
        sourceCallsAfterFirst
      );
    });

    it('dispose disconnects all track nodes and is idempotent; no nodes remain', () => {
      const context = makeContext();
      const target = makeTargetStub();
      const { manager, id } = makeManagerWithStubTrack();
      manager.init(context, target.node, () => {});

      const state = manager.tracks[id];
      const sourceNode = state.sourceNode;
      const trackGain = state.trackGain;
      expect(sourceNode).not.toBeNull();
      expect(trackGain).not.toBeNull();

      manager.dispose();
      expect(sourceNode.disconnect).toHaveBeenCalled();
      expect(trackGain.disconnect).toHaveBeenCalled();
      expect(manager.initialized).toBe(false);
      expect(manager.tracks[id].trackGain).toBeNull();
      expect(manager.tracks[id].sourceNode).toBeNull();

      // Idempotent.
      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('fade writes ONLY the trackGain, anchored before ramping', () => {
    it('schedules a click-safe fade on the track gain and never on the target node', () => {
      const context = makeContext();
      const target = makeTargetStub();
      const trackGainSpy = makeGainParamSpy(0);
      // Force the eager-built trackGain to be our spied gain.
      context.createGain = vi.fn(() => ({
        gain: trackGainSpy.param,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));

      const { manager, id } = makeManagerWithStubTrack();
      manager.init(context, target.node, () => {});

      manager.fade(id, 1, 1500);

      // The fade anchored (setValueAtTime current) BEFORE the ramp.
      const methods = trackGainSpy.calls
        .filter((c) => c.method !== 'cancelScheduledValues')
        .map((c) => c.method);
      const anchorIdx = methods.indexOf('setValueAtTime');
      const rampIdx = methods.indexOf('linearRampToValueAtTime');
      expect(anchorIdx).toBeGreaterThanOrEqual(0);
      expect(rampIdx).toBeGreaterThan(anchorIdx);

      // The manager NEVER wrote the target (duck/slider) node.
      expect(target.writeCalls()).toEqual([]);
    });
  });

  describe('rejected play() is caught and retried on the next ensureRunning flush', () => {
    it('does not produce an unhandled rejection; a single bounded retry recovers the track', async () => {
      const context = makeContext({ state: 'running' });
      const target = makeTargetStub();

      let attempts = 0;
      const rejectingMedia = createMediaElementStub({
        playImplementation: () => {
          attempts += 1;
          if (attempts === 1) {
            const err = new Error('autoplay blocked');
            err.name = 'NotAllowedError';
            return Promise.reject(err);
          }
          return Promise.resolve();
        },
      });

      const { ensureRunning } = makeEnsureRunning(context);
      const { manager, id } = makeManagerWithStubTrack('menu-opening', {});
      // Replace the stub element with the rejecting one BEFORE init builds graph.
      manager.tracks[id].audioElement = rejectingMedia;
      manager.init(context, target.node, ensureRunning);

      // First start: play() rejects (NotAllowedError). The rejection is caught
      // (no unhandled rejection) and a single bounded retry is queued through the
      // ensureRunning gate, which recovers the track on the second attempt.
      manager.playTrack(id);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // The track retried EXACTLY once more (bounded — no busy-loop).
      expect(attempts).toBe(2);
      expect(manager.tracks[id].retryPending).toBe(false);
      expect(manager.tracks[id]._retryQueued).toBe(false);
    });

    it('does not busy-loop when every play() rejects (at most one retry outstanding)', async () => {
      const context = makeContext({ state: 'running' });
      const target = makeTargetStub();

      let attempts = 0;
      const alwaysReject = createMediaElementStub({
        playImplementation: () => {
          attempts += 1;
          const err = new Error('autoplay blocked');
          err.name = 'NotAllowedError';
          return Promise.reject(err);
        },
      });

      const { ensureRunning } = makeEnsureRunning(context);
      const { manager, id } = makeManagerWithStubTrack('menu-opening', {});
      manager.tracks[id].audioElement = alwaysReject;
      manager.init(context, target.node, ensureRunning);

      manager.playTrack(id);
      // Drain a generous number of microtasks — a busy-loop would explode here.
      for (let i = 0; i < 20; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }

      // One initial attempt + one bounded retry = 2. The latch prevents more.
      expect(attempts).toBe(2);
      expect(manager.tracks[id].retryPending).toBe(true);
    });
  });

  describe('FIFO ordered flush of starts requested while suspended', () => {
    it('flushes two suspended-context plays in request order, exactly once each', async () => {
      const context = makeContext({ state: 'suspended' });
      const target = makeTargetStub();

      const order = [];
      const mediaA = createMediaElementStub({
        playImplementation: () => {
          order.push('A');
          return Promise.resolve();
        },
      });
      const mediaB = createMediaElementStub({
        playImplementation: () => {
          order.push('B');
          return Promise.resolve();
        },
      });

      const { ensureRunning } = makeEnsureRunning(context);
      const manager = new FileTrackManager({
        catalog: {
          'track-a': { src: 'a.mp3', loop: false, fadeInMs: 10, fadeOutMs: 10 },
          'track-b': { src: 'b.mp3', loop: false, fadeInMs: 10, fadeOutMs: 10 },
        },
      });
      manager.init(context, target.node, ensureRunning);
      manager.tracks['track-a'].audioElement = mediaA;
      manager.tracks['track-a'].warmupRequested = true;
      manager.tracks['track-b'].audioElement = mediaB;
      manager.tracks['track-b'].warmupRequested = true;

      // Requested while suspended → both queue, nothing plays yet.
      manager.playTrack('track-a');
      manager.playTrack('track-b');
      expect(order).toEqual([]);

      // Resume → flush FIFO.
      await context.resume();
      await Promise.resolve();
      await Promise.resolve();

      expect(order).toEqual(['A', 'B']);
      // Exactly once each.
      expect(order.filter((x) => x === 'A').length).toBe(1);
      expect(order.filter((x) => x === 'B').length).toBe(1);
    });
  });

  describe('per-id MediaElementSource is created once and reused', () => {
    it('playTrack twice reuses the existing source (createMediaElementSource called once)', () => {
      const context = makeContext({ state: 'running' });
      const target = makeTargetStub();
      const { manager, id } = makeManagerWithStubTrack();

      manager.init(context, target.node, (thunk) => thunk());
      // init already built the eager graph → 1 source. A second playTrack must
      // REUSE the existing per-id source (createMediaElementSource throws on a
      // second call for the same element).
      expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);

      manager.playTrack(id);
      manager.playTrack(id);

      expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
    });
  });
});
