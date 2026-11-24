// src/modules/ui/onboarding.js

// First-run tips taught in play (NORTE §7 pillar 5): one small prompt at a
// time, each dismissed by doing the thing. Finished steps persist, so a tip
// never shows again until the Settings toggle replays them. The menu has its
// own first-visit lines (MENU_TIPS), kept in the same record. A dash or shield
// tip that runs out unused is only set aside for the run: it comes back on
// the next one, until it has run out TIP_EXPIRIES_TO_DONE times.

import { loadJSON, saveJSON } from '../../core/storage.js';
import { joinKeyLabels } from './bindingHints.js';

export const ONBOARDING_STORAGE_KEY = 'roguefield:onboarding:v1';
/** Pause between one tip finishing and the next appearing. */
export const ONBOARDING_GAP_SECONDS = 1.5;
/** Movement input held this long (in total) completes the move tip. */
export const MOVE_HOLD_SECONDS = 0.6;
/** The shield tip leaves on its own after this long on screen. */
export const SHIELD_TIP_SECONDS = 6;
/** The dash tip leaves on its own after this long on screen. */
export const DASH_TIP_SECONDS = 10; // proposta 12/11
/** A timed tip that ran out unused this many times is not shown again. */
export const TIP_EXPIRIES_TO_DONE = 3;
export const CARDS_TIP_TEXT = 'Pick a card. R rerolls, B banishes.';
export const CARDS_TIP_TEXT_GAMEPAD = 'Pick a card. X rerolls, Y banishes.';
/** The same tip during a head start, where "Equip for me" makes the rest. */
export const CARDS_TIP_TEXT_HEAD_START =
  'Pick a card. R rerolls, B banishes, Q equips the rest.';
export const CARDS_TIP_TEXT_HEAD_START_GAMEPAD =
  'Pick a card. X rerolls, Y banishes, RB equips the rest.';
/** By touch the actions are the buttons under the cards: no keys to name. */
export const CARDS_TIP_TEXT_TOUCH = 'Pick a card.';

/**
 * The menu's first-visit lines (Felipe's pick B, 23/11), each in its place
 * and done once the player does what it says: `menu` on Mission Control until
 * a first launch, `hangar` in the Hangar until it closes, `salvage` by the
 * Hangar button once the first purchase is within reach, until it opens.
 */
export const MENU_TIPS = {
  menu: {
    label: 'New here',
    text: 'Pick a mode, a sector and a difficulty, then Launch.',
  },
  hangar: {
    label: 'New here',
    text: 'Every run pays Salvage, won or lost. Spend it in the Hangar on upgrades, hulls and licences.',
  },
  salvage: {
    label: 'Back from your run',
    text: 'Enough Salvage for your first upgrade. Spend it in the Hangar.',
  },
};

/**
 * In-play tips in order; `cards` lives on the level-up screen instead, and
 * `cardsHeadStart` is its head-start variant (a superset of its text).
 */
const PLAY_STEPS = ['move', 'dash', 'shield'];
export const ONBOARDING_STEP_IDS = [...PLAY_STEPS, 'cards', 'cardsHeadStart'];
const TIP_SECONDS = { dash: DASH_TIP_SECONDS, shield: SHIELD_TIP_SECONDS };

/**
 * The notice when T or G changed a mode in play: `toggled` is CombatSystem's
 * `combat-mode-toggled` payload ({ kind: 'aim' | 'spread', mode }), `keys`
 * the bound labels ({ toggleAimMode, toggleSpreadMode }). Manual aim fires
 * along the turret: on the nose, or (pad, modern flight) along the right stick.
 */
export function modeNotice(
  { kind, mode },
  keys,
  device = 'keyboard',
  scheme = 'modern'
) {
  // By touch the mode word itself is tapped: no key to name.
  const touch = device === 'touch';
  const again = touch ? 'Tap again' : 'Press again';
  const texts = {
    auto: `AIM AUTO · the turret finds targets. ${again} for manual.`,
    manual:
      device === 'gamepad' && scheme === 'modern'
        ? 'AIM MANUAL · aim with the right stick. Press again for auto.'
        : `AIM MANUAL · shots fly where the nose points. ${again} for auto.`,
    fan: `SPREAD FAN · extra shots fan out wide. ${again} to concentrate.`,
    concentrated: `SPREAD CONC · extra shots fly side by side. ${again} to fan.`,
  };
  const key = touch
    ? null
    : kind === 'aim'
      ? keys.toggleAimMode
      : keys.toggleSpreadMode;
  return { keys: key ? [key] : [], text: texts[mode] };
}

/**
 * Prompt content per step. `keys` are the labels of the bound keys or pad
 * buttons ({ moveUp, moveDown, moveLeft, moveRight, dash, activateShield,
 * toggleAimMode, toggleSpreadMode }); `device` is the last one used
 * ('keyboard' | 'gamepad' | 'touch'); `toggled` adds the `mode` notice (modeNotice).
 */
