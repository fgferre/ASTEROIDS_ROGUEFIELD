// src/modules/ui/hud/instruments/radar/classic.js
//
// The first radar (until 20/10): a decagon over an analog ring, a conic
// sweep, one dot per contact within its range. It draws only what is in
// range: no camera view, no rim markers, no crowds, no XP.

const RADAR_SIZE = 220;
const RADAR_POOL_SIZE = 80;
// A phased Shade's blip (it can't be hit or locked while phased).
const RADAR_PHASED_ALPHA = 0.35; // proposta 18/10
// The dot for each radar kind; a fast machine is a machine, shells have none.
const DOT = {
  rock: 'rock',
  machine: 'machine',
  fast: 'machine',
  elite: 'elite',
  herald: 'herald',
  warden: 'warden',
  pickup: 'pickup',
  noise: 'noise',
};

const MARKUP = `
                <div class="radar-structure">
                    <svg class="radar-svg-layer" viewBox="0 0 220 220">
                        <circle class="radar-ring" cx="110" cy="110" r="108" />
                        <circle class="radar-ring-dash" cx="110" cy="110" r="100" />
                        <polygon class="radar-outline" points="110,15 166,33 200,81 200,139 166,187 110,205 54,187 20,139 20,81 54,33" />
                        <line class="radar-axis" x1="110" y1="15" x2="110" y2="205" />
                        <line class="radar-axis" x1="20" y1="139" x2="200" y2="81" />
                        <line class="radar-axis" x1="20" y1="81" x2="200" y2="139" />
                        <line class="radar-axis" x1="166" y1="33" x2="54" y2="187" />
                        <line class="radar-axis" x1="54" y1="33" x2="166" y2="187" />
                        <polygon class="radar-inner" points="110,53 144,64 164,93 164,127 144,156 110,167 76,156 56,127 56,93 76,64" />
                    </svg>

                    <div class="radar-mask">
                        <div class="radar-sweep"></div>
                        <div class="blip-container">
                            <div class="blip player"></div>
                        </div>
                    </div>
                    <div class="radar-jam-label">NO SIGNAL</div>
                </div>`;

const CSS = `
            .radar-structure { width: 220px; height: 220px; position: relative; }
            .radar-svg-layer { position: absolute; inset: 0; z-index: 5; pointer-events: none; fill: none; }
            .radar-ring { stroke: var(--neutral, #00aaff); stroke-width: 2; stroke-opacity: 0.6; }
            .radar-ring-dash { stroke: var(--accent, #00f2ff); stroke-width: 1; stroke-dasharray: 4 6; opacity: 0.3; }
            .radar-outline { stroke: var(--accent, #00f2ff); stroke-width: 1.5; opacity: 0.8; }
            .radar-axis { stroke: var(--neutral, #00aaff); stroke-width: 1; opacity: 0.1; }
            .radar-inner { stroke: var(--neutral, #00aaff); stroke-width: 1; opacity: 0.2; }
            .radar-mask {
                position: absolute; inset: 0; z-index: 2; background: var(--surface, rgba(0, 10, 20, 0.5));
                clip-path: polygon(50% 7%, 75.5% 15%, 91% 37%, 91% 63%, 75.5% 85%, 50% 93%, 24.5% 85%, 9% 63%, 9% 37%, 24.5% 15%);
            }
            .radar-sweep { position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: conic-gradient(from 0deg, transparent 0%, transparent 60%, transparent 80%, var(--glow-accent, rgba(0, 242, 255, 0.35)) 100%); animation: radar-sweep-anim 4s linear infinite; border-radius: 50%; mix-blend-mode: screen; pointer-events: none; }
            .blip-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; }
            .blip { position: absolute; top: 0; left: 0; border-radius: 50%; box-shadow: 0 0 6px 1px currentColor; will-change: transform; }
            .blip.rock { width: 5px; height: 5px; background: var(--text-dim); color: var(--text-dim); box-shadow: none; }
            .blip.machine { width: 8px; height: 7px; border-radius: 0; background: var(--danger); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
            .blip.elite { width: 9px; height: 9px; box-sizing: border-box; border: 2px solid var(--xp); color: var(--xp); }
            .blip.herald { width: 11px; height: 11px; border-radius: 0; background: var(--boss); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
            .blip.warden { width: 13px; height: 12px; border-radius: 0; background: var(--danger); clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); }
            .blip.pickup { width: 7px; height: 7px; border-radius: 0; background: var(--status); clip-path: polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%); }
            .blip.noise { width: 3px; height: 3px; background: var(--text-dim); color: var(--text-dim); box-shadow: none; }
            .radar-jam-label { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); z-index: 20; display: none; text-align: center; font-family: var(--font-display); font-size: var(--text-sm); font-weight: 700; letter-spacing: 0.3em; margin-right: -0.3em; color: var(--xp); text-shadow: 0 0 8px var(--xp), 0 1px 0 rgba(0, 0, 0, 0.8); pointer-events: none; }
            .radar-structure.is-jammed .radar-jam-label { display: block; }
            .radar-structure.is-jammed .radar-sweep { opacity: 0.2; }
            .radar-structure.is-jammed .blip.player { display: none; }
            .blip.player { top: 50%; left: 50%; width: 8px; height: 8px; background: var(--text, #fff); border: 1px solid var(--accent, #00f2ff); color: var(--text, #fff); z-index: 15; transform: translate(-50%, -50%); }
            @keyframes radar-sweep-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;

/** The pooled blip elements, hidden, inside the radar's blip container. */
export function createBlipPool(container) {
  const pool = [];
  for (let i = 0; i < RADAR_POOL_SIZE; i += 1) {
    const el = document.createElement('div');
    el.className = 'blip machine';
    el.dataset.type = 'machine';
    el.style.display = 'none';
    container.appendChild(el);
    pool.push(el);
  }
  return pool;
}

/**
 * Lays the radar state's blips in range out on the pooled blips; the pool's
 * spare blips are hidden.
 */
export function drawBlips(pool, blips) {
  let used = 0;
  for (let i = 0; i < blips.length && used < pool.length; i += 1) {
    const b = blips[i];
    const type = DOT[b.kind];
    if (b.rim || !type) continue;
    const el = pool[used];
    used += 1;
    if (el.dataset.type !== type) {
      el.dataset.type = type;
      el.className = 'blip ' + type;
    }
    el.style.display = '';
    const opacity = b.phased ? String(RADAR_PHASED_ALPHA) : '';
    if (el.style.opacity !== opacity) el.style.opacity = opacity;
    const x = ((b.x + 1) / 2) * RADAR_SIZE;
    const y = ((b.y + 1) / 2) * RADAR_SIZE;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  for (let i = used; i < pool.length; i += 1) {
    if (pool[i].style.display !== 'none') pool[i].style.display = 'none';
  }
}

export default {
  slot: 'radar',
  id: 'classic',
  name: 'Classic',
  // Field units from the ship to the rim.
  range: 1500,

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    this.structure = container.querySelector('.radar-structure');
    this.pool = createBlipPool(container.querySelector('.blip-container'));
  },

  update(state) {
    this.structure.classList.toggle('is-jammed', state.jammed);
    drawBlips(this.pool, state.blips);
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
    this.structure = null;
    this.pool = [];
  },
};
