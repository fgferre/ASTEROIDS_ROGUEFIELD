// src/modules/ui/hud/instruments/hull-ring/classic.js
//
// No ring: the low-hull warning of the HUD until 20/10, a red glow pulsing
// in from the screen's edges below 30 % hull, stronger below 15 %.

const LOW_HULL_PERCENT = 30;
const CRITICAL_HULL_PERCENT = 15;

const CSS = `
            .lowhp-vignette { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity var(--motion-base); box-shadow: inset 0 0 120px 24px var(--danger-line); }
            .lowhp-vignette.is-low { opacity: 0.6; }
            .lowhp-vignette.is-critical { opacity: 0.9; box-shadow: inset 0 0 130px 36px var(--danger-line), inset 0 0 28px 3px var(--danger); }
            @media (prefers-reduced-motion: no-preference) {
                .lowhp-vignette.is-low { animation: lowhp-pulse 0.83s ease-in-out infinite alternate; }
                .lowhp-vignette.is-critical { animation-name: lowhp-pulse-critical; }
            }
            @keyframes lowhp-pulse { from { opacity: 0.25; } to { opacity: 0.75; } }
            @keyframes lowhp-pulse-critical { from { opacity: 0.55; } to { opacity: 1; } }`;

export default {
  slot: 'hull-ring',
  id: 'classic',
  name: 'Classic',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style><div class="lowhp-vignette" id="ui-lowhp-vignette"></div>`;
    this.vignette = container.querySelector('.lowhp-vignette');
  },

  update({ hull, maxHull }) {
    const percent = (hull / maxHull) * 100;
    const alive = hull > 0;
    this.vignette.classList.toggle(
      'is-low',
      alive && percent < LOW_HULL_PERCENT
    );
    this.vignette.classList.toggle(
      'is-critical',
      alive && percent < CRITICAL_HULL_PERCENT
    );
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
  },
};
