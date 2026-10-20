// src/modules/ui/hud/instruments/warden/classic.js
//
// The first boss bar (until 20/10), top centre: a wide bar with a skull
// badge, "NAME • PHASE n/m" over it, recoloured per phase, split into its
// phase segments with the current one pulsing; it flashes on hits and greys
// while the Warden can't be hurt. A Herald gets a shorter violet bar. The
// HUD's own edge arrows point at the Warden off screen.

import { bossSegments } from '../../hudCommon.js';

const BOSS_FALLBACK_COLOR = '#ff003c';
const BOSS_FALLBACK_DARK = '#880020';

const MARKUP = `
            <div class="boss-area hud-panel" id="ui-boss-panel">
                <div class="boss-bar-container">
                    <div class="boss-name" id="ui-boss-name">BOSS</div>
                    <div class="boss-skull"><i data-lucide="skull" size="24"></i></div>
                    <div class="boss-fill" id="ui-boss-fill"></div>
                    <div class="boss-segments" id="ui-boss-segments"></div>
                </div>
            </div>`;

const CSS = `
            .boss-area { display: flex; flex-direction: column; align-items: center; padding-top: var(--space-4, 16px); opacity: 0; transition: opacity 0.5s; }
            .boss-area.active { opacity: 1; }
            .boss-bar-container { position: relative; width: 70%; height: 32px; background: var(--surface, rgba(20, 0, 0, 0.6)); border: 1px solid var(--boss, #ff003c); display: flex; align-items: center; margin-top: var(--space-4, 16px); }
            .boss-skull { width: 45px; height: 45px; background: var(--bg, #0a0a0f); border: 2px solid var(--boss, #ff003c); position: absolute; left: -22px; display: flex; justify-content: center; align-items: center; clip-path: polygon(25% 0%, 75% 0%, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0% 75%, 0% 25%); color: var(--boss, #ff003c); z-index: 5; }
            .boss-fill { height: 100%; width: 100%; background: var(--boss, #ff003c); box-shadow: 0 0 20px var(--boss, #ff003c); transition: width 0.3s ease-out; position: relative; }
            .boss-name { position: absolute; top: -24px; width: 100%; text-align: center; font-size: var(--text-md, 16px); letter-spacing: 4px; color: var(--text, #fff); font-weight: 700; }
            .boss-segments { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
            .boss-seg { position: absolute; top: 0; bottom: 0; box-sizing: border-box; }
            .boss-seg + .boss-seg { border-left: 3px solid var(--bg); }
            .boss-seg.is-spent { background: repeating-linear-gradient(-45deg, transparent 0 6px, var(--line) 6px 7px); }
            .boss-seg.is-current { box-shadow: inset 0 0 0 1px var(--text), inset 0 0 12px var(--text-dim); }
            .boss-area.is-herald .boss-bar-container { width: 42%; height: 20px; border-color: var(--boss); }
            .boss-area.is-herald .boss-fill { background: var(--boss); box-shadow: 0 0 16px var(--boss); }
            .boss-area.is-herald .boss-skull { width: 32px; height: 32px; left: -16px; border-color: var(--boss); color: var(--boss); }
            .boss-area.is-hit .boss-fill { animation: boss-hit 0.25s ease-out; }
            .boss-area.is-critical .boss-fill { animation: boss-critical 0.3s ease-out; }
            .boss-area.is-invulnerable .boss-fill { filter: grayscale(0.35) brightness(0.75); opacity: 0.65; }
            .boss-area.is-invulnerable .boss-bar-container { border-color: var(--text-dim, rgba(255, 255, 255, 0.35)); }
            .boss-area.is-invulnerable .boss-skull { border-color: var(--text-dim, rgba(255, 255, 255, 0.7)); color: var(--text-dim, rgba(255, 255, 255, 0.9)); }
            @media (prefers-reduced-motion: no-preference) {
                .boss-seg.is-current { animation: boss-seg-pulse 0.9s ease-in-out infinite alternate; }
                .boss-area { transform: translateY(-24px); transition: opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out); }
                .boss-area.active { transform: translateY(0); }
            }
            @keyframes boss-hit { 0% { filter: brightness(1.6); } 100% { filter: brightness(1); } }
            @keyframes boss-critical { 0% { filter: brightness(2); } 100% { filter: brightness(1); } }
            @keyframes boss-seg-pulse { from { background: transparent; } to { background: color-mix(in srgb, var(--text) 18%, transparent); } }`;

