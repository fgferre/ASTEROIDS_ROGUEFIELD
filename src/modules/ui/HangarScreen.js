// src/modules/ui/HangarScreen.js
//
// The Hangar overlay over the main menu: Salvage balance and five tabs.
// Ship: the items to buy, the hull picker with its 3D preview and lock
// caption, and the Ring's line for a purchase. Licences: weapons and cards to
// license and switch on or off. Control: rungs of rerolls, banishes, Hold,
// Seal and the Flight School. Medals: the wall of medals and
// what each pays. Pressure: the ladder above Warden, a rung to pick.

import {
  hangarItemMarkup,
  hullLockText,
  hullTraitsMarkup,
  licenseMarkup,
  medalMarkup,
  pressureLadderMarkup,
  pressureNoteText,
  salvageBalanceText,
} from './hangar.js';
import { getAllShipModels, getShipModelById } from '../../data/shipModels.js';

export class HangarScreen {
  /**
   * `refs`: the overlay's nodes { overlay, list, hulls, hullLock, hullInfo, balance, openBtn, backBtn, closeBtn, tabs, panels, licenses, control, medals, pressure, pressureNote }.
   * `settings`: the settings service; a hull button selects that hull.
   * `emit(name, payload)`: sends hangar-hull-hovered and the purchase line's
   *   transmission events (its voice, audio/voiceLines.js).
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
    this.purchaseLine = null;
    this.tab = 'ship';
  }

  // The run's transmission banner is hidden in the menu: the Ring's line
  // for a purchase shows in the caption under the hull stage, scrolled into
  // view, and speaks through the transmission events like a run's line.
  showPurchaseLine(line) {
    const caption = this.refs.hullLock;
    if (line && caption) {
      this.endPurchaseLine();
      caption.textContent = `${line.speaker}: ${line.text}`;
      caption.hidden = false;
      caption.scrollIntoView({ block: 'nearest' });
      this.purchaseLine = line;
      this.emit('transmission-queued', line);
      this.emit('transmission-shown', line);
    }
  }

  // Another caption or leaving the Hangar ends the purchase line: its voice
  // stops and its recording is let go.
  endPurchaseLine() {
    if (!this.purchaseLine) return;
    this.emit('transmission-finished', this.purchaseLine);
    this.purchaseLine = null;
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
      const tab = event.target.closest('[data-hangar-tab]');
      if (tab) {
        this.tab = tab.dataset.hangarTab;
        this.endPurchaseLine();
        this.renderHangar();
        return;
      }
      const rung = event.target.closest('[data-hangar-pressure]');
      if (rung) {
        this.hangar().setPressure(Number(rung.dataset.hangarPressure));
        this.renderHangar();
        refs.pressure
          .querySelector(
            `[data-hangar-pressure="${rung.dataset.hangarPressure}"]`
          )
          ?.focus({ preventScroll: true });
        return;
      }
      const license = event.target.closest(
        '[data-hangar-license-buy], [data-hangar-license-on]'
      );
      if (license) {
        const { hangarLicenseBuy, hangarLicenseOn } = license.dataset;
        if (hangarLicenseBuy) this.hangar().buyLicense(hangarLicenseBuy);
        else {
          this.hangar().setLicenseOn(
            hangarLicenseOn,
            license.getAttribute('aria-pressed') !== 'true'
          );
        }
        const id = hangarLicenseBuy ?? hangarLicenseOn;
        this.renderHangar();
        refs.licenses
          .querySelector(`[data-hangar-license="${id}"] .hangar-item__action`)
          ?.focus({ preventScroll: true });
        return;
      }
      const buy = event.target.closest('[data-hangar-buy]');
      if (buy) {
        const id = buy.dataset.hangarBuy;
        const list = buy.closest('.hangar-list');
        this.hangar().buy(id);
        this.renderHangar();
        list
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
      this.endPurchaseLine();
      refs.hullLock.hidden = !locked;
      refs.hullLock.textContent = locked ? hullLockText(hullId) : '';
      if (hullId) this.showHullInfo(hullId);
      this.emit('hangar-hull-hovered', { hullId, locked });
    };
    refs.hulls?.addEventListener('pointerover', previewHull);
    refs.hulls?.addEventListener('focusin', previewHull);
    ['pointerleave', 'focusout'].forEach((type) =>
      refs.hulls?.addEventListener(type, () => {
        this.endPurchaseLine();
        refs.hullLock.hidden = true;
        this.showHullInfo();
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
    const medals = hangar.getMedals();
    refs.tabs.forEach((button) => {
      const active = button.dataset.hangarTab === this.tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      if (button.dataset.hangarTab === 'medals') {
        button.textContent = `Medals · ${
          medals.filter((medal) => medal.unlockedAt).length
        }/${medals.length}`;
      }
    });
    refs.panels.forEach((panel) => {
      panel.hidden = panel.dataset.hangarPanel !== this.tab;
    });
    refs.licenses.innerHTML = hangar.getLicenses().map(licenseMarkup).join('');
    refs.control.innerHTML = hangar
      .getControlItems()
      .map(hangarItemMarkup)
      .join('');
    refs.medals.innerHTML = medals.map(medalMarkup).join('');
    refs.pressureNote.textContent = pressureNoteText(hangar.pressure.open);
    refs.pressure.innerHTML = pressureLadderMarkup(hangar.pressure);
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
    this.showHullInfo(selected);
  }

  // Under the stage: what the hovered or focused hull does, else the
  // selected one's.
  showHullInfo(hullId = this.selectedHullId()) {
    if (!this.refs.hullInfo) return;
    this.refs.hullInfo.innerHTML = hullTraitsMarkup(getShipModelById(hullId));
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
    this.endPurchaseLine();
    const refs = this.refs;
    this.showScreen('hangar', { overlay: true, show: false });
    refs.overlay.setAttribute('aria-hidden', 'true');
    this.announceVisibility(false, { source: 'menu' });
    this.refreshShipSelector();
    this.hangarState.trigger?.focus?.({ preventScroll: true });
    this.hangarState = { isOpen: false, trigger: null };
  }
}
