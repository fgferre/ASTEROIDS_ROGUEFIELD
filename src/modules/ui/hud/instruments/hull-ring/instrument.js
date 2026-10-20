// src/modules/ui/hud/instruments/hull-ring/instrument.js
//
// The hull on the ship (HUD.md, on the ship; owner's mock-up of 20/10): a
// ring of ten segments round the ship, sized in screen pixels, for 2 s after
// each hull hit (what the hit took shows red) and always below 30 % hull,
// red then. Near death the warning grows: below 30 % the screen's edges
// darken, and below 15 % each hit (and the drop under 15 %) shakes the image
// in a short glitch — never with Reduce Motion or Reduce Flashing on.

const SIZE = 140;
const RING_R = 40;
const SEGMENTS = 10;
const SEGMENT_DEG = 30;
const LOW_PERCENT = 30;
const CRITICAL_PERCENT = 15;
export const HIT_SHOW_MS = 2000;
export const GLITCH_MS = 350;

const f = (n) => Math.round(n * 10) / 10;
const point = (deg) => {
  const a = (deg * Math.PI) / 180;
  return `${f(RING_R * Math.cos(a))} ${f(RING_R * Math.sin(a))}`;
};

// Clockwise from 12 o'clock, 36° apart with a 6° gap between segments.
const SEGMENT_PATHS = Array.from({ length: SEGMENTS }, (_, i) => {
  const a0 = -90 + i * 36 + 3;
  const d = `M${point(a0)}A${RING_R} ${RING_R} 0 0 1 ${point(a0 + SEGMENT_DEG)}`;
  return `<path class="hr-track" d="${d}"/><path class="hr-lit" d="${d}" pathLength="1" stroke-dasharray="0 1"/><path class="hr-lost" d="${d}" pathLength="1" stroke-dasharray="0 1"/>`;
}).join('');

const MARKUP = `
        <div class="hr">
          <div class="hr-dark"></div>
          <div class="hr-glitch" aria-hidden="true"><i></i><i></i><i></i></div>
          <svg class="hr-ring" viewBox="${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}" aria-hidden="true">${SEGMENT_PATHS}</svg>
        </div>`;

const CSS = `
            .hr, .hr-dark, .hr-glitch { position: absolute; inset: 0; pointer-events: none; }
            .hr-dark { opacity: 0; transition: opacity var(--motion-base) var(--ease-out); background: radial-gradient(ellipse 75% 70% at 50% 50%, transparent 52%, rgba(2, 4, 8, 0.5) 78%, rgba(2, 4, 8, 0.86) 100%); box-shadow: inset 0 0 160px color-mix(in srgb, var(--danger) 30%, transparent); }
            .hr.is-low .hr-dark { opacity: 1; }
            .hr-ring { position: absolute; left: 0; top: 0; width: calc(${SIZE}px * var(--hud-u)); height: calc(${SIZE}px * var(--hud-u)); overflow: visible; transform: translate(-50%, -50%); opacity: 0; transition: opacity var(--motion-base) var(--ease-out); }
            .hr.is-ring .hr-ring { opacity: 1; }
            .hr-ring path { fill: none; stroke-width: 3; }
            .hr-track { stroke: rgba(230, 238, 248, 0.2); }
            .hr-lit { stroke: var(--text); }
            .hr-lost { stroke: var(--danger); opacity: 0.75; }
            .hr.is-low .hr-track { stroke: color-mix(in srgb, var(--danger) 26%, transparent); }
            .hr.is-low .hr-lit { stroke: var(--danger); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--danger) 80%, transparent)); }
            .hr-glitch { display: none; }
            .hr-glitch i { position: absolute; display: block; backdrop-filter: hue-rotate(-50deg) saturate(2.2) brightness(1.5) contrast(1.3); box-shadow: 0 -1px 0 color-mix(in srgb, var(--danger) 70%, transparent), 0 1px 0 color-mix(in srgb, var(--accent) 60%, transparent); }
            .hr-glitch i:nth-child(1) { left: 60%; top: 58%; width: 29%; height: 1.3%; }
            .hr-glitch i:nth-child(2) { left: 9%; top: 64.8%; width: 37%; height: 0.5%; }
            .hr-glitch i:nth-child(3) { left: 30%; top: 21%; width: 22%; height: 0.8%; }
            @media (prefers-reduced-motion: no-preference) {
                html:not([data-motion='reduced']) body:not(.motion-reduced):not(.flashing-reduced) .hr.is-glitching .hr-glitch { display: block; }
            }
            .hr.is-glitching .hr-glitch i { animation: hr-glitch ${GLITCH_MS}ms steps(1, end) forwards; }
            .hr-glitch i:nth-child(2) { animation-delay: 60ms; }
            @keyframes hr-glitch { 0% { transform: translateX(1.2%); } 30% { transform: translateX(-0.8%); } 55% { transform: translateX(0.5%); opacity: 0.7; } 80% { transform: translateX(-0.3%); opacity: 0.4; } 100% { opacity: 0; } }`;

