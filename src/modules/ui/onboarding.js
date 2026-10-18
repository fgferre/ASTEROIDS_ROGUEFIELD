// src/modules/ui/onboarding.js

// First-run tips taught in play (NORTE §7 pillar 5): one small prompt at a
// time, each dismissed by doing the thing. Finished steps persist, so a tip
// never shows again until the Settings toggle replays them.

import { loadJSON, saveJSON } from '../../core/storage.js';

export const ONBOARDING_STORAGE_KEY = 'roguefield:onboarding:v1';
/** Pause between one tip finishing and the next appearing. */
export const ONBOARDING_GAP_SECONDS = 1.5;
/** Movement input held this long (in total) completes the move tip. */
export const MOVE_HOLD_SECONDS = 0.6;
/** The shield tip leaves on its own after this long on screen. */
export const SHIELD_TIP_SECONDS = 6;
export const CARDS_TIP_TEXT = 'Pick a card. R rerolls, B banishes.';
export const CARDS_TIP_TEXT_GAMEPAD = 'Pick a card. X rerolls, Y banishes.';

/** In-play tips in order; `cards` lives on the level-up screen instead. */
const PLAY_STEPS = ['move', 'dash', 'shield'];
export const ONBOARDING_STEP_IDS = [...PLAY_STEPS, 'cards'];

/**
 * Prompt content per step. `keys` are the labels of the bound keys or pad
 * buttons ({ moveUp, moveDown, moveLeft, moveRight, dash, activateShield });
 * `device` is the last one used ('keyboard' | 'gamepad').
 */
export function onboardingPrompts(
  keys,
  scheme = 'modern',
  device = 'keyboard'
) {
  const padMove = {
    keys: ['L-Stick'],
    text:
      scheme === 'classic'
        ? 'Turn and thrust with the left stick. Your guns fire on their own.'
        : 'Move with the left stick. The turret aims on its own; the right stick aims it by hand.',
  };
  const keyboardMove =
    scheme === 'classic'
      ? {
          keys: [keys.moveLeft, keys.moveUp, keys.moveRight],
          text: 'Turn and thrust. Your guns fire on their own.',
        }
      : {
          keys: [keys.moveUp, keys.moveLeft, keys.moveDown, keys.moveRight],
          text: 'Move with WASD. The turret aims and fires on its own.',
        };
  return {
    move: device === 'gamepad' ? padMove : keyboardMove,
    dash: {
      keys: [keys.dash === 'Shift' ? '⇧ Shift' : keys.dash],
      text: "Dash through danger. You can't be hit mid-dash.",
    },
    shield: {
      keys: [keys.activateShield],
      text: 'Raise your shield before a hit lands.',
    },
  };
}

export class Onboarding {
  /**
   * `view`: { showTip(id), hideTip() } — the HUD prompt.
   * `onStep(id)`: called when a tip appears (audio hook).
   */
  constructor(view, onStep = () => {}) {
    this.view = view;
    this.onStep = onStep;
    this.done = new Set(loadJSON(ONBOARDING_STORAGE_KEY)?.done || []);
    this.active = false;
    this.cardsShown = false;
    this.reset();
  }

  reset() {
    this.gap = 0;
    this.shown = false;
    this.shownFor = 0;
    this.moveHeld = 0;
  }

  get complete() {
    return ONBOARDING_STEP_IDS.every((id) => this.done.has(id));
  }

  /** The in-play step being taught, or null. */
  get current() {
    if (!this.active) {
      return null;
    }
    return PLAY_STEPS.find((id) => !this.done.has(id)) || null;
  }

  /** A run starts: teach whatever is left. */
  start() {
    this.stop();
    this.active = !this.complete;
    this.gap = 0;
  }

  stop() {
    if (this.shown) {
      this.view.hideTip();
    }
    this.active = false;
    this.cardsShown = false;
    this.reset();
  }

  /** The Settings toggle was turned back on: every tip shows again. */
  replay() {
    this.done.clear();
    saveJSON(ONBOARDING_STORAGE_KEY, { done: [] });
  }

  /**
   * One simulation step. `moving`: any thrust/strafe held; `shieldReady`:
   * the ship has a shield to raise; `bannerBusy`: a HUD banner owns the
   * screen, so a new tip waits.
   */
  update(dt, { moving = false, shieldReady = false, bannerBusy = false } = {}) {
    const id = this.current;
    if (!id) {
      return;
    }
    if (id === 'move' && moving) {
      this.moveHeld += dt;
      if (this.moveHeld >= MOVE_HOLD_SECONDS) {
        this.finish(id);
        return;
      }
    }
    if (this.gap > 0) {
      this.gap -= dt;
      return;
    }
    if (!this.shown) {
      if (bannerBusy || (id === 'shield' && !shieldReady)) {
        return;
      }
      this.shown = true;
      this.shownFor = 0;
      this.view.showTip(id);
      this.onStep(id);
      return;
    }
    this.shownFor += dt;
    if (id === 'shield' && this.shownFor >= SHIELD_TIP_SECONDS) {
      this.finish(id);
    }
  }

  dashed() {
    if (this.current === 'dash') {
      this.finish('dash');
    }
  }

  shieldRaised() {
    if (this.current === 'shield') {
      this.finish('shield');
    }
  }

  /** Footer text for the level-up screen, or null once learned. */
  cardsTip(device = 'keyboard') {
    if (!this.active || this.done.has('cards')) {
      return null;
    }
    if (!this.cardsShown) {
      this.cardsShown = true;
      this.onStep('cards');
    }
    return device === 'gamepad' ? CARDS_TIP_TEXT_GAMEPAD : CARDS_TIP_TEXT;
  }

  /** A card was picked; the tip counts once it was on screen. */
  cardPicked() {
    if (this.cardsShown && !this.done.has('cards')) {
      this.markDone('cards');
    }
  }

  finish(id) {
    if (this.shown) {
      this.view.hideTip();
    }
    this.reset();
    this.gap = ONBOARDING_GAP_SECONDS;
    this.markDone(id);
  }

  markDone(id) {
    this.done.add(id);
    saveJSON(ONBOARDING_STORAGE_KEY, { done: [...this.done] });
    if (this.complete) {
      this.active = false;
    }
  }
}
