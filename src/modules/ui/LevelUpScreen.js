// src/modules/ui/LevelUpScreen.js
//
// The level-up screen: one card per upgrade offered, keyboard, mouse and pad
// focus over them, reroll and banish, and the pick that sends the run back
// to play through the cards' exit animation.

import { pipsMarkup } from './runRecap.js';
import { playLevelUpExit, staggerCardEntry } from './levelUpTransition.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

// Level-up cards and the victory buttons ignore input this long after showing.
export const SCREEN_INPUT_LOCKOUT_MS = 400;
const UPGRADE_RARITY_LABELS = { common: 'Common', rare: 'Rare', epic: 'Epic' };

const COLOR_ASSIST_ACCENTS = {
  offense: '#3366CC',
  defense: '#2F855A',
  mobility: '#E76F51',
  utility: '#8E6CFF',
  default: '#4C6EF5',
};

export class LevelUpScreen {
  /**
   * `refs`: the screen's nodes { container, text, rerollBtn, banishBtn, banishHint }.
   * `progression()`: the progression service (offers, rerolls, banishes, picks), or none.
   * `emit(name, payload)`: sends ui-hover.
   * `showScreen(name, options)`: shows the level-up overlay.
   * `showGameUI()`: back to play, or to the next card choice waiting; it resets this screen too.
   * `showCardsTip()`: the first-run onboarding tip under the cards.
   * `prefersReducedMotion()`: the cards skip their entry and exit animation.
   * `colorVision()`: 'assist' swaps the card accents for the color-blind palette.
   */
  constructor({
    refs,
    progression,
    emit,
    showScreen,
    showGameUI,
    showCardsTip,
    prefersReducedMotion,
    colorVision,
  }) {
    this.refs = refs;
    this.progression = progression;
    this.emit = emit;
    this.showScreen = showScreen;
    this.showGameUI = showGameUI;
    this.showCardsTip = showCardsTip;
    this.prefersReducedMotion = prefersReducedMotion;
    this.colorVision = colorVision;
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
    this.renderLevelUpOptions(options, data.poolSize);
    this.showCardsTip();
  }

