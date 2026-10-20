// src/modules/ui/LevelUpScreen.js
//
// The level-up screen (the owner's mock-ups of 20/10): "LEVEL n", one card
// per upgrade offered (ui/upgradeCard.js), keyboard, mouse and pad focus over
// them, reroll and banish, and the pick that sends the run back to play
// through the cards' exit animation. The first three picks name themselves
// and show where each family leads; the HUD's build instrument previews the
// highlighted card's cell.

import { PROGRESSION_INITIAL_LEVEL } from '../../core/GameConstants.js';
import { playLevelUpExit, staggerCardEntry } from './levelUpTransition.js';
import {
  cardClasses,
  cardMarkup,
  cardState,
  paintCard,
  weaponOfCard,
} from './upgradeCard.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

// Level-up cards and the victory buttons ignore input this long after showing.
export const SCREEN_INPUT_LOCKOUT_MS = 400;
// The picks that set the run's direction get their own strip.
const FIRST_PICKS = ['First pick', 'Second pick', 'Third pick'];

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
   * `refs`: the screen's nodes { container, text, level, picks, rerollBtn, banishBtn, banishHint }.
   * `progression()`: the progression service (offers, rerolls, banishes, picks), or none.
   * `combat()`: the combat service (the held weapon a card names).
   * `emit(name, payload)`: sends ui-hover.
   * `showScreen(name, options)`: shows the level-up overlay.
   * `showGameUI()`: back to play, or to the next card choice waiting; it resets this screen too.
   * `showCardsTip()`: the first-run onboarding tip under the cards.
   * `prefersReducedMotion()`: the cards skip their entry and exit animation.
   * `previewBuild(card)`: the HUD build instrument shows `{ family }` as
   *   gaining a card, or nothing (null).
   */
  constructor({
    refs,
    progression,
    combat,
    emit,
    showScreen,
    showGameUI,
    showCardsTip,
    prefersReducedMotion,
    previewBuild,
  }) {
    this.refs = refs;
    this.progression = progression;
    this.combat = combat;
    this.emit = emit;
    this.showScreen = showScreen;
    this.showGameUI = showGameUI;
    this.showCardsTip = showCardsTip;
    this.prefersReducedMotion = prefersReducedMotion;
    this.previewBuild = previewBuild;
    this.levelUpState = {
      isVisible: false,
      options: [],
      buttons: [],
      focusIndex: -1,
      poolSize: 0,
      level: null,
      lockedUntil: 0,
      banishMode: false,
      exitTimer: null,
    };
  }

  bindLevelUpControls() {
    const { rerollBtn, banishBtn } = this.refs;
    rerollBtn?.addEventListener('click', () => this.rerollLevelUpOptions());
    banishBtn?.addEventListener('click', () => this.toggleBanishMode());

    document.addEventListener('keydown', (event) => {
      if (!this.levelUpState.isVisible || event.repeat) {
        return;
      }
      if (event.code === 'KeyR') {
        this.rerollLevelUpOptions();
      } else if (event.code === 'KeyB') {
        this.toggleBanishMode();
      } else if (event.key === 'Escape' && this.levelUpState.banishMode) {
        this.setBanishMode(false);
      }
    });
  }

  /** A pad press here: reroll, banish, or back out of banish mode. */
  handleGamepadNav(action) {
    if (action === 'reroll') this.rerollLevelUpOptions();
    else if (action === 'banish') this.toggleBanishMode();
    else if (action === 'back' && this.levelUpState.banishMode) {
      this.setBanishMode(false);
    }
  }

  showLevelUpScreen(data = {}) {
    const options = ensureArray(data.options || data.availableUpgrades);

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
    this.levelUpState.level = levelValue;
    this.showScreen('levelup', { overlay: true, show: true });
    const screen = document.getElementById('levelup-screen');
    if (screen) liftHudInstruments(screen);
    this.renderLevelUpOptions(options, data.poolSize);
    this.showCardsTip();
  }

  // "LEVEL n" over "Choose one", or the first picks' strip.
  renderHeader() {
    const { level: levelNode, text, picks } = this.refs;
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
    this.setBanishMode(false);
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
      this.focusLevelUpOption(0, { preventFocus: false });
    } else {
      this.levelUpState.buttons = [];
    }
  }

  // After a reroll or banish: redraw the cards, or close if none are left.
  refreshLevelUpOptions(payload = {}) {
    if (!this.levelUpState.isVisible) {
      return;
    }
    const options = ensureArray(payload.options);
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
  }

  isLevelUpLocked() {
    return Date.now() < this.levelUpState.lockedUntil;
  }

  rerollLevelUpOptions() {
    if (!this.levelUpState.isVisible || this.isLevelUpLocked()) {
      return;
    }
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
    this.setBanishMode(!this.levelUpState.banishMode);
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
    button.innerHTML = cardMarkup(state.definition, state, {
      weapon: this.combat().getWeaponState(),
      key: index + 1,
    });
    button.addEventListener('click', () => this.selectUpgrade(option.id));
    button.addEventListener('mouseenter', () => {
      this.emit('ui-hover', { source: 'upgrade-selection', index });
      this.focusLevelUpOption(index, { preventFocus: true, fromPointer: true });
    });
    button.addEventListener('focus', () =>
      this.focusLevelUpOption(index, { preventFocus: false })
    );

    return button;
  }

  selectUpgrade(upgradeId) {
    if (!upgradeId) {
      return;
    }

    if (this.isLevelUpLocked()) {
      return;
    }

    const progression = this.progression();

    if (this.levelUpState.banishMode) {
      progression?.banishUpgrade(upgradeId);
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
    const buttons = ensureArray(this.levelUpState.buttons);
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
    const options = ensureArray(payload.options || payload.availableUpgrades);
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

  focusLevelUpOption(index, options = {}) {
    const buttons = ensureArray(this.levelUpState.buttons);
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
        if (!options.preventFocus && document.activeElement !== button) {
          button.focus({ preventScroll: true });
        }
      } else {
        button.classList.remove('is-focused');
      }
    });

    this.levelUpState.focusIndex = safeIndex;
    this.previewFocusedCard();
  }

  // The highlighted card's cell on the HUD: a card new to its family adds one.
  previewFocusedCard() {
    const option = this.levelUpState.options[this.levelUpState.focusIndex];
    const progression = this.progression();
    if (!option || !progression) return;
    const { definition, rank } = cardState(progression, option.id);
    this.previewBuild(rank === 1 ? { family: definition.family } : null);
  }

  moveLevelUpFocus(direction) {
    const buttons = ensureArray(this.levelUpState.buttons);
    if (!buttons.length) {
      return;
    }

    const currentIndex =
      this.levelUpState.focusIndex >= 0 ? this.levelUpState.focusIndex : 0;
    this.focusLevelUpOption(currentIndex + direction, { preventFocus: false });
  }

  handleLevelUpInputAction(payload = {}) {
    if (!this.levelUpState.isVisible) {
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
      this.focusLevelUpOption(0, { preventFocus: false });
    }

    const option = this.levelUpState.options?.[this.levelUpState.focusIndex];
    if (option && option.id) {
      this.selectUpgrade(option.id);
    }
  }

  disableLevelUpOptions() {
    ensureArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.disabled = true;
      }
    });
  }

  enableLevelUpOptions() {
    ensureArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.disabled = false;
      }
    });
  }

  resetLevelUpState() {
    clearTimeout(this.levelUpState.exitTimer);
    document.getElementById('levelup-screen')?.classList.remove('is-leaving');
    ensureArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.classList.remove('is-focused');
        button.disabled = false;
      }
    });
    this.setBanishMode(false);
    if (this.levelUpState.isVisible) this.previewBuild(null);

    this.levelUpState = {
      isVisible: false,
      options: [],
      buttons: [],
      focusIndex: -1,
      poolSize: 0,
      level: null,
      lockedUntil: 0,
      banishMode: false,
      exitTimer: null,
    };
  }
}
