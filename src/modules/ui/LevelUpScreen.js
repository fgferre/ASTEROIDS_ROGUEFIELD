// src/modules/ui/LevelUpScreen.js
//
// The level-up screen (the owner's mock-ups of 20/10): "LEVEL n", one card
// per upgrade offered (ui/upgradeCard.js), keyboard, mouse and pad focus over
// them, reroll, banish and hold, and the pick that sends the run back to play
// through the cards' exit animation. The first three picks name themselves
// and show where each family leads; the HUD's build instrument previews the
// highlighted card's cell. During a sector's head start a counter shows the
// pick, and "Equip for me" makes the picks left (session/headStart.js):
// its first press only arms it, the second within EQUIP_CONFIRM_MS confirms.
// With the new flight, a tray under the cards shows the run's card slots and
// its piloting trail.

import { PROGRESSION_INITIAL_LEVEL } from '../../core/GameConstants.js';
import { playLevelUpExit, staggerCardEntry } from './levelUpTransition.js';
import {
  cardClasses,
  cardMarkup,
  cardState,
  paintCard,
  runTrayMarkup,
  weaponOfCard,
} from './upgradeCard.js';
import { asArray } from '../upgradeCatalog.js';
import { inputLayers } from '../input/inputLayers.js';

// A card's detail arrow on the phone, held sideways (cardScreens.css).
const DETAIL_ARROW =
  '<span class="card__more" aria-hidden="true"><i><svg viewBox="0 0 14 14"><path d="M3 5.5 7 9.5 11 5.5"/></svg></i></span>';

// Level-up cards and the run end's buttons ignore input this long after showing.
export const SCREEN_INPUT_LOCKOUT_MS = 400;
// The picks that set the run's direction get their own strip.
const FIRST_PICKS = ['First pick', 'Second pick', 'Third pick'];
// How long the line naming an automatic build stays up.
export const EQUIPPED_NOTICE_MS = 5000;
// An armed "Equip for me" waits this long for the confirming press.
export const EQUIP_CONFIRM_MS = 3000;

/**
 * The HUD's build and XP instruments stay lit through a card screen's dim:
 * their boxes, as holes in its backdrop (--hole-a-*, --hole-b-*).
 */
export function liftHudInstruments(screen) {
  ['build', 'xp'].forEach((slot, i) => {
    const rect = document
      .querySelector(`#hud-layer [data-slot="${slot}"]`)
      ?.getBoundingClientRect();
    const hole = `--hole-${'ab'[i]}`;
    const shown = rect && rect.width > 0;
    screen.style.setProperty(
      `${hole}-x`,
      shown ? `${Math.round(rect.left + rect.width / 2)}px` : '-999px'
    );
    screen.style.setProperty(
      `${hole}-y`,
      shown ? `${Math.round(rect.top + rect.height / 2)}px` : '-999px'
    );
    screen.style.setProperty(
      `${hole}-w`,
      shown ? `${Math.round(rect.width / 2 + 90)}px` : '1px'
    );
    screen.style.setProperty(
      `${hole}-h`,
      shown ? `${Math.round(rect.height / 2 + 40)}px` : '1px'
    );
  });
}

