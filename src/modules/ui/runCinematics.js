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
// so replays stay exact), a skip hint shows and any key, click or pad button
// skips (the journey and the intro together); the layer banner — the title
// card — shows once, when it ends. Epilogue: the renderer pulls back as the
// Ring wakes, the victory line plays over it, and the victory screen waits
// for it to end. Ending (the campaign's last win, after the choice): the
// epilogue's shot holds while the ending's lines play and the Ring answers
// through its wake; then the final card. Warden entrance: letterbox bars over the live shot until
// the Warden closes up ('boss-arrived'); the run plays on, slowed (no hold,
// no skip). A renderer that can't move the camera (2D, reduced motion,
// `?camera=0`) refuses them all, and the run keeps the plain banner; a
// journey's lines then play as ordinary transmissions.

import {
  EPILOGUE_MS,
  INTRO_MS,
  TRAVEL,
  cinematicFreezeFromUrl,
  endingPath,
} from '../../core/cinematics.js';
import { IS_DEV } from '../../core/env.js';
import { SECTORS, sectorById } from '../../data/sectors.js';
import { loadRecords } from '../../services/runRecords.js';
import {
  TRANSMISSION_CHARS_PER_SECOND,
  endingTransmissions,
  travelTransmissions,
} from './transmissions.js';

// The bars leave when the Warden closes up; this only covers one that never
// does (released mid-entrance).
const ARRIVAL_LIMIT_MS = 6000;

/**
 * The sector a run start flies to first, or null: the sector a carried start
 * (the victory screen's Next Sector) begins, or the first sector launched
 * from the campaign map before any sector was ever won. Never a replay. A
 * dev `freeze` of kind 'travel' flies any start to its sector (or the first).
 */
export function travelDestination(
  { sector, carried, source, replay } = {},
  records = { sectorsWon: [] },
  freeze = null
) {
  if (replay) return null;
  if (freeze?.kind === 'travel') {
    return sectorById(freeze.sector)?.id ?? SECTORS[0].id;
  }
  if (!sectorById(sector)) return null;
  if (carried) return sector;
  const opening =
    source === 'campaign-launch-btn' &&
    sector === SECTORS[0].id &&
    records.sectorsWon.length === 0;
  return opening ? sector : null;
}

/** The journey's length for its `lines`: typed, held, within TRAVEL. */
export function travelDurationMs(lines) {
  const spoken = lines.reduce(
    (sum, line) =>
      sum +
      (line.text.length / TRANSMISSION_CHARS_PER_SECOND) * 1000 +
      TRAVEL.lineHoldMs,
    TRAVEL.leadMs
  );
  return Math.min(TRAVEL.maxMs, Math.max(TRAVEL.minMs, spoken));
}

/**
 * Skips on any key (a held key's repeats are swallowed too), click or newly
 * pressed pad button; returns the unbind. Capture on window runs before
 * every other handler: the input only skips. A key still held after the
 * unbind stays swallowed until it is released, so its repeats never reach
 * the game as a fresh press (Escape would pause).
 */
export function listenForSkip(skip) {
  const keys = new Set();
  let live = true;
  const onInput = (event) => {
    if (!live && !(event.repeat && keys.has(event.code))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'keydown') keys.add(event.code);
    if (live && !event.repeat) skip();
  };
  const detachKeys = () => {
    window.removeEventListener('keydown', onInput, true);
    window.removeEventListener('keyup', onKeyUp, true);
  };
  const onKeyUp = (event) => {
    keys.delete(event.code);
    if (!live && keys.size === 0) detachKeys();
  };
  // Pad buttons held when it starts (the press that started the run) wait
  // for their release.
  const held = [0, 0, 0, 0];
  let first = true;
  let frame = 0;
  const poll = () => {
    const pads = navigator.getGamepads?.() ?? [];
    let pressedNow = false;
    for (let p = 0; p < held.length; p += 1) {
      let mask = 0;
      const buttons = pads[p]?.buttons ?? [];
      for (let b = 0; b < buttons.length && b < 31; b += 1) {
        if (buttons[b].pressed) mask |= 1 << b;
      }
      if (!first && mask & ~held[p]) pressedNow = true;
      held[p] = mask;
    }
    first = false;
    if (pressedNow) skip();
    else frame = window.requestAnimationFrame(poll);
  };
  window.addEventListener('keydown', onInput, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onInput, true);
  frame = window.requestAnimationFrame(poll);
  return () => {
    live = false;
    if (keys.size === 0) detachKeys();
    window.removeEventListener('pointerdown', onInput, true);
    window.cancelAnimationFrame(frame);
  };
}

