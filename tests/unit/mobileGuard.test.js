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
import { mobileGuard } from '../../src/bootstrap/mobileGuard.js';

// A11Y-08 detection contract lock per CONTEXT D-07.
//
// Vitest runs in `environment: 'node'` (see vite.config.js test block), so
// window/navigator/document are NOT provided. We stub them via vi.stubGlobal
// on a per-test basis to simulate device profiles. cleanupGlobalState() in
// the afterEach hook calls vi.restoreAllMocks(), unwinding the stubs.
//
// Four device profiles covered (D-07):
//   1. desktop-mouse  → ontouchstart absent, maxTouchPoints=0, pointer:coarse false  → blocked: false
//   2. laptop+touch   → ontouchstart present, maxTouchPoints=5, pointer:coarse false → blocked: true
//   3. phone          → ontouchstart present, maxTouchPoints=5, pointer:coarse true  → blocked: true
//   4. tablet         → ontouchstart absent, maxTouchPoints=10, pointer:coarse false → blocked: true (OR-not-AND)
// Plus:
//   - ?desktop=force override on a phone-shaped profile → blocked: false
//   - Defensive null-canvas branch (document.getElementById returns null) → blocked: true

/**
 * Stubs window/navigator/document with the minimal surface the guard probes.
 *
 * @param {object} opts
 * @param {boolean} opts.ontouchstart - whether `'ontouchstart' in window` is true
 * @param {number} opts.maxTouchPoints - navigator.maxTouchPoints value
 * @param {boolean} opts.pointerCoarse - whether matchMedia('(pointer: coarse)').matches is true
 * @param {string} [opts.searchString=''] - window.location.search value (for ?desktop=force override)
 * @param {boolean} [opts.canvasMissing=false] - if true, document.getElementById returns null
 */
function stubDeviceProfile({
  ontouchstart,
  maxTouchPoints,
  pointerCoarse,
  searchString = '',
  canvasMissing = false,
}) {
  const matchMediaStub = vi.fn((query) => ({
    matches: query === '(pointer: coarse)' ? pointerCoarse : false,
    media: query,
  }));

  const windowStub = {
    location: { search: searchString },
    matchMedia: matchMediaStub,
  };
  if (ontouchstart) {
    // The detection probe uses `'ontouchstart' in window`, so the key must exist
    // (value can be null, undefined, or a no-op handler — only `in` is checked).
    windowStub.ontouchstart = null;
  }

  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('navigator', { maxTouchPoints });

  const fillRectMock = vi.fn();
  const fillTextMock = vi.fn();
  const measureTextMock = vi.fn(() => ({ width: 200 }));
  const ctxStub = {
    fillRect: fillRectMock,
    fillText: fillTextMock,
    measureText: measureTextMock,
    get fillStyle() {
      return this._fillStyle;
    },
    set fillStyle(v) {
      this._fillStyle = v;
    },
    get font() {
      return this._font;
    },
    set font(v) {
      this._font = v;
    },
    get textAlign() {
      return this._textAlign;
    },
    set textAlign(v) {
      this._textAlign = v;
    },
    get textBaseline() {
      return this._textBaseline;
    },
    set textBaseline(v) {
      this._textBaseline = v;
    },
  };

  const canvasStub = canvasMissing
    ? null
    : {
        width: 800,
        height: 600,
        getContext: vi.fn(() => ctxStub),
      };

  vi.stubGlobal('document', {
    getElementById: vi.fn((id) =>
      id === 'game-canvas' ? canvasStub : null
    ),
  });

  return { ctxStub, canvasStub, fillRectMock, fillTextMock, measureTextMock };
}

describe('mobileGuard', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
    vi.unstubAllGlobals();
  });

  describe('detection heuristic', () => {
    it('returns { blocked: false } on desktop with mouse only', () => {
      stubDeviceProfile({
        ontouchstart: false,
        maxTouchPoints: 0,
        pointerCoarse: false,
      });
      expect(mobileGuard()).toEqual({ blocked: false });
    });

    it('returns { blocked: true } on laptop with touchscreen', () => {
      const { fillTextMock } = stubDeviceProfile({
        ontouchstart: true,
        maxTouchPoints: 5,
        pointerCoarse: false,
      });
      expect(mobileGuard()).toEqual({ blocked: true });
      // Notice was painted — both EN and PT-BR lines.
      expect(fillTextMock).toHaveBeenCalledTimes(2);
    });

    it('returns { blocked: true } on phone (pointer: coarse)', () => {
      const { fillTextMock } = stubDeviceProfile({
        ontouchstart: true,
        maxTouchPoints: 5,
        pointerCoarse: true,
      });
      expect(mobileGuard()).toEqual({ blocked: true });
      expect(fillTextMock).toHaveBeenCalledTimes(2);
    });

    it('returns { blocked: true } on tablet (maxTouchPoints alone — OR-not-AND)', () => {
      stubDeviceProfile({
        ontouchstart: false,
        maxTouchPoints: 10,
        pointerCoarse: false,
      });
      expect(mobileGuard()).toEqual({ blocked: true });
    });
  });

  describe('?desktop=force override', () => {
    it('overrides the block on a phone-shaped touch device', () => {
      const { fillTextMock } = stubDeviceProfile({
        ontouchstart: true,
        maxTouchPoints: 5,
        pointerCoarse: true,
        searchString: '?desktop=force',
      });
      expect(mobileGuard()).toEqual({ blocked: false });
      // Notice MUST NOT be painted on the override path.
      expect(fillTextMock).not.toHaveBeenCalled();
    });

    it('treats the override flag case-insensitively', () => {
      stubDeviceProfile({
        ontouchstart: true,
        maxTouchPoints: 5,
        pointerCoarse: true,
        searchString: '?desktop=FORCE',
      });
      expect(mobileGuard()).toEqual({ blocked: false });
    });
  });

  describe('defensive fallbacks', () => {
    it('returns { blocked: true } when #game-canvas is missing', () => {
      // Phone-shaped profile so detection triggers, then canvas resolves to null.
      stubDeviceProfile({
        ontouchstart: true,
        maxTouchPoints: 5,
        pointerCoarse: true,
        canvasMissing: true,
      });
      // Safe default: still halt boot even when the notice cannot be painted.
      expect(mobileGuard()).toEqual({ blocked: true });
    });
  });
});