export class LevelUpScreen {
  /**
   * `refs`: the screen's nodes { screen, container, text, level, picks, rerollBtn, banishBtn, banishHint, holdBtn, holdHint, headStart, equipBtn, cancelBtn, run }.
   * `progression()`: the progression service (offers, rerolls, banishes, holds, picks), or none.
   * `headStart()`: the session's head start (session/headStart.js).
   * `combat()`: the combat service (the held weapon a card names).
   * `emit(name, payload)`: sends ui-hover.
   * `showScreen(name, options)`: shows the level-up overlay.
   * `showGameUI()`: back to play, or to the next card choice waiting; it resets this screen too.
   * `showCardsTip(headStart)`: the first-run onboarding tip under the cards.
   * `prefersReducedMotion()`: the cards skip their entry and exit animation.
   * `hud()`: the HUD layout: its build instrument previews a card
   *   (previewBuildCard), its tip line names an automatic build.
   */
  constructor({
    refs,
    progression,
    headStart,
    combat,
    emit,
    showScreen,
    showGameUI,
    showCardsTip,
    prefersReducedMotion,
    hud,
  }) {
    this.refs = refs;
    this.progression = progression;
    this.headStart = headStart;
    this.combat = combat;
    this.emit = emit;
    this.showScreen = showScreen;
    this.showGameUI = showGameUI;
    this.showCardsTip = showCardsTip;
    this.prefersReducedMotion = prefersReducedMotion;
    this.hud = hud;
    // "Equip for me" armed: the timer that disarms it, or null.
    this.equipArmTimer = null;
    this.levelUpState = {
      isVisible: false,
      options: [],
      buttons: [],
      focusIndex: -1,
      poolSize: 0,
      level: null,
      lockedUntil: 0,
      banishMode: false,
      holdMode: false,
      exitTimer: null,
    };
    // Up, on the input layer stack: its keys, the pad's X, Y, LB, RB and B,
    // the confirm; the pause key still goes to the game.
    this.inputLayer = {
      name: 'levelup',
      element: refs.screen,
      passes: ['pause'],
      onKey: (event) => this.handleLevelUpKey(event),
      onPad: (action) => this.handleGamepadNav(action),
      onConfirm: () => this.handleLevelUpConfirm(),
    };
  }

  bindLevelUpControls() {
    const { rerollBtn, banishBtn, holdBtn, equipBtn, cancelBtn } = this.refs;
    rerollBtn?.addEventListener('click', () => this.rerollLevelUpOptions());
    banishBtn?.addEventListener('click', () => this.toggleBanishMode());
    holdBtn?.addEventListener('click', () => this.toggleHoldMode());
    equipBtn?.addEventListener('click', () => this.equipForMe());
    cancelBtn?.addEventListener('click', () => this.backOut());
  }

  // A key on the cards (their layer). A card's key badge (1, 2, 3) picks it
  // as a click on it would, and is theirs alone: a flight press bound to it
  // does not fire in the run it resumes.
  handleLevelUpKey(event) {
    if (event.repeat) return false;
    const card = this.levelUpState.buttons[Number(event.key) - 1];
    if (card) {
      event.preventDefault();
      this.selectUpgrade(card.dataset.upgradeId);
      return true;
    }
    if (event.code === 'KeyR') this.rerollLevelUpOptions();
    else if (event.code === 'KeyB') this.toggleBanishMode();
    else if (event.code === 'KeyH') this.toggleHoldMode();
    else if (event.code === 'KeyQ') this.equipForMe();
    else if (event.key === 'Escape') this.backOut();
    return false;
  }

  /** A pad press here: reroll, banish, hold (LB), equip for me, or back out. */
  handleGamepadNav(action) {
    if (action === 'reroll') this.rerollLevelUpOptions();
    else if (action === 'banish') this.toggleBanishMode();
    else if (action === 'tabPrev') this.toggleHoldMode();
    else if (action === 'tabNext') this.equipForMe();
    else if (action === 'back') this.backOut();
  }

  // Escape, the pad's back or a tap on Cancel (touch only): an armed "Equip for me" disarms and nothing
  // else happens; otherwise banish or hold mode ends.
  backOut() {
    if (this.equipArmTimer) this.disarmEquip();
    else if (this.levelUpState.banishMode) this.setBanishMode(false);
    else if (this.levelUpState.holdMode) this.setHoldMode(false);
  }

  showLevelUpScreen(data = {}) {
    const options = asArray(data.options || data.availableUpgrades);

    if (!options.length) {
      if (data.autoResolved) {
        this.resetLevelUpState();
        this.showGameUI();
      }
      return;
    }

    const levelValue = Number.isFinite(Number(data.level))
      ? Number(data.level)
      : Number.isFinite(Number(data.newLevel))
        ? Number(data.newLevel)
        : null;

    this.levelUpState.isVisible = true;
    inputLayers.push(this.inputLayer);
    this.levelUpState.level = levelValue;
    this.showScreen('levelup', { overlay: true, show: true });
    const screen = document.getElementById('levelup-screen');
    if (screen) liftHudInstruments(screen);
    this.renderLevelUpOptions(options, data.poolSize);
    this.showCardsTip(Boolean(this.headStart().progress()));
  }

