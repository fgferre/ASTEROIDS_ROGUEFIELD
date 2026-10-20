// src/modules/ui/hud/instruments/vitals/instrument.js
//
// Hull and shield in one capsule, bottom left (the owner's pick of 20/10,
// casco-escudo-ativo.html, wired as it came): the hull is ten white cells
// (10 % each) inside a rounded capsule, the shield a cyan stroke round the
// capsule filling from the left with the shield's HP; HULL and its number
// on the left, SHIELD and a smaller one on the right, a status line under
// them. The shield's four states come from the deflector itself:
//   locked    no shield card yet: the outline thin and grey, NOT INSTALLED
//   ready     "<key> ACTIVATE", the key the player bound
//   active    the HP left, ACTIVE
//   cooldown  the seconds left in amber over a thin amber bar
// Taking the shield card lights the outline cyan round its length once
// (Reduce Motion: a plain fade). A hull hit leaves a white chip that drains
// into the cells; below 30 % the hull turns red.

export const INSTALL_MS = 600;
export const CHIP_HOLD_MS = 300;
// Hull % per second the chip drains once its hold is over.
export const CHIP_DRAIN = 60;
const LOW_HULL_PERCENT = 30;
const CELLS = 10;
// The capsule's inner width the hull fills (x 22 → 378).
const HULL_SPAN = 356;
const GAUGE_WIDTH = 400;

const CAPSULE =
  'M24 6 H376 Q394 6 394 24 V30 Q394 48 376 48 H24 Q6 48 6 30 V24 Q6 6 24 6 Z';

const cells = () =>
  Array.from(
    { length: CELLS },
    (_, i) =>
      `<rect x="${(22 + i * 35.9).toFixed(2)}" y="19" width="32.9" height="16" rx="1"/>`
  ).join('');

const MARKUP = `
        <div class="ins ins-glance vt" data-state="locked">
          <div class="vt-readouts">
            <div class="vt-hull-readout">
              <span class="vt-label">HULL</span>
              <span class="vt-hull-value"><b>100</b><span class="vt-unit">%</span></span>
            </div>
            <div class="vt-shield-readout">
              <span class="vt-label">SHIELD</span>
              <span class="vt-shield-value"><b></b><span class="vt-unit"></span></span>
            </div>
          </div>
          <svg class="vt-gauge" viewBox="0 0 400 54" aria-hidden="true">
            <defs>
              <clipPath id="vt-hull-clip"><rect class="vt-hull-clip" x="22" y="19" width="${HULL_SPAN}" height="16"/></clipPath>
              <clipPath id="vt-chip-clip"><rect class="vt-chip-clip" x="22" y="19" width="0" height="16"/></clipPath>
              <clipPath id="vt-shield-clip"><rect class="vt-shield-clip" x="0" y="0" width="0" height="54"/></clipPath>
            </defs>
            <path class="vt-shield-track" d="${CAPSULE}"/>
            <path class="vt-shield-energy" clip-path="url(#vt-shield-clip)" d="${CAPSULE}"/>
            <path class="vt-install" d="${CAPSULE}" pathLength="1"/>
            <g class="vt-hull-track">${cells()}</g>
            <g class="vt-hull-chip" clip-path="url(#vt-chip-clip)">${cells()}</g>
            <g class="vt-hull-fill" clip-path="url(#vt-hull-clip)">${cells()}</g>
          </svg>
          <div class="vt-statusline">
            <span class="vt-locked">NOT INSTALLED</span>
            <span class="vt-activation"><kbd>E</kbd><span>ACTIVATE</span></span>
            <span class="vt-online">ACTIVE</span>
            <div class="vt-cooling">
              <span>COOLDOWN</span>
              <div class="vt-cooling-track"><div class="vt-cooling-fill"></div></div>
            </div>
          </div>
        </div>`;

