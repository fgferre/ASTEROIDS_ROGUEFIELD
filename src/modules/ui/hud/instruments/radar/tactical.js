// src/modules/ui/hud/instruments/radar/tactical.js
//
// The tactical radar (HUD.md, owner's mock-up of 20/10): a 180 px disc at a
// 1080p window, centred on the ship, north up, at real scale — range rings
// at 400 and 800 field units, the field's border, the camera's view as
// corner brackets. What is in the view is dimmed (the player sees it), what
// is outside is bright; beyond the range, threats sit on the rim as chevrons
// or as wedges with a count. Calm 70 %, threat 100 %, a Warden's fight 55 %
// with the Warden and the ship at full strength. Reduced motion: no sweep.

import { RADAR_BUDGET } from '../../radar.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEG = 180 / Math.PI;
// The drawing's units (viewBox 0 0 180 180): centre, disc, rim scale.
const SIZE = 180;
const C = 90;
const DISC = 88;
const RIM = 86;
const RINGS = [400, 800];
const RING_LABEL_ANGLE = (Math.PI * 3) / 4;
const BRACKET = 6;
const CHEVRON_R = 82;
// Wedge counts sit just outside the rim, Herald distances just inside.
const COUNT_R = 103;
const DISTANCE_R = 70;
const HAZE_POOL = 16;
const LABEL_POOL = 12;

const f = (n) => Math.round(n * 10) / 10;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const HEX = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i + Math.PI / 6;
  return `${f(7.5 * Math.cos(a))},${f(7.5 * Math.sin(a))}`;
}).join(' ');

// A wedge on the rim, facing +x: 22° wide, from r 79 to the disc's edge.
const WEDGE = (() => {
  const a = 11 / DEG;
  const p = (r, t) => `${f(r * Math.cos(t))} ${f(r * Math.sin(t))}`;
  return `M${p(79, -a)}L${p(DISC, -a)}A${DISC} ${DISC} 0 0 1 ${p(DISC, a)}L${p(79, a)}A79 79 0 0 0 ${p(79, -a)}Z`;
})();

// Glyphs, centred on their point and facing +x; colour comes from the
// pooled <use> (its kind's class), which they inherit.
const GLYPHS = `
            <g id="rt-g-dot"><circle r="1"/></g>
            <g id="rt-g-machine"><path d="M3.4 0L-2.4 -2.7L-2.4 2.7Z"/></g>
            <g id="rt-g-fast"><path d="M-2.4 0H-10" fill="none" stroke-width="1.3" stroke-linecap="round" stroke-opacity="0.55"/><path d="M3.4 0L-2.4 -2.7L-2.4 2.7Z" stroke="none"/></g>
            <g id="rt-g-elite"><circle r="3.6" fill="none" stroke-width="1.4"/></g>
            <g id="rt-g-herald"><path d="M0 -4.6L4.6 0L0 4.6L-4.6 0Z" stroke-width="1"/></g>
            <g id="rt-g-warden"><polygon points="${HEX}" stroke-width="1.3"/></g>
            <g id="rt-g-pickup"><path d="M-1 -3.6H1V-1H3.6V1H1V3.6H-1V1H-3.6V-1H-1Z"/></g>
            <g id="rt-g-shell"><circle r="1" fill="none" stroke-width="1.2" vector-effect="non-scaling-stroke"/></g>
            <g id="rt-g-chevron"><path d="M-2.6 -3.6L3 0L-2.6 3.6L-0.8 0Z"/></g>
            <g id="rt-g-wedge"><path d="${WEDGE}"/></g>`;

