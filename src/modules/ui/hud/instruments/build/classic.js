// src/modules/ui/hud/instruments/build/classic.js
//
// The first systems panel (until 20/10), bottom right: timed pickup chips
// ("OVERCHARGE 7.9s"), the WEAPON chip with its beam pips and one chip per
// evolution, and the AIM / SPREAD / DASH chips (the DASH bar empties as the
// dash recharges and the chip flashes once when it is ready).

import {
  DEFAULT_WEAPON_ID,
  WEAPONS,
  firePattern,
} from '../../../../../data/weapons.js';
import { replay } from '../../hudCommon.js';
import { familyAccent } from '../../../upgradeCard.js';

// A weapon with an every-nth-shot beam shows one pip per shot before it (the
// beam is the last shot). The markup holds the most any weapon needs.
const beamPips = (weapon) => (firePattern(weapon, 'beam')?.every ?? 1) - 1;
const BEAM_PIPS = Math.max(0, ...Object.values(WEAPONS).map(beamPips));

const MARKUP = `
            <div class="systems-area hud-panel">
                <div class="buff-row" id="ui-buffs"></div>
                <div class="weapon-group">
                    <div class="mode-chip weapon-chip" id="ui-weapon-chip">WEAPON <span class="data-val" id="ui-weapon-name">${WEAPONS[DEFAULT_WEAPON_ID].chip}</span><span class="beam-pips is-hidden" id="ui-beam-pips">${'<span class="beam-pip"></span>'.repeat(BEAM_PIPS)}</span></div>
                    <div class="evo-row" id="ui-evolutions"></div>
                </div>
                <div class="systems-row">
                    <div class="mode-chip">AIM <span class="data-val" id="ui-aim-mode">AUTO</span></div>
                    <div class="mode-chip">SPREAD <span class="data-val" id="ui-spread-mode">CONC</span></div>
                    <div class="mode-chip dash-chip" id="ui-dash-chip">DASH <span class="dash-meter"><span class="dash-meter__fill" id="ui-dash-fill"></span></span></div>
                </div>
            </div>`;

// 220 px: the side column it filled in the old grid (its chips wrap in it).
const CSS = `
            .systems-area { width: 220px; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; gap: var(--space-2, 8px); }
            .systems-row { display: flex; flex-direction: row; justify-content: flex-end; align-items: flex-end; gap: var(--space-2, 8px); }
            .mode-chip { font-family: var(--font-mono, 'Consolas', monospace); font-size: var(--text-xs, 12px); color: var(--text-dim, #ccc); background: var(--surface, rgba(12, 20, 31, 0.65)); border: 1px solid var(--line, rgba(255,255,255,0.2)); border-radius: var(--radius-sm, 4px); padding: var(--space-1, 4px) var(--space-2, 8px); letter-spacing: 1px; }
            .data-val { color: var(--accent, #00f2ff); font-weight: bold; }
            .dash-chip { display: flex; align-items: center; gap: var(--space-1, 4px); color: var(--accent); border-color: var(--accent-line); }
            .dash-chip.is-charging { color: var(--text-dim); border-color: var(--line); }
            .dash-meter { width: 28px; height: 4px; background: var(--accent); border-radius: var(--radius-sm); overflow: hidden; box-shadow: var(--glow-accent); }
            .dash-chip.is-charging .dash-meter { background: var(--surface-strong); box-shadow: none; }
            .dash-meter__fill { display: block; width: 100%; height: 100%; background: var(--accent-line); transform: scaleX(0); transform-origin: left; }
            .weapon-group { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1, 4px); }
            .weapon-chip { display: flex; align-items: center; gap: var(--space-1, 4px); }
            .beam-pips { display: flex; gap: 3px; margin-left: 2px; }
            .beam-pips.is-hidden { display: none; }
            .beam-pip { width: 5px; height: 5px; border: 1px solid var(--accent-line); border-radius: 1px; }
            .beam-pip.is-filled { background: var(--accent); box-shadow: var(--glow-accent); }
            .beam-pip.is-hidden { display: none; }
            .evo-row { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; max-width: 220px; }
            .evo-chip { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1px; padding: 1px var(--space-1, 4px); color: var(--family-color); background: var(--surface); border: 1px solid color-mix(in srgb, var(--family-color) 55%, transparent); border-radius: var(--radius-sm); }
            .buff-row { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1, 4px); }
            .buff-row:empty { display: none; }
            .evo-chip.is-apex { color: color-mix(in srgb, var(--family-color) 55%, white); border-color: var(--family-color); box-shadow: 0 0 6px color-mix(in srgb, var(--family-color) 45%, transparent); font-weight: 700; }
            .evo-row:empty { display: none; }
            .buff-chip { display: flex; align-items: center; gap: var(--space-2, 8px); color: var(--buff-color); border-color: color-mix(in srgb, var(--buff-color) 55%, transparent); }
            .buff-meter { width: 36px; height: 4px; background: var(--surface-strong); border-radius: var(--radius-sm); overflow: hidden; }
            .buff-meter__fill { display: block; width: 100%; height: 100%; background: var(--buff-color); transform-origin: left; }
            @media (prefers-reduced-motion: no-preference) {
                .dash-chip.is-ready { animation: dash-ready var(--motion-base) var(--ease-out) 1; }
                .weapon-chip.is-beam { animation: dash-ready var(--motion-base) var(--ease-out) 1; }
                .weapon-chip.is-beam .beam-pip { animation: beam-pip-flash var(--motion-base) var(--ease-out) 1; }
                .evo-chip, .buff-chip { animation: feed-in var(--motion-base) var(--ease-out); }
            }
            @keyframes dash-ready { 0% { box-shadow: var(--glow-accent); background: var(--accent-soft); } 100% { box-shadow: none; } }
            @keyframes beam-pip-flash { 0% { background: var(--accent); box-shadow: var(--glow-accent); } 100% { background: transparent; box-shadow: none; } }`;

