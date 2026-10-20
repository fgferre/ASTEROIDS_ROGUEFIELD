// src/modules/ui/hud/instruments/warden/instrument.js
//
// The Warden on top (HUD.md, now; owner's mock-up of 20/10): its name beside
// a violet hexagon, "PHASE n/m" at the right, and one violet bar split into
// its phase segments, draining right to left. While the Warden is off
// screen, a hexagon on the screen's edge points at it with its distance —
// the only marker it gets (the HUD's edge arrows skip it). A Herald gets a
// shorter bar with one segment. Hits brighten the bar for 120 ms (not with
// reduced motion); the bar enters and leaves in 250 ms.

import { bossSegments } from '../../hudCommon.js';

export const HIT_FLASH_MS = 120;

const HEX = '6.1,3.5 0,7 -6.1,3.5 -6.1,-3.5 0,-7 6.1,-3.5';

const MARKUP = `
        <div class="ins wd">
          <div class="wd-head">
            <svg class="wd-hex" viewBox="-8 -8 16 16" aria-hidden="true"><polygon points="${HEX}"/></svg>
            <span class="wd-name"></span>
            <span class="ins-lbl wd-phase"></span>
          </div>
          <div class="wd-segs"></div>
        </div>`;

const MARKER = `
          <svg viewBox="-24 -24 48 48" aria-hidden="true">
            <polygon points="7.8,4.5 0,9 -7.8,4.5 -7.8,-4.5 0,-9 7.8,-4.5"/>
            <path class="wd-chevron" d="M22 0L13 -7L15.5 0L13 7Z"/>
          </svg>
          <span class="wd-dist"></span>`;

const CSS = `
            .wd { width: calc(760px * var(--hud-u)); opacity: 0; transform: translateY(calc(-8px * var(--hud-u))); transition: opacity var(--motion-base) var(--ease-out), transform var(--motion-base) var(--ease-out); }
            .wd.is-on { opacity: 1; transform: none; }
            .wd.is-herald { width: calc(480px * var(--hud-u)); }
            .wd-head { display: flex; align-items: center; gap: calc(var(--space-2) * var(--hud-u)); margin-bottom: calc(6px * var(--hud-u)); }
            .wd-hex { width: calc(16px * var(--hud-u)); height: calc(16px * var(--hud-u)); overflow: visible; }
            .wd-hex polygon, .wd-marker polygon { fill: color-mix(in srgb, var(--boss) 45%, transparent); stroke: var(--boss-light); stroke-width: 1.4; }
            .wd-name { font-weight: 700; font-size: calc(var(--text-lg) * var(--hud-u)); letter-spacing: 0.24em; line-height: 1; text-transform: uppercase; }
            .wd-phase { margin-left: auto; color: var(--boss-light); }
            .wd-segs { display: grid; gap: calc(3px * var(--hud-u)); height: calc(10px * var(--hud-u)); }
            .wd-seg { position: relative; overflow: hidden; background: color-mix(in srgb, var(--boss) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--boss) 35%, transparent); }
            .wd-seg i { position: absolute; left: 0; top: 0; bottom: 0; display: block; background: linear-gradient(to bottom, var(--boss-light) 0 2px, var(--boss) 2px); box-shadow: 0 0 10px color-mix(in srgb, var(--boss) 70%, transparent); transition: width 0.3s var(--ease-out); }
            .wd.is-invulnerable .wd-seg i { filter: grayscale(0.45) brightness(0.75); opacity: 0.65; }
            .wd.is-invulnerable .wd-seg::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(-45deg, transparent 0 5px, rgba(230, 238, 248, 0.18) 5px 6px); }
            @media (prefers-reduced-motion: no-preference) {
                html:not([data-motion='reduced']) body:not(.motion-reduced) .wd.is-hit .wd-seg i { filter: brightness(1.7); }
            }
            .wd-marker { position: absolute; width: 0; height: 0; display: none; pointer-events: none; }
            .wd-marker.is-on { display: block; }
            .wd-marker svg { position: absolute; left: calc(-24px * var(--hud-u)); top: calc(-24px * var(--hud-u)); width: calc(48px * var(--hud-u)); height: calc(48px * var(--hud-u)); overflow: visible; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--boss) 80%, transparent)); }
            .wd-chevron { fill: var(--boss-light); }
            .wd-dist { position: absolute; transform: translate(-50%, -50%); font-family: var(--font-display); font-weight: 600; font-size: calc(var(--text-sm) * var(--hud-u)); letter-spacing: 0.08em; color: var(--boss-light); white-space: nowrap; text-shadow: 0 1px 2px rgba(2, 4, 8, 0.9); }
            .wd-marker[data-edge='top'] .wd-dist { left: 0; top: calc(34px * var(--hud-u)); }
            .wd-marker[data-edge='bottom'] .wd-dist { left: 0; top: calc(-34px * var(--hud-u)); }
            .wd-marker[data-edge='left'] .wd-dist { left: calc(52px * var(--hud-u)); top: 0; }
            .wd-marker[data-edge='right'] .wd-dist { left: calc(-52px * var(--hud-u)); top: 0; }`;

