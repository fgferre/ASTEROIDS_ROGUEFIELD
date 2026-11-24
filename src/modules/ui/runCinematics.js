// src/modules/ui/runCinematics.js
//
// Sequencing of the run's cinematics (PLAN.md R5.1), on wall-clock time like
// the HUD banners. Journey: before a sector the victory screen's Next Sector
// starts, and before the first sector the first time the campaign launches
// it, the renderer flies the ship there (render3d/travelScene.js) under the
// letterbox while the journey's lines play; the simulation is held, and the
// cards dealt at the start (a head start, owed picks) wait for the intro's
// end. It ends on the intro's first pose and the intro follows. Intro: the
// renderer descends to the ship while the simulation is held (no step runs,
// so replays stay exact); the layer banner — the title card — shows once,
// when it ends. Epilogue: the renderer pulls back as the
// Ring wakes, the victory line plays over it, and the victory screen waits
// for it to end. The campaign's ending plays in beats (core/cinematics.js),
// each asking the renderer for its picture (playEndingBeat) and speaking its
// line as it starts, timed by the beats even when the renderer draws none:
// act 1, the revelation, replaces the epilogue on the win that opens the
// choice, and the choice waits for it; act 2, the ending picked, plays its
// own beats, then the credits and the final card. Warden entrance: letterbox bars
// over the live shot until
// the Warden closes up ('boss-arrived'); the run plays on, slowed (no hold,
// no skip). A renderer that can't move the camera (2D, reduced motion,
// `?camera=0`) refuses them all, and the run keeps the plain banner; a
// journey's lines then play as ordinary transmissions.
// Story: every campaign launch tells it before its journey (the owner,
// 23/11: "tem que se tocar sim. A pessoa se quiser pula";
// render3d/storyScene.js): six shots of the Wake under the letterbox, a line
// opening each; a skip goes on to the journey.
// Skipping (ui/skipHold.js): the skip key held skips the scene playing (the
// story, the journey, the intro, an act of the ending: act 1 to the choice,
// act 2 to the credits); a tap goes to its next line — the story's next
// shot, the journey's next line, the ending's next beat — and with none
// left, or in the intro, to the next scene.

import {
  EPILOGUE_MS,
  INTRO_MS,
  REVELATION_BEATS,
  STORY_LINE_LEAD_MS,
  STORY_MS,
  STORY_SHOT_MS,
  TRAVEL,
  cinematicFreezeFromUrl,
  endingBeats,
} from '../../core/cinematics.js';
import { IS_DEV } from '../../core/env.js';
import { SECTORS, sectorById } from '../../data/sectors.js';
import { STORY } from '../../data/story.js';
import {
  TRANSMISSION_CHARS_PER_SECOND,
  endingTransmissions,
  holdMsFor,
  prologueTransmissions,
  revelationTransmissions,
  runVoiceLines,
  travelTransmissions,
} from './transmissions.js';
import { listenForHold } from './skipHold.js';

// The bars leave when the Warden closes up; this only covers one that never
// does (released mid-entrance).
const ARRIVAL_LIMIT_MS = 6000;
// A story line's hold once typed (its voice holds it longer).
const STORY_LINE_HOLD_MS = 600;

/**
 * The sector a run start flies to first, or null: the sector a carried start
 * (the victory screen's Next Sector) begins, or any sector launched from the
 * campaign map — every launch, won before or not (the owner's choice, 16/11:
 * the skip key is there). Never a retry or a replay. A dev `freeze` of kind
 * 'travel' flies any start to its sector (or the first).
 */
export function travelDestination(
  { sector, carried, source, replay } = {},
  freeze = null
) {
  if (replay) return null;
  if (freeze?.kind === 'travel' || freeze?.kind === 'story') {
    return sectorById(freeze.sector)?.id ?? SECTORS[0].id;
  }
  if (!sectorById(sector)) return null;
  return carried || source === 'campaign-launch-btn' ? sector : null;
}

/**
 * Whether a run `start` flying to `to` tells the story first: a campaign
 * launch (never the victory screen's Next Sector), or any start under a dev
 * `freeze` of kind 'story'.
 */