  // "LEVEL n" over "Choose one", or the first picks' strip; a head start's
  // counter over them and its "Equip for me" under the cards.
  renderHeader() {
    const { level: levelNode, text, picks, headStart, equipBtn } = this.refs;
    const progress = this.headStart().progress();
    headStart?.classList.toggle('hidden', !progress);
    equipBtn?.classList.toggle('hidden', !progress);
    if (headStart && progress) {
      headStart.innerHTML = `Head start <b>${progress.pick}</b> / ${progress.total}`;
    }
    const level = this.levelUpState.level;
    if (levelNode) levelNode.textContent = Number.isFinite(level) ? level : '';
    const pick = Number.isFinite(level) ? level - PROGRESSION_INITIAL_LEVEL : 0;
    const strip = FIRST_PICKS[pick - 1];
    text?.classList.toggle('hidden', Boolean(strip));
    if (!picks) return;
    picks.classList.toggle('hidden', !strip);
    if (strip) {
      const slots = FIRST_PICKS.map(
        (_, i) =>
          `<i class="lu-slot${i < pick - 1 ? ' is-done' : i === pick - 1 ? ' is-now' : ''}"></i>`
      ).join('');
      picks.innerHTML = `<span class="lu-picks__lbl">${strip}</span><span class="lu-picks__slots" aria-hidden="true">${slots}</span><span>Your first three picks set the run's direction.</span>`;
    }
  }

  // Cards, header and reroll/banish buttons for the offered options; new
  // cards restart the input lockout so a held key can't pick one unseen.
  renderLevelUpOptions(options, offeredPoolSize) {
    this.levelUpState.options = options;
    this.levelUpState.poolSize = Number.isFinite(Number(offeredPoolSize))
      ? Number(offeredPoolSize)
      : options.length;
    this.levelUpState.focusIndex = -1;
    this.levelUpState.lockedUntil = Date.now() + SCREEN_INPUT_LOCKOUT_MS;
    this.disarmEquip();
    this.setBanishMode(false);
    this.setHoldMode(false);
    this.updateLevelUpActionButtons();
    this.renderHeader();

    const container = this.refs.container;
    if (container) {
      container.innerHTML = '';
      const fragment = document.createDocumentFragment();
      const buttons = [];
      // The weapon card stands apart, after the others.
      const order = options
        .map((option, index) => ({ option, index }))
        .sort(
          (a, b) =>
            Number(Boolean(weaponOfCard(a.option.id))) -
              Number(Boolean(weaponOfCard(b.option.id))) || a.index - b.index
        );
      this.levelUpState.options = order.map(({ option }) => option);

      order.forEach(({ option }, index) => {
        const button = this.createUpgradeOptionButton(option, index);
        fragment.appendChild(button);
        buttons.push(button);
      });

      container.appendChild(fragment);
      this.levelUpState.buttons = buttons;
      if (!this.prefersReducedMotion()) {
        staggerCardEntry(buttons);
      }
      this.focusLevelUpOption(0);
    } else {
      this.levelUpState.buttons = [];
    }
  }

  // After a reroll or banish: redraw the cards, or close if none are left.
  refreshLevelUpOptions(payload = {}) {
    if (!this.levelUpState.isVisible) {
      return;
    }
    const options = asArray(payload.options);
    if (!options.length) {
      this.resetLevelUpState();
      this.showGameUI();
      return;
    }
    this.renderLevelUpOptions(options, payload.poolSize);
  }

  updateLevelUpActionButtons() {
    const progression = this.progression();
    const { rerollBtn, banishBtn } = this.refs;
    [
      [rerollBtn, progression?.rerollsLeft ?? 0],
      [banishBtn, progression?.banishesLeft ?? 0],
    ].forEach(([button, left]) => {
      if (!button) {
        return;
      }
      button.disabled = left <= 0;
      const count = button.querySelector('[data-count]');
      if (count) {
        count.textContent = `${left}`;
      }
    });
    // Hold: shown only when the run's contract gives holds.
    const { holdBtn } = this.refs;
    if (holdBtn) {
      holdBtn.classList.toggle('hidden', !(progression?.holdsPerRun > 0));
      holdBtn.disabled = !this.canHold();
      const count = holdBtn.querySelector('[data-count]');
      if (count) count.textContent = `${progression?.holdsLeft ?? 0}`;
    }
  }

