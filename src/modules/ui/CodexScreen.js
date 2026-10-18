// src/modules/ui/CodexScreen.js
//
// The Codex overlay over the main menu: the ENEMIES and ACHIEVEMENTS tabs,
// switched by click, the arrow keys or the pad's shoulder buttons; closes on
// its buttons, a backdrop click or Escape and gives the focus back.

import { adjacentCodexTab, codexTabView } from './codexTabs.js';

export class CodexScreen {
  /**
   * `refs`: the overlay's nodes { overlay, list, count, openBtn, backBtn, closeBtn, tabs }.
   * `showScreen(name, options)`: shows or hides the overlay.
   * `announceVisibility(isOpen, payload)`: the overlay opened or closed.
   * `codex()`: the codex service (the ENEMIES entries).
   * `achievements()`: the achievements service (the ACHIEVEMENTS entries).
   */
  constructor({ refs, showScreen, announceVisibility, codex, achievements }) {
    this.refs = refs;
    this.showScreen = showScreen;
    this.announceVisibility = announceVisibility;
    this.codex = codex;
    this.achievements = achievements;
    this.codexState = { isOpen: false, trigger: null, tab: 'enemies' };
  }

  /** Arrow keys or LB/RB: the previous or next tab, its button focused. */
  cycleTab(step) {
    this.showCodexTab(adjacentCodexTab(this.codexState.tab, step), {
      focusTab: true,
    });
  }

  bindCodexControls() {
    const refs = this.refs;
    if (!refs.overlay) return;
    refs.openBtn?.addEventListener('click', () => this.openCodex());
    [refs.backBtn, refs.closeBtn].forEach((button) =>
      button?.addEventListener('click', () => this.closeCodex())
    );
    refs.overlay.addEventListener('click', (event) => {
      if (event.target === refs.overlay) this.closeCodex();
    });
    refs.tabs.forEach((button) =>
      button.addEventListener('click', () =>
        this.showCodexTab(button.dataset.codexTab)
      )
    );
    document.addEventListener('keydown', (event) => {
      if (!this.codexState.isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeCodex();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.cycleTab(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
  }

  showCodexTab(tab, { focusTab = false } = {}) {
    const refs = this.refs;
    const view = codexTabView(tab, {
      enemies: this.codex().getEntries(),
      achievements: this.achievements().getEntries(),
    });
    refs.list.innerHTML = view.markup;
    refs.list.setAttribute('aria-label', view.label);
    refs.list.scrollTop = 0;
    refs.count.textContent = view.count;
    refs.tabs.forEach((button) => {
      const active = button.dataset.codexTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      if (active && focusTab) button.focus({ preventScroll: true });
    });
    this.codexState.tab = tab;
  }

  openCodex() {
    const refs = this.refs;
    this.codexState = {
      isOpen: true,
      trigger: document.activeElement,
      tab: 'enemies',
    };
    this.showCodexTab('enemies');
    this.showScreen('codex', { overlay: true, show: true });
    refs.overlay.setAttribute('aria-hidden', 'false');
    this.announceVisibility(true, { source: 'menu' });
    refs.backBtn?.focus({ preventScroll: true });
  }

  closeCodex() {
    if (!this.codexState.isOpen) return;
    const refs = this.refs;
    this.showScreen('codex', { overlay: true, show: false });
    refs.overlay.setAttribute('aria-hidden', 'true');
    this.announceVisibility(false, { source: 'menu' });
    this.codexState.trigger?.focus?.({ preventScroll: true });
    this.codexState = { isOpen: false, trigger: null, tab: 'enemies' };
  }
}