export function onboardingPrompts(
  keys,
  scheme = 'modern',
  device = 'keyboard',
  toggled = null
) {
  const padMove =
    scheme === 'classic'
      ? {
          keys: ['L-Stick', 'R-Stick'],
          text: 'Thrust with the left stick, pull it back to brake, turn with the right. The cannon fires on its own.',
        }
      : {
          keys: ['L-Stick'],
          text: 'Move with the left stick. The cannon fires on its own.',
        };
  const wasd = [keys.moveUp, keys.moveLeft, keys.moveDown, keys.moveRight];
  const keyboardMove =
    scheme === 'classic'
      ? {
          keys: [keys.moveLeft, keys.moveUp, keys.moveDown, keys.moveRight],
          text: `Turn and thrust; ${keys.moveDown} brakes, nothing else slows you. The cannon fires on its own.`,
        }
      : {
          keys: wasd,
          text: `Move with ${joinKeyLabels(wasd)}. The cannon fires on its own.`,
        };
  // Touch: the gesture, and the on-screen buttons' own names.
  const touchMove = {
    keys: [],
    text:
      scheme === 'classic'
        ? 'Put your left thumb down and point where to fly; pull back to brake. The cannon fires on its own.'
        : 'Put your left thumb down and drag to move. The cannon fires on its own.',
  };
  const touch = device === 'touch';
  return {
    move: touch ? touchMove : device === 'gamepad' ? padMove : keyboardMove,
    dash: {
      keys: [touch ? 'DASH' : keys.dash === 'Shift' ? '⇧ Shift' : keys.dash],
      text: "Dash through danger. You can't be hit mid-dash.",
    },
    shield: {
      keys: [touch ? 'SHIELD' : keys.activateShield],
      text: 'Raise your shield before a hit lands.',
    },
    mode: toggled && modeNotice(toggled, keys, device, scheme),
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
    const stored = loadJSON(ONBOARDING_STORAGE_KEY);
    this.done = new Set(stored?.done || []);
    /** How many times each timed tip ran out unused, across runs. */
    this.expired = { ...stored?.expired };
    /** Timed tips that ran out unused in this run: set aside until the next. */
    this.setAside = new Set();
    this.active = false;
    /** The cards variant on screen this run ('cards' | 'cardsHeadStart'). */
    this.cardsShown = null;
    /** The menu lines on screen now (MENU_TIPS ids). */
    this.menuShown = new Set();
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
    return (
      PLAY_STEPS.find((id) => !this.done.has(id) && !this.setAside.has(id)) ||
      null
    );
  }

  /** A ship has flown under this record: the menu's Launch line is past. */
  get flown() {
    return this.done.has('move');
  }

  /**
   * The menu line `id` ({ label, text }) while `ready` and not done, else
   * null; what it returns is on screen until the next call.
   */
  menuTip(id, ready) {
    if (!ready || this.done.has(id)) {
      this.menuShown.delete(id);
      return null;
    }
    this.menuShown.add(id);
    return MENU_TIPS[id];
  }

  /** The player did what the menu line `id` says: done if it was on screen. */
  menuActed(id) {
    if (this.menuShown.delete(id)) {
      this.markDone(id);
    }
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
    this.cardsShown = null;
    this.setAside.clear();
    this.reset();
  }

  /** The Settings toggle was turned back on: every tip shows again. */
  replay() {
    this.done.clear();
    this.expired = {};
    this.save();
  }

  /**
   * One simulation step. `moving`: any thrust/strafe held; `shieldReady`:
   * the ship has a shield to raise; `bannerBusy`: a HUD banner owns the
   * screen, so a new tip waits; `tipCovered`: a timed notice covers the tip
   * on screen, so its time waits.
   */
  update(
    dt,
    {
      moving = false,
      shieldReady = false,
      bannerBusy = false,
      tipCovered = false,
    } = {}
  ) {
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
    if (tipCovered) {
      return;
    }
    this.shownFor += dt;
    if (this.shownFor >= TIP_SECONDS[id]) {
      this.expire(id);
    }
  }

  dashed() {
    this.acted('dash');
  }

  shieldRaised() {
    this.acted('shield');
  }

  /** Doing the thing during its tip, or after it ran out this run, counts. */
  acted(id) {
    if (this.current === id) {
      this.finish(id);
    } else if (this.setAside.has(id)) {
      this.setAside.delete(id);
      this.markDone(id);
    }
  }

  /** The tip ran out unused: set aside for this run, done on the last time. */
  expire(id) {
    this.expired[id] = (this.expired[id] || 0) + 1;
    if (this.expired[id] >= TIP_EXPIRIES_TO_DONE) {
      this.finish(id);
      return;
    }
    this.view.hideTip();
    this.reset();
    this.gap = ONBOARDING_GAP_SECONDS;
    this.setAside.add(id);
    this.save();
  }

  /** Footer text for the level-up screen, or null once learned. */
  cardsTip(device = 'keyboard', headStart = false) {
    const id = headStart ? 'cardsHeadStart' : 'cards';
    if (!this.active || this.done.has(id)) {
      return null;
    }
    if (this.cardsShown !== id) {
      this.cardsShown = id;
      this.onStep('cards');
    }
    if (device === 'touch') {
      return CARDS_TIP_TEXT_TOUCH;
    }
    if (headStart) {
      return device === 'gamepad'
        ? CARDS_TIP_TEXT_HEAD_START_GAMEPAD
        : CARDS_TIP_TEXT_HEAD_START;
    }
    return device === 'gamepad' ? CARDS_TIP_TEXT_GAMEPAD : CARDS_TIP_TEXT;
  }

  /**
   * A card was picked; the tip counts once it was on screen. The head-start
   * text holds the ordinary one, so it teaches both.
   */
  cardPicked() {
    if (this.cardsShown === 'cardsHeadStart') {
      this.markDone('cardsHeadStart', 'cards');
    } else if (this.cardsShown === 'cards') {
      this.markDone('cards');
    }
    this.cardsShown = null;
  }

  finish(id) {
    if (this.shown) {
      this.view.hideTip();
    }
    this.reset();
    this.gap = ONBOARDING_GAP_SECONDS;
    this.markDone(id);
  }

  markDone(...ids) {
    ids.forEach((id) => this.done.add(id));
    this.save();
    if (this.complete) {
      this.active = false;
    }
  }

  save() {
    saveJSON(ONBOARDING_STORAGE_KEY, {
      done: [...this.done],
      expired: this.expired,
    });
  }
}
