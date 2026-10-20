// src/modules/ui/hud/hudStyles.js

import { WARDEN_ARRIVAL } from '../../../core/cinematics.js';
import { DAMAGE_ARC_MS } from './direction.js';
import { FADE_OUT_MS } from './hudCommon.js';

// The Warden arrival's letterbox slides with the camera's trip.
const LETTERBOX_IN_MS = WARDEN_ARRIVAL.travelIn * 1000;
const LETTERBOX_OUT_MS = WARDEN_ARRIVAL.travelBack * 1000;

/** The HUD's stylesheet text. */
export function getHudCss() {
  return `
            #hud-layer {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 20;
                box-sizing: border-box;
                container-type: size;
                pointer-events: none;
                font-family: var(--font-ui, 'Rajdhani', sans-serif);
                font-size: calc(1rem * var(--hud-scale-effective, 1));
                color: var(--text, #e8f4ff);
                /* The HUD's unit: 1 at a 1080p window with HUD Scale 100 % (viewportScaling.js) */
                --hud-u: calc(var(--hud-scale-effective, 1.2) / 1.2);
                --boss-light: color-mix(in srgb, var(--boss) 55%, white);
            }
            .hud-panel { pointer-events: auto; transition: opacity var(--motion-base, 0.3s); }

            /* SLOTS (data/ui/hudPresets.js): the instruments sit in a centred 16:9 frame, clear of
               notches and rounded corners (viewport-fit=cover); taller windows keep the corners. */
            .hud-frame {
                position: absolute; left: 0; right: 0; margin: 0 auto;
                top: env(safe-area-inset-top, 0px); bottom: env(safe-area-inset-bottom, 0px);
                width: min(100cqw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px), 100cqh * 16 / 9);
                /* its slots size against it (cqw), e.g. the XP line between the corners */
                container-type: size;
            }
            /* The field's glowing border fades out under an instrument: a soft dark plate behind it,
               reaching --plate-x / --plate-y past the instrument and feathered over its last 40 px
               (the XP line's spans the bottom edge between the corners; the radar's is round). */
            .hud-plate::before {
                content: ''; position: absolute; z-index: -1; pointer-events: none;
                inset: calc(var(--plate-y, -40px) * var(--hud-u)) calc(var(--plate-x, -48px) * var(--hud-u));
                --feather: calc(40px * var(--hud-u));
                --across: linear-gradient(to right, transparent, #000 var(--feather), #000 calc(100% - var(--feather)), transparent);
                --down: linear-gradient(to bottom, transparent, #000 var(--feather), #000 calc(100% - var(--feather)), transparent);
                background: rgba(2, 4, 8, 0.8);
                -webkit-mask-image: var(--across), var(--down); -webkit-mask-composite: source-in;
                mask-image: var(--across), var(--down); mask-composite: intersect;
                transition: opacity var(--motion-base) var(--ease-out);
            }
            [data-slot='xp'] { --plate-x: -230px; }
            [data-slot='radar'].hud-plate::before { inset: calc(-24px * var(--hud-u)); -webkit-mask-image: none; mask-image: none; background: radial-gradient(closest-side, rgba(2, 4, 8, 0.8) 72%, transparent); }
            /* Only under what is drawn: the Warden bar while it is up, the feed while it has rows. */
            [data-slot='warden'].hud-plate:not(:has(.is-on))::before, [data-slot='feed'].hud-plate:not(:has(.feed-row))::before { opacity: 0; }

            /* INSTRUMENTS: the mock-ups' finish (HUD.md). Glance 70 % (55 % while a Warden lives),
               on demand 35 % until a change wakes it; a changed value pulses once. */
            .ins { color: var(--text); font-family: var(--font-ui); text-shadow: 0 1px 2px rgba(2, 4, 8, 0.9); pointer-events: none; }
            .ins-lbl { font-family: var(--font-display); font-weight: 500; font-size: calc(var(--text-xs) * var(--hud-u)); letter-spacing: 0.2em; color: var(--text-dim); }
            .ins-glance { opacity: 0.7; transition: opacity var(--motion-base) var(--ease-out); }
            #hud-layer[data-hud-mode='warden'] .ins-glance { opacity: 0.55; }
            .ins-demand { opacity: 0.35; transition: opacity var(--motion-base) var(--ease-out); }
            .ins-demand.is-awake { opacity: 1; }
            @media (prefers-reduced-motion: no-preference) {
                html:not([data-motion='reduced']) body:not(.motion-reduced) .ins-pulse { animation: ins-pulse 120ms var(--ease-out) 1; }
            }
            @keyframes ins-pulse { 50% { transform: scale(1.06); filter: brightness(1.5); } }

            .cockpit-frame {
                position: absolute; width: 100%; height: 100%; z-index: 11; pointer-events: none;
                background: linear-gradient(135deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(-135deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(45deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(-45deg, rgba(5,5,5,0.5) 2%, transparent 10%);
            }


            /* NEXT WAVE */
            .next-wave-box { position: absolute; top: 50%; left: 0; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translateY(-50%); font-family: var(--font-display, 'Orbitron', sans-serif); opacity: 0; transition: opacity var(--motion-base, 0.3s); pointer-events: none; z-index: 100; }
            .next-wave-box.visible { opacity: 1; }
            .next-wave-label { font-size: var(--text-lg, 20px); color: var(--danger, #ff003c); letter-spacing: 6px; font-weight: 900; margin: 0; text-transform: uppercase; text-shadow: 0 0 15px rgba(0, 0, 0, 0.9); line-height: 1.2; }
            .next-wave-timer { font-size: 4rem; line-height: 1; color: var(--text, #fff); font-weight: 900; text-shadow: 0 0 20px var(--danger, #ff003c), 2px 2px 0 #000; margin-top: var(--space-2, 8px); }
            .next-wave-box.visible .next-wave-timer { animation: alert-pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

            /* ANIMATIONS */
            @keyframes alert-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }

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

            @media (prefers-reduced-motion: no-preference) {
                html:not([data-motion='reduced']) .damage-arc.is-on { animation: damage-arc-fade ${DAMAGE_ARC_MS}ms ease-in forwards; }
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
            }
            @keyframes damage-arc-fade { 0% { opacity: 1; } 35% { opacity: 0.9; } 100% { opacity: 0; } }
            @keyframes banner-title-in { from { opacity: 0; letter-spacing: 0.2em; margin-right: -0.2em; } to { opacity: 1; letter-spacing: 0.5em; margin-right: -0.5em; } }
            @keyframes banner-line-draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
            @keyframes boss-intro-in { from { opacity: 0; transform: translateX(-50%) scale(0.9); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
            @keyframes transmission-flicker { 0%, 100% { opacity: 1; } 3% { opacity: 0.55; } 5% { opacity: 0.9; } 7% { opacity: 0.7; } 9% { opacity: 1; } 61% { opacity: 0.82; } 62% { opacity: 1; } }
            @keyframes onboarding-tip-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
            @keyframes feed-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
        `;
}