const MARKUP = `
        <div class="rt" data-mode="calm">
          <div class="rt-frame">
            <svg viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true">
              <defs>
                <clipPath id="rt-disc"><circle cx="${C}" cy="${C}" r="${DISC}"/></clipPath>
                <radialGradient id="rt-haze"><stop offset="0" stop-color="#ffd700" stop-opacity="0.6"/><stop offset="1" stop-color="#ffd700" stop-opacity="0"/></radialGradient>
                ${GLYPHS}
              </defs>
              <circle class="rt-disc" cx="${C}" cy="${C}" r="${DISC}"/>
              <g clip-path="url(#rt-disc)">
                ${RINGS.map((d) => `<circle class="rt-ring" cx="${C}" cy="${C}" r="0"/><text class="rt-ring-label">${d}</text>`).join('')}
                <rect class="rt-field"/>
                <path class="rt-view"/>
              </g>
              <circle class="rt-rim" cx="${C}" cy="${C}" r="${DISC}"/>
              <line class="rt-north" x1="${C}" y1="2" x2="${C}" y2="7"/>
            </svg>
            <div class="rt-sweep"></div>
          </div>
          <svg class="rt-contacts" viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true">
            <g class="rt-hazes"></g>
            <g class="rt-blips"></g>
            <path class="rt-ship" d="M6 0L-4.4 -4.4L-2 0L-4.4 4.4Z"/>
          </svg>
          <div class="rt-labels"></div>
          <div class="rt-jam">NO SIGNAL</div>
        </div>`;

// Sized in the mock-up's px at a 1080p window, where the HUD's effective
// scale is 1.2 (viewportScaling.js); the HUD Scale setting scales it.
const CSS = `
            .rt { --rt-u: calc(var(--hud-scale-effective, 1.2) / 1.2); --rt-boss-light: color-mix(in srgb, var(--boss) 55%, white); position: relative; width: calc(${SIZE}px * var(--rt-u)); height: calc(${SIZE}px * var(--rt-u)); pointer-events: none; }
            .rt > *, .rt-frame > * { position: absolute; inset: 0; width: 100%; height: 100%; }
            .rt svg { display: block; overflow: visible; }
            .rt-frame { opacity: 0.7; transition: opacity var(--motion-base) var(--ease-out); }
            .rt[data-mode='threat'] .rt-frame { opacity: 1; transition-duration: 0ms; }
            .rt[data-mode='warden'] .rt-frame { opacity: 0.55; }
            .rt-disc { fill: var(--surface); }
            .rt-ring { fill: none; stroke: rgba(230, 238, 248, 0.16); }
            .rt-ring-label { font-family: var(--font-display); font-weight: 500; font-size: 9.5px; fill: rgba(230, 238, 248, 0.45); }
            .rt-field { fill: none; stroke: rgba(0, 242, 255, 0.42); }
            .rt-view { fill: none; stroke: rgba(230, 238, 248, 0.5); }
            .rt-rim { fill: none; stroke: rgba(230, 238, 248, 0.3); }
            .rt-north { stroke: rgba(230, 238, 248, 0.5); }
            .rt .rt-sweep { inset: 2.2%; width: auto; height: auto; border-radius: 50%; display: none; background: conic-gradient(from 0deg, transparent 0deg 300deg, color-mix(in srgb, var(--accent) 9%, transparent) 359.8deg, transparent 360deg); }
            @media (prefers-reduced-motion: no-preference) {
                html:not([data-motion='reduced']) body:not(.motion-reduced) .rt .rt-sweep { display: block; animation: rt-sweep 4s linear infinite; }
            }
            @keyframes rt-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .rt.is-jammed .rt-sweep { opacity: 0.2; }
            .rt-ship { fill: var(--accent); }
            .rt.is-jammed .rt-ship { display: none; }
            .rt-c { fill: var(--danger); stroke: none; }
            .rt-c.k-fast, .rt-c.k-shell { stroke: var(--danger); }
            .rt-c.k-rock, .rt-c.k-noise { fill: rgba(230, 238, 248, 0.62); }
            .rt-c.k-elite { stroke: var(--xp); }
            .rt-c.k-herald { fill: var(--boss); stroke: var(--rt-boss-light); }
            .rt-c.k-warden { fill: color-mix(in srgb, var(--boss) 45%, transparent); stroke: var(--rt-boss-light); }
            .rt-c.k-pickup { fill: var(--status); }
            .rt-c.is-rim.k-elite { fill: var(--xp); stroke: none; }
            .rt-c.is-rim.k-herald { fill: var(--rt-boss-light); stroke: none; }
            .rt-o.is-dim { opacity: 0.32; }
            .rt-o.is-phased { opacity: 0.35; }
            .rt[data-mode='threat'] .rt-o.is-dim { opacity: 0.45; }
            .rt[data-mode='warden'] .rt-o, .rt[data-mode='warden'] .rt-label { opacity: 0.55; }
            .rt[data-mode='warden'] .rt-o.is-dim { opacity: 0.25; }
            .rt[data-mode='warden'] .rt-o.k-warden { opacity: 1; }
            .rt-label { position: absolute; transform: translate(-50%, -50%); font-family: var(--font-display); font-weight: 600; font-size: calc(var(--text-md) * var(--rt-u)); line-height: 1; color: var(--danger); white-space: nowrap; text-shadow: 0 1px 2px rgba(2, 4, 8, 0.9); }
            .rt-label.k-elite { color: var(--xp); }
            .rt-label.k-herald { font-size: calc(var(--text-xs) * var(--rt-u)); letter-spacing: 0.08em; color: var(--rt-boss-light); }
            .rt .rt-jam { inset: 50% 0 auto; height: auto; transform: translateY(-50%); display: none; text-align: center; font-family: var(--font-display); font-size: calc(var(--text-sm) * var(--rt-u)); font-weight: 700; letter-spacing: 0.3em; margin-right: -0.3em; color: var(--xp); text-shadow: 0 0 8px var(--xp), 0 1px 0 rgba(0, 0, 0, 0.8); }
            .rt.is-jammed .rt-jam { display: block; }`;

