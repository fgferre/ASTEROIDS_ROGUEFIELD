// src/modules/ui/hud/instruments/build/instrument.js
//
// The weapon and where the build is going, bottom right (HUD.md, glance;
// owner's mock-up of 20/10): the weapon's name over one family track — the
// family with the most cards, five cells, a notch after the third where the
// weapon evolves ("Incendiary at 3") and "Apex n/5" at its end — in the
// family's colour. Above it, on demand, the timed pickups counting down and
// the aim and spread modes. A beam shot and a new evolution pulse once.

import {
  FAMILY_APEX_THRESHOLD,
  FAMILY_SYNERGY_THRESHOLD,
  UPGRADE_FAMILIES,
} from '../../../../../data/upgrades/families.js';
import {
  WEAPON_APEX,
  WEAPON_EVOLUTIONS,
  WEAPON_FORMS,
} from '../../../../../data/weapons.js';
import { onDemand, replay } from '../../hudCommon.js';

const CELLS = Array.from({ length: FAMILY_APEX_THRESHOLD }, (_, i) =>
  i === FAMILY_SYNERGY_THRESHOLD
    ? '<b class="bd-notch"></b><i class="bd-cell"></i>'
    : '<i class="bd-cell"></i>'
).join('');

const MARKUP = `
        <div class="bd">
          <div class="ins ins-demand bd-demand">
            <div class="bd-buffs"></div>
            <div class="ins-lbl bd-modes"></div>
          </div>
          <div class="ins ins-glance bd-weapon">
            <div class="bd-name"></div>
            <div class="bd-track is-hidden">
              <span class="ins-lbl bd-family"></span>${CELLS}
              <span class="bd-note bd-evo"></span>
              <span class="bd-note bd-apex"></span>
            </div>
          </div>
        </div>`;

const CSS = `
            .bd { display: grid; justify-items: end; row-gap: calc(var(--space-2) * var(--hud-u)); }
            .bd-weapon { display: grid; justify-items: end; }
            .bd-name { font-weight: 700; font-size: calc(var(--text-lg) * var(--hud-u)); letter-spacing: 0.18em; line-height: 1; margin-right: -0.18em; }
            .bd-track { --fam: var(--accent); display: grid; align-items: center; margin-top: calc(var(--space-2) * var(--hud-u)); grid-template-columns: auto repeat(3, calc(36px * var(--hud-u))) calc(9px * var(--hud-u)) repeat(2, calc(36px * var(--hud-u))); column-gap: calc(4px * var(--hud-u)); row-gap: calc(5px * var(--hud-u)); }
            .bd-track.is-hidden { display: none; }
            .bd-family { margin-right: calc(var(--space-2) * var(--hud-u)); color: var(--fam); opacity: 0.85; }
            .bd-cell { height: calc(6px * var(--hud-u)); border-radius: 1px; box-shadow: inset 0 0 0 1px rgba(230, 238, 248, 0.38); }
            .bd-cell.is-on { background: var(--fam); box-shadow: none; }
            .bd-cell.is-next { box-shadow: inset 0 0 0 1px var(--fam); background: color-mix(in srgb, var(--fam) 18%, transparent); }
            .bd-cell.is-preview { background: color-mix(in srgb, var(--fam) 75%, white); box-shadow: 0 0 0 1px var(--fam), 0 0 12px var(--fam); }
            .bd-track.is-apex .bd-cell.is-on { box-shadow: 0 0 6px color-mix(in srgb, var(--fam) 60%, transparent); }
            .bd-notch { justify-self: center; width: 1px; height: calc(14px * var(--hud-u)); background: var(--fam); }
            .bd-note { font-weight: 600; font-size: calc(var(--text-sm) * var(--hud-u)); line-height: 1; white-space: nowrap; }
            .bd-evo { grid-column: 2 / 6; color: var(--fam); }
            .bd-evo.is-on, .bd-evo.is-hot { font-weight: 700; color: color-mix(in srgb, var(--fam) 70%, white); }
            .bd-apex { grid-column: 6 / 8; justify-self: end; color: var(--text-dim); }
            .bd-track.is-apex .bd-apex { color: var(--fam); font-weight: 700; }
            .bd-demand { display: grid; justify-items: end; row-gap: calc(var(--space-1) * var(--hud-u)); }
            .bd-buffs:empty { display: none; }
            .bd-buffs { display: grid; justify-items: end; row-gap: calc(var(--space-1) * var(--hud-u)); }
            .bd-buff { display: flex; align-items: center; gap: calc(var(--space-2) * var(--hud-u)); color: var(--buff); font-weight: 600; font-size: calc(var(--text-sm) * var(--hud-u)); line-height: 1; letter-spacing: 0.08em; }
            .bd-buff-time { font-family: var(--font-display); font-weight: 500; font-size: calc(var(--text-xs) * var(--hud-u)); min-width: 3.4em; text-align: right; }
            .bd-buff-meter { position: relative; width: calc(36px * var(--hud-u)); height: calc(3px * var(--hud-u)); overflow: hidden; background: color-mix(in srgb, var(--buff) 24%, transparent); }
            .bd-buff-meter b { position: absolute; inset: 0; display: block; background: var(--buff); transform-origin: left; }`;

