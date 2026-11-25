import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EPILOGUE_MS,
  INTRO_MS,
  REVELATION_BEATS,
  STORY_MS,
  STORY_SHOT_MS,
  endingBeats,
} from '../../../src/core/cinematics.js';
import UISystem from '../../../src/modules/UISystem.js';
import { AAAHudLayout } from '../../../src/modules/ui/AAAHudLayout.js';
import { RunEndScreens } from '../../../src/modules/ui/RunEndScreens.js';
import {
  RunCinematics,
  beatTiming,
  travelDestination,
} from '../../../src/modules/ui/runCinematics.js';
import {
  endingTransmissions,
  prologueTransmissions,
  revelationTransmissions,
  runVoiceLines,
  travelTransmissions,
} from '../../../src/modules/ui/transmissions.js';

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
    layerBannerNote: fakeElement(),
    letterbox: fakeElement(),
  };
  const renderer = {
    playIntro: vi.fn(() => plays),
    playEpilogue: vi.fn(() => plays),
    playEndingBeat: vi.fn(() => plays),
    playArrival: vi.fn(() => plays),
    playTravel: vi.fn(() => plays),
    endTravel: vi.fn(),
    endCinematic: vi.fn(),
  };
  const events = [];
  const beatEvents = [];
  const held = [];
  let skipKey = null;
  let nextKey = null;
  const nextLine = vi.fn(() => false);
  const ui = {
    tacticalHud: { layout: hud },
    transmissionLayer: 1,
    queueTransmission: vi.fn(),
    getService: () => null,
  };
  const spoken = [];
  const hush = vi.fn();
  ui.cinematics = new RunCinematics({
    // The cinematics' own events (each layer also readies its voices).
    eventBus: {
      emit: (name, payload) => {
        if (name.startsWith('cinematic')) events.push([name, payload.kind]);
        if (name === 'ending-beat') beatEvents.push(payload);
      },
    },
    renderer: () => renderer,
    hud: () => hud,
    holdSim: (flag) => held.push(flag),
    bindSkip: (skip, next) => {
      skipKey = skip;
      nextKey = next;
      return () => {
        skipKey = null;
        nextKey = null;
      };
    },
    onIntroEnd: () =>
      UISystem.prototype.handleLayerStarted.call(ui, {
        wave: ui.transmissionLayer,
      }),
    speak: (entry) => spoken.push(entry),
    hush,
    nextLine,
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
    beatEvents,
    held,
    startRun,
    spoken,
    hush,
    skip: () => skipKey?.(),
    next: () => nextKey?.(),
    nextLine,
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
    const { ui, renderer, banners, events, held, startRun, skip } = setup();
    startRun();
    vi.advanceTimersByTime(500);
    expect(banners).toEqual([]);
    expect(held).toEqual([true]);

    skip();
    vi.advanceTimersByTime(INTRO_MS * 2);
    expect(renderer.endCinematic).toHaveBeenCalledTimes(1);
    expect(held).toEqual([true, false]);
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

  it("tells act 1's truth beat by beat, Sovereign's last words first, and the choice opens only after the last", () => {
    const { ui, hud, renderer, spoken, hush, events } = setup();
    const bars = hud.els.letterbox.classList;
    ui.cinematics.startRevelation();
    expect(bars.contains('is-showing')).toBe(true);
    expect(hush).toHaveBeenCalledTimes(1);
    expect(events).toEqual([['cinematic-started', 'revelation']]);
    const show = vi.fn();
    expect(ui.cinematics.deferUntilEpilogueEnds(show)).toBe(true);

    const lines = revelationTransmissions();
    const lengths = REVELATION_BEATS.map(
      (beat) => beatTiming(beat, lines).durationMs
    );
    lengths.forEach((ms) => expect(ms).toBeGreaterThanOrEqual(5000));
    vi.advanceTimersByTime(lengths.reduce((a, b) => a + b, 0) - 1);
    expect(spoken.map(({ key }) => key)).toEqual([
      'boss:sovereign:defeated',
      'revelation:0',
      'revelation:1',
      'revelation:2',
      'stage:quarantine-grid:3',
      'revelation:3',
      'revelation:4',
    ]);
    expect(renderer.playEndingBeat.mock.calls.map(([id]) => id)).toEqual(
      REVELATION_BEATS.map(({ id }) => id)
    );
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual(['cinematic-ended', 'revelation']);
    expect(bars.contains('is-showing')).toBe(false);
  });

  it("a renderer that draws none of it still says every line of act 1 before the choice, on the beats' time", () => {
    const { ui, hud, spoken } = setup({ plays: false });
    ui.cinematics.startRevelation();
    expect(hud.els.letterbox.classList.contains('is-showing')).toBe(false);
    const show = vi.fn();
    expect(ui.cinematics.deferUntilEpilogueEnds(show)).toBe(true);
    const lines = revelationTransmissions();
    const total = REVELATION_BEATS.reduce(
      (sum, beat) => sum + beatTiming(beat, lines).durationMs,
      0
    );
    vi.advanceTimersByTime(total - 1);
    expect(spoken).toHaveLength(REVELATION_BEATS.length);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('in act 1 a tap drops the line on air for the next beat, a hold goes to the choice', () => {
    const { ui, renderer, spoken, hush, skip, next } = setup();
    ui.cinematics.startRevelation();
    const show = vi.fn();
    ui.cinematics.deferUntilEpilogueEnds(show);
    next();
    expect(hush).toHaveBeenCalledTimes(2);
    expect(spoken.map(({ key }) => key)).toEqual([
      'boss:sovereign:defeated',
      'revelation:0',
    ]);
    expect(renderer.playEndingBeat.mock.lastCall[0]).toBe('count');
    expect(show).not.toHaveBeenCalled();

    skip();
    expect(hush).toHaveBeenCalledTimes(3);
    expect(show).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(spoken).toHaveLength(2);
    // Skipped before the session opens its screen: it opens at once then.
    expect(ui.cinematics.deferUntilEpilogueEnds(show)).toBe(false);
  });

  it('act 1 skipped before the choice is due holds its last picture under the bars, then opens the choice the moment it is asked for', () => {
    const { ui, hud, renderer, spoken, events, skip } = setup();
    const bars = hud.els.letterbox.classList;
    ui.cinematics.startRevelation();
    skip();
    expect(renderer.playEndingBeat.mock.lastCall).toEqual(['known', 1, null]);
    expect(bars.contains('is-showing')).toBe(true);
    expect(events).toEqual([['cinematic-started', 'revelation']]);
    // the skip does nothing more, no beat or line follows
    skip();
    vi.advanceTimersByTime(60_000);
    expect(spoken).toHaveLength(1);
    expect(renderer.playEndingBeat).toHaveBeenCalledTimes(2);

    const show = vi.fn();
    expect(ui.cinematics.deferUntilEpilogueEnds(show)).toBe(true);
    expect(show).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual(['cinematic-ended', 'revelation']);
    expect(bars.contains('is-showing')).toBe(false);
  });

  it('announces each drawn beat of an act with its id and ending, and none the renderer does not draw', () => {
    const { ui, beatEvents } = setup();
    ui.cinematics.startRevelation();
    expect(beatEvents).toEqual([{ id: REVELATION_BEATS[0].id, ending: null }]);
    ui.cinematics.playEnding('severance', vi.fn());
    const ids = endingBeats('severance').map(({ id }) => id);
    expect(beatEvents.at(-1)).toEqual({ id: ids[0], ending: 'severance' });

    const undrawn = setup({ plays: false });
    undrawn.ui.cinematics.startRevelation();
    undrawn.ui.cinematics.playEnding('severance', vi.fn());
    expect(undrawn.beatEvents).toEqual([]);
  });

  it('act 1 skipped early holds its last beat without announcing a beat', () => {
    const { ui, beatEvents, skip } = setup();
    ui.cinematics.startRevelation();
    const before = beatEvents.length;
    skip();
    expect(beatEvents).toHaveLength(before);
  });

  it('a renderer that draws none of act 1 still opens the choice when asked after an early skip', () => {
    const { ui, skip } = setup({ plays: false });
    ui.cinematics.startRevelation();
    skip();
    const show = vi.fn();
    expect(ui.cinematics.deferUntilEpilogueEnds(show)).toBe(true);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("plays act 2's beats under the bars for the ending picked, its two lines as theirs start, then the credits", () => {
    const { ui, hud, renderer, spoken } = setup();
    const bars = hud.els.letterbox.classList;
    const onEnd = vi.fn();
    // it says the renderer draws it (the page's own dim stays off)
    expect(ui.cinematics.playEnding('severance', onEnd)).toBe(true);
    expect(bars.contains('is-showing')).toBe(true);
    const beats = endingBeats('severance');
    const lines = endingTransmissions('severance');
    const total = beats.reduce(
      (sum, beat) => sum + beatTiming(beat, lines).durationMs,
      0
    );
    vi.advanceTimersByTime(total - 1);
    expect(spoken.map(({ key, speaker }) => [key, speaker])).toEqual([
      ['ending:severance:0', 'THE RING'],
      ['ending:severance:1', 'WAKE'],
    ]);
    expect(renderer.playEndingBeat.mock.calls).toEqual(
      beats.map((beat) => [
        beat.id,
        beatTiming(beat, lines).durationMs,
        'severance',
      ])
    );
    expect(onEnd).not.toHaveBeenCalled();
    expect(bars.contains('is-showing')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    // the bars come off where the credits take over
    expect(bars.contains('is-showing')).toBe(false);
    expect(endingBeats('stewardship').map(({ id }) => id)).toContain('watch');
  });

  it('a renderer that draws none of act 2 says so', () => {
    const { ui, hud } = setup({ plays: false });
    expect(ui.cinematics.playEnding('severance', vi.fn())).toBe(false);
    expect(hud.els.letterbox.classList.contains('is-showing')).toBe(false);
  });

  it("in act 2 a hold goes to the credits once, a tap to the next beat; the last beat's tap ends it", () => {
    const { ui, renderer, hush, skip, next } = setup();
    const onEnd = vi.fn();
    ui.cinematics.playEnding('stewardship', onEnd);
    skip();
    expect(hush).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    skip();
    vi.advanceTimersByTime(120_000);
    expect(onEnd).toHaveBeenCalledTimes(1);

    // A new run's stop drops it unseen.
    ui.cinematics.playEnding('stewardship', onEnd);
    ui.cinematics.stop();
    vi.advanceTimersByTime(120_000);
    expect(onEnd).toHaveBeenCalledTimes(1);

    renderer.playEndingBeat.mockClear();
    ui.cinematics.playEnding('stewardship', onEnd);
    const ids = endingBeats('stewardship').map(({ id }) => id);
    ids.slice(1).forEach(() => next());
    expect(renderer.playEndingBeat.mock.calls.map(([id]) => id)).toEqual(ids);
    expect(onEnd).toHaveBeenCalledTimes(1);
    next();
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it("the win that opens the choice plays act 1 in the epilogue's place and says Sovereign's words once; any other win, or a replay of it, keeps the epilogue", () => {
    const handlers = new Map();
    const cinematics = {
      startRevelation: vi.fn(),
      startEpilogue: vi.fn(),
    };
    const runEndScreens = Object.setPrototypeOf(
      { replay: false },
      RunEndScreens.prototype
    );
    const queueTransmission = vi.fn();
    UISystem.prototype.setupEventListeners.call(
      Object.setPrototypeOf(
        {
          cinematics,
          runEndScreens,
          queueTransmission,
          chestCeremony: { clear: () => {} },
          registerEventListener: (name, fn) => handlers.set(name, fn),
        },
        UISystem.prototype
      )
    );
    const won = handlers.get('run-won');

    won({ wave: 20, sector: 'the-crucible' });
    expect(cinematics.startRevelation).toHaveBeenCalledTimes(1);
    expect(cinematics.startEpilogue).not.toHaveBeenCalled();
    expect(queueTransmission).not.toHaveBeenCalled();

    won({ wave: 18, sector: 'wardens-reach' });
    expect(cinematics.startEpilogue).toHaveBeenCalledTimes(1);
    expect(queueTransmission).toHaveBeenCalledTimes(1);

    runEndScreens.replay = true;
    won({ wave: 20, sector: 'the-crucible' });
    expect(cinematics.startRevelation).toHaveBeenCalledTimes(1);
    expect(cinematics.startEpilogue).toHaveBeenCalledTimes(2);
    expect(queueTransmission.mock.lastCall[0].key).toBe(
      'boss:sovereign:defeated'
    );
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

  it('flies a journey for a carried start and every campaign-map launch, never a retry, a Descent or a replay', () => {
    const launch = { sector: 'debris-wake', source: 'campaign-launch-btn' };
    expect(travelDestination({ sector: 'salvage-lanes', carried: true })).toBe(
      'salvage-lanes'
    );
    expect(travelDestination(launch)).toBe('debris-wake');
    expect(travelDestination({ ...launch, sector: 'salvage-lanes' })).toBe(
      'salvage-lanes'
    );
    expect(travelDestination({ ...launch, source: 'retry-game-btn' })).toBe(
      null
    );
    expect(travelDestination({ sector: null, source: 'start-game-btn' })).toBe(
      null
    );
    expect(
      travelDestination({
        sector: 'salvage-lanes',
        carried: true,
        replay: true,
      })
    ).toBe(null);
    expect(
      travelDestination({}, { kind: 'travel', sector: 'furnace-drift' })
    ).toBe('furnace-drift');
  });

  it("readies the voices of the journey a start would fly and of the run's fight, in place of the ones before", () => {
    const emit = vi.fn();
    const cinematics = new RunCinematics({
      eventBus: { emit },
    });
    const keys = () => emit.mock.lastCall[1].entries.map((entry) => entry.key);
    const launch = { sector: 'debris-wake', source: 'campaign-launch-btn' };
    cinematics.prepareTravel(launch);
    expect(emit.mock.lastCall[0]).toBe('voice-lines-coming');
    // A campaign launch tells the story: its lines come too.
    expect(keys()).toEqual([
      ...travelTransmissions('debris-wake').map((entry) => entry.key),
      ...prologueTransmissions().map((entry) => entry.key),
      ...runVoiceLines(launch).map((entry) => entry.key),
    ]);
    expect(keys()).toContain('chapter:debris-wake');
    expect(keys()).toContain('boss:quarry-maw:warning');

    // The run starts without its journey (a sector already won): its
    // fight's lines alone, from the start.
    cinematics.armTravel({ sector: 'debris-wake', source: 'start-game-btn' });
    expect(keys()).toEqual(
      runVoiceLines({ sector: 'debris-wake' }).map((e) => e.key)
    );

    // A Descent readies the stretch ahead as each layer starts; a sector
    // run or a Boss Rush keeps what its start readied.
    emit.mockClear();
    cinematics.prepareLayer(4, null, false);
    expect(keys()).toEqual(runVoiceLines({}, 4).map((entry) => entry.key));
    cinematics.prepareLayer(3, { id: 'debris-wake' }, false);
    cinematics.prepareLayer(5, null, true);
    expect(emit).toHaveBeenCalledTimes(1);

    cinematics.prepareEnding();
    expect(keys()).toEqual([
      ...endingTransmissions('severance').map((entry) => entry.key),
      ...endingTransmissions('stewardship').map((entry) => entry.key),
    ]);
  });

  it('holds the run through a journey, cards wait for the intro, and a skip drops the lines for the descent', () => {
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
    expect(ui.cinematics.kind).toBe('intro');
    expect(card).not.toHaveBeenCalled();
    skip();
    expect(ui.cinematics.kind).toBe(null);
    expect(held.at(-1)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(banners).toHaveLength(1);
    expect(card).toHaveBeenCalledTimes(1);
  });

  it('tells the story on every campaign launch, a line opening each shot; a skip flies on to the journey', () => {
    const { ui, renderer, spoken, hush, skip } = setup();
    renderer.playStory = vi.fn(() => true);
    renderer.endStory = vi.fn();
    const launch = { sector: 'debris-wake', source: 'campaign-launch-btn' };
    ui.cinematics.armTravel(launch);
    ui.cinematics.startIntro();
    expect(ui.cinematics.kind).toBe('story');
    expect(renderer.playTravel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STORY_SHOT_MS[0] + STORY_SHOT_MS[1]);
    expect(spoken.map(({ key }) => key)).toEqual(['prologue:0', 'prologue:1']);

    skip();
    expect(hush).toHaveBeenCalledTimes(1);
    expect(renderer.endStory).toHaveBeenCalledTimes(1);
    expect(ui.cinematics.kind).toBe('travel');
    vi.advanceTimersByTime(STORY_MS);
    const told = spoken.filter(({ key }) => key.startsWith('prologue'));
    expect(told).toHaveLength(2);

    // The next campaign launch tells it again; the victory screen's Next
    // Sector flies straight to its journey.
    ui.cinematics.stop();
    ui.cinematics.armTravel(launch);
    ui.cinematics.startIntro();
    expect(ui.cinematics.kind).toBe('story');
    ui.cinematics.stop();
    ui.cinematics.armTravel({ sector: 'salvage-lanes', carried: true });
    ui.cinematics.startIntro();
    expect(ui.cinematics.kind).toBe('travel');
    expect(renderer.playStory).toHaveBeenCalledTimes(2);
  });

  it("a tap goes to the story's next shot, its line first; on the last shot, to the journey", () => {
    const { ui, renderer, spoken, hush, next } = setup();
    renderer.playStory = vi.fn(() => true);
    renderer.seekStory = vi.fn();
    renderer.endStory = vi.fn();
    ui.cinematics.armTravel({
      sector: 'debris-wake',
      source: 'campaign-launch-btn',
    });
    ui.cinematics.startIntro();
    vi.advanceTimersByTime(1000);
    next();
    expect(hush).toHaveBeenCalledTimes(1);
    expect(renderer.seekStory).toHaveBeenLastCalledWith(STORY_SHOT_MS[0]);
    vi.advanceTimersByTime(500);
    expect(spoken.map(({ key }) => key)).toEqual(['prologue:0', 'prologue:1']);

    for (let shot = 2; shot < STORY_SHOT_MS.length; shot += 1) next();
    expect(ui.cinematics.kind).toBe('story');
    next();
    expect(ui.cinematics.kind).toBe('travel');
    expect(renderer.endStory).toHaveBeenCalledTimes(1);
  });

  it("a tap drops the journey's line on air; with none waiting, the descent; there, the run", () => {
    const { ui, renderer, held, next, nextLine } = setup();
    ui.cinematics.armTravel({ sector: 'salvage-lanes', carried: true });
    ui.cinematics.startIntro();
    nextLine.mockReturnValueOnce(true);
    next();
    expect(ui.cinematics.kind).toBe('travel');
    next();
    expect(renderer.endTravel).toHaveBeenCalledTimes(1);
    expect(ui.cinematics.kind).toBe('intro');
    next();
    expect(ui.cinematics.kind).toBe(null);
    expect(held.at(-1)).toBe(false);
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

  it("plays the layer's line after the journey's when the camera cannot move", () => {
    const { ui, spoken, banners } = setup({ plays: false });
    ui.queueTransmission = (entry) => spoken.push(entry);
    // The layer starts before 'game-started', which drops its line.
    UISystem.prototype.handleLayerStarted.call(ui, { wave: 1 });
    spoken.length = 0;
    ui.cinematics.armTravel({
      sector: 'debris-wake',
      source: 'campaign-launch-btn',
    });
    ui.cinematics.startIntro();
    vi.advanceTimersByTime(500);
    expect(spoken.map(({ key }) => key)).toEqual([
      'travel:debris-wake:0',
      'travel:debris-wake:1',
      'travel:debris-wake:2',
      expect.stringMatching(/^chapter:/),
    ]);
    expect(banners.length).toBeGreaterThan(0);
  });

  it('the press that picked the ending is no tap; a hold of the skip key skips it', () => {
    // Window capture listeners run first on each event, as in the browser:
    // one bound during an event's own handler misses that event.
    const listeners = new Map();
    vi.stubGlobal('window', {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
      addEventListener: (type, fn) =>
        listeners.set(type, [...(listeners.get(type) ?? []), fn]),
      removeEventListener: (type, fn) =>
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((other) => other !== fn)
        ),
      requestAnimationFrame: (fn) => setTimeout(fn, 16),
      cancelAnimationFrame: (id) => clearTimeout(id),
    });
    const body = fakeElement();
    body.dataset = {};
    const hint = {
      ...fakeElement(),
      dataset: {},
      setAttribute() {},
      querySelector() {
        return this;
      },
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ width: 0 }),
    };
    body.append = () => {};
    vi.stubGlobal('document', { body, createElement: () => hint });
    vi.stubGlobal('performance', { now: () => Date.now() });
    // A tap drops the line on air for the next beat; a hold, the act.
    const hush = vi.fn();
    const cinematics = new RunCinematics({
      eventBus: { emit: () => {} },
      renderer: () => null,
      hud: () => null,
      holdSim: () => {},
      hush,
    });
    const onEnd = vi.fn();
    const dispatch = (type, target = () => {}) => {
      (listeners.get(type) ?? []).forEach((fn) =>
        fn({
          type,
          code: 'Space',
          repeat: false,
          preventDefault() {},
          stopImmediatePropagation() {},
        })
      );
      target();
    };

    // Space on the choice button: its keyup clicks it and picks the ending.
    dispatch('keydown');
    dispatch('keyup', () => cinematics.playEnding('severance', onEnd));
    vi.advanceTimersByTime(100);
    expect(hush).not.toHaveBeenCalled();

    dispatch('keydown');
    vi.advanceTimersByTime(1600);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(hush).toHaveBeenCalledTimes(1);
    dispatch('keyup');
    expect(hush).toHaveBeenCalledTimes(1);
  });
});
