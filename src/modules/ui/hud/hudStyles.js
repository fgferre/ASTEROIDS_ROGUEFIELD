// src/modules/ui/hud/hudStyles.js

import { WARDEN_ARRIVAL } from '../../../core/cinematics.js';
import { DAMAGE_ARC_MS } from './direction.js';
import { FADE_OUT_MS, FEED_MAX_ROWS } from './hudCommon.js';

const COMBO_POP_MS = 120;
// The Warden arrival's letterbox slides with the camera's trip.
const LETTERBOX_IN_MS = WARDEN_ARRIVAL.travelIn * 1000;
const LETTERBOX_OUT_MS = WARDEN_ARRIVAL.travelBack * 1000;

/** The HUD's stylesheet text. */
export function getHudCss() {
  return `
            #hud-layer {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 20;
                box-sizing: border-box;
                /* clear of notches and rounded corners (viewport-fit=cover) */
                padding:
                    max(var(--space-4, 16px), env(safe-area-inset-top))
                    max(var(--space-4, 16px), env(safe-area-inset-right))
                    max(var(--space-4, 16px), env(safe-area-inset-bottom))
                    max(var(--space-4, 16px), env(safe-area-inset-left));
                display: grid;
                grid-template-columns: 220px 1fr 220px;
                grid-template-rows: auto 1fr auto;
                pointer-events: none;
                font-family: var(--font-ui, 'Rajdhani', sans-serif);
                font-size: calc(1rem * var(--hud-scale-effective, 1));
                color: var(--text, #e8f4ff);
            }
            .hud-panel { pointer-events: auto; transition: opacity var(--motion-base, 0.3s); }

            .cockpit-frame {
                position: absolute; width: 100%; height: 100%; z-index: 11; pointer-events: none;
                background: linear-gradient(135deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(-135deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(45deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(-45deg, rgba(5,5,5,0.5) 2%, transparent 10%);
            }

            /* STATS */
            .stats-area { display: flex; flex-direction: column; gap: var(--space-3, 12px); }
            .stats-grid { display: flex; flex-direction: column; gap: var(--space-3, 12px); }
            .stat-block { display: flex; flex-direction: column; background: linear-gradient(90deg, var(--surface, rgba(12, 20, 31, 0.65)) 0%, transparent 100%); padding: var(--space-1, 4px) var(--space-2, 8px) var(--space-1, 4px) var(--space-3, 12px); border-left: 3px solid var(--neutral, #00aaff); width: fit-content; min-width: 160px; }
            .stat-label { font-size: var(--text-xs, 12px); color: var(--neutral, #00aaff); letter-spacing: 1px; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; font-weight: 700; }
            .stat-value { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-xl, 28px); color: var(--text, #fff); line-height: 1.1; }
            .combo-box { margin-top: var(--space-2, 8px); }
            .combo-box.is-hidden { visibility: hidden; }
            .combo-box { transform-origin: left center; }
            .combo-label { font-size: var(--text-sm, 14px); color: var(--accent, #00f2ff); letter-spacing: 2px; font-weight: 700; }
            .combo-val { font-size: var(--text-xl, 28px); line-height: 1; font-family: var(--font-display, 'Orbitron', sans-serif); color: var(--text); font-weight: 900; transition: color var(--motion-fast); }
            .combo-box[data-tier='status'] .combo-val { color: var(--status); }
            .combo-box[data-tier='xp'] .combo-val { color: var(--xp); }
            .combo-box[data-tier='boss'] .combo-val { color: var(--boss); text-shadow: 0 0 12px var(--boss); }

            /* BOSS */
            .boss-area { grid-column: 2; display: flex; flex-direction: column; align-items: center; padding-top: var(--space-4, 16px); opacity: 0; transition: opacity 0.5s; }
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

            /* NEXT WAVE */
            .next-wave-box { position: absolute; top: 50%; left: 0; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translateY(-50%); font-family: var(--font-display, 'Orbitron', sans-serif); opacity: 0; transition: opacity var(--motion-base, 0.3s); pointer-events: none; z-index: 100; }
            .next-wave-box.visible { opacity: 1; }
            .next-wave-label { font-size: var(--text-lg, 20px); color: var(--danger, #ff003c); letter-spacing: 6px; font-weight: 900; margin: 0; text-transform: uppercase; text-shadow: 0 0 15px rgba(0, 0, 0, 0.9); line-height: 1.2; }
            .next-wave-timer { font-size: 4rem; line-height: 1; color: var(--text, #fff); font-weight: 900; text-shadow: 0 0 20px var(--danger, #ff003c), 2px 2px 0 #000; margin-top: var(--space-2, 8px); }
            .next-wave-box.visible .next-wave-timer { animation: alert-pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

            /* VITALS */
            .status-area { grid-row: 3; display: flex; flex-direction: column; justify-content: flex-end; }
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

            /* PROGRESS */
            .bottom-center { grid-row: 3; grid-column: 2; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
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

            /* MODES */
            .systems-area { grid-row: 3; grid-column: 3; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; gap: var(--space-2, 8px); }
            .systems-row { display: flex; flex-direction: row; justify-content: flex-end; align-items: flex-end; gap: var(--space-2, 8px); }
            .mode-chip { font-family: var(--font-mono, 'Consolas', monospace); font-size: var(--text-xs, 12px); color: var(--text-dim, #ccc); background: var(--surface, rgba(12, 20, 31, 0.65)); border: 1px solid var(--line, rgba(255,255,255,0.2)); border-radius: var(--radius-sm, 4px); padding: var(--space-1, 4px) var(--space-2, 8px); letter-spacing: 1px; }
            .data-val { color: var(--accent, #00f2ff); font-weight: bold; }
            .dash-chip { display: flex; align-items: center; gap: var(--space-1, 4px); color: var(--accent); border-color: var(--accent-line); }
            .dash-chip.is-charging { color: var(--text-dim); border-color: var(--line); }
            .dash-meter { width: 28px; height: 4px; background: var(--accent); border-radius: var(--radius-sm); overflow: hidden; box-shadow: var(--glow-accent); }
            .dash-chip.is-charging .dash-meter { background: var(--surface-strong); box-shadow: none; }
            .dash-meter__fill { display: block; width: 100%; height: 100%; background: var(--accent-line); transform: scaleX(0); transform-origin: left; }
            .weapon-group { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1, 4px); }
            .weapon-chip { display: flex; align-items: center; gap: var(--space-1, 4px); }
            .beam-pips { display: flex; gap: 3px; margin-left: 2px; }
            .beam-pips.is-hidden { display: none; }
            .beam-pip { width: 5px; height: 5px; border: 1px solid var(--accent-line); border-radius: 1px; }
            .beam-pip.is-filled { background: var(--accent); box-shadow: var(--glow-accent); }
            .beam-pip.is-hidden { display: none; }
            .evo-row { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; max-width: 220px; }
            .evo-chip { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1px; padding: 1px var(--space-1, 4px); color: var(--family-color); background: var(--surface); border: 1px solid color-mix(in srgb, var(--family-color) 55%, transparent); border-radius: var(--radius-sm); }
            .buff-row { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1, 4px); }
            .buff-row:empty { display: none; }
            .evo-chip.is-apex { color: color-mix(in srgb, var(--family-color) 55%, white); border-color: var(--family-color); box-shadow: 0 0 6px color-mix(in srgb, var(--family-color) 45%, transparent); font-weight: 700; }
            .evo-row:empty { display: none; }
            .buff-chip { display: flex; align-items: center; gap: var(--space-2, 8px); color: var(--buff-color); border-color: color-mix(in srgb, var(--buff-color) 55%, transparent); }
            .buff-meter { width: 36px; height: 4px; background: var(--surface-strong); border-radius: var(--radius-sm); overflow: hidden; }
            .buff-meter__fill { display: block; width: 100%; height: 100%; background: var(--buff-color); transform-origin: left; }

            /* ANIMATIONS */
            @keyframes rotate-border { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            @keyframes alert-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
            @keyframes boss-hit { 0% { filter: brightness(1.6); } 100% { filter: brightness(1); } }
            @keyframes boss-critical { 0% { filter: brightness(2); } 100% { filter: brightness(1); } }
            @keyframes glitch { 0%, 92%, 95%, 100% { transform: translate(0, 0); opacity: 1; } 93% { transform: translate(-2px, 2px); opacity: 0.8; } 94% { transform: translate(2px, -2px); opacity: 0.8; } 96% { transform: translate(1px, 2px); opacity: 0.9; } 97% { transform: translate(-1px, -1px); opacity: 0.9; } }
            .glitch-text { animation: glitch 3s infinite; }

            /* LOW HULL VIGNETTE */
            .lowhp-vignette { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity var(--motion-base); box-shadow: inset 0 0 120px 24px var(--danger-line); }
            .lowhp-vignette.is-low { opacity: 0.6; }
            .lowhp-vignette.is-critical { opacity: 0.9; box-shadow: inset 0 0 130px 36px var(--danger-line), inset 0 0 28px 3px var(--danger); }

            /* DIRECTION: damage arcs + off-screen arrows, over the field */
            .hud-direction { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
            .damage-arc { position: absolute; width: 150px; height: 34px; opacity: 0; box-sizing: border-box; border-top: 4px solid var(--danger); border-radius: 50% 50% 0 0 / 100% 100% 0 0; background: radial-gradient(ellipse at 50% 0%, var(--danger-soft), transparent 70%); filter: drop-shadow(0 0 6px var(--danger)); }
            .damage-arc.is-on { opacity: 0.95; }
            .edge-arrow { position: absolute; width: 0; height: 0; --arrow-tone: var(--arrow-color, var(--status)); }
            .edge-arrow[data-kind='warden'] { --arrow-tone: var(--danger); }
            .edge-arrow[data-kind='herald'] { --arrow-tone: var(--boss); }
            .edge-arrow__glyph { position: absolute; left: -9px; top: -8px; width: 18px; height: 16px; background: var(--arrow-tone); clip-path: polygon(0 0, 100% 50%, 0 100%, 30% 50%); filter: drop-shadow(0 0 4px var(--arrow-tone)); }
            .edge-arrow[data-kind='pickup'] .edge-arrow__glyph { transform-origin: 50% 50%; scale: 0.7; }
            .edge-arrow__label { position: absolute; transform: translate(-50%, -50%); font-family: var(--font-display); font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.1em; color: var(--arrow-tone); text-shadow: 0 0 6px rgba(0, 0, 0, 0.9); white-space: nowrap; }
            .edge-arrow[data-edge='left'] .edge-arrow__label { left: 34px; top: 0; }
            .edge-arrow[data-edge='right'] .edge-arrow__label { left: -34px; top: 0; }
            .edge-arrow[data-edge='top'] .edge-arrow__label { left: 0; top: 22px; }
            .edge-arrow[data-edge='bottom'] .edge-arrow__label { left: 0; top: -22px; }

            /* LAYER BANNER */
            .layer-banner { position: absolute; top: 28%; left: 0; width: 100%; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); pointer-events: none; z-index: 90; opacity: 0; visibility: hidden; }
            .layer-banner.is-showing { opacity: 1; visibility: visible; }
            .layer-banner__title { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 700; letter-spacing: 0.5em; margin-right: -0.5em; color: var(--text); text-shadow: 0 0 18px var(--accent-line), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner__line { width: 420px; max-width: 70%; height: 1px; background: linear-gradient(90deg, transparent, var(--accent) 20%, var(--accent) 80%, transparent); box-shadow: var(--glow-accent); }
            .layer-banner.is-boss .layer-banner__title { color: var(--boss); text-shadow: 0 0 18px var(--boss), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner.is-boss .layer-banner__line { background: linear-gradient(90deg, transparent, var(--boss) 20%, var(--boss) 80%, transparent); box-shadow: 0 0 12px var(--boss); }
            .layer-banner__sub { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: 600; letter-spacing: 0.4em; margin-right: -0.4em; text-transform: uppercase; color: var(--text-dim); text-shadow: 0 0 10px rgba(0, 0, 0, 0.9); }
            .layer-banner__sub:empty { display: none; }
            .layer-banner.is-surge .layer-banner__title { color: var(--danger); text-shadow: 0 0 18px var(--danger), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner.is-surge .layer-banner__line { background: linear-gradient(90deg, transparent, var(--danger) 20%, var(--danger) 80%, transparent); box-shadow: 0 0 12px var(--danger); }
            .layer-banner.is-surge .layer-banner__sub { color: var(--danger); }
            .layer-banner.is-event .layer-banner__title { color: var(--xp); text-shadow: 0 0 18px var(--xp), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner.is-event .layer-banner__line { background: linear-gradient(90deg, transparent, var(--xp) 20%, var(--xp) 80%, transparent); box-shadow: 0 0 12px var(--xp); }
            .layer-banner.is-event .layer-banner__sub { color: var(--xp); }
            .layer-banner.is-herald .layer-banner__title { color: var(--text); text-shadow: 0 0 18px var(--boss), 0 0 4px var(--boss), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner.is-herald .layer-banner__line { background: linear-gradient(90deg, transparent, var(--boss) 20%, var(--boss) 80%, transparent); box-shadow: 0 0 12px var(--boss); }
            .layer-banner.is-modifier .layer-banner__title { color: var(--modifier); text-shadow: 0 0 18px var(--modifier), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner.is-modifier .layer-banner__line { background: linear-gradient(90deg, transparent, var(--modifier) 20%, var(--modifier) 80%, transparent); box-shadow: 0 0 12px var(--modifier); }
            .layer-banner.is-modifier .layer-banner__sub { color: var(--modifier-color); }
            .layer-banner.is-herald .layer-banner__sub { color: color-mix(in srgb, var(--boss) 45%, var(--text)); text-transform: none; letter-spacing: 0.2em; margin-right: -0.2em; }

            .cinematic-hint { position: absolute; bottom: 64px; left: 0; width: 100%; text-align: center; font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.3em; color: var(--text-dim); text-shadow: 0 0 8px rgba(0, 0, 0, 0.9); pointer-events: none; z-index: 90; opacity: 0; visibility: hidden; }
            .cinematic-hint.is-showing { opacity: 0.8; visibility: visible; }
            /* Under the panels (z-index -1 in the HUD layer), over the field. */
            .letterbox { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
            .letterbox::before, .letterbox::after { content: ''; position: absolute; left: 0; width: 100%; height: ${WARDEN_ARRIVAL.barHeight}%; background: #000; }
            .letterbox::before { top: 0; transform: translateY(-100%); }
            .letterbox::after { bottom: 0; transform: translateY(100%); }
            .letterbox.is-showing::before, .letterbox.is-showing::after { transform: translateY(0); }

            /* BOSS INTRO */
            .boss-intro { position: absolute; top: 26%; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: var(--space-2); padding: var(--space-4) var(--space-6); background: radial-gradient(ellipse at center, color-mix(in srgb, var(--boss) 22%, transparent) 0%, transparent 70%); pointer-events: none; z-index: 95; opacity: 0; visibility: hidden; }
            .boss-intro.is-showing { opacity: 1; visibility: visible; }
            .layer-banner.is-leaving, .boss-intro.is-leaving { opacity: 0; }
            .boss-intro__name { font-family: var(--font-display); font-size: var(--text-hero); font-weight: 900; letter-spacing: 0.3em; margin-right: -0.3em; text-transform: uppercase; color: var(--text); text-shadow: 0 0 24px var(--boss), 0 0 4px var(--boss), 0 3px 0 rgba(0, 0, 0, 0.85); line-height: 1; white-space: nowrap; }
            .boss-intro__sub { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: 600; letter-spacing: 0.4em; margin-right: -0.4em; text-transform: uppercase; color: var(--boss); text-shadow: 0 0 10px rgba(0, 0, 0, 0.9); }
            .boss-intro__line { width: 100%; height: 1px; background: linear-gradient(90deg, transparent, var(--boss) 25%, var(--boss) 75%, transparent); box-shadow: 0 0 10px var(--boss); }

            /* TRANSMISSION (Warden radio, bottom centre above the layer dial) */
            .transmission { position: absolute; bottom: 150px; left: 50%; transform: translateX(-50%); width: min(640px, 80%); display: flex; flex-direction: column; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-4); background: radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%); pointer-events: none; z-index: 85; opacity: 0; visibility: hidden; }
            .transmission.is-showing { opacity: 1; visibility: visible; }
            .transmission.is-leaving { opacity: 0; }
            .transmission__speaker { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.25em; color: var(--accent); text-shadow: 0 0 8px var(--accent-line); }
            .transmission__rule { width: 100%; height: 1px; background: linear-gradient(90deg, transparent, var(--accent-line) 20%, var(--accent-line) 80%, transparent); }
            .transmission__line { min-height: 1.5em; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.06em; line-height: 1.5; text-align: center; color: var(--text); text-shadow: 0 0 10px rgba(0, 0, 0, 0.9), 0 0 6px var(--accent-line); }
            .transmission.is-typing .transmission__line::after { content: '▌'; margin-left: 2px; color: var(--accent); }
            /* Settings → Accessibility: Large Subtitles stacks on Text Size; Reduce Flashing stops the flicker */
            body.subtitles-large .transmission { width: min(760px, 90%); }
            body.subtitles-large .transmission__speaker { font-size: calc(var(--text-xs) * 1.35); }
            body.subtitles-large .transmission__line { font-size: calc(var(--text-md) * 1.35); }
            body.flashing-reduced .transmission.is-showing { animation: none; }

            /* High Contrast HUD: opaque panels and 2 px outlines (tokens in style.css) */
            body.hud-high-contrast :is(.stat-block, .feed-row, .transmission) { background: var(--surface); outline: 2px solid var(--line); }
            body.hud-high-contrast :is(.mode-chip, .xp-bar-container, .bar-segment, .boss-bar-container, .onboarding-tip) { border-width: 2px; }

            /* ONBOARDING TIP (first run, top centre under the boss bar slot) */
            .onboarding-tip { position: absolute; top: 15%; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4); background: var(--surface-strong); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: var(--radius-md); pointer-events: none; z-index: 80; white-space: nowrap; opacity: 0; visibility: hidden; }
            .onboarding-tip.is-showing { opacity: 1; visibility: visible; }
            .onboarding-tip.is-leaving { opacity: 0; }
            .onboarding-tip__keys { display: flex; gap: var(--space-1); }
            .onboarding-tip__key { min-width: 1.9em; padding: 2px var(--space-2); font-family: var(--font-mono); font-size: var(--text-sm); font-weight: 700; letter-spacing: 1px; text-align: center; text-transform: uppercase; color: var(--accent); background: var(--surface); border: 1px solid var(--accent-line); border-bottom-width: 2px; border-radius: var(--radius-sm); }
            .onboarding-tip__text { font-family: var(--font-ui); font-size: var(--text-md); font-weight: 600; letter-spacing: 0.04em; color: var(--text); }

            /* KILL FEED */
            .hud-feed { position: absolute; top: calc(220px + var(--space-6)); right: var(--space-4); width: 200px; min-height: calc(${FEED_MAX_ROWS} * (var(--text-md) * 1.25 + 4px + var(--space-1))); display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); pointer-events: none; z-index: 30; }
            .feed-row { display: flex; align-items: baseline; gap: var(--space-2); padding: 2px var(--space-2); background: linear-gradient(270deg, var(--surface) 0%, transparent 100%); border-right: 2px solid var(--neutral); font-family: var(--font-ui); font-size: var(--text-md); font-weight: 600; letter-spacing: 1px; color: var(--text); white-space: nowrap; }
            .feed-row.is-leaving { opacity: 0; }
            .feed-value { font-family: var(--font-display); font-size: var(--text-sm); color: var(--text-dim); }
            .feed-row--xp { border-right-color: var(--xp); color: var(--xp); }
            .feed-row--combo { border-right-color: var(--status); color: var(--status); }
            .feed-row--combo[data-tier='xp'] { border-right-color: var(--xp); color: var(--xp); }
            .feed-row--combo[data-tier='boss'] { border-right-color: var(--boss); color: var(--boss); }
            .feed-row--combo .feed-value { color: inherit; }
            .feed-row--achievement { border-right-color: var(--xp); color: var(--xp); background: linear-gradient(270deg, color-mix(in srgb, var(--xp) 22%, var(--surface)) 0%, transparent 100%); text-shadow: 0 0 8px color-mix(in srgb, var(--xp) 60%, transparent); }

            @media (prefers-reduced-motion: no-preference) {
                .combo-box.pulse { animation: combo-pop ${COMBO_POP_MS}ms var(--ease-out) 1; }
                .dash-chip.is-ready { animation: dash-ready var(--motion-base) var(--ease-out) 1; }
                .weapon-chip.is-beam { animation: dash-ready var(--motion-base) var(--ease-out) 1; }
                .weapon-chip.is-beam .beam-pip { animation: beam-pip-flash var(--motion-base) var(--ease-out) 1; }
                .evo-chip, .buff-chip { animation: feed-in var(--motion-base) var(--ease-out); }
                .lowhp-vignette.is-low { animation: lowhp-pulse 0.83s ease-in-out infinite alternate; }
                .lowhp-vignette.is-critical { animation-name: lowhp-pulse-critical; }
                html:not([data-motion='reduced']) .damage-arc.is-on { animation: damage-arc-fade ${DAMAGE_ARC_MS}ms ease-in forwards; }
                .boss-seg.is-current { animation: boss-seg-pulse 0.9s ease-in-out infinite alternate; }
                .layer-banner.is-showing .layer-banner__title { animation: banner-title-in 420ms var(--ease-out); }
                .layer-banner.is-showing .layer-banner__line { animation: banner-line-draw 600ms var(--ease-out) 120ms both; }
                .layer-banner.is-leaving, .boss-intro.is-leaving { transition: opacity ${FADE_OUT_MS}ms ease-in; }
                .letterbox::before, .letterbox::after { transition: transform ${LETTERBOX_OUT_MS}ms ease-in-out; }
                .letterbox.is-showing::before, .letterbox.is-showing::after { transition-duration: ${LETTERBOX_IN_MS}ms; }
                .boss-intro.is-showing { animation: boss-intro-in 360ms var(--ease-out); }
                .boss-intro.is-showing .boss-intro__line { animation: banner-line-draw 600ms var(--ease-out) 150ms both; }
                .transmission.is-showing { animation: transmission-flicker 2.4s steps(1, end) infinite; }
                .transmission.is-leaving { animation: none; transition: opacity ${FADE_OUT_MS}ms ease-in; }
                .onboarding-tip.is-showing { animation: onboarding-tip-in var(--motion-base) var(--ease-out); }
                .onboarding-tip.is-leaving { animation: none; transition: opacity ${FADE_OUT_MS}ms ease-in; }
                .boss-area { transform: translateY(-24px); transition: opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out); }
                .boss-area.active { transform: translateY(0); }
                .feed-row { animation: feed-in var(--motion-base) var(--ease-out); transition: opacity ${FADE_OUT_MS}ms ease-in, transform ${FADE_OUT_MS}ms ease-in; }
                .feed-row.is-leaving { transform: translateX(8px); }
            }
            @keyframes combo-pop { 0% { transform: scale(1); } 50% { transform: scale(1.18); } 100% { transform: scale(1); } }
            @keyframes dash-ready { 0% { box-shadow: var(--glow-accent); background: var(--accent-soft); } 100% { box-shadow: none; } }
            @keyframes beam-pip-flash { 0% { background: var(--accent); box-shadow: var(--glow-accent); } 100% { background: transparent; box-shadow: none; } }
            @keyframes damage-arc-fade { 0% { opacity: 1; } 35% { opacity: 0.9; } 100% { opacity: 0; } }
            @keyframes boss-seg-pulse { from { background: transparent; } to { background: color-mix(in srgb, var(--text) 18%, transparent); } }
            @keyframes lowhp-pulse { from { opacity: 0.25; } to { opacity: 0.75; } }
            @keyframes lowhp-pulse-critical { from { opacity: 0.55; } to { opacity: 1; } }
            @keyframes banner-title-in { from { opacity: 0; letter-spacing: 0.2em; margin-right: -0.2em; } to { opacity: 1; letter-spacing: 0.5em; margin-right: -0.5em; } }
            @keyframes banner-line-draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
            @keyframes boss-intro-in { from { opacity: 0; transform: translateX(-50%) scale(0.9); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
            @keyframes transmission-flicker { 0%, 100% { opacity: 1; } 3% { opacity: 0.55; } 5% { opacity: 0.9; } 7% { opacity: 0.7; } 9% { opacity: 1; } 61% { opacity: 0.82; } 62% { opacity: 1; } }
            @keyframes onboarding-tip-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
            @keyframes feed-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }

            @media (max-width: 900px) { #hud-layer { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; } .stats-area { position: absolute; top: 10px; left: 10px; } .boss-area { margin-top: 60px; transform: scale(0.8); } .status-area { position: absolute; bottom: 20px; left: 10px; transform: scale(0.9); transform-origin: bottom left; } .systems-area { position: absolute; bottom: 20px; right: 10px; } .bottom-center { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); width: 300px; } }
        `;
}
