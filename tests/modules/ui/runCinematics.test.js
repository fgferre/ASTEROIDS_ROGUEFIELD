import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EPILOGUE_MS, INTRO_MS } from '../../../src/core/cinematics.js';
import UISystem from '../../../src/modules/UISystem.js';
import { AAAHudLayout } from '../../../src/modules/ui/AAAHudLayout.js';
import { RunCinematics } from '../../../src/modules/ui/runCinematics.js';

// The node test environment has no DOM: just enough element for the banner.
function fakeElement(onAdd = () => {}) {
  const classes = new Set();
  return {
    textContent: '',
    offsetWidth: 0,
    classList: {
      add: (...names) =>
        names.forEach((name) => {
          classes.add(name);
          onAdd(name);
        }),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    },
  };
}

function setup({ plays = true } = {}) {
  const hud = new AAAHudLayout();
  const banners = [];
  hud.els = {
    layerBanner: fakeElement((name) => {
      if (name === 'is-showing')
        banners.push(hud.els.layerBannerSub.textContent);
    }),
    layerBannerTitle: fakeElement(),
    layerBannerSub: fakeElement(),
    cinematicHint: fakeElement(),
  };
  const renderer = {
    playIntro: vi.fn(() => plays),
    playEpilogue: vi.fn(() => plays),
    endCinematic: vi.fn(),
  };
  const events = [];
  const held = [];
  let skipKey = null;
  const ui = {
    aaaTacticalHud: hud,
    transmissionLayer: 1,
    queueTransmission: vi.fn(),
  };
  ui.cinematics = new RunCinematics({
    eventBus: { emit: (name, payload) => events.push([name, payload.kind]) },
    renderer: () => renderer,
    hud: () => hud,
    holdSim: (flag) => held.push(flag),
    bindSkip: (skip) => {
      skipKey = skip;
      return () => {
        skipKey = null;
      };
    },
    onIntroEnd: () =>
      UISystem.prototype.handleLayerStarted.call(ui, {
        wave: ui.transmissionLayer,
      }),
  });
  // A run start: wave 1 starts (its banner queued), then the intro.
  const startRun = () => {
    UISystem.prototype.handleLayerStarted.call(ui, { wave: 1 });
    ui.cinematics.startIntro();
  };
  return {
    ui,
    hud,
    renderer,
    banners,
    events,
    held,
    startRun,
    skip: () => skipKey?.(),
  };
}

describe('RunCinematics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('holds the run through the intro, and a skip ends it with one title card', () => {
    const { ui, hud, renderer, banners, events, held, startRun, skip } =
      setup();
    startRun();
    vi.advanceTimersByTime(500);
    expect(banners).toEqual([]);
    expect(held).toEqual([true]);
    expect(hud.els.cinematicHint.classList.contains('is-showing')).toBe(true);

    skip();
    vi.advanceTimersByTime(INTRO_MS * 2);
    expect(renderer.endCinematic).toHaveBeenCalledTimes(1);
    expect(held).toEqual([true, false]);
    expect(hud.els.cinematicHint.classList.contains('is-showing')).toBe(false);
    expect(banners).toEqual(['CHAPTER I — THE OUTER RING']);
    expect(ui.queueTransmission).toHaveBeenCalledTimes(2);
    expect(ui.queueTransmission.mock.calls[1][0].key).toBe(
      'chapter:outer-ring'
    );
    expect(events).toEqual([
      ['cinematic-started', 'intro'],
      ['cinematic-ended', 'intro'],
    ]);
  });

  it('shows the title card once when the intro plays out', () => {
    const { banners, held, startRun } = setup();
    startRun();
    vi.advanceTimersByTime(INTRO_MS + 100);
    expect(banners).toHaveLength(1);
    expect(held).toEqual([true, false]);
  });

  it('keeps the plain banner when the renderer cannot move the camera', () => {
    const { banners, held, startRun } = setup({ plays: false });
    startRun();
    vi.advanceTimersByTime(100);
    expect(banners).toHaveLength(1);
    expect(held).toEqual([]);
  });

  it('lets the victory line through and shows the victory screen after the epilogue', () => {
    const { ui, hud } = setup();
    hud.showSurgeBanner('Rush');
    expect(hud.isBannerBusy()).toBe(true);
    ui.cinematics.startEpilogue();
    expect(hud.isBannerBusy()).toBe(false);

    const show = vi.fn();
    expect(ui.cinematics.deferUntilEpilogueEnds(show)).toBe(true);
    vi.advanceTimersByTime(EPILOGUE_MS - 1);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(ui.cinematics.deferUntilEpilogueEnds(show)).toBe(false);
  });
});
