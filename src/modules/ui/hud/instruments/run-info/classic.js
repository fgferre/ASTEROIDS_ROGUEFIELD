// src/modules/ui/hud/instruments/run-info/classic.js
//
// The first stats panel (until 20/10): TIME and KILLS blocks with a cyan
// edge, the COMBO count under them in its tier's colour, popping as it
// climbs. The layer sits on the classic XP dial instead.

import { COMBO_VISIBLE_MIN, comboTier, replay } from '../../hudCommon.js';

const COMBO_POP_MS = 120;

const MARKUP = `
            <div class="stats-area hud-panel">
                <div class="stats-grid">
                    <div class="stat-block">
                        <div class="stat-label"><i data-lucide="clock" size="14"></i> TIME</div>
                        <div class="stat-value" id="ui-timer">00:00</div>
                    </div>
                    <div class="stat-block">
                        <div class="stat-label"><i data-lucide="crosshair" size="14"></i> KILLS</div>
                        <div class="stat-value" id="ui-kills">0</div>
                    </div>
                </div>
                <div class="combo-box is-hidden" id="ui-combo-box">
                    <div class="combo-label">COMBO</div>
                    <div class="combo-val" id="ui-combo">x0</div>
                </div>
            </div>`;

const CSS = `
            .stats-area { display: flex; flex-direction: column; gap: var(--space-3, 12px); }
            .stats-grid { display: flex; flex-direction: column; gap: var(--space-3, 12px); }
            .stat-block { display: flex; flex-direction: column; background: linear-gradient(90deg, var(--surface, rgba(12, 20, 31, 0.65)) 0%, transparent 100%); padding: var(--space-1, 4px) var(--space-2, 8px) var(--space-1, 4px) var(--space-3, 12px); border-left: 3px solid var(--neutral, #00aaff); width: fit-content; min-width: 160px; }
            .stat-label { font-size: var(--text-xs, 12px); color: var(--neutral, #00aaff); letter-spacing: 1px; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; font-weight: 700; }
            .stat-value { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-xl, 28px); color: var(--text, #fff); line-height: 1.1; }
            .combo-box { margin-top: var(--space-2, 8px); }
            .combo-box.is-hidden { visibility: hidden; }
            .combo-box { transform-origin: left center; }
            .combo-label { font-size: var(--text-sm, 14px); color: var(--accent, #00f2ff); letter-spacing: 2px; font-weight: 700; }
            .combo-val { font-size: var(--text-xl, 28px); line-height: 1; font-family: var(--font-display, 'Orbitron', sans-serif); color: var(--text); font-weight: 900; transition: color var(--motion-fast); }
            .combo-box[data-tier='status'] .combo-val { color: var(--status); }
            .combo-box[data-tier='xp'] .combo-val { color: var(--xp); }
            .combo-box[data-tier='boss'] .combo-val { color: var(--boss); text-shadow: 0 0 12px var(--boss); }
            @media (prefers-reduced-motion: no-preference) {
                .combo-box.pulse { animation: combo-pop ${COMBO_POP_MS}ms var(--ease-out) 1; }
            }
            @keyframes combo-pop { 0% { transform: scale(1); } 50% { transform: scale(1.18); } 100% { transform: scale(1); } }`;

export default {
  slot: 'run-info',
  id: 'classic',
  name: 'Classic',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.timer = q('#ui-timer');
    this.kills = q('#ui-kills');
    this.combo = q('#ui-combo');
    this.comboBox = q('#ui-combo-box');
    this.shown = {};
    this.lastCombo = null;
  },

  update({ clock, kills, combo, multiplier }) {
    if (clock !== this.shown.clock) {
      this.shown.clock = clock;
      this.timer.textContent = clock;
    }
    if (kills !== this.shown.kills) {
      this.shown.kills = kills;
      this.kills.textContent = kills;
    }
    if (combo === this.lastCombo) return;
    const increased = combo > (this.lastCombo ?? 0);
    this.lastCombo = combo;
    const visible = combo >= COMBO_VISIBLE_MIN;
    this.comboBox.classList.toggle('is-hidden', !visible);
    this.comboBox.dataset.tier = comboTier(multiplier);
    if (visible) {
      this.combo.textContent = 'x' + combo;
      if (increased) replay(this.comboBox, 'pulse');
    }
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
  },
};
