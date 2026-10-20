// src/modules/ui/hud/instruments/xp/instrument.js
//
// XP along the bottom edge (HUD.md, glance; owner's mock-up of 20/10): a
// thin gold line 960 px wide at a 1080p window (narrower when the corners
// need the room) with "LV n" at its left. A new level pulses once.

import { replay } from '../../hudCommon.js';

// What the line leaves free at each end at a 1080p window: the vitals
// (32 px in, 400 px wide) and a gap, so a larger HUD Scale never runs it
// into the corners.
const CORNER_CLEARANCE = 472;

const MARKUP = `
        <div class="ins ins-glance xpl">
          <div class="xpl-lv"><small>LV</small><b>1</b></div>
          <div class="xpl-bar"><i></i></div>
        </div>`;

const CSS = `
            .xpl { width: min(960px * var(--hud-u), 100cqw - ${CORNER_CLEARANCE * 2}px * var(--hud-u)); display: flex; align-items: center; gap: calc(var(--space-3) * var(--hud-u)); }
            .xpl-lv { font-family: var(--font-display); color: var(--xp); white-space: nowrap; line-height: 1; }
            .xpl-lv small { font-size: calc(var(--text-xs) * var(--hud-u)); letter-spacing: 0.2em; font-weight: 500; opacity: 0.75; margin-right: 4px; }
            .xpl-lv b { display: inline-block; font-size: calc(var(--text-md) * var(--hud-u)); font-weight: 600; }
            .xpl-bar { position: relative; flex: 1; height: calc(3px * var(--hud-u)); overflow: hidden; background: color-mix(in srgb, var(--xp) 24%, transparent); }
            .xpl-bar i { position: absolute; inset: 0; display: block; background: var(--xp); transform: scaleX(0); transform-origin: left; transition: transform 0.5s var(--ease-out); }`;

export default {
  slot: 'xp',
  id: 'instrument',
  name: 'Instrument',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    this.level = container.querySelector('.xpl-lv b');
    this.fill = container.querySelector('.xpl-bar i');
    this.shownLevel = null;
    this.shownFill = null;
  },

  update({ level, current, required }) {
    if (level !== this.shownLevel) {
      if (this.shownLevel !== null) replay(this.level, 'ins-pulse');
      this.shownLevel = level;
      this.level.textContent = level;
    }
    const fraction =
      required > 0 ? Math.min(1, Math.max(0, current / required)) : 0;
    const fill = `scaleX(${fraction.toFixed(3)})`;
    if (fill !== this.shownFill) {
      this.shownFill = fill;
      this.fill.style.transform = fill;
    }
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
  },
};
