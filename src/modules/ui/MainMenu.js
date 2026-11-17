// src/modules/ui/MainMenu.js
//
// The main menu, the mission preparation screen: the mode tabs (Campaign,
// Descent, Daily Field, Boss Rush) and the panel of the one showing, the ship
// selector with its hull previews, the records strip under the title, the
// Boss Rush lock, and the hover sound for every menu button on any screen.

import {
  DEFAULT_HULL_ID,
  getAllShipModels,
  getShipModelById,
} from '../../data/shipModels.js';
import { isBossRushUnlocked, loadRecords } from '../../services/runRecords.js';
import { menuStatusItems, menuStatusMarkup } from './menuStatus.js';
import { hullTraitsMarkup, hullUnlockText } from './hangar.js';

export class MainMenu {
  /**
   * `refs`: the menu's nodes { screen, shipSelector, shipSelectorOptions, shipSelectorLabel, status, bossRushBtn, bossRushLock, nav, tabs, hint }.
   * `settings`: the settings service (selected hull, graphics quality), or none.
   * `emit(name, payload)`: sends ui-hover.
   * `hangar()`: the hangar service (unlocked hulls, Salvage).
   * `codex()`: the codex service (the strip's Codex count).
   * `achievements()`: the achievements service (the strip's count).
   * `difficulty()`: the difficulty service (Daily best, difficulty).
   * `player()`: the player system, which draws the hull previews.
   * `livePreset()`: the preset Auto quality runs now (the strip's Quality).
   */
  constructor({
    refs,
    settings,
    emit,
    hangar,
    codex,
    achievements,
    difficulty,
    player,
    livePreset,
  }) {
    this.refs = refs;
    this.settings = settings;
    this.emit = emit;
    this.hangar = hangar;
    this.codex = codex;
    this.achievements = achievements;
    this.difficulty = difficulty;
    this.player = player;
    this.livePreset = livePreset;
    this.menuShipSelectorRefreshFrame = null;
    this._lastHoverTarget = null;
    // The mode tab showing; it is kept while the page lives.
    this.prepTab = 'campaign';
  }

  /** Shows one mode's panel and Launch (CSS keys on `data-active-tab`). */
  setPrepTab(tab) {
    const { nav, tabs } = this.refs;
    this.prepTab = tab;
    nav.dataset.activeTab = tab;
    tabs.querySelectorAll('[data-prep-tab]').forEach((button) => {
      const active = button.dataset.prepTab === tab;
      button.setAttribute('aria-selected', String(active));
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  bindPrepTabs() {
    this.refs.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-prep-tab]');
      if (tab) this.setPrepTab(tab.dataset.prepTab);
    });
    this.setPrepTab(this.prepTab);
  }

  getSelectedHullId() {
    const gameplayValues =
      this.settings && typeof this.settings.getCategoryValues === 'function'
        ? this.settings.getCategoryValues('gameplay') || null
        : null;
    const hullDefinition = getShipModelById(gameplayValues?.selectedHull);
    return this.hangar().hullFor(hullDefinition?.id || DEFAULT_HULL_ID);
  }

  getHullDisplayName(hullDefinition) {
    if (!hullDefinition) {
      return 'Unknown Hull';
    }

    return hullDefinition.name || hullDefinition.id;
  }

  initializeMenuShipSelector() {
    const menuRefs = this.refs;
    if (!menuRefs?.shipSelector || !menuRefs.shipSelectorOptions) {
      return;
    }

    this.buildMenuShipSelectorButtons();
    this.bindHullLine();
    this.refreshMenuShipSelector();
  }

  // The line over the hull chips says what the hovered or focused hull does,
  // otherwise the selected one; a locked hull also says where to unlock it.
  showHullLine(hullId = this.getSelectedHullId()) {
    const line = this.refs.shipSelectorLabel;
    if (!line) return;
    const lock = this.hangar().isHullUnlocked(hullId)
      ? ''
      : hullUnlockText(hullId);
    line.innerHTML = hullTraitsMarkup(getShipModelById(hullId), lock);
  }

  bindHullLine() {
    const chips = this.refs.shipSelectorOptions;
    const showChip = (event) => {
      const chip = event.target.closest?.('[data-hull-id]');
      if (chip) this.showHullLine(chip.dataset.hullId);
    };
    chips.addEventListener('pointerover', showChip);
    chips.addEventListener('focusin', showChip);
    chips.addEventListener('pointerleave', () => this.showHullLine());
    chips.addEventListener('focusout', (event) => {
      if (!chips.contains(event.relatedTarget)) this.showHullLine();
    });
  }

  buildMenuShipSelectorButtons() {
    const container = this.refs.shipSelectorOptions;
    if (!container) {
      return;
    }

    container.innerHTML = '';

    const fragment = document.createDocumentFragment();
    getAllShipModels().forEach((hullDefinition) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-ship-selector__option';
      button.dataset.hullId = hullDefinition.id;
      button.setAttribute('aria-pressed', 'false');

      const preview = document.createElement('canvas');
      preview.className = 'menu-ship-selector__preview';
      preview.width = 112;
      preview.height = 112;
      preview.setAttribute('aria-hidden', 'true');
      button.appendChild(preview);

      const label = document.createElement('span');
      label.className = 'menu-ship-selector__name';
      label.textContent = this.getHullDisplayName(hullDefinition);
      label.title = label.textContent;
      button.appendChild(label);

      button.addEventListener('click', () => {
        if (!this.settings || typeof this.settings.setSetting !== 'function') {
          return;
        }

        this.settings.setSetting(
          'gameplay',
          'selectedHull',
          hullDefinition.id,
          {
            source: 'ui',
          }
        );
      });

      fragment.appendChild(button);
    });