  // Cards, subtitle and reroll/banish buttons for the offered options; new
  // cards restart the input lockout so a held key can't pick one unseen.
  renderLevelUpOptions(options, offeredPoolSize) {
    const levelValue = this.levelUpState.level;
    this.levelUpState.options = options;
    this.levelUpState.poolSize = Number.isFinite(Number(offeredPoolSize))
      ? Number(offeredPoolSize)
      : options.length;
    this.levelUpState.focusIndex = -1;
    this.levelUpState.lockedUntil = Date.now() + SCREEN_INPUT_LOCKOUT_MS;
    this.setBanishMode(false);
    this.updateLevelUpActionButtons();

    if (this.refs.text) {
      const optionCount = options.length;
      const poolSize = this.levelUpState.poolSize;
      const optionLabel = optionCount === 1 ? 'option' : 'options';
      let suffix = ` (${optionCount} ${optionLabel})`;
      if (poolSize > optionCount) {
        suffix = ` (${optionCount} of ${poolSize} ${optionLabel})`;
      }
      const prefix = Number.isFinite(levelValue)
        ? `Level ${levelValue} - Choose your technology`
        : 'Choose your technology';
      this.refs.text.textContent = `${prefix}${suffix}:`;
    }

    const container = this.refs.container;
    if (container) {
      container.innerHTML = '';
      const fragment = document.createDocumentFragment();
      const buttons = [];

      options.forEach((option, index) => {
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
        count.textContent = `${left} left`;
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `upgrade-option upgrade-option--${option.rarity || 'common'}${
      option.cursed ? ' upgrade-option--cursed' : ''
    }`;
    button.dataset.upgradeId = option.id;
    button.dataset.index = `${index}`;

    const accentColors = this.resolveAccentColors(option);
    button.style.setProperty('--upgrade-accent', accentColors.accent);
    button.style.setProperty('--upgrade-accent-soft', accentColors.soft);
    if (option.family) {
      button.style.setProperty('--family-color', option.family.color);
    }

    button.innerHTML = this.buildUpgradeOptionMarkup(option);
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

  buildUpgradeOptionMarkup(option = {}) {
    const category = option.category || {};
    const currentLevel = Number.isFinite(Number(option.currentLevel))
      ? Number(option.currentLevel)
      : 0;
    const maxLevel = Number.isFinite(Number(option.maxLevel))
      ? Number(option.maxLevel)
      : Math.max(currentLevel, 1);
    const nextLevel = option.nextLevel || null;
    const summary = option.summary ? option.summary : '';
    const highlights = Array.isArray(nextLevel?.highlights)
      ? nextLevel.highlights
      : [];
    const prerequisites = ensureArray(option.prerequisites);

    const familySection = this.buildFamilyProgressMarkup(option.family);

    const categoryIcon = category.icon
      ? `<span class="upgrade-option__category-icon" aria-hidden="true">${category.icon}</span>`
      : '';

    const nextLevelSection = nextLevel
      ? `<section class="upgrade-option__next">
          <p class="upgrade-option__next-label">Next: ${
            nextLevel.title || `Level ${currentLevel + 1}`
          }</p>
          <p class="upgrade-option__description">${
            nextLevel.description || ''
          }</p>
          ${
            highlights.length
              ? `<ul class="upgrade-highlights">
                  ${highlights.map((item) => `<li>${item}</li>`).join('')}
                </ul>`
              : ''
          }
        </section>`
      : '<p class="upgrade-option__maxed">Technology maxed out.</p>';

    const prerequisitesSection = prerequisites.length
      ? `<footer class="upgrade-option__footer">
          <ul class="upgrade-prerequisites">
            ${prerequisites
              .map((entry) => {
                const label = entry?.label || entry?.description || '';
                if (!label) {
                  return '';
                }
                const stateClass = entry.met ? 'is-met' : 'is-locked';
                const icon = entry.met ? '✔️' : '🔒';
                return `<li class="${stateClass}">${icon} ${label}</li>`;
              })
              .join('')}
          </ul>
        </footer>`
      : '';

    const rarity = option.rarity || 'common';

    return `
      <p class="upgrade-option__rarity">${
        option.cursed ? 'Cursed' : UPGRADE_RARITY_LABELS[rarity]
      }</p>
      <header class="upgrade-option__header">
        <span class="upgrade-icon" aria-hidden="true">${
          option.icon || '✨'
        }</span>
        <div class="upgrade-option__meta">
          <div class="upgrade-option__chips">
            <span class="upgrade-option__category">
              ${categoryIcon}
              ${category.label || 'Tecnologia'}
            </span>
            ${
              option.family
                ? `<span class="upgrade-option__family">${option.family.name}</span>`
                : ''
            }
          </div>
          <span class="upgrade-option__level">Lv. ${currentLevel}/${
            maxLevel || Math.max(1, currentLevel)
          }</span>
        </div>
      </header>
      <div class="upgrade-option__body">
        <h3 class="upgrade-option__title">${option.name || option.id}</h3>
        ${summary ? `<p class="upgrade-option__summary">${summary}</p>` : ''}
        ${familySection}
        ${nextLevelSection}
      </div>
      ${prerequisitesSection}
    `;
  }

  // Pips for distinct upgrades held in the family; names the bonus a pick unlocks.
  buildFamilyProgressMarkup(family) {
    if (!family) {
      return '';
    }
    const pips = pipsMarkup(family.owned, family.required);
    let state = '';
    let label = `${family.name} ${Math.min(family.owned, family.required)}/${family.required} · ${family.bonusName}`;
    if (family.active) {
      state = ' is-active';
      label = `${family.bonusName} online`;
    } else if (family.completesSynergy) {
      state = ' is-unlocking';
      label = `Unlocks: ${family.bonusName} — ${family.bonusDescription}`;
    } else if (family.owned > 0) {
      state = ' is-building';
    }
    return `<p class="upgrade-option__family-progress${state}">
        <span class="family-pips" aria-hidden="true">${pips}</span>
        <span>${label}</span>
      </p>`;
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

  // Cards out (ui/levelUpTransition.js), input locked, then back to the run.
  leaveLevelUp(upgradeId) {
    const buttons = ensureArray(this.levelUpState.buttons);
    this.levelUpState.lockedUntil = Infinity;
    this.levelUpState.exitTimer = playLevelUpExit({
      screen: document.getElementById('levelup-screen'),
      cards: buttons,
      picked: buttons.find((button) => button.dataset.upgradeId === upgradeId),
      target: document.getElementById('ui-weapon-chip'),
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

    if (
      Number.isFinite(Number(payload.level)) ||
      Number.isFinite(Number(payload.newLevel))
    ) {
      this.updateLevelDisplay(payload.level ?? payload.newLevel, {
        force: true,
      });
    }

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

  updateLevelDisplay() {
    // Standard HUD legacy method.
    // AAA HUD updates via updateAAATacticalHudFromServices.
    // Kept as stub for shared logic calls.
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

  resolveAccentColors(option) {
    const fallback = '#3399ff';
    let accent = fallback;
    let categoryId = null;

    if (option && typeof option === 'object') {
      if (
        typeof option.themeColor === 'string' &&
        option.themeColor.trim().length
      ) {
        accent = option.themeColor.trim();
      } else if (
        typeof option.color === 'string' &&
        option.color.trim().length
      ) {
        accent = option.color.trim();
      }

      categoryId =
        option.category?.id ||
        option.categoryId ||
        (typeof option.id === 'string' ? option.id : null);
    } else if (typeof option === 'string' && option.trim().length) {
      accent = option.trim();
    }

    const colorVision = this.colorVision();

    if (colorVision === 'assist') {
      const assistAccent = this.resolveAssistAccent(categoryId);
      if (assistAccent) {
        accent = assistAccent;
      }
    }

    const normalized =
      typeof accent === 'string' ? accent.trim().toLowerCase() : '';
    const softAlpha = colorVision === 'assist' ? 0.35 : 0.25;
    let soft = 'rgba(51, 153, 255, 0.25)';

    if (normalized.startsWith('#')) {
      soft = this.hexToRgba(normalized, softAlpha);
    } else if (normalized.startsWith('rgb')) {
      soft = normalized.replace('rgb', 'rgba').replace(')', `, ${softAlpha})`);
    } else if (normalized.startsWith('hsl')) {
      soft = normalized.replace('hsl', 'hsla').replace(')', `, ${softAlpha})`);
    } else if (colorVision === 'assist') {
      soft = 'rgba(76, 110, 245, 0.32)';
    }

    return { accent, soft };
  }

  resolveAssistAccent(categoryId) {
    if (!categoryId) {
      return COLOR_ASSIST_ACCENTS.default;
    }

    return COLOR_ASSIST_ACCENTS[categoryId] || COLOR_ASSIST_ACCENTS.default;
  }

  hexToRgba(hex, alpha = 1) {
    const sanitized = typeof hex === 'string' ? hex.replace('#', '') : '';
    const clampedAlpha = Math.min(1, Math.max(0, alpha));

    if (sanitized.length === 3) {
      const r = parseInt(sanitized[0] + sanitized[0], 16);
      const g = parseInt(sanitized[1] + sanitized[1], 16);
      const b = parseInt(sanitized[2] + sanitized[2], 16);
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }

    if (sanitized.length === 6) {
      const r = parseInt(sanitized.slice(0, 2), 16);
      const g = parseInt(sanitized.slice(2, 4), 16);
      const b = parseInt(sanitized.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }

    return `rgba(51, 153, 255, ${clampedAlpha})`;
  }
}
