// src/modules/ui/hud/instruments/xp/classic.js
//
// The first progress panel (until 20/10): the layer in a turning ring over a
// short XP bar, the XP as numbers and "Lvl n" under it.

const MARKUP = `
            <div class="bottom-center hud-panel">
                <div class="wave-indicator">
                    <div class="wave-content">
                        <div class="wave-label">LAYER</div>
                        <div class="wave-num" id="ui-wave-num">1</div>
                    </div>
                </div>
                <div class="xp-bar-container">
                    <div class="xp-label"><i data-lucide="zap" size="12"></i> XP</div>
                    <div class="xp-fill" id="ui-xp-fill"></div>
                </div>
                <div class="xp-details">
                    <div class="xp-values" id="ui-xp-text">0 / 1000</div>
                    <div class="lvl-indicator" id="ui-lvl-text">Lvl 1</div>
                </div>
            </div>`;

const CSS = `
            .bottom-center { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
            .wave-indicator { width: 70px; height: 70px; border-radius: 50%; border: 2px solid var(--line, rgba(255,255,255,0.1)); border-top: 2px solid var(--accent, #00f2ff); border-bottom: 2px solid var(--accent, #00f2ff); display: flex; flex-direction: column; justify-content: center; align-items: center; background: var(--surface-strong, rgba(0,0,0,0.8)); margin-bottom: var(--space-3, 12px); animation: rotate-border 4s infinite linear reverse; }
            .wave-content { animation: rotate-border 4s infinite linear; text-align: center; }
            .wave-num { font-size: var(--text-xl, 28px); color: var(--text, #fff); font-family: var(--font-display, 'Orbitron', sans-serif); line-height: 1; }
            .wave-label { font-size: var(--text-xs, 12px); color: var(--neutral, #00aaff); letter-spacing: 1px; }
            .xp-bar-container { width: 100%; max-width: 300px; height: 6px; background: var(--surface-strong, #0a0a0a); border: 1px solid var(--line, #333); border-radius: var(--radius-sm, 4px); position: relative; display: flex; align-items: center; margin-bottom: 2px; }
            .xp-fill { height: 100%; width: 0%; background: var(--xp, #aa00ff); border-radius: 2px; transition: width 0.5s var(--ease-out, ease-out); }
            .xp-label { position: absolute; left: 0; top: -20px; font-size: var(--text-xs, 12px); color: var(--xp, #aa00ff); font-weight: bold; z-index: 2; display: flex; align-items: center; gap: 5px; }
            .xp-details { display: flex; justify-content: space-between; width: 100%; max-width: 300px; margin-top: 2px; }
            .xp-values { font-family: var(--font-mono, 'Consolas', monospace); font-size: var(--text-xs, 12px); color: var(--text-dim, #ccc); letter-spacing: 1px; }
            .lvl-indicator { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-sm, 14px); font-weight: 700; color: var(--text, #fff); letter-spacing: 1px; }
            @keyframes rotate-border { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;

export default {
  slot: 'xp',
  id: 'classic',
  name: 'Classic',

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style>${MARKUP}`;
    const q = (selector) => container.querySelector(selector);
    this.wave = q('#ui-wave-num');
    this.fill = q('#ui-xp-fill');
    this.text = q('#ui-xp-text');
    this.lvl = q('#ui-lvl-text');
    this.shown = null;
  },

  update({ level, current, required, layer }) {
    const safeRequired =
      Number.isFinite(required) && required > 0 ? required : 1;
    const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
    const percent = Math.min(
      100,
      Math.floor((safeCurrent / safeRequired) * 100)
    );
    const shown = `${layer}|${level}|${Math.floor(safeCurrent)}|${Math.floor(safeRequired)}`;
    if (shown === this.shown) return;
    this.shown = shown;
    this.wave.textContent = layer;
    this.fill.style.width = percent + '%';
    this.text.textContent = `${Math.floor(safeCurrent)} / ${Math.floor(safeRequired)}`;
    this.lvl.textContent = `Lvl ${level}`;
  },

  destroy() {
    this.container.innerHTML = '';
    this.container = null;
  },
};
