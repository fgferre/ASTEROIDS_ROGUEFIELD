import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EPILOGUE_MS,
  INTRO_MS,
  endingPath,
  epiloguePath,
} from '../../../src/core/cinematics.js';
import UISystem from '../../../src/modules/UISystem.js';
import { AAAHudLayout } from '../../../src/modules/ui/AAAHudLayout.js';
import {
  RunCinematics,
  travelDestination,
} from '../../../src/modules/ui/runCinematics.js';

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
    letterbox: fakeElement(),
  };
  const renderer = {
    playIntro: vi.fn(() => plays),
    playEpilogue: vi.fn(() => plays),
    playArrival: vi.fn(() => plays),
    playTravel: vi.fn(() => plays),
    endTravel: vi.fn(),
    endCinematic: vi.fn(),
  };
  const events = [];
  const held = [];
  let skipKey = null;
  const ui = {
    tacticalHud: { layout: hud },
    transmissionLayer: 1,
    queueTransmission: vi.fn(),
    getService: () => null,
  };
  const spoken = [];
  const hush = vi.fn();
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
    speak: (entry) => spoken.push(entry),
    hush,
    records: () => ({ sectorsWon: [] }),
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
    spoken,
    hush,
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

  it("plays an ending's two lines while the Ring's wake eases to its own, then the final card", () => {
    const { ui, renderer, spoken } = setup();
    renderer.startCinematic = vi.fn();
    const onEnd = vi.fn();
    ui.cinematics.playEnding('severance', onEnd);

    expect(spoken.map(({ key, speaker }) => [key, speaker])).toEqual([
      ['ending:severance:0', 'THE RING'],
      ['ending:severance:1', 'WAKE'],
    ]);
    const [path, durationMs, hold] = renderer.startCinematic.mock.calls[0];
    expect(hold).toBe(true);
    expect(path(0).wake).toBe(1);
    expect(path(1).wake).toBe(0);
    expect(path(1).distance).toBe(epiloguePath(1).distance);
    expect(endingPath('stewardship')(1).wake).toBeGreaterThan(1);

    vi.advanceTimersByTime(durationMs - 1);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('letterboxes a Warden entrance without holding the run, lifting it when the Warden closes up', () => {
    const { ui, hud, renderer, events, held } = setup();
    const warden = { x: 400, y: 84 };
    expect(ui.cinematics.startArrival(warden)).toBe(true);
    expect(renderer.playArrival).toHaveBeenCalledWith(warden);
    expect(hud.els.letterbox.classList.contains('is-showing')).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(hud.els.letterbox.classList.contains('is-showing')).toBe(true);
    ui.cinematics.endArrival();
    expect(hud.els.letterbox.classList.contains('is-showing')).toBe(false);
    expect(held).toEqual([]);
    expect(events).toEqual([
      ['cinematic-started', 'arrival'],
      ['cinematic-ended', 'arrival'],
    ]);
  });

  it('only retargets the camera for a second Warden, and a new run lifts the letterbox at once', () => {
    const { ui, hud, renderer, events } = setup();
    ui.cinematics.startArrival({ x: 400, y: 84 });
    vi.advanceTimersByTime(200);
    const second = { x: 200, y: 84 };
    ui.cinematics.startArrival(second);
    expect(renderer.playArrival).toHaveBeenLastCalledWith(second);
    expect(events).toEqual([['cinematic-started', 'arrival']]);

    ui.cinematics.stop();
    expect(hud.els.letterbox.classList.contains('is-showing')).toBe(false);
    expect(events.at(-1)).toEqual(['cinematic-ended', 'arrival']);
  });

  it('shows no letterbox when the camera cannot move (reduced motion), nor over the intro', () => {
    const refused = setup({ plays: false });
    expect(refused.ui.cinematics.startArrival({ x: 400, y: 84 })).toBe(false);
    expect(refused.hud.els.letterbox.classList.contains('is-showing')).toBe(
      false
    );
    expect(refused.events).toEqual([]);

    const { ui, renderer, startRun } = setup();
    startRun();
    expect(ui.cinematics.startArrival({ x: 400, y: 84 })).toBe(false);
    expect(renderer.playArrival).not.toHaveBeenCalled();
    expect(ui.cinematics.introActive).toBe(true);
  });

  it('flies a journey for a carried start and the first-ever first-sector launch, not otherwise', () => {
    const none = { sectorsWon: [] };
    const won = { sectorsWon: ['debris-wake'] };
    const launch = { sector: 'debris-wake', source: 'campaign-launch-btn' };
    expect(
      travelDestination({ sector: 'salvage-lanes', carried: true }, won)
    ).toBe('salvage-lanes');
    expect(travelDestination(launch, none)).toBe('debris-wake');
    expect(travelDestination(launch, won)).toBe(null);
    expect(
      travelDestination({ ...launch, sector: 'salvage-lanes' }, none)
    ).toBe(null);
    expect(
      travelDestination({ ...launch, source: 'retry-game-btn' }, none)
    ).toBe(null);
    expect(travelDestination({ sector: null, source: 'start-game-btn' })).toBe(
      null
    );
    expect(
      travelDestination(
        { sector: 'salvage-lanes', carried: true, replay: true },
        won
      )
    ).toBe(null);
    expect(
      travelDestination({}, none, { kind: 'travel', sector: 'furnace-drift' })
    ).toBe('furnace-drift');
  });

  it('holds the run through a journey, cards wait for the intro, and a skip drops the lines', () => {
    const { ui, renderer, held, spoken, hush, banners, skip } = setup();
    ui.cinematics.armTravel({ sector: 'salvage-lanes', carried: true });
    const card = vi.fn();
    ui.cinematics.afterTravel(card);
    ui.cinematics.startIntro();
    expect(ui.cinematics.kind).toBe('travel');
    expect(renderer.playTravel).toHaveBeenCalledTimes(1);
    expect(spoken.map((entry) => entry.key)).toEqual([
      'travel:salvage-lanes:0',
      'travel:salvage-lanes:1',
    ]);
    expect(held).toEqual([true]);
    expect(card).not.toHaveBeenCalled();

    skip();
    expect(hush).toHaveBeenCalledTimes(1);
    expect(renderer.endTravel).toHaveBeenCalledTimes(1);
    expect(renderer.playIntro).toHaveBeenCalledTimes(1);
    expect(ui.cinematics.kind).toBe(null);
    expect(held.at(-1)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(banners).toHaveLength(1);
    expect(card).toHaveBeenCalledTimes(1);
  });

  it('plays a journey as plain lines when the camera cannot move', () => {
    const { ui, held, spoken } = setup({ plays: false });
    ui.cinematics.armTravel({
      sector: 'debris-wake',
      source: 'campaign-launch-btn',
    });
    const card = vi.fn();
    ui.cinematics.afterTravel(card);
    ui.cinematics.startIntro();
    expect(spoken).toHaveLength(3);
    expect(spoken[0].holdMs).toBeUndefined();
    expect(held).toEqual([]);
    expect(card).toHaveBeenCalledTimes(1);
  });
});