const shortName = (name) => name.replace(/ Lance$/, '');

// The family's evolution (or Apex) as the held weapon has it: its own form
// on its card's family, else the lance's.
function evolutionName(weaponId, family, apex) {
  const forms = WEAPON_FORMS[weaponId];
  if (forms?.evolution && forms.base.card.family === family) {
    return (apex ? forms.apex : forms.evolution).name;
  }
  return (apex ? WEAPON_APEX : WEAPON_EVOLUTIONS)[family].name;
}

/**
 * The family the track follows: the most cards among the families with a
 * weapon evolution (the first in data order on a tie); null before any.
 */
export function trackFamily(families) {
  let best = null;
  for (const family of Object.keys(WEAPON_EVOLUTIONS)) {
    const cards = families?.[family] ?? 0;
    if (cards > 0 && (!best || cards > best.cards)) best = { family, cards };
  }
  return best;
}

export default {
  slot: 'build',
  id: 'instrument',
  name: 'Instrument',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.name = q('.bd-name');
    this.track = q('.bd-track');
    this.familyLabel = q('.bd-family');
    this.cells = [...container.querySelectorAll('.bd-cell')];
    this.evo = q('.bd-evo');
    this.apex = q('.bd-apex');
    this.buffs = q('.bd-buffs');
    this.modes = q('.bd-modes');
    this.demand = onDemand(q('.bd-demand'));
    this.buffRows = new Map();
    this.shown = {};
    this.beams = null;
    this.previewFamily = null;
    this.trackState = null;
  },

  // The level-up's highlighted card (AAAHudLayout.previewBuildCard), drawn at
  // once (the run is stopped): its family's track with the cell it fills
  // lit; null goes back to the build as it is.
  preview(card) {
    this.previewFamily = WEAPON_EVOLUTIONS[card?.family] ? card.family : null;
    if (this.trackState) this.updateTrack(...this.trackState);
  },

  update(state) {
    const { now, weapon } = state;
    const shown = this.shown;
    if (weapon) {
      const name = weapon.chip || weapon.name.toUpperCase();
      if (name !== shown.name) {
        shown.name = name;
        this.name.textContent = name;
      }
      this.trackState = [state.families, weapon];
      this.updateTrack(...this.trackState);
    }
    if (state.beams !== this.beams) {
      if (this.beams !== null) replay(this.name, 'ins-pulse');
      this.beams = state.beams;
    }
    const modes = `AIM ${state.aimMode === 'manual' ? 'MANUAL' : 'AUTO'} · SPREAD ${state.spreadMode === 'fan' ? 'FAN' : 'CONC'}`;
    if (modes !== shown.modes) {
      if (shown.modes !== undefined) this.demand.wake(now);
      shown.modes = modes;
      this.modes.textContent = modes;
    }
    this.updateBuffs(state.buffs, now);
    this.demand.update(now);
  },

  updateTrack(families, { weaponId, evolutions }) {
    const previewing = this.previewFamily;
    const track = previewing
      ? { family: previewing, cards: families?.[previewing] ?? 0 }
      : trackFamily(families);
    const evolution =
      track && evolutions.find((e) => e.family === track.family);
    const key = track
      ? `${weaponId}:${track.family}:${track.cards}:${evolution?.id ?? ''}:${Boolean(previewing)}`
      : '';
    if (key === this.shown.track) return;
    this.shown.track = key;
    this.track.classList.toggle('is-hidden', !track);
    if (!track) return;
    const { family, cards } = track;
    const lit = Math.min(FAMILY_APEX_THRESHOLD, cards);
    // The previewed card fills the next cell; at 3 or 5 it evolves.
    const gained = previewing && lit < FAMILY_APEX_THRESHOLD ? 1 : 0;
    this.track.style.setProperty('--fam', UPGRADE_FAMILIES[family].color);
    this.familyLabel.textContent = UPGRADE_FAMILIES[family].name.toUpperCase();
    this.cells.forEach((cell, i) => {
      cell.classList.toggle('is-on', i < lit);
      cell.classList.toggle('is-next', !gained && i === lit);
      cell.classList.toggle('is-preview', Boolean(gained) && i === lit);
    });
    const apex = Boolean(evolution?.apex);
    const evolves =
      gained &&
      (lit + 1 === FAMILY_SYNERGY_THRESHOLD ||
        lit + 1 === FAMILY_APEX_THRESHOLD);
    this.track.classList.toggle('is-apex', apex);
    this.evo.classList.toggle('is-on', Boolean(evolution) && !evolves);
    this.evo.classList.toggle('is-hot', Boolean(evolves));
    this.evo.textContent = evolves
      ? `+1 → ${lit + 1 === FAMILY_APEX_THRESHOLD ? 'Apex' : shortName(evolutionName(weaponId, family, false))}`
      : evolution
        ? shortName(evolutionName(weaponId, family, apex))
        : `${shortName(evolutionName(weaponId, family, false))} at ${FAMILY_SYNERGY_THRESHOLD}`;
    this.apex.textContent = `Apex ${lit + gained}/${FAMILY_APEX_THRESHOLD}`;
    // The weapon evolved (or reached its Apex) since the last frame.
    if (evolution && this.shown.evolution !== evolution.id) {
      if (this.shown.evolution !== undefined) replay(this.evo, 'ins-pulse');
    }
    this.shown.evolution = evolution?.id ?? null;
  },

  // One row per timed pickup; a new one wakes the on-demand block.
  updateBuffs(buffs, now) {
    const kinds = new Set(buffs.map((buff) => buff.kind));
    for (const [kind, row] of this.buffRows) {
      if (!kinds.has(kind)) {
        row.el.remove();
        this.buffRows.delete(kind);
      }
    }
    for (const buff of buffs) {
      let row = this.buffRows.get(buff.kind);
      if (!row) {
        const make = (tag, className = '') => {
          const part = document.createElement(tag);
          part.className = className;
          return part;
        };
        const el = make('div', 'bd-buff');
        el.style.setProperty('--buff', buff.color);
        const label = el.appendChild(make('span'));
        label.textContent = buff.label;
        const time = el.appendChild(make('span', 'bd-buff-time'));
        const fill = el
          .appendChild(make('i', 'bd-buff-meter'))
          .appendChild(make('b'));
        this.buffs.appendChild(el);
        row = { el, time, fill, shown: '' };
        this.buffRows.set(buff.kind, row);
        this.demand.wake(now);
      }
      const shown = `${buff.remaining.toFixed(1)}s`;
      if (shown !== row.shown) {
        row.shown = shown;
        row.time.textContent = shown;
        row.fill.style.transform = `scaleX(${(buff.remaining / buff.duration).toFixed(3)})`;
      }
    }
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
    this.buffRows = new Map();
  },
};
