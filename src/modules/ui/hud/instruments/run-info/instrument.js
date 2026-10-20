// src/modules/ui/hud/instruments/run-info/instrument.js
//
// The run's numbers, small, top left (HUD.md, on demand; owner's mock-up of
// 20/10): the clock with the layer beside it, kills, and the combo while it
// runs, in its tier's colour. Wakes to full strength when the layer, kills
// or combo change and fades to 35 % 4 s later; the clock ticking alone does
// not wake it. A new layer and a climbing combo pulse once.

import {
  COMBO_VISIBLE_MIN,
  comboTier,
  onDemand,
  replay,
} from '../../hudCommon.js';

const MARKUP = `
        <div class="ins ins-demand ri">
          <div class="ri-row"><span class="ri-clock">00:00</span><span class="ins-lbl ri-layer">LAYER 1</span></div>
          <div class="ri-row"><span class="ri-num ri-kills">0</span><span class="ins-lbl">KILLS</span></div>
          <div class="ri-row ri-combo is-hidden"><span class="ri-num ri-combo-num">x0</span><span class="ins-lbl">COMBO</span></div>
        </div>`;

const CSS = `
            .ri-row { display: flex; align-items: baseline; gap: calc(var(--space-3) * var(--hud-u)); }
            .ri-row + .ri-row { margin-top: calc(var(--space-1) * var(--hud-u)); }
            .ri-clock { font-family: var(--font-display); font-weight: 500; font-size: calc(var(--text-lg) * var(--hud-u)); letter-spacing: 0.06em; line-height: 1; }
            .ri-num { font-family: var(--font-display); font-weight: 500; font-size: calc(var(--text-sm) * var(--hud-u)); line-height: 1; }
            .ri-combo.is-hidden { display: none; }
            .ri-combo[data-tier='status'] .ri-num { color: var(--status); }
            .ri-combo[data-tier='xp'] .ri-num { color: var(--xp); }
            .ri-combo[data-tier='boss'] .ri-num { color: var(--boss-light); }`;

/** "09:42"; past an hour "1:09:42". */
export function runClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${s}`
    : `${String(m).padStart(2, '0')}:${s}`;
}

export default {
  slot: 'run-info',
  id: 'instrument',
  name: 'Instrument',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.root = q('.ri');
    this.clock = q('.ri-clock');
    this.layer = q('.ri-layer');
    this.kills = q('.ri-kills');
    this.comboRow = q('.ri-combo');
    this.comboNum = q('.ri-combo-num');
    this.demand = onDemand(this.root);
    this.shown = {};
  },

  update({ now, seconds, layer, kills, combo, multiplier }) {
    const shown = this.shown;
    const clock = runClock(seconds);
    if (clock !== shown.clock) {
      shown.clock = clock;
      this.clock.textContent = clock;
    }
    if (layer !== shown.layer) {
      if (shown.layer !== undefined) replay(this.layer, 'ins-pulse');
      shown.layer = layer;
      this.layer.textContent = `LAYER ${layer}`;
      this.demand.wake(now);
    }
    if (kills !== shown.kills) {
      shown.kills = kills;
      this.kills.textContent = kills;
      this.demand.wake(now);
    }
    if (combo !== shown.combo) {
      const increased = combo > (shown.combo ?? 0);
      shown.combo = combo;
      const visible = combo >= COMBO_VISIBLE_MIN;
      this.comboRow.classList.toggle('is-hidden', !visible);
      if (visible) {
        this.comboRow.dataset.tier = comboTier(multiplier);
        this.comboNum.textContent = `x${combo}`;
        if (increased) replay(this.comboNum, 'ins-pulse');
        this.demand.wake(now);
      }
    }
    this.demand.update(now);
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
  },
};