// Pooled elements, hidden; `last` holds what was written, so a frame only
// touches what changed.
function pool(parent, count, make) {
  return Array.from({ length: count }, () => {
    const el = make();
    el.style.display = 'none';
    parent.appendChild(el);
    return { el, last: { 'style.display': 'none' } };
  });
}

function write(slot, name, value) {
  if (slot.last[name] === value) return;
  slot.last[name] = value;
  slot.el.setAttribute(name, value);
}

function setStyle(slot, name, value) {
  const key = `style.${name}`;
  if (slot.last[key] === value) return;
  slot.last[key] = value;
  slot.el.style[name] = value;
}

const show = (slot, visible) =>
  setStyle(slot, 'display', visible ? '' : 'none');

function glyphOf(b) {
  if (b.rim) return b.count > 1 ? 'wedge' : 'chevron';
  return b.kind === 'rock' || b.kind === 'noise' ? 'dot' : b.kind;
}

function transformOf(b) {
  if (b.rim) {
    const turn = `rotate(${f(b.angle * DEG)})`;
    if (b.count > 1) return `translate(${C} ${C}) ${turn}`;
    return `translate(${f(C + b.x * CHEVRON_R)} ${f(C + b.y * CHEVRON_R)}) ${turn}`;
  }
  const at = `translate(${f(C + b.x * RIM)} ${f(C + b.y * RIM)})`;
  switch (b.kind) {
    case 'machine':
    case 'fast':
      return `${at} rotate(${f(b.heading * DEG)})`;
    case 'rock':
      return `${at} scale(${f(clamp(b.size * RIM * 0.6, 0.9, 2.4))})`;
    case 'noise':
      return `${at} scale(1.1)`;
    case 'shell':
      return `${at} scale(${f(Math.max(0.6, b.size * RIM * (1 - b.progress)))})`;
    default:
      return at;
  }
}

function classOf(b) {
  return `rt-o rt-c k-${b.kind}${b.rim ? ' is-rim' : ''}${b.inView ? ' is-dim' : ''}${b.phased ? ' is-phased' : ''}`;
}

// The camera's view as four corner brackets, in the drawing's units.
function bracketPath(view, ship, k) {
  if (!view) return '';
  const x0 = C + (view.x - ship.x) * k;
  const y0 = C + (view.y - ship.y) * k;
  const x1 = x0 + view.width * k;
  const y1 = y0 + view.height * k;
  return [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x0, y1, 1, -1],
    [x1, y1, -1, -1],
  ]
    .map(
      ([x, y, sx, sy]) =>
        `M${f(x + sx * BRACKET)} ${f(y)}H${f(x)}V${f(y + sy * BRACKET)}`
    )
    .join('');
}