// The proposal's sizes, spacing and letter-spacing as they came, × --hud-u.
const u = (px) => `calc(${px}px * var(--hud-u))`;
const CSS = `
            .vt { --vt-track: #242f3c; --vt-muted: #8a99aa; --vt-amber: #ffb347; width: ${u(400)}; font-family: var(--font-display); font-weight: 500; letter-spacing: 0.035em; font-variant-numeric: tabular-nums; }
            #hud-layer .vt.is-critical { opacity: 1; }
            .vt-readouts { display: flex; align-items: baseline; justify-content: space-between; gap: ${u(18)}; padding: 0 ${u(13)} ${u(9)}; }
            .vt-hull-readout, .vt-shield-readout { display: flex; align-items: baseline; gap: ${u(11)}; white-space: nowrap; }
            .vt-label { font-size: ${u(11)}; letter-spacing: 0.13em; }
            .vt-hull-value { font-size: ${u(26)}; line-height: 1.15; font-weight: 600; letter-spacing: 0; }
            .vt-hull-value b, .vt-shield-value b { font-weight: inherit; }
            .vt-unit { font-size: 0.65em; margin-left: ${u(3)}; }
            .vt-shield-readout { color: var(--accent); }
            .vt-shield-value { font-size: ${u(16)}; letter-spacing: 0; }
            .vt-gauge { display: block; width: 100%; height: auto; overflow: visible; }
            .vt-shield-track { fill: none; stroke: var(--vt-track); stroke-width: 7; }
            .vt-shield-energy { fill: none; stroke: var(--accent); stroke-width: 7; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent) 27%, transparent)); }
            .vt-install { fill: none; stroke: var(--accent); stroke-width: 3; opacity: 0; stroke-dasharray: 1 1; filter: drop-shadow(0 0 4px var(--accent)); }
            .vt-hull-track { fill: var(--vt-track); }
            .vt-hull-chip { fill: var(--text); opacity: 0.55; }
            .vt-hull-fill { fill: var(--text); }
            .vt-statusline { height: ${u(28)}; padding: ${u(7)} ${u(13)} 0; display: flex; justify-content: flex-end; align-items: flex-start; box-sizing: border-box; font-family: var(--font-ui); font-size: ${u(12)}; font-weight: 600; letter-spacing: 0.14em; }
            .vt-statusline > * { display: none; }
            .vt-locked { color: var(--vt-muted); }
            .vt-activation { align-items: center; gap: ${u(7)}; color: var(--text); }
            .vt-activation kbd { font: inherit; letter-spacing: 0; padding: 0 ${u(4)}; min-width: ${u(12)}; line-height: ${u(17)}; text-align: center; color: var(--text); border: 1px solid #788da3; border-radius: 2px; }
            .vt-online { color: var(--accent); }
            .vt-cooling { align-items: center; gap: ${u(9)}; color: var(--vt-muted); }
            .vt-cooling-track { width: ${u(75)}; height: ${u(3)}; background: var(--vt-track); }
            .vt-cooling-fill { height: 100%; width: 0; background: var(--vt-amber); }
            .vt[data-state='locked'] .vt-locked, .vt[data-state='ready'] .vt-activation, .vt[data-state='active'] .vt-online, .vt[data-state='cooldown'] .vt-cooling { display: flex; }
            .vt:not([data-state='active']) .vt-shield-energy { visibility: hidden; }
            .vt[data-state='locked'] .vt-shield-track { stroke-width: 1.5; stroke: #53657a; opacity: 0.35; }
            .vt[data-state='locked'] .vt-shield-readout { color: var(--vt-muted); opacity: 0.45; }
            .vt[data-state='locked'] .vt-shield-value { display: none; }
            .vt[data-state='ready'] .vt-shield-track, .vt[data-state='cooldown'] .vt-shield-track { stroke-width: 1.5; stroke: #53657a; opacity: 0.7; }
            .vt[data-state='ready'] .vt-shield-readout { color: #adb9c7; }
            .vt[data-state='cooldown'] .vt-shield-readout { color: var(--vt-amber); }
            .vt.is-critical .vt-hull-value { color: var(--danger); }
            .vt.is-critical .vt-hull-fill { fill: var(--danger); }
            /* The shield card taken: the outline lights cyan round its length once; with
               Reduce Motion (the system's or the game's) it fades in and out instead. */
            .vt.is-installing .vt-install { animation: vt-install ${INSTALL_MS}ms var(--ease-out) forwards; }
            @media (prefers-reduced-motion: reduce) {
                .vt.is-installing .vt-install { animation-name: vt-install-fade; }
            }
            html[data-motion='reduced'] .vt.is-installing .vt-install, body.motion-reduced .vt.is-installing .vt-install { animation: vt-install-fade ${INSTALL_MS}ms ease-out forwards !important; animation-duration: ${INSTALL_MS}ms !important; }
            @keyframes vt-install { 0% { stroke-dashoffset: 1; opacity: 1; } 80% { stroke-dashoffset: 0; opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }
            @keyframes vt-install-fade { 0% { stroke-dashoffset: 0; opacity: 0; } 40% { stroke-dashoffset: 0; opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }`;