export function tellsStory({ source } = {}, to, freeze = null) {
  if (!to) return false;
  if (freeze?.kind === 'story') return true;
  return source === 'campaign-launch-btn';
}

/**
 * The journey's length for its `lines`: typed, held, within TRAVEL; longer
 * when its recorded lines (audio/voiceLines.js) need it to be spoken out.
 */
export function travelDurationMs(lines) {
  const sum = (hold) =>
    lines.reduce((total, line) => {
      const typing = (line.text.length / TRANSMISSION_CHARS_PER_SECOND) * 1000;
      return total + typing + hold(line, typing);
    }, TRAVEL.leadMs);
  const typed = sum(() => TRAVEL.lineHoldMs);
  const spoken = sum((line, typing) =>
    holdMsFor({ ...line, holdMs: TRAVEL.lineHoldMs }, typing)
  );
  return Math.max(
    Math.min(TRAVEL.maxMs, Math.max(TRAVEL.minMs, typed)),
    spoken
  );
}

/**
 * A beat of the ending (core/cinematics.js) with its act's `lines`: its
 * line, held to stay up through the beat (null without one), and the beat's
 * length — the line typed and held (longer for its recording, as a
 * journey's), never less than the beat's minimum.
 */
export function beatTiming(beat, lines) {
  const line = lines[beat.line];
  if (!line) return { entry: null, durationMs: beat.minMs };
  const typing = (line.text.length / TRANSMISSION_CHARS_PER_SECOND) * 1000;
  const holdMs = Math.max(TRAVEL.lineHoldMs, beat.minMs - typing);
  const entry = { ...line, holdMs };
  return { entry, durationMs: typing + holdMsFor(entry, typing) };
}

export class RunCinematics {
  /**
   * `renderer()`/`hud()` resolve the current ones (playTravel, endTravel,
   * playIntro, playEpilogue, playEndingBeat, playArrival, playStory,
   * seekStory, endCinematic / cancelBanner, showLetterbox). `holdSim(flag)` stops or restarts the
   * fixed step; `bindSkip(skip, next)` listens for the skip and the tap and
   * returns the unbind; `onIntroEnd()` shows the layer banner; `speak(entry)`
   * queues a transmission, `hush()` drops them all and `nextLine()` ends the
   * one on air, false when none waits after it.
   */
  constructor({
    eventBus,
    renderer,
    hud,
    holdSim,
    bindSkip = listenForHold,
    onIntroEnd,
    speak = () => {},
    hush = () => {},
    nextLine = () => false,
  }) {
    this.eventBus = eventBus;
    this.renderer = renderer;
    this.hud = hud;
    this.holdSim = holdSim;
    this.bindSkip = bindSkip;
    this.onIntroEnd = onIntroEnd;
    this.speak = speak;
    this.hush = hush;
    this.nextLine = nextLine;
    this.kind = null;
    this.timer = null;
    this.handOff = null;
    this.unbindSkip = null;
    this.afterEpilogue = null;
    this.afterEnding = null;
    // The act of the ending playing: { beats, lines, ending, onEnd, at }.
    this.act = null;
    this.travelTo = null;
    // A campaign launch's journey tells the story first (startStory).
    this.tellsStory = false;
    this.storyTo = null;
    this.storyStartedAt = 0;
    this.lineTimers = [];
    // Cards dealt while a journey is armed or plays, shown after the intro.
    this.cards = null;
  }

  /** The run's opening plays: its journey or its intro. */
  get introActive() {
    return ['intro', 'travel', 'story'].includes(this.kind);
  }

  /**
   * On 'game-started' (`start` its payload), before the start unpauses:
   * arms the journey this start flies, if any. The intro (startIntro) flies
   * it first.
   */
  armTravel(start) {
    const freeze = IS_DEV ? cinematicFreezeFromUrl() : null;
    this.travelTo = travelDestination(start, freeze);
    this.tellsStory = tellsStory(start, this.travelTo, freeze);
    this.cards = this.travelTo ? [] : null;
    this.readyVoices(start, this.travelTo);
  }