export default {
  slot: 'build',
  id: 'classic',
  name: 'Classic',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.els = {
      weaponChip: q('#ui-weapon-chip'),
      weaponName: q('#ui-weapon-name'),
      beamPips: q('#ui-beam-pips'),
      beamPipEls: [...container.querySelectorAll('.beam-pip')],
      evolutions: q('#ui-evolutions'),
      buffs: q('#ui-buffs'),
      aim: q('#ui-aim-mode'),
      spread: q('#ui-spread-mode'),
      dashChip: q('#ui-dash-chip'),
      dashFill: q('#ui-dash-fill'),
    };
    this.shown = {};
    this.lastDashFraction = null;
    this.lastWeaponKey = null;
    this.evolutionChips = new Map();
    this.buffChips = new Map();
    this.beams = null;
  },

  update(state) {
    const { els, shown } = this;
    const spread = state.spreadMode === 'fan' ? 'FAN' : 'CONC';
    if (spread !== shown.spread) {
      shown.spread = spread;
      els.spread.textContent = spread;
    }
    const aim = state.aimMode === 'manual' ? 'MANUAL' : 'AUTO';
    if (aim !== shown.aim) {
      shown.aim = aim;
      els.aim.textContent = aim;
    }
    this.updateDash(state.dash);
    if (state.weapon) this.updateWeapon(state.weapon);
    this.updateBuffs(state.buffs);
    // A beam fired: the weapon chip and its pips flash once.
    if (state.beams !== this.beams) {
      if (this.beams !== null) replay(els.weaponChip, 'is-beam');
      this.beams = state.beams;
    }
  },

  updateDash(cooldownFraction) {
    const { els } = this;
    const fraction = Math.min(1, Math.max(0, cooldownFraction || 0));
    if (fraction === this.lastDashFraction) return;
    const wasCharging = this.lastDashFraction > 0;
    this.lastDashFraction = fraction;
    els.dashFill.style.transform = `scaleX(${fraction})`;
    els.dashChip.classList.toggle('is-charging', fraction > 0);
    if (wasCharging && fraction === 0) replay(els.dashChip, 'is-ready');
  },

  // The WEAPON chip, its beam pips and the evolution chips; writes the DOM
  // only when something changed.
  updateWeapon(state) {
    const { els } = this;
    const pips = beamPips(WEAPONS[state.weaponId]);
    const filled = pips ? pips + 1 - state.shotsToBeam : 0;
    const key = `${state.weaponId}:${filled}:${state.evolutions.map((evolution) => evolution.id).join(',')}`;
    if (key === this.lastWeaponKey) return;
    this.lastWeaponKey = key;
    // The chip is a short label; the full name goes to the recap and pause.
    els.weaponName.textContent = state.chip || state.name.toUpperCase();
    els.beamPips.classList.toggle('is-hidden', !pips);
    els.beamPipEls.forEach((pip, index) => {
      pip.classList.toggle('is-filled', index < filled);
      pip.classList.toggle('is-hidden', index >= pips);
    });

    const ids = new Set(state.evolutions.map((evolution) => evolution.id));
    for (const [id, chip] of this.evolutionChips) {
      if (!ids.has(id)) {
        chip.remove();
        this.evolutionChips.delete(id);
      }
    }
    for (const { id, family, apex, short } of state.evolutions) {
      if (this.evolutionChips.has(id)) continue;
      const chip = document.createElement('span');
      chip.className = 'evo-chip';
      chip.classList.toggle('is-apex', Boolean(apex));
      chip.textContent = apex ? `APEX ${short}` : id.toUpperCase();
      chip.style.setProperty('--family-color', familyAccent(family));
      els.evolutions.appendChild(chip);
      this.evolutionChips.set(id, chip);
    }
  },

  // One chip per timed pickup: its label, the seconds left and a draining bar.
  updateBuffs(buffs) {
    const kinds = new Set(buffs.map((buff) => buff.kind));
    for (const [kind, chip] of this.buffChips) {
      if (!kinds.has(kind)) {
        chip.el.remove();
        this.buffChips.delete(kind);
      }
    }
    for (const buff of buffs) {
      let chip = this.buffChips.get(buff.kind);
      if (!chip) {
        const el = document.createElement('div');
        el.className = 'mode-chip buff-chip';
        el.style.setProperty('--buff-color', buff.color);
        const text = document.createElement('span');
        const meter = document.createElement('span');
        meter.className = 'buff-meter';
        const fill = document.createElement('span');
        fill.className = 'buff-meter__fill';
        meter.appendChild(fill);
        el.appendChild(text);
        el.appendChild(meter);
        this.els.buffs.appendChild(el);
        chip = { el, text, fill, shown: '' };
        this.buffChips.set(buff.kind, chip);
      }
      const shown = `${buff.label} ${buff.remaining.toFixed(1)}s`;
      if (shown !== chip.shown) {
        chip.shown = shown;
        chip.text.textContent = shown;
      }
      chip.fill.style.transform = `scaleX(${buff.remaining / buff.duration})`;
    }
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
    this.evolutionChips = new Map();
    this.buffChips = new Map();
  },
};