/** How far round each segment is lit (0..1) for `percent` hull. */
export function ringSegments(percent) {
  const per = 100 / SEGMENTS;
  return Array.from({ length: SEGMENTS }, (_, i) =>
    Math.max(0, Math.min(1, (percent - i * per) / per))
  );
}

export default {
  slot: 'hull-ring',
  id: 'instrument',
  name: 'Instrument',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    this.root = container.querySelector('.hr');
    this.ring = container.querySelector('.hr-ring');
    this.lit = [...container.querySelectorAll('.hr-lit')];
    this.lost = [...container.querySelectorAll('.hr-lost')];
    this.lastPercent = null;
    this.hitUntil = 0;
    this.lostFrom = null;
    this.glitchUntil = 0;
    this.shown = {};
  },

  update({ now, ship, hull, maxHull }) {
    const alive = hull > 0;
    const percent = alive ? (hull / maxHull) * 100 : 0;
    const hit = this.lastPercent !== null && percent < this.lastPercent;
    const critical = alive && percent < CRITICAL_PERCENT;
    if (hit) {
      // What the hits of one 2 s window took, from where it started.
      if (now >= this.hitUntil) this.lostFrom = this.lastPercent;
      this.hitUntil = now + HIT_SHOW_MS;
    }
    if (critical && (hit || this.lastPercent >= CRITICAL_PERCENT)) {
      this.glitchUntil = now + GLITCH_MS;
    }
    this.lastPercent = percent;
    if (now >= this.hitUntil) this.lostFrom = null;

    const low = alive && percent < LOW_PERCENT;
    const showRing = Boolean(ship) && alive && (low || now < this.hitUntil);
    this.toggle('is-low', low);
    this.toggle('is-ring', showRing);
    this.toggle('is-glitching', now < this.glitchUntil);
    if (ship) {
      const left = `${((ship.x / 800) * 100).toFixed(2)}%`;
      const top = `${((ship.y / 600) * 100).toFixed(2)}%`;
      if (left !== this.shown.left)
        this.ring.style.left = this.shown.left = left;
      if (top !== this.shown.top) this.ring.style.top = this.shown.top = top;
    }
    const drawn = `${f(percent)}|${this.lostFrom === null ? '' : f(this.lostFrom)}`;
    if (drawn === this.shown.drawn) return;
    this.shown.drawn = drawn;
    const lit = ringSegments(percent);
    const until = ringSegments(this.lostFrom ?? percent);
    const d = (n) => n.toFixed(3);
    for (let i = 0; i < lit.length; i += 1) {
      this.lit[i].setAttribute('stroke-dasharray', `${d(lit[i])} 1`);
      const chip = until[i] - lit[i];
      this.lost[i].setAttribute(
        'stroke-dasharray',
        chip > 0 ? `0 ${d(lit[i])} ${d(chip)} 1` : '0 1'
      );
    }
  },

  toggle(name, on) {
    if (this.shown[name] === on) return;
    this.shown[name] = on;
    this.root.classList.toggle(name, on);
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
  },
};