  // A hold left, none made on this screen, and another card to take now.
  canHold() {
    const progression = this.progression();
    return (
      progression?.holdsLeft > 0 &&
      !progression.heldCard &&
      this.levelUpState.options.length >= 2
    );
  }

  isLevelUpLocked() {
    return Date.now() < this.levelUpState.lockedUntil;
  }

  rerollLevelUpOptions() {
    if (!this.levelUpState.isVisible || this.isLevelUpLocked()) {
      return;
    }
    this.disarmEquip();
    this.progression()?.rerollUpgradeOptions();
  }

  toggleBanishMode() {
    if (!this.levelUpState.isVisible || this.isLevelUpLocked()) {
      return;
    }
    const progression = this.progression();
    if (!this.levelUpState.banishMode && !(progression?.banishesLeft > 0)) {
      return;
    }
    this.disarmEquip();
    this.setHoldMode(false);
    this.setBanishMode(!this.levelUpState.banishMode);
  }

  toggleHoldMode() {
    if (!this.levelUpState.isVisible || this.isLevelUpLocked()) {
      return;
    }
    if (!this.levelUpState.holdMode && !this.canHold()) {
      return;
    }
    this.disarmEquip();
    this.setBanishMode(false);
    this.setHoldMode(!this.levelUpState.holdMode);
  }

  // Hold pick mode: the next card chosen is held for the next level-up's
  // offer, then the pick goes on as usual.
  setHoldMode(active) {
    this.levelUpState.holdMode = active;
    const { holdBtn, holdHint } = this.refs;
    holdBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');
    holdHint?.classList.toggle('hidden', !active);
    document
      .getElementById('levelup-screen')
      ?.classList.toggle('is-holding', active);
  }

  // The held card's face gets its marker; the other cards stay as dealt.
  holdCard(upgradeId) {
    this.setHoldMode(false);
    if (!this.progression()?.holdUpgrade(upgradeId)) return;
    const index = this.levelUpState.options.findIndex(
      ({ id }) => id === upgradeId
    );
    const button = this.levelUpState.buttons[index];
    if (button) this.fillCard(button, upgradeId, index);
    this.updateLevelUpActionButtons();
  }

  // Banish pick mode: the next card chosen is banished instead of taken.
  setBanishMode(active) {
    this.levelUpState.banishMode = active;
    const { banishBtn, banishHint } = this.refs;
    banishBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');
    banishHint?.classList.toggle('hidden', !active);
    document
      .getElementById('levelup-screen')
      ?.classList.toggle('is-banishing', active);
  }

