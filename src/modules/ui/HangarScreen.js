// src/modules/ui/HangarScreen.js
//
// The Hangar overlay over the main menu: Salvage balance, the items to buy,
// the hull picker with its 3D preview and lock caption, and the Ring's line
// for a purchase.

import {
  hangarItemMarkup,
  hullLockText,
  salvageBalanceText,
} from './hangar.js';
import { getAllShipModels } from '../../data/shipModels.js';

export class HangarScreen {
  /**
   * `refs`: the overlay's nodes { overlay, list, hulls, hullLock, balance, openBtn, backBtn, closeBtn }.
   * `settings`: the settings service; a hull button selects that hull.
   * `emit(name, payload)`: sends hangar-hull-hovered.
   * `showScreen(name, options)`: shows or hides the overlay.
   * `announceVisibility(isOpen, payload)`: the overlay opened or closed.
   * `hangar()`: the hangar service (Salvage, items, purchases, unlocked hulls).
   * `selectedHullId()`: the hull the next run flies.
   * `hullName(hull)`: a hull's display name.
   * `refreshShipSelector()`: the menu's ship selector follows on close.
   */
  constructor({
    refs,
    settings,
    emit,
    showScreen,
    announceVisibility,
    hangar,
    selectedHullId,
    hullName,
    refreshShipSelector,
  }) {
    this.refs = refs;
    this.settings = settings;
    this.emit = emit;
    this.showScreen = showScreen;
    this.announceVisibility = announceVisibility;
    this.hangar = hangar;
    this.selectedHullId = selectedHullId;
    this.hullName = hullName;
    this.refreshShipSelector = refreshShipSelector;
    this.hangarState = { isOpen: false, trigger: null };
  }

  // The run's transmission banner is hidden in the menu: the Ring's line
  // for a purchase shows in the caption under the hull stage, scrolled into
  // view.
  showPurchaseLine(line) {
    const caption = this.refs.hullLock;
    if (line && caption) {
      caption.textContent = `${line.speaker}: ${line.text}`;
      caption.hidden = false;
      caption.scrollIntoView({ block: 'nearest' });
    }
  }

  bindHangarControls() {
    const refs = this.refs;
    if (!refs.overlay) return;
    refs.openBtn?.addEventListener('click', () => this.openHangar());
    [refs.backBtn, refs.closeBtn].forEach((button) =>
      button?.addEventListener('click', () => this.closeHangar())
    );
    refs.overlay.addEventListener('click', (event) => {
      if (event.target === refs.overlay) {
        this.closeHangar();
        return;
      }
      const buy = event.target.closest('[data-hangar-buy]');
      if (buy) {
        const id = buy.dataset.hangarBuy;
        this.hangar().buy(id);
        this.renderHangar();
        refs.list
          .querySelector(`[data-hangar-item="${id}"] .hangar-item__action`)
          ?.focus({ preventScroll: true });
        return;
      }
      const hull = event.target.closest('[data-hangar-hull]');
      if (hull) {
        this.settings.setSetting(
          'gameplay',
          'selectedHull',
          hull.dataset.hangarHull,
          { source: 'ui' }
        );
        this.renderHangar();
      }
    });
    // The 3D hull preview follows the hovered or focused hull button; a
    // locked hull shows as a silhouette with its price over the stage.
    const previewHull = (event) => {
      const hull = event.target.closest?.('[data-hangar-hull]');
      const hullId = hull?.dataset.hangarHull ?? null;
      const locked = Boolean(hull?.disabled);
      refs.hullLock.hidden = !locked;
      refs.hullLock.textContent = locked ? hullLockText(hullId) : '';
      this.emit('hangar-hull-hovered', { hullId, locked });
    };
    refs.hulls?.addEventListener('pointerover', previewHull);
    refs.hulls?.addEventListener('focusin', previewHull);
    ['pointerleave', 'focusout'].forEach((type) =>
      refs.hulls?.addEventListener(type, () => {
        refs.hullLock.hidden = true;
        this.emit('hangar-hull-hovered', { hullId: null });
      })
    );
    document.addEventListener('keydown', (event) => {
      if (this.hangarState.isOpen && event.key === 'Escape') {
        event.preventDefault();
        this.closeHangar();
      }
    });
  }

  renderHangar() {
    const refs = this.refs;
    const hangar = this.hangar();
    refs.balance.textContent = salvageBalanceText(hangar.salvage);
    refs.list.innerHTML = hangar.getItems().map(hangarItemMarkup).join('');
    const selected = this.selectedHullId();
    refs.hulls.innerHTML = getAllShipModels()
      .map((hull) => {
        const locked = !hangar.isHullUnlocked(hull.id);
        const active = hull.id === selected;
        return `<button type="button" class="hangar-hull${
          active ? ' is-active' : ''
        }" data-hangar-hull="${hull.id}" aria-pressed="${active}"${
          locked ? ' disabled' : ''
        }>${this.hullName(hull)}${locked ? ' · Locked' : ''}</button>`;
      })
      .join('');
  }

  openHangar() {
    const refs = this.refs;
    this.renderHangar();
    refs.hullLock.hidden = true;
    this.hangarState = { isOpen: true, trigger: document.activeElement };
    this.showScreen('hangar', { overlay: true, show: true });
    refs.overlay.setAttribute('aria-hidden', 'false');
    this.announceVisibility(true, { source: 'menu' });
    refs.backBtn?.focus({ preventScroll: true });
  }

  closeHangar() {
    if (!this.hangarState.isOpen) return;
    const refs = this.refs;
    this.showScreen('hangar', { overlay: true, show: false });
    refs.overlay.setAttribute('aria-hidden', 'true');
    this.announceVisibility(false, { source: 'menu' });
    this.refreshShipSelector();
    this.hangarState.trigger?.focus?.({ preventScroll: true });
    this.hangarState = { isOpen: false, trigger: null };
  }
}