  /**
   * A run `start` (as armTravel's) is offered (the victory screen's Next
   * Sector, the campaign map's Launch): its voices load now, as below.
   */
  prepareTravel(start) {
    // The sector's music is fetched meanwhile (audio/SectorScore.js).
    if (start.sector)
      this.eventBus.emit('sector-picked', { sector: start.sector });
    this.readyVoices(start, travelDestination(start));
  }

  /**
   * The recordings (audio/voiceLines.js) of the journey to `to` (none: null)
   * and of every line run `start` can say in its fight load now, in place of
   * the ones loaded before, so each line speaks as it shows.
   */
  readyVoices(start, to) {
    const entries = to ? travelTransmissions(to) : [];
    if (tellsStory(start, to)) entries.push(...prologueTransmissions());
    entries.push(...runVoiceLines(start));
    this.eventBus.emit('voice-lines-coming', { entries });
  }

  /**
   * Layer `layer` of a run in `sector` (or null) starts: a Descent readies
   * the voices of the stretch ahead (runVoiceLines), a sector run or a Boss
   * Rush has all of its own since its start.
   */
  prepareLayer(layer, sector, bossRush) {
    if (sector || bossRush) return;
    const entries = runVoiceLines({}, layer);
    this.eventBus.emit('voice-lines-coming', { entries });
  }

  /** The ending choice opens: the lines of every ending load now. */
  prepareEnding() {
    const entries = Object.keys(STORY.ending).flatMap((ending) =>
      endingTransmissions(ending)
    );
    this.eventBus.emit('voice-lines-coming', { entries });
  }

  /** Runs `show` now, or after the intro while a journey is armed or plays. */
  afterTravel(show) {
    if (this.cards) this.cards.push(show);
    else show();
  }

  /** False (nothing happens) when the renderer can't play it. */
  startIntro() {
    this.stop();
    const to = this.travelTo;
    this.travelTo = null;
    if (to && this.tellsStory && this.startStory(to)) return true;
    if (to && this.startTravel(to)) return true;
    // No flight (reduced motion, no 3D): the lines play as they come.
    if (to) travelTransmissions(to).forEach((entry) => this.speak(entry));
    const playing = this.playIntro();
    // No intro: its end comes at once, so the layer's title card and line
    // follow the journey's ('game-started' dropped the line queued before).
    if (!playing) {
      this.onIntroEnd();
      this.showCards();
    }
    return playing;
  }

  playIntro() {
    if (!this.renderer()?.playIntro?.(INTRO_MS)) {
      return false;
    }
    this.begin('intro', INTRO_MS, () => this.endIntro());
    this.hud()?.cancelBanner();
    this.holdSim(true);
    this.unbindSkip = this.bindSkip(
      () => this.skip(),
      () => this.next()
    );
    return true;
  }

  startTravel(to) {
    const lines = travelTransmissions(to, TRAVEL.lineHoldMs);
    const durationMs = travelDurationMs(lines);
    if (!this.renderer()?.playTravel?.({ to, durationMs })) {
      return false;
    }
    this.begin('travel', durationMs, () => this.endTravel());
    this.hud()?.cancelBanner();
    this.hud()?.showLetterbox(true, true);
    // The instruments fade back in under the bars over the last second.
    this.handOff = setTimeout(
      () => this.hud()?.showLetterbox(true),
      durationMs - TRAVEL.handOffMs
    );
    this.holdSim(true);
    lines.forEach((entry) => this.speak(entry));
    this.unbindSkip = this.bindSkip(
      () => this.skip(),
      () => this.next()
    );
    return true;
  }

  /** The story before the journey to sector `to`; false without 3D. */
  startStory(to) {
    this.tellsStory = false;
    if (!this.renderer()?.playStory?.()) return false;
    this.begin('story', STORY_MS, () => this.endStory(to));
    this.hud()?.cancelBanner();
    this.hud()?.showLetterbox(true, true);
    this.holdSim(true);
    this.storyTo = to;
    this.tellFrom(0);
    this.unbindSkip = this.bindSkip(
      () => this.skip(),
      () => this.next()
    );
    return true;
  }