const f = (n) => (Math.round(n * 100) / 100).toString();

export default {
  slot: 'vitals',
  id: 'instrument',
  name: 'Instrument',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.root = q('.vt');
    this.hullValue = q('.vt-hull-value b');
    this.shieldValue = q('.vt-shield-value b');
    this.shieldUnit = q('.vt-shield-value .vt-unit');
    this.hullClip = q('.vt-hull-clip');
    this.chipClip = q('.vt-chip-clip');
    this.shieldClip = q('.vt-shield-clip');
    this.key = q('.vt-activation kbd');
    this.coolingFill = q('.vt-cooling-fill');
    this.shown = {};
    this.mode = null;
    this.installUntil = 0;
    this.lastHull = null;
    this.chip = 0;
    this.chipHoldUntil = 0;
    this.lastNow = null;
  },

  update(state) {
    const { now, shieldMode: mode } = state;
    const hull = state.hull > 0 ? (state.hull / state.maxHull) * 100 : 0;

    // The shield card was just taken: one sweep of light round the outline.
    if (this.mode === 'locked' && mode !== 'locked') {
      this.installUntil = now + INSTALL_MS;
    }
    this.mode = mode;
    this.set('mode', mode, () => {
      this.root.dataset.state = mode;
    });
    this.toggle('is-installing', now < this.installUntil);
    this.toggle('is-critical', hull < LOW_HULL_PERCENT);

    this.set('hull', String(Math.round(hull)), (text) => {
      this.hullValue.textContent = text;
    });
    this.set('hullClip', f((HULL_SPAN * hull) / 100), (width) =>
      this.hullClip.setAttribute('width', width)
    );
    this.updateChip(hull, now);

    let value = '';
    let unit = '';
    if (mode === 'active') {
      const fraction = state.maxShield > 0 ? state.shield / state.maxShield : 0;
      value = String(Math.round(fraction * 100));
      unit = '%';
      this.set('shieldClip', f(GAUGE_WIDTH * fraction), (width) =>
        this.shieldClip.setAttribute('width', width)
      );
    } else if (mode === 'cooldown') {
      value = state.shieldSeconds.toFixed(1);
      unit = 's';
      this.set(
        'cooling',
        `${f(100 * (1 - state.shieldCooldown))}%`,
        (width) => {
          this.coolingFill.style.width = width;
        }
      );
    } else if (mode === 'ready') {
      value = 'READY';
      this.set('key', state.shieldKey, (key) => {
        this.key.textContent = key;
      });
    }
    this.set('shieldValue', value, (text) => {
      this.shieldValue.textContent = text;
    });
    this.set('shieldUnit', unit, (text) => {
      this.shieldUnit.textContent = text;
    });
  },

  // What a hit took stays white for CHIP_HOLD_MS, then drains into the
  // cells at CHIP_DRAIN % a second.
  updateChip(hull, now) {
    if (this.lastHull !== null && hull < this.lastHull) {
      this.chip = Math.max(this.chip, this.lastHull);
      this.chipHoldUntil = now + CHIP_HOLD_MS;
    }
    if (now >= this.chipHoldUntil && this.lastNow !== null) {
      this.chip -= (CHIP_DRAIN * (now - this.lastNow)) / 1000;
    }
    this.chip = Math.max(hull, this.chip);
    this.lastHull = hull;
    this.lastNow = now;
    this.set('chipClip', f((HULL_SPAN * this.chip) / 100), (width) =>
      this.chipClip.setAttribute('width', width)
    );
  },

  // Writes the DOM only when what it shows changed.
  set(name, value, write) {
    if (this.shown[name] === value) return;
    this.shown[name] = value;
    write(value);
  },

  toggle(name, on) {
    this.set(name, on, () => this.root.classList.toggle(name, on));
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
  },
};