const f = (n) => Math.round(n * 100) / 100;

export default {
  slot: 'warden',
  id: 'instrument',
  name: 'Instrument',
  // Draws its own screen-edge marker: the HUD's arrows leave Wardens out.
  edgeMarker: true,

  mount(container, screen) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.root = q('.wd');
    this.name = q('.wd-name');
    this.phase = q('.wd-phase');
    this.segs = q('.wd-segs');
    this.fills = [];
    this.marker = document.createElement('div');
    this.marker.className = 'wd-marker';
    this.marker.innerHTML = MARKER;
    screen.appendChild(this.marker);
    this.chevron = this.marker.querySelector('.wd-chevron');
    this.dist = this.marker.querySelector('.wd-dist');
    this.lastPercent = null;
    this.hitUntil = 0;
    this.shown = {};
  },

  update(state) {
    const { now } = state;
    const on = state.active && state.shown;
    this.toggle('is-on', on);
    this.updateMarker(state.active ? state.marker : null);
    if (!state.active) {
      this.lastPercent = null;
      return;
    }
    this.toggle('is-herald', state.herald);
    this.toggle('is-invulnerable', state.invulnerable);
    if (this.lastPercent !== null && state.percent < this.lastPercent) {
      this.hitUntil = now + HIT_FLASH_MS;
    }
    this.lastPercent = state.percent;
    this.toggle('is-hit', now < this.hitUntil);

    const name = state.name || 'WARDEN';
    if (name !== this.shown.name)
      this.name.textContent = this.shown.name = name;
    const phase =
      state.phaseCount > 1
        ? `PHASE ${state.phase + 1}/${state.phaseCount}`
        : '';
    if (phase !== this.shown.phase)
      this.phase.textContent = this.shown.phase = phase;

    const segments = bossSegments(state.phaseCount, state.phase);
    const layout = segments.map((seg) => `${f(seg.width)}fr`).join(' ');
    if (layout !== this.shown.layout) {
      this.shown.layout = layout;
      this.segs.style.gridTemplateColumns = layout;
      const segs = segments.map(() => {
        const seg = document.createElement('div');
        seg.className = 'wd-seg';
        seg.appendChild(document.createElement('i'));
        return seg;
      });
      this.segs.replaceChildren(...segs);
      this.fills = segs.map((seg) => seg.firstChild);
      this.shown.fills = [];
    }
    segments.forEach((seg, i) => {
      const part = Math.max(
        0,
        Math.min(1, (state.percent - seg.left) / seg.width)
      );
      const width = `${f(part * 100)}%`;
      if (width === this.shown.fills[i]) return;
      this.shown.fills[i] = width;
      this.fills[i].style.width = width;
    });
  },

  updateMarker(marker) {
    const key = marker
      ? `${f(marker.left)}|${f(marker.top)}|${f(marker.angle)}|${marker.edge}|${Math.round(marker.distance / 10) * 10}`
      : '';
    if (key === this.shown.marker) return;
    this.shown.marker = key;
    this.marker.classList.toggle('is-on', Boolean(marker));
    if (!marker) return;
    this.marker.dataset.edge = marker.edge;
    this.marker.style.left = `${f(marker.left)}%`;
    this.marker.style.top = `${f(marker.top)}%`;
    this.chevron.setAttribute(
      'transform',
      `rotate(${f((marker.angle * 180) / Math.PI)})`
    );
    this.dist.textContent = `${Math.round(marker.distance / 10) * 10} m`;
  },

  toggle(name, on) {
    if (this.shown[name] === on) return;
    this.shown[name] = on;
    this.root.classList.toggle(name, on);
  },

  destroy() {
    this.marker.remove();
    this.container.innerHTML = '';
    this.container = null;
    this.marker = null;
  },
};