  /**
   * The story from shot `first` on, now: each line opens its shot, held
   * short so the next shot's finds the channel clear.
   */
  tellFrom(first) {
    const from = STORY_SHOT_MS.slice(0, first).reduce((a, b) => a + b, 0);
    this.storyStartedAt = performance.now() - from;
    this.lineTimers.forEach(clearTimeout);
    this.lineTimers = [];
    let shotAt = STORY_LINE_LEAD_MS;
    prologueTransmissions(STORY_LINE_HOLD_MS).forEach((entry, i) => {
      if (i >= first) {
        this.lineTimers.push(setTimeout(() => this.speak(entry), shotAt));
        shotAt += STORY_SHOT_MS[i];
      }
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.endStory(this.storyTo), STORY_MS - from);
  }

  // The story is told: the journey flies on from it.
  endStory(to) {
    this.finish();
    this.renderer()?.endStory();
    if (!this.startTravel(to) && !this.playIntro()) this.endIntro();
  }

  // The flight ends on the intro's first pose: the intro goes on from it.
  endTravel() {
    this.finish();
    this.renderer()?.endTravel();
    if (!this.playIntro()) this.endIntro();
  }

  /**
   * Ends the scene playing now (one scene per hold, Felipe 23/11): the
   * story's or the journey's lines drop and the next scene plays; the
   * intro's camera eases back to the ship and the run starts; an act of the
   * ending drops its line and ends (to the choice, to the credits).
   */
  skip() {
    if (this.act) {
      this.hush();
      this.act.onEnd();
      return;
    }
    if (this.kind === 'story') {
      this.hush();
      this.endStory(this.storyTo);
      return;
    }
    if (this.kind === 'travel') {
      this.hush();
      this.endTravel();
      return;
    }
    if (this.kind !== 'intro') {
      return;
    }
    this.renderer()?.endCinematic();
    this.endIntro();
  }

  /**
   * A tap of the skip key: the story's next shot, the journey's next line,
   * the ending's next beat (its line on air dropped); with none left (or in
   * the intro), the next scene.
   */
  next() {
    if (this.act) {
      this.hush();
      this.playBeat(this.act.at + 1);
      return;
    }
    if (this.kind === 'story') {
      const elapsed = performance.now() - this.storyStartedAt;
      let end = 0;
      const shot = STORY_SHOT_MS.findIndex((ms) => (end += ms) > elapsed);
      if (shot >= 0 && shot < STORY_SHOT_MS.length - 1) {
        this.hush();
        this.tellFrom(shot + 1);
        this.renderer()?.seekStory(performance.now() - this.storyStartedAt);
        return;
      }
    } else if (this.kind === 'travel' && this.nextLine()) {
      return;
    }
    this.skip();
  }

  startEpilogue() {
    this.stop();
    if (!this.renderer()?.playEpilogue?.(EPILOGUE_MS)) {
      return false;
    }
    // Nothing on the banner may hold back the victory line.
    this.hud()?.cancelBanner();
    this.begin('epilogue', EPILOGUE_MS, () => this.endEpilogue());
    return true;
  }

  // The win's scene is over: the screen it held back opens.
  endEpilogue() {
    const show = this.afterEpilogue;
    this.finish();
    show?.();
  }

  /**
   * Act 1 of the campaign's ending, in the epilogue's place on the win that
   * opens the choice (RunEndScreens.opensChoice): the truth, beat by beat
   * (REVELATION_BEATS), from Sovereign's last words on; the choice waits
   * for its end (deferUntilEpilogueEnds). It plays, and speaks every line,
   * whether or not the renderer draws it.
   */
  startRevelation() {
    this.stop();
    const lines = revelationTransmissions();
    // The fence line is no line of this run's: its recording loads now.
    this.eventBus.emit('voice-lines-coming', { entries: lines });
    // Nothing on the banner or on air may hold back Sovereign's last words.
    this.hud()?.cancelBanner();
    this.hush();
    this.startAct('revelation', REVELATION_BEATS, lines, null, () =>
      this.endEpilogue()
    );
  }

  /**
   * Act 2: the ending picked (data/story.js STORY.ending), its beats
   * (endingBeats) with its two lines; `onEnd` runs once, when they are done
   * or skipped. The press that picked it has gone by when the skip binds.
   */
  playEnding(ending, onEnd) {
    this.stop();
    this.afterEnding = onEnd;
    this.startAct(
      'ending',
      endingBeats(ending),
      endingTransmissions(ending),
      ending,
      () => this.endEnding()
    );
  }

  // An act of the ending (kind 'revelation' or 'ending') from its first beat.
  startAct(kind, beats, lines, ending, onEnd) {
    this.begin(kind);
    this.act = { beats, lines, ending, onEnd, at: 0 };
    this.playBeat(0);
    this.unbindSkip = this.bindSkip(
      () => this.skip(),
      () => this.next()
    );
  }

  /**
   * The act's beat `i`, now: its picture asked of the renderer, its line
   * spoken; the next beat when it is over, the act's end after the last.
   */
  playBeat(i) {
    const { beats, lines, ending, onEnd } = this.act;
    if (i >= beats.length) {
      onEnd();
      return;
    }
    const { entry, durationMs } = beatTiming(beats[i], lines);
    this.act.at = i;
    this.renderer()?.playEndingBeat?.(beats[i].id, durationMs, ending);
    if (entry) this.speak(entry);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.playBeat(i + 1), durationMs);
  }