    container.appendChild(fragment);
  }

  requestMenuShipSelectorRefresh() {
    if (this.menuShipSelectorRefreshFrame !== null) {
      return;
    }

    const schedule =
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => setTimeout(callback, 16);

    this.menuShipSelectorRefreshFrame = schedule(() => {
      this.menuShipSelectorRefreshFrame = null;
      this.refreshMenuShipSelector();
    });
  }

  refreshMenuShipSelector() {
    const container = this.refs.shipSelectorOptions;
    if (!container) {
      return;
    }

    const selectedHullId = this.getSelectedHullId();
    const hangar = this.hangar();
    container
      .querySelectorAll('.menu-ship-selector__option')
      .forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        const isActive = button.dataset.hullId === selectedHullId;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        const locked = !hangar.isHullUnlocked(button.dataset.hullId);
        button.disabled = locked;
        button.classList.toggle('is-locked', locked);
      });

    this.showHullLine(selectedHullId);
    this.renderMenuShipSelectorPreviews();
  }

  // The records strip under the menu title (ui/menuStatus.js).
  refreshMenuStatus() {
    const strip = this.refs.status;
    if (!strip) {
      return;
    }
    strip.innerHTML = menuStatusMarkup(
      menuStatusItems({
        records: loadRecords(),
        hangar: this.hangar(),
        codex: this.codex(),
        achievements: this.achievements(),
        difficulty: this.difficulty(),
        quality: this.settings?.getCategoryValues('graphics')?.quality,
        livePreset: this.livePreset(),
      })
    );
  }

  // Boss Rush stays locked until a run has beaten Warden Prime.
  refreshBossRushLock() {
    const { bossRushBtn, bossRushLock } = this.refs;
    if (!bossRushBtn) {
      return;
    }
    const locked = !isBossRushUnlocked();
    bossRushBtn.disabled = locked;
    bossRushLock.classList.toggle('hidden', !locked);
  }

  renderMenuShipSelectorPreviews() {
    const container = this.refs.shipSelectorOptions;
    const player = this.player();
    if (
      !container ||
      !player ||
      typeof player.renderHullPreview !== 'function'
    ) {
      return;
    }

    container
      .querySelectorAll('.menu-ship-selector__option')
      .forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        const preview = button.querySelector('.menu-ship-selector__preview');
        if (!(preview instanceof HTMLCanvasElement)) {
          return;
        }

        const context = preview.getContext('2d');
        if (!context) {
          return;
        }

        const hullDefinition = getShipModelById(button.dataset.hullId);
        player.renderHullPreview(context, hullDefinition, {
          padding: 12,
        });
      });
  }

  // The footer line says what the tab or link under the pointer or holding
  // the focus does; otherwise the focused one's, else the first (Campaign). One line, never empty.
  bindModeHints() {
    const { nav, hint } = this.refs;
    if (!nav || !hint) return;
    let hovered = null;
    const show = (button) => {
      hint.textContent = (
        button ?? nav.querySelector('[data-hint]')
      ).dataset.hint;
    };
    const focused = () => {
      const active = document.activeElement;
      return nav.contains(active) && active.dataset?.hint ? active : null;
    };
    nav.addEventListener('pointerover', (event) => {
      hovered = event.target.closest('[data-hint]');
      if (hovered) show(hovered);
    });
    nav.addEventListener('pointerleave', () => {
      hovered = null;
      show(focused());
    });
    nav.addEventListener('focusin', (event) => {
      show(event.target.closest('[data-hint]'));
    });
    nav.addEventListener('focusout', (event) => {
      if (!nav.contains(event.relatedTarget)) show(hovered);
    });
    show(focused());
  }

  bindMainMenuControls() {
    this.bindPrepTabs();
    this.bindModeHints();
    // Generic UI Hover Sound Delegation
    // Listens for all menu buttons and interactive elements
    if (typeof document !== 'undefined') {
      document.addEventListener(
        'mouseover',
        (event) => {
          // Check for common button classes or interactive elements
          const target = event.target.closest(
            '.menu-screen__button, .menu-ship-selector__option, .btn, .settings-tab-button, [role="button"]'
          );

          // Debounce/Check if it's a new hover target to avoid spam
          if (target && target !== this._lastHoverTarget) {
            this._lastHoverTarget = target;

            // Determine source based on context
            let source = 'ui';
            if (target.closest('#main-menu')) source = 'main-menu';
            else if (target.closest('#pause-screen')) source = 'pause-menu';
            else if (target.closest('#settings-screen'))
              source = 'settings-menu';
            else if (target.closest('#gameover-screen'))
              source = 'gameover-menu';
            else if (target.closest('#victory-screen')) source = 'victory-menu';
            else if (target.closest('#levelup-screen')) source = 'levelup-menu';

            this.emit('ui-hover', {
              source,
              button: target.id || target.className || 'unknown',
            });
          }
        },
        { passive: true }
      );

      // Reset last hover target when mouse leaves
      document.addEventListener(
        'mouseout',
        (event) => {
          if (event.target === this._lastHoverTarget) {
            this._lastHoverTarget = null;
          }
        },
        { passive: true }
      );
    }
  }
}