export default {
  slot: 'radar',
  id: 'tactical',
  name: 'Tactical',
  // Field units from the ship to the rim: the 800 ring sits inside it.
  range: 900,

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.root = q('.rt');
    this.rings = [...container.querySelectorAll('.rt-ring')];
    this.ringLabels = [...container.querySelectorAll('.rt-ring-label')];
    this.field = { el: q('.rt-field'), last: {} };
    this.view = { el: q('.rt-view'), last: {} };
    this.ship = { el: q('.rt-ship'), last: {} };
    const svg = (name) => () => document.createElementNS(SVG_NS, name);
    this.blips = pool(q('.rt-blips'), RADAR_BUDGET, svg('use'));
    this.hazes = pool(q('.rt-hazes'), HAZE_POOL, svg('circle'));
    this.labels = pool(q('.rt-labels'), LABEL_POOL, () =>
      document.createElement('span')
    );
    this.mode = null;
    this.jammed = null;
    this.ringsRange = null;
  },

  update(state) {
    const { range, ship, field } = state;
    if (state.mode !== this.mode) {
      this.mode = state.mode;
      this.root.dataset.mode = state.mode;
    }
    if (state.jammed !== this.jammed) {
      this.jammed = state.jammed;
      this.root.classList.toggle('is-jammed', state.jammed);
    }
    if (range !== this.ringsRange) {
      this.ringsRange = range;
      this.placeRings(range);
    }
    const k = RIM / range;
    write(this.field, 'x', f(C - ship.x * k));
    write(this.field, 'y', f(C - ship.y * k));
    write(this.field, 'width', f(field.width * k));
    write(this.field, 'height', f(field.height * k));
    write(this.view, 'd', bracketPath(state.view, ship, k));
    write(
      this.ship,
      'transform',
      `translate(${C} ${C}) rotate(${f(ship.angle * DEG)})`
    );
    this.drawBlips(state.blips);
    this.drawHaze(state.haze);
  },

  placeRings(range) {
    RINGS.forEach((distance, i) => {
      const r = (distance / range) * RIM;
      this.rings[i].setAttribute('r', f(r));
      const label = this.ringLabels[i];
      label.setAttribute('x', f(C + r * Math.cos(RING_LABEL_ANGLE) + 4));
      label.setAttribute('y', f(C + r * Math.sin(RING_LABEL_ANGLE) - 2));
    });
  },

  drawBlips(blips) {
    let labels = 0;
    for (let i = 0; i < this.blips.length; i += 1) {
      const slot = this.blips[i];
      const b = blips[i];
      show(slot, Boolean(b));
      if (!b) continue;
      write(slot, 'href', `#rt-g-${glyphOf(b)}`);
      write(slot, 'class', classOf(b));
      write(slot, 'transform', transformOf(b));
      const counted = b.rim && b.count > 1;
      if (!counted && !(b.rim && b.kind === 'herald')) continue;
      if (labels >= this.labels.length) continue;
      const label = this.labels[labels];
      labels += 1;
      const r = counted ? COUNT_R : DISTANCE_R;
      const text = counted
        ? String(b.count)
        : `${Math.round(b.distance / 10) * 10} m`;
      show(label, true);
      if (label.last.text !== text) {
        label.last.text = text;
        label.el.textContent = text;
      }
      write(label, 'class', `rt-label k-${b.kind}`);
      setStyle(label, 'left', `${f(((C + b.x * r) / SIZE) * 100)}%`);
      setStyle(label, 'top', `${f(((C + b.y * r) / SIZE) * 100)}%`);
    }
    for (let i = labels; i < this.labels.length; i += 1) {
      show(this.labels[i], false);
    }
  },

  drawHaze(haze) {
    for (let i = 0; i < this.hazes.length; i += 1) {
      const slot = this.hazes[i];
      const h = haze[i];
      show(slot, Boolean(h));
      if (!h) continue;
      write(slot, 'class', `rt-o rt-hz${h.inView ? ' is-dim' : ''}`);
      write(slot, 'fill', 'url(#rt-haze)');
      write(slot, 'cx', f(C + h.x * RIM));
      write(slot, 'cy', f(C + h.y * RIM));
      write(slot, 'r', f(Math.min(9, 4 + 1.2 * Math.sqrt(h.weight))));
    }
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
    this.root = null;
    this.blips = [];
    this.hazes = [];
    this.labels = [];
  },
};