export class RunCinematics {
  /**
   * `renderer()`/`hud()` resolve the current ones (playTravel, endTravel,
   * playIntro, playEpilogue, playArrival, endCinematic / cancelBanner,
   * showCinematicHint, showLetterbox). `holdSim(flag)` stops or restarts
   * the fixed step; `bindSkip(fn)` listens for the skip and returns the
   * unbind; `onIntroEnd()` shows the layer banner; `speak(entry)` queues a
   * transmission and `hush()` drops them all; `records()` the run records.
   */
  constructor({
    eventBus,
    renderer,
    hud,
    holdSim,
    bindSkip = listenForSkip,
    onIntroEnd,
    speak = () => {},
    hush = () => {},
    records = loadRecords,
  }) {
    this.eventBus = eventBus;
    this.renderer = renderer;
    this.hud = hud;
    this.holdSim = holdSim;
    this.bindSkip = bindSkip;
    this.onIntroEnd = onIntroEnd;
    this.speak = speak;
    this.hush = hush;
    this.records = records;
    this.kind = null;
    this.timer = null;
    this.handOff = null;
    this.unbindSkip = null;
    this.afterEpilogue = null;
    this.travelTo = null;
    // Cards dealt while a journey is armed or plays, shown after the intro.
    this.cards = null;
  }

  /** The run's opening plays: its journey or its intro. */
  get introActive() {
    return this.kind === 'intro' || this.kind === 'travel';
  }

  /**
   * On 'game-started' (`start` its payload), before the start unpauses:
   * arms the journey this start flies, if any. The intro (startIntro) flies
   * it first.
   */
  armTravel(start) {
    const freeze = IS_DEV ? cinematicFreezeFromUrl() : null;
    this.travelTo = travelDestination(start, this.records(), freeze);
    this.cards = this.travelTo ? [] : null;
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
    this.hud()?.showCinematicHint(true);
    this.holdSim(true);
    this.unbindSkip = this.bindSkip(() => this.skip());
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
    this.hud()?.showCinematicHint(true);
    this.hud()?.showLetterbox(true, true);
    // The instruments fade back in under the bars over the last second.
    this.handOff = setTimeout(
      () => this.hud()?.showLetterbox(true),
      durationMs - TRAVEL.handOffMs
    );
    this.holdSim(true);
    lines.forEach((entry) => this.speak(entry));
    this.unbindSkip = this.bindSkip(() => this.skip());
    return true;
  }

  // The flight ends on the intro's first pose: the intro goes on from it.
  endTravel() {
    this.finish();
    this.renderer()?.endTravel();
    if (!this.playIntro()) this.endIntro();
  }

  /**
   * Ends the opening now: the journey's remaining lines drop and the camera
   * eases from the intro's pose back to the ship.
   */
  skip() {
    if (this.kind === 'travel') {
      this.hush();
      this.endTravel();
    }
    if (this.kind !== 'intro') {
      return;
    }
    this.renderer()?.endCinematic();
    this.endIntro();
  }

  startEpilogue() {
    this.stop();
    if (!this.renderer()?.playEpilogue?.(EPILOGUE_MS)) {
      return false;
    }
    // Nothing on the banner may hold back the victory line.
    this.hud()?.cancelBanner();
    this.begin('epilogue', EPILOGUE_MS, () => {
      const show = this.afterEpilogue;
      this.finish();
      show?.();
    });
    return true;
  }

  /**
   * The ending picked (data/story.js STORY.ending): its lines play, timed
   * as a journey's, while the held shot's wake eases to the ending's own
   * (none without the 3D camera); `onEnd` runs once they are done.
   */
  playEnding(ending, onEnd) {
    this.stop();
    const lines = endingTransmissions(ending, TRAVEL.lineHoldMs);
    const durationMs = travelDurationMs(lines);
    this.renderer()?.startCinematic?.(
      endingPath(ending),
      durationMs,
      true,
      'ending'
    );
    lines.forEach((entry) => this.speak(entry));
    this.begin('ending', durationMs, () => {
      this.finish();
      onEnd();
    });
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

  /** Runs `show` when the epilogue ends; false (run it now) without one. */
  deferUntilEpilogueEnds(show) {
    if (this.kind !== 'epilogue') {
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
    if (this.introActive) {
      this.hud()?.showCinematicHint(false);
      this.holdSim(false);
    }
    if (this.kind === 'travel') {
      this.renderer()?.endTravel();
    }
    if (this.kind) {
      this.finish();
    }
  }

  begin(kind, durationMs, onEnd) {
    this.kind = kind;
    this.timer = setTimeout(onEnd, durationMs);
    this.eventBus.emit('cinematic-started', { kind });
  }

  endIntro() {
    this.hud()?.showCinematicHint(false);
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
    if (kind === 'arrival' || kind === 'travel') {
      this.hud()?.showLetterbox(false);
    }
    clearTimeout(this.timer);
    clearTimeout(this.handOff);
    this.unbindSkip?.();
    this.timer = null;
    this.handOff = null;
    this.unbindSkip = null;
    this.afterEpilogue = null;
    this.kind = null;
    this.eventBus.emit('cinematic-ended', { kind });
  }
}
