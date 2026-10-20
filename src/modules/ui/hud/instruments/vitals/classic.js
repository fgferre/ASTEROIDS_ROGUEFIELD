// src/modules/ui/hud/instruments/vitals/classic.js
//
// The shield and hull pair (until 20/10): two slanted rows of 20 segments,
// shield above, hull below, the percentages at their right; the hull number
// turns red and twitches below 30 %.

const SEGMENTS = 20;
const LOW_HULL_PERCENT = 30;

const MARKUP = `
            <div class="status-area hud-panel">
                <div class="bars-container">
                    <div class="system-label shield-label">❖ SHIELDS</div>
                    <div class="bar-wrapper">
                        <div class="health-bar-row shield" id="ui-shield-row"></div>
                        <div class="numeric-text shield-text" id="ui-shield-text">100%</div>
                    </div>
                    <div class="bar-wrapper">
                        <div class="health-bar-row" id="ui-hull-row"></div>
                        <div class="numeric-text hull-text" id="ui-hull-text">100%</div>
                    </div>
                    <div class="system-label hull-label">♥ HULL INTEGRITY</div>
                </div>
            </div>`;

// 220 px: the side column it filled in the old grid.
const CSS = `
            .status-area { width: 220px; display: flex; flex-direction: column; justify-content: flex-end; }
            .bars-container { transform: skewX(-15deg); }
            .bar-wrapper { display: flex; align-items: center; margin-bottom: 2px; }
            .health-bar-row { display: flex; height: 16px; gap: 3px; flex-grow: 1; min-width: 120px; }
            .health-bar-row.shield { height: 12px; opacity: 0.9; }
            .bar-segment { flex: 1; background: var(--surface, rgba(12, 20, 31, 0.65)); border: 1px solid var(--line, rgba(255, 255, 255, 0.2)); transition: background var(--motion-fast, 0.15s); }
            .bar-segment.filled { background: var(--hull, #00ff66); border-color: var(--text, #fff); }
            .shield .bar-segment.filled { background: var(--accent, #00f2ff); border-color: var(--text, #fff); }
            .system-label { font-size: var(--text-xs, 12px); font-weight: 700; letter-spacing: 1px; margin: 2px 0; }
            .shield-label, .shield-text { color: var(--accent, #00f2ff); }
            .hull-label, .hull-text { color: var(--status, #00ff66); }
            .hull-text.is-critical { color: var(--danger, #ff003c); }
            .numeric-text { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-md, 16px); font-weight: bold; transform: skewX(15deg); margin-left: var(--space-2, 8px); min-width: 48px; transition: color var(--motion-base, 0.3s); }
            @keyframes glitch { 0%, 92%, 95%, 100% { transform: translate(0, 0); opacity: 1; } 93% { transform: translate(-2px, 2px); opacity: 0.8; } 94% { transform: translate(2px, -2px); opacity: 0.8; } 96% { transform: translate(1px, 2px); opacity: 0.9; } 97% { transform: translate(-1px, -1px); opacity: 0.9; } }
            .glitch-text { animation: glitch 3s infinite; }`;

function createSegments(row) {
  row.innerHTML = '';
  for (let index = 0; index < SEGMENTS; index += 1) {
    const div = document.createElement('div');
    div.className = 'bar-segment filled';
    row.appendChild(div);
  }
}

function fillBar(row, value, max) {
  const segments = row.children;
  const filled = Math.ceil((value / max) * segments.length);
  for (let index = 0; index < segments.length; index += 1) {
    segments[index].classList.toggle('filled', index < filled);
  }
}

export default {
  slot: 'vitals',
  id: 'classic',
  name: 'Classic',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.shieldRow = q('#ui-shield-row');
    this.shieldText = q('#ui-shield-text');
    this.hullRow = q('#ui-hull-row');
    this.hullText = q('#ui-hull-text');
    createSegments(this.shieldRow);
    createSegments(this.hullRow);
    this.shown = null;
  },

  update({ shield, maxShield, hull, maxHull }) {
    const shown = `${shield}|${maxShield}|${hull}|${maxHull}`;
    if (shown === this.shown) return;
    this.shown = shown;
    fillBar(this.shieldRow, shield, maxShield);
    fillBar(this.hullRow, hull, maxHull);
    this.shieldText.textContent = Math.floor((shield / maxShield) * 100) + '%';
    const hullPercent = Math.floor((hull / maxHull) * 100);
    this.hullText.textContent = hullPercent + '%';
    const critical = hullPercent < LOW_HULL_PERCENT;
    this.hullText.classList.toggle('is-critical', critical);
    this.hullText.classList.toggle('glitch-text', critical);
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
  },
};