  createUpgradeOptionButton(option, index) {
    const progression = this.progression();
    const state = cardState(progression, option.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = cardClasses(state.definition);
    button.dataset.upgradeId = option.id;
    button.dataset.index = `${index}`;
    paintCard(button, state.definition);
    this.fillCard(button, option.id, index);
    button.addEventListener('click', (event) => {
      if (event.target.closest('.card__more')) {
        this.toggleCardDetail(button);
        return;
      }
      this.selectUpgrade(option.id);
    });
    button.addEventListener('mouseenter', () => {
      this.emit('ui-hover', { source: 'upgrade-selection', index });
      // Keyboard focus follows: Enter and the highlight name the same card.
      this.focusLevelUpOption(index);
    });
    button.addEventListener('focus', () => this.focusLevelUpOption(index));

    return button;
  }

  fillCard(button, upgradeId, index) {
    const progression = this.progression();
    const state = cardState(progression, upgradeId);
    button.innerHTML =
      cardMarkup(state.definition, state, {
        weapon: this.combat().getWeaponState(),
        key: index + 1,
        held: progression.heldCard?.id === upgradeId,
      }) + DETAIL_ARROW;
  }

  // The phone's arrow (cardScreens.css): opens one card's detail, closing
  // any other; a second tap closes it.
  toggleCardDetail(button) {
    const open = !button.classList.contains('is-open');
    asArray(this.levelUpState.buttons).forEach((card) =>
      card.classList.toggle('is-open', open && card === button)
    );
  }

  selectUpgrade(upgradeId) {
    if (!upgradeId) {
      return;
    }

    if (this.isLevelUpLocked()) {
      return;
    }

    this.disarmEquip();
    const progression = this.progression();

    if (this.levelUpState.banishMode) {
      progression?.banishUpgrade(upgradeId);
      return;
    }

    if (this.levelUpState.holdMode) {
      this.holdCard(upgradeId);
      return;
    }

    if (!progression || typeof progression.applyUpgrade !== 'function') {
      this.showGameUI();
      return;
    }

    this.disableLevelUpOptions();
    const success = progression.applyUpgrade(upgradeId);
    if (success) {
      this.leaveLevelUp(upgradeId);
    } else {
      this.enableLevelUpOptions();
    }
  }

  // Cards out (ui/levelUpTransition.js) toward the HUD's build instrument,
  // input locked, then back to the run.
  leaveLevelUp(upgradeId) {
    const buttons = asArray(this.levelUpState.buttons);
    this.levelUpState.lockedUntil = Infinity;
    this.levelUpState.exitTimer = playLevelUpExit({
      screen: document.getElementById('levelup-screen'),
      cards: buttons,
      picked: buttons.find((button) => button.dataset.upgradeId === upgradeId),
      target: document.querySelector('#hud-layer [data-slot="build"]'),
      reducedMotion: this.prefersReducedMotion(),
      done: () => this.showGameUI(),
    });
  }

  handleUpgradeOptions(payload = {}) {
    const options = asArray(payload.options || payload.availableUpgrades);
    this.levelUpState.poolSize = Number.isFinite(Number(payload.poolSize))
      ? Number(payload.poolSize)
      : options.length;
    this.levelUpState.options = options;

    if (!options.length) {
      this.resetLevelUpState();
      if (payload.autoResolved) {
        this.showGameUI();
      }
      return;
    }

    this.showLevelUpScreen({
      level: payload.level ?? payload.newLevel,
      options,
      poolSize: this.levelUpState.poolSize,
      autoResolved: payload.autoResolved,
    });
  }

  focusLevelUpOption(index) {
    const buttons = asArray(this.levelUpState.buttons);
    if (!buttons.length) {
      this.levelUpState.focusIndex = -1;
      return;
    }

    const safeIndex =
      ((index % buttons.length) + buttons.length) % buttons.length;
    buttons.forEach((button, idx) => {
      if (!button) {
        return;
      }
      if (idx === safeIndex) {
        button.classList.add('is-focused');
        if (
          document.activeElement !== button &&
          !inputLayers.covered(this.inputLayer)
        ) {
          button.focus({ preventScroll: true });
        }
      } else {
        button.classList.remove('is-focused');
      }
    });

    this.levelUpState.focusIndex = safeIndex;
    this.previewFocusedCard();
    this.renderRunTray();
  }

  // The card slots and the piloting trail under the cards (the new flight
  // only): the highlighted card, if new, as a ghost in the next free slot.
  renderRunTray() {
    const { run } = this.refs;
    const progression = this.progression();
    if (!run || !progression) return;
    const shown = progression.pilotCardIds.length > 0;
    run.classList.toggle('hidden', !shown);
    if (!shown) return;
    const { options, focusIndex } = this.levelUpState;
    run.innerHTML = runTrayMarkup(progression, {
      ghost: options[focusIndex]?.id,
      offered: options.map(({ id }) => id),
    });
  }

  // The highlighted card's cell on the HUD: a card new to its family adds one.
  previewFocusedCard() {
    const option = this.levelUpState.options[this.levelUpState.focusIndex];
    const progression = this.progression();
    if (!option || !progression) return;
    const { definition, rank } = cardState(progression, option.id);
    this.hud()?.previewBuildCard(
      rank === 1 ? { family: definition.family } : null
    );
  }

  // Q, RB or a click on "Equip for me": the first press arms it (the button
  // says how many picks it makes), the second while armed makes them.
  equipForMe() {
    const progress = this.headStart().progress();
    if (!this.levelUpState.isVisible || this.isLevelUpLocked() || !progress) {
      return;
    }
    const cards = progress.total - progress.pick + 1;
    if (this.equipArmTimer) {
      this.disarmEquip();
      this.equipRest(cards);
      return;
    }
    this.setBanishMode(false);
    this.setHoldMode(false);
    const { equipBtn } = this.refs;
    equipBtn?.classList.add('is-armed');
    equipBtn?.setAttribute('aria-pressed', 'true');
    const label = equipBtn?.querySelector('[data-label]');
    if (label) {
      const again =
        document.body?.dataset.inputDevice === 'touch' ? 'Tap' : 'Press';
      label.textContent = `Equip ${cards} card${cards === 1 ? '' : 's'}? ${again} again`;
    }
    this.equipArmTimer = setTimeout(() => this.disarmEquip(), EQUIP_CONFIRM_MS);
  }

  disarmEquip() {
    clearTimeout(this.equipArmTimer);
    this.equipArmTimer = null;
    const { equipBtn } = this.refs;
    equipBtn?.classList.remove('is-armed');
    equipBtn?.setAttribute('aria-pressed', 'false');
    const label = equipBtn?.querySelector('[data-label]');
    if (label) label.textContent = 'Equip for me';
  }

  // The head start's `cards` picks left, made at once (one pick sound: the
  // cue's throttle); back to play, and the HUD's tip line names the build.
  equipRest(cards) {
    this.disableLevelUpOptions();
    const families = this.headStart().equipRest();
    this.showGameUI();
    const build = families.map(({ name, cards: n }) => `${name} ${n}`);
    this.hud()?.showTimedNotice(
      [],
      `Equipped ${cards} card${cards === 1 ? '' : 's'}: ${build.join(' · ')}`,
      EQUIPPED_NOTICE_MS
    );
  }

  moveLevelUpFocus(direction) {
    const buttons = asArray(this.levelUpState.buttons);
    if (!buttons.length) {
      return;
    }

    const currentIndex =
      this.levelUpState.focusIndex >= 0 ? this.levelUpState.focusIndex : 0;
    this.focusLevelUpOption(currentIndex + direction);
  }

  // The move keys and the stick (InputSystem's actions), while the cards
  // are on top: not under Settings.
  handleLevelUpInputAction(payload = {}) {
    if (inputLayers.layerFor(payload.context?.event) !== this.inputLayer) {
      return;
    }

    if (payload.phase && payload.phase !== 'pressed') {
      return;
    }

    switch (payload.action) {
      case 'moveUp':
      case 'moveLeft':
        this.moveLevelUpFocus(-1);
        break;
      case 'moveDown':
      case 'moveRight':
        this.moveLevelUpFocus(1);
        break;
      default:
        break;
    }
  }

  handleLevelUpConfirm() {
    if (!this.levelUpState.isVisible) {
      return;
    }

    this.applyFocusedUpgrade();
  }

  applyFocusedUpgrade() {
    const index = this.levelUpState.focusIndex;
    if (index < 0) {
      this.focusLevelUpOption(0);
    }

    const option = this.levelUpState.options?.[this.levelUpState.focusIndex];
    if (option && option.id) {
      this.selectUpgrade(option.id);
    }
  }

  disableLevelUpOptions() {
    asArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.disabled = true;
      }
    });
  }

  enableLevelUpOptions() {
    asArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.disabled = false;
      }
    });
  }

  resetLevelUpState() {
    clearTimeout(this.levelUpState.exitTimer);
    document.getElementById('levelup-screen')?.classList.remove('is-leaving');
    asArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.classList.remove('is-focused');
        button.disabled = false;
      }
    });
    this.disarmEquip();
    this.setBanishMode(false);
    this.setHoldMode(false);
    if (this.levelUpState.isVisible) this.hud()?.previewBuildCard(null);
    inputLayers.remove(this.inputLayer);

    this.levelUpState = {
      isVisible: false,
      options: [],
      buttons: [],
      focusIndex: -1,
      poolSize: 0,
      level: null,
      lockedUntil: 0,
      banishMode: false,
      holdMode: false,
      exitTimer: null,
    };
  }
}
