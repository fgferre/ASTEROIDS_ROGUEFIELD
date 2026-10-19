// src/modules/ui/hud/systemsPanel.js

import { WEAPONS } from '../../../data/weapons.js';
import { UPGRADE_FAMILIES } from '../../../data/upgrades/families.js';
import { replay } from './hudCommon.js';

// One pip per lance shot before the Harmonic beam (the beam is the last shot).
export const BEAM_PIPS = WEAPONS.harmonic.beam.every - 1;

/**
 * The bottom-right panel: timed pickup chips, the WEAPON chip with its beam
 * pips and evolution chips, and the AIM / SPREAD / DASH chips. `els` is the
 * HUD's element map, passed on every call.
 */
export class SystemsPanel {
  constructor() {
    this._aimStick = false;
    this._lastDashFraction = null;
    this._lastWeaponKey = null;
    this._evolutionChips = new Map();
    this._buffs = new Map();
  }

  /** Forgets the chips and readings (the HUD unmounts). */
  reset() {
    this._aimStick = false;
    this._lastDashFraction = null;
    this._lastWeaponKey = null;
    this._evolutionChips = new Map();
    this._buffs = new Map();
  }

  /**
   * Plan 01.07 Task 5/6 — update spread + aim mode indicators.
   * @param {string} spreadMode - 'concentrated' or 'fan'.
   * @param {string} aimMode - 'auto' or 'manual'.
   */
  updateModeIndicators(els, spreadMode, aimMode) {
    if (!els) {
      return;
    }
    if (els.spreadModeIndicator) {
      const label = spreadMode === 'fan' ? 'FAN' : 'CONC';
      els.spreadModeIndicator.innerText = label;
    }
    if (els.aimModeIndicator) {
      const label = aimMode === 'manual' || this._aimStick ? 'MANUAL' : 'AUTO';
      els.aimModeIndicator.innerText = label;
    }
  }

  /** The right stick aims by hand while held: the AIM chip reads MANUAL. */
  setAimStick(active) {
    this._aimStick = Boolean(active);
  }

  /**
   * DASH chip: the bar empties as the dash recharges and the chip flashes
   * once when it is ready again.
   * @param {number} cooldownFraction - 1 right after a dash, 0 when ready.
   */
  updateDashCooldown(els, cooldownFraction) {
    if (!els?.dashFill) {
      return;
    }
    const fraction = Math.min(1, Math.max(0, cooldownFraction || 0));
    if (fraction === this._lastDashFraction) {
      return;
    }
    const wasCharging = this._lastDashFraction > 0;
    this._lastDashFraction = fraction;
    els.dashFill.style.transform = `scaleX(${fraction})`;
    els.dashChip.classList.toggle('is-charging', fraction > 0);
    if (wasCharging && fraction === 0) {
      replay(els.dashChip, 'is-ready');
    }
  }

  /**
   * WEAPON chip, beam pips and evolution chips from
   * CombatSystem.getWeaponState(); writes the DOM only when something changed.
   */
  updateWeapon(els, state) {
    if (!els?.weaponName || !state) {
      return;
    }
    const harmonic = state.weaponId === 'harmonic';
    const filled = harmonic ? BEAM_PIPS + 1 - state.shotsToBeam : 0;
    const key = `${state.weaponId}:${filled}:${state.evolutions.map((evolution) => evolution.id).join(',')}`;
    if (key === this._lastWeaponKey) {
      return;
    }
    this._lastWeaponKey = key;
    // The chip is a short label; the full name goes to the recap and pause.
    els.weaponName.textContent = state.chip || state.name.toUpperCase();
    els.beamPips.classList.toggle('is-hidden', !harmonic);
    els.beamPipEls.forEach((pip, index) =>
      pip.classList.toggle('is-filled', index < filled)
    );

    const ids = new Set(state.evolutions.map((evolution) => evolution.id));
    for (const [id, chip] of this._evolutionChips) {
      if (!ids.has(id)) {
        chip.remove();
        this._evolutionChips.delete(id);
      }
    }
    for (const { id, family, apex, short } of state.evolutions) {
      if (this._evolutionChips.has(id)) {
        continue;
      }
      const chip = document.createElement('span');
      chip.className = 'evo-chip';
      chip.classList.toggle('is-apex', Boolean(apex));
      chip.textContent = apex ? `APEX ${short}` : id.toUpperCase();
      chip.style.setProperty('--family-color', UPGRADE_FAMILIES[family].color);
      els.evolutions.appendChild(chip);
      this._evolutionChips.set(id, chip);
    }
  }

  /** The Harmonic beam fired: the weapon chip and its pips flash once. */
  flashBeam(els) {
    if (els?.weaponChip) {
      replay(els.weaponChip, 'is-beam');
    }
  }

  /** Timed pickup chip ("OVERCHARGE 7.9s"); collecting it again restarts it. */
  startBuff(els, kind, label, duration, color) {
    const container = els?.buffs;
    if (!container) {
      return;
    }
    let buff = this._buffs.get(kind);
    if (!buff) {
      const el = document.createElement('div');
      el.className = 'mode-chip buff-chip';
      el.style.setProperty('--buff-color', color);
      const text = document.createElement('span');
      const meter = document.createElement('span');
      meter.className = 'buff-meter';
      const fill = document.createElement('span');
      fill.className = 'buff-meter__fill';
      meter.appendChild(fill);
      el.appendChild(text);
      el.appendChild(meter);
      container.appendChild(el);
      buff = { el, text, fill, label, duration, remaining: 0, shown: '' };
      this._buffs.set(kind, buff);
    }
    buff.duration = duration;
    buff.remaining = duration;
    this._renderBuff(buff);
  }

  /** Counts the buff chips down on the game's clock; a chip at 0 goes away. */
  tickBuffs(deltaTime) {
    for (const [kind, buff] of this._buffs) {
      buff.remaining -= deltaTime;
      if (buff.remaining <= 0) {
        buff.el.remove();
        this._buffs.delete(kind);
      } else {
        this._renderBuff(buff);
      }
    }
  }

  clearBuffs() {
    this._buffs.forEach((buff) => buff.el.remove());
    this._buffs.clear();
  }

  _renderBuff(buff) {
    const shown = `${buff.label} ${buff.remaining.toFixed(1)}s`;
    if (shown !== buff.shown) {
      buff.shown = shown;
      buff.text.textContent = shown;
    }
    buff.fill.style.transform = `scaleX(${buff.remaining / buff.duration})`;
  }
}
