import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import {
  setupGlobalMocks,
  cleanupGlobalState,
} from '../__helpers__/setup.js';
import { activateProfileHarness } from '../../src/bootstrap/profileHarness.js';

// INFRA-01 (Phase 1, Plan 01.02) — URL-flag activation contract for the
// in-browser performance harness.
//
// The harness is browser-only and dynamically imports the test-only
// scriptedPlayer helper (per CONTEXT D-09) — it cannot be exercised
// end-to-end here. These tests lock the SYNCHRONOUS return shape and the
// gameState-mutation contract, which is what src/app.js depends on:
//
//   1. No ?profile= flag             → { active: false } and zero mutation.
//   2. ?profile=banana (unrecognized) → { active: false } and zero mutation.
//   3. ?profile=cold-open (whitelist) → { active: true, scenario: 'cold-open' }
//      with gameState.randomSeed === 0xB45E and randomSeedSource === 'profile-harness'.
//   4. All four whitelist values activate: cold-open, mid-game, boss-arena, late-stress.
//   5. typeof window === 'undefined' (SSR / Node) → { active: false }.
//
// The scenario driver itself (auto-log, dynamic import, downloadLogs) runs
// inside a deferred microtask path — these tests do not assert on that;
// behavioural verification is the manual scenario runs at phase close (D-02).

function stubBrowserGlobals({ searchString = '' } = {}) {
  // Minimal Canvas2D + Blob + URL stubs so the deferred driver path (which
  // schedules a microtask) does not crash if it fires asynchronously after
  // the test returns. We do NOT assert on those side effects here.
  const ctxStub = {
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
  };
  const canvasStub = {
    width: 800,
    height: 600,
    getContext: vi.fn(() => ctxStub),
  };

  vi.stubGlobal('window', {
    location: { search: searchString },
  });
  vi.stubGlobal('document', {
    getElementById: vi.fn(() => canvasStub),
    createElement: vi.fn(() => ({
      href: '',
      download: '',
      click: vi.fn(),
    })),
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
  });
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob://stub'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('Blob', vi.fn());
}

function makeGameState() {
  return {
    randomSeed: null,
    randomSeedSource: 'unknown',
  };
}

function makePerfMonitor() {
  return {
    enableAutoLog: vi.fn(),
    downloadLogs: vi.fn(),
    exportLogs: vi.fn(() => '[]'),
  };
}

describe('activateProfileHarness (INFRA-01)', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  describe('inactive paths', () => {
    it('returns { active: false } when no ?profile= flag is present', () => {
      stubBrowserGlobals({ searchString: '' });
      const gameState = makeGameState();
      const performanceMonitor = makePerfMonitor();

      const result = activateProfileHarness({ gameState, performanceMonitor });

      expect(result).toEqual({ active: false });
      expect(gameState.randomSeed).toBeNull();
      expect(gameState.randomSeedSource).toBe('unknown');
      expect(performanceMonitor.enableAutoLog).not.toHaveBeenCalled();
    });

    it('returns { active: false } when ?profile= value is unrecognized', () => {
      stubBrowserGlobals({ searchString: '?profile=banana' });
      const gameState = makeGameState();
      const performanceMonitor = makePerfMonitor();

      const result = activateProfileHarness({ gameState, performanceMonitor });

      expect(result).toEqual({ active: false });
      expect(gameState.randomSeed).toBeNull();
      expect(gameState.randomSeedSource).toBe('unknown');
    });

    it('returns { active: false } when window is undefined (SSR/Node)', () => {
      // Explicitly do NOT stub window — Vitest node env has no window by default.
      vi.stubGlobal('window', undefined);
      const gameState = makeGameState();
      const performanceMonitor = makePerfMonitor();

      const result = activateProfileHarness({ gameState, performanceMonitor });

      expect(result).toEqual({ active: false });
      expect(gameState.randomSeed).toBeNull();
    });
  });

  describe('active paths (all four whitelisted scenarios)', () => {
    const scenarios = ['cold-open', 'mid-game', 'boss-arena', 'late-stress'];

    for (const scenario of scenarios) {
      it(`forces seed and returns { active: true, scenario } for ?profile=${scenario}`, () => {
        stubBrowserGlobals({ searchString: `?profile=${scenario}` });
        const gameState = makeGameState();
        const performanceMonitor = makePerfMonitor();

        const result = activateProfileHarness({
          gameState,
          performanceMonitor,
        });

        expect(result).toEqual({ active: true, scenario });
        // Per CONTEXT D-09 the seed is fixed at 0xB45E across all scenarios.
        expect(gameState.randomSeed).toBe(0xb45e);
        expect(gameState.randomSeedSource).toBe('profile-harness');
      });
    }
  });
});
