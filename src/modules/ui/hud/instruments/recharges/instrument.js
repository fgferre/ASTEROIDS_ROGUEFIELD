// src/modules/ui/hud/instruments/recharges/instrument.js
//
// Recharges on the ship (HUD.md, on the ship; owner's mock-up of 20/10):
// thin arcs under the ship, sized in screen pixels so the wide camera does
// not shrink them — the dash as one cyan line that fills while it recharges,
// the broken shield as ten segments outside it. Each shows only while
// recharging and for a 0.5 s pulse when it is ready again (reduced motion:
// held full for that 0.5 s, no pulse).

const SIZE = 140;
const DASH_R = 50;
const SHIELD_R = 57;
const SHIELD_SEGMENTS = 10;
// Under the ship, from 140° (lower left) round to 40° (lower right).
const FROM = 140;
const TO = 40;
export const READY_PULSE_MS = 500;

const f = (n) => Math.round(n * 10) / 10;
const point = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return `${f(r * Math.cos(a))} ${f(r * Math.sin(a))}`;
};
// An arc from `a0` to `a1` degrees, drawn toward the smaller angle.
const arc = (r, a0, a1) => `M${point(r, a0)}A${r} ${r} 0 0 0 ${point(r, a1)}`;

const SHIELD_SEGMENT_PATHS = Array.from({ length: SHIELD_SEGMENTS }, (_, i) => {
  const step = (FROM - TO) / SHIELD_SEGMENTS;
  const a0 = FROM - i * step - 1.5;
  return `<path class="rc-seg" d="${arc(SHIELD_R, a0, a0 - step + 3)}"/>`;
}).join('');

const MARKUP = `
        <svg class="rc" viewBox="${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}" aria-hidden="true">
          <g class="rc-dash">
            <path class="rc-track" d="${arc(DASH_R, FROM, TO)}"/>
            <path class="rc-fill" d="${arc(DASH_R, FROM, TO)}" pathLength="1" stroke-dasharray="0 1"/>
          </g>
          <g class="rc-shield">${SHIELD_SEGMENT_PATHS}</g>
        </svg>`;

const CSS = `
            .rc { position: absolute; left: 0; top: 0; width: calc(${SIZE}px * var(--hud-u)); height: calc(${SIZE}px * var(--hud-u)); overflow: visible; pointer-events: none; transform: translate(-50%, -50%); }
            .rc.is-hidden { display: none; }
            .rc-dash, .rc-shield { opacity: 0; transition: opacity var(--motion-base) var(--ease-out); transform-origin: 0 0; }
            .rc-dash.is-on, .rc-shield.is-on { opacity: 1; }
            .rc path { fill: none; stroke-linecap: round; }
            .rc-track { stroke: color-mix(in srgb, var(--accent) 20%, transparent); stroke-width: 2; }
            .rc-fill { stroke: var(--accent); stroke-width: 2; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent) 60%, transparent)); }
            .rc-seg { stroke: color-mix(in srgb, var(--accent) 22%, transparent); stroke-width: 1.5; stroke-linecap: butt; }
            .rc-seg.is-lit { stroke: var(--accent); }
            @media (prefers-reduced-motion: no-preference) {
                html:not([data-motion='reduced']) body:not(.motion-reduced) .rc .is-ready { animation: rc-ready ${READY_PULSE_MS}ms var(--ease-out) forwards; }
            }
            @keyframes rc-ready { 0% { transform: scale(1); filter: brightness(1); } 25% { transform: scale(1.06); filter: brightness(1.8); } 100% { transform: scale(1); filter: brightness(1); opacity: 0; } }`;

export default {
  slot: 'recharges',
  id: 'instrument',
  name: 'Instrument',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.svg = q('.rc');
    this.dash = {
      group: q('.rc-dash'),
      fill: q('.rc-fill'),
      last: 0,
      readyUntil: 0,
      shown: null,
    };
    this.shield = {
      group: q('.rc-shield'),
      segments: [...container.querySelectorAll('.rc-seg')],
      last: 0,
      readyUntil: 0,
      shown: null,
    };
    this.at = null;
  },

  update({ now, ship, dash, shield }) {
    const at = ship
      ? `${((ship.x / 800) * 100).toFixed(2)}%|${((ship.y / 600) * 100).toFixed(2)}%`
      : null;
    if (at !== this.at) {
      this.at = at;
      this.svg.classList.toggle('is-hidden', !at);
      if (at) {
        const [left, top] = at.split('|');
        this.svg.style.left = left;
        this.svg.style.top = top;
      }
    }
    this.meter(this.dash, dash, now, (fill) =>
      this.dash.fill.setAttribute('stroke-dasharray', `${fill} 1`)
    );
    this.meter(this.shield, shield, now, (fill) => {
      const lit = Math.round(fill * SHIELD_SEGMENTS);
      this.shield.segments.forEach((seg, i) =>
        seg.classList.toggle('is-lit', i < lit)
      );
    });
  },

  // One recharge: `cooldown` is what is left (1 just used, 0 ready). Shown
  // while it recharges and for READY_PULSE_MS once it is ready.
  meter(part, cooldown, now, draw) {
    const left = Math.min(1, Math.max(0, cooldown || 0));
    if (part.last > 0 && left === 0) part.readyUntil = now + READY_PULSE_MS;
    part.last = left;
    const charging = left > 0;
    const ready = !charging && now < part.readyUntil;
    const fill = charging ? (1 - left).toFixed(3) : '1';
    const shown = `${charging}|${ready}|${fill}`;
    if (shown === part.shown) return;
    part.shown = shown;
    part.group.classList.toggle('is-on', charging || ready);
    part.group.classList.toggle('is-ready', ready);
    draw(Number(fill));
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
  },
};