/** Darken a hex color by a factor (0-1) */
function darkenColor(hex, factor) {
  if (!hex || typeof hex !== 'string') return BOSS_FALLBACK_DARK;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return BOSS_FALLBACK_DARK;
  const num = parseInt(clean, 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - factor)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - factor)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - factor)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default {
  slot: 'warden',
  id: 'classic',
  name: 'Classic',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.panel = q('#ui-boss-panel');
    this.name = q('#ui-boss-name');
    this.fill = q('#ui-boss-fill');
    this.segments = q('#ui-boss-segments');
    this.lastPercent = null;
    this.hitTimeout = null;
    this.criticalTimeout = null;
    this.segmentEls = [];
    this.segmentKey = null;
  },

  update(state) {
    const { panel, fill } = this;
    if (!state.active) {
      panel.classList.remove('active', 'is-hit', 'is-invulnerable');
      panel.classList.remove('is-critical', 'is-herald');
      this.clearTimers();
      this.lastPercent = null;
      this.updateSegments(0, 0);
      this.resetColors();
      return;
    }

    // A Herald: shorter violet bar, one segment, no phase colours.
    if (state.herald !== panel.classList.contains('is-herald')) {
      panel.classList.toggle('is-herald', state.herald);
      this.resetColors();
    }
    panel.classList.toggle('active', state.shown);
    panel.classList.toggle('is-invulnerable', state.invulnerable);

    const { phase, phaseCount, phaseColors, percent } = state;
    const hasPhases = phaseCount > 1;
    this.name.textContent = hasPhases
      ? `${state.name || 'BOSS'} • PHASE ${phase + 1}/${phaseCount}`
      : state.name || 'BOSS';

    // Phase color: change bar color based on current phase
    if (phaseColors.length > 0) {
      const color =
        phaseColors[Math.min(phase, phaseColors.length - 1)] ||
        BOSS_FALLBACK_COLOR;
      const darkColor = darkenColor(color, 0.4);
      fill.style.background = `repeating-linear-gradient(45deg, ${color}, ${color} 10px, ${darkColor} 10px, ${darkColor} 20px)`;
      fill.style.boxShadow = `0 0 20px ${color}`;
    }

    fill.style.width = percent + '%';
    if (this.lastPercent !== null && percent < this.lastPercent) {
      this.flash('is-hit', 'hitTimeout', 180);
      if (this.lastPercent - percent >= 8) {
        this.flash('is-critical', 'criticalTimeout', 280);
      }
    }
    this.lastPercent = percent;
    this.updateSegments(phaseCount, phase);
  },

  resetColors() {
    this.fill.style.background = '';
    this.fill.style.boxShadow = '';
  },

  flash(className, timer, ms) {
    this.panel.classList.add(className);
    if (this[timer]) window.clearTimeout(this[timer]);
    this[timer] = window.setTimeout(() => {
      this.panel?.classList.remove(className);
      this[timer] = null;
    }, ms);
  },

  clearTimers() {
    if (this.hitTimeout) window.clearTimeout(this.hitTimeout);
    if (this.criticalTimeout) window.clearTimeout(this.criticalTimeout);
    this.hitTimeout = null;
    this.criticalTimeout = null;
  },

  updateSegments(phaseCount, phase) {
    const segments = phaseCount > 0 ? bossSegments(phaseCount, phase) : [];
    const key = segments.map((seg) => seg.state).join();
    if (key === this.segmentKey) return;
    this.segmentKey = key;

    if (segments.length !== this.segmentEls.length) {
      this.segments.innerHTML = '';
      this.segmentEls = segments.map((seg) => {
        const el = document.createElement('div');
        el.style.left = `${seg.left}%`;
        el.style.width = `${seg.width}%`;
        this.segments.appendChild(el);
        return el;
      });
    }
    // One segment (a Herald) is just the bar: no pulse.
    segments.forEach((seg, index) => {
      const state = segments.length > 1 ? seg.state : 'ahead';
      this.segmentEls[index].className = `boss-seg is-${state}`;
    });
  },

  destroy() {
    this.clearTimers();
    this.container.innerHTML = '';
    this.container = null;
    this.panel = null;
  },
};