  endEnding() {
    const show = this.afterEnding;
    this.finish();
    show();
  }

  /**
   * The letterbox over `warden`'s entrance; false (nothing happens) when the
   * renderer can't. Never over another cinematic; a second Warden during one
   * keeps the bars up.
   */
  startArrival(warden) {
    if (this.kind === 'arrival') {
      return this.renderer()?.playArrival?.(warden) ?? false;
    }
    if (this.kind || !this.renderer()?.playArrival?.(warden)) {
      return false;
    }
    this.hud()?.showLetterbox(true);
    this.begin('arrival', ARRIVAL_LIMIT_MS, () => this.finish());
    return true;
  }

  /** The Warden closed up: the bars slide out. */
  endArrival() {
    if (this.kind === 'arrival') this.finish();
  }

  /**
   * Runs `show` when the win's scene (the epilogue, or the ending's act 1)
   * ends; false (run it now) without one.
   */
  deferUntilEpilogueEnds(show) {
    if (this.kind !== 'epilogue' && this.kind !== 'revelation') {
      return false;
    }
    this.afterEpilogue = show;
    return true;
  }

  /** The run went on past victory: the camera comes back down. */
  release() {
    this.stop();
    this.renderer()?.endCinematic();
  }

  /** Drops whatever plays, without its ending (a new run, a reset). */
  stop() {
    if (this.introActive) this.holdSim(false);
    if (this.kind === 'travel') {
      this.renderer()?.endTravel();
    }
    if (this.kind === 'story') this.renderer()?.endStory();
    if (this.kind) {
      this.finish();
    }
  }

  // `onEnd` after `durationMs`; an act of the ending times its own beats.
  begin(kind, durationMs, onEnd) {
    this.kind = kind;
    if (onEnd) this.timer = setTimeout(onEnd, durationMs);
    this.eventBus.emit('cinematic-started', { kind });
  }

  endIntro() {
    this.holdSim(false);
    if (this.kind) this.finish();
    this.onIntroEnd();
    this.showCards();
  }

  showCards() {
    const cards = this.cards ?? [];
    this.cards = null;
    cards.forEach((show) => show());
  }

  finish() {
    const { kind } = this;
    if (kind === 'arrival' || kind === 'travel' || kind === 'story') {
      this.hud()?.showLetterbox(false);
    }
    clearTimeout(this.timer);
    clearTimeout(this.handOff);
    this.lineTimers.forEach(clearTimeout);
    this.lineTimers = [];
    this.unbindSkip?.();
    this.timer = null;
    this.handOff = null;
    this.unbindSkip = null;
    this.afterEpilogue = null;
    this.afterEnding = null;
    this.act = null;
    this.kind = null;
    this.eventBus.emit('cinematic-ended', { kind });
  }
}
