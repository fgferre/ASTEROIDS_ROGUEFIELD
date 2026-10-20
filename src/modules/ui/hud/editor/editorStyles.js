// src/modules/ui/hud/editor/editorStyles.js
//
// The HUD editor's stylesheet, added while it is open: the stage over the
// instruments (frames, grid, safe area, guides) and the chrome over the
// window, in the game's tokens (style.css) — dark glass panels like the
// pause screen, Orbitron labels, Rajdhani text, neon only on the selected
// frame and the guides.

/** The editor's stylesheet text. */
export function getEditorCss() {
  return `
    /* THE HUD WHILE EDITED: every instrument at full strength, the centre-screen moments away,
       the field pushed back. */
    body.is-hud-editing #game-canvas { filter: saturate(0.55) brightness(0.5); }
    body.is-hud-editing #game-ui { filter: none; }
    #hud-layer.is-editing .ins-glance, #hud-layer.is-editing .ins-demand { opacity: 1; }
    #hud-layer.is-editing :is(.layer-banner, .boss-intro, .transmission, .onboarding-tip, .next-wave-box, .cinematic-hint, .hud-direction) { visibility: hidden; }

    /* STAGE (inside #hud-layer: a preview scales it with the HUD) */
    .hed-stage { position: absolute; inset: 0; z-index: 300; pointer-events: auto; cursor: default; user-select: none; -webkit-user-select: none; touch-action: none; }
    .hed-grid, .hed-safe { position: absolute; pointer-events: none; }
    .hed-grid {
      --line: rgba(0, 242, 255, 0.07);
      --major: rgba(0, 242, 255, 0.14);
      background:
        linear-gradient(to right, transparent calc(50% - 0.5px), rgba(0, 242, 255, 0.3) calc(50% - 0.5px), rgba(0, 242, 255, 0.3) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
        linear-gradient(to bottom, transparent calc(50% - 0.5px), rgba(0, 242, 255, 0.3) calc(50% - 0.5px), rgba(0, 242, 255, 0.3) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
        repeating-linear-gradient(to right, var(--major) 0 1px, transparent 1px calc(var(--grid) * 4)),
        repeating-linear-gradient(to bottom, var(--major) 0 1px, transparent 1px calc(var(--grid) * 4)),
        repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px var(--grid)),
        repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px var(--grid));
    }
    .hed-safe { outline: 1px dashed rgba(230, 238, 248, 0.42); outline-offset: -1px; }
    .hed-safe__margin { position: absolute; inset: var(--margin); outline: 1px dotted rgba(0, 242, 255, 0.45); }
    /* The labels run up the middle of the frame's left edge and the margin's right one. */
    .hed-safe__label { position: absolute; left: 6px; top: 50%; writing-mode: vertical-rl; transform: translateY(-50%) rotate(180deg); font-family: var(--font-display); font-size: 10px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; white-space: nowrap; color: rgba(230, 238, 248, 0.6); }
    .hed-safe__margin .hed-safe__label { left: auto; right: 6px; transform: translateY(-50%); color: rgba(0, 242, 255, 0.7); }
    .hed-safe[data-outside='true'] { box-shadow: 0 0 0 100vmax rgba(255, 49, 49, 0.06); }

    .hed-frame { position: absolute; box-sizing: border-box; border: 1px dashed rgba(230, 238, 248, 0.34); border-radius: 3px; background: rgba(230, 238, 248, 0.025); cursor: grab; transition: border-color var(--motion-fast) var(--ease-out), background-color var(--motion-fast) var(--ease-out); }
    .hed-frame:hover { border-style: solid; border-color: rgba(230, 238, 248, 0.7); background: rgba(230, 238, 248, 0.05); }
    .hed-frame.is-ship { border-radius: 999px; cursor: pointer; }
    .hed-frame[data-slot='recharges'] { border-radius: 0 0 999px 999px; }
    .hed-frame.is-hidden { border-style: dotted; border-color: rgba(230, 238, 248, 0.24); background: repeating-linear-gradient(-45deg, rgba(230, 238, 248, 0.04) 0 6px, transparent 6px 12px); }
    .hed-frame.is-hidden .hed-tag { opacity: 0.6; }
    .hed-tag { position: absolute; left: -1px; bottom: calc(100% + 4px); display: flex; gap: 6px; align-items: baseline; padding: 3px 7px; border-radius: 3px; background: rgba(2, 4, 8, 0.88); white-space: nowrap; font-family: var(--font-display); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-dim); pointer-events: none; }
    .hed-tag b { font-weight: 700; }
    .hed-tag em { font-style: normal; font-weight: 500; color: rgba(230, 238, 248, 0.45); }
    .hed-tag em:empty { display: none; }
    .hed-frame[data-tag='below'] .hed-tag { bottom: auto; top: calc(100% + 4px); }
    .hed-frame[data-tag='inside'] .hed-tag { left: 4px; top: 4px; bottom: auto; }
    .hed-frame.is-ship .hed-tag { left: calc(100% + 8px); bottom: auto; top: 50%; transform: translateY(-50%); }
    .hed-anchor { display: none; position: absolute; width: 7px; height: 7px; margin: -4px 0 0 -4px; background: var(--accent); transform: rotate(45deg); box-shadow: 0 0 8px var(--accent); }

    .hed-frame.is-selected { border: 1.5px solid var(--accent); background: rgba(0, 242, 255, 0.06); box-shadow: 0 0 0 1px rgba(0, 242, 255, 0.18), 0 0 22px rgba(0, 242, 255, 0.35), inset 0 0 26px rgba(0, 242, 255, 0.1); }
    .hed-frame.is-selected .hed-tag { background: var(--accent); color: var(--bg); }
    .hed-frame.is-selected .hed-tag em { color: rgba(2, 4, 8, 0.6); }
    .hed-frame.is-selected:not(.is-ship)::after {
      content: ''; position: absolute; inset: -6px; pointer-events: none;
      --c: var(--accent);
      background:
        linear-gradient(var(--c), var(--c)) left top / 14px 2px, linear-gradient(var(--c), var(--c)) left top / 2px 14px,
        linear-gradient(var(--c), var(--c)) right top / 14px 2px, linear-gradient(var(--c), var(--c)) right top / 2px 14px,
        linear-gradient(var(--c), var(--c)) left bottom / 14px 2px, linear-gradient(var(--c), var(--c)) left bottom / 2px 14px,
        linear-gradient(var(--c), var(--c)) right bottom / 14px 2px, linear-gradient(var(--c), var(--c)) right bottom / 2px 14px;
      background-repeat: no-repeat;
      filter: drop-shadow(0 0 4px var(--accent));
    }
    .hed-frame.is-selected .hed-anchor { display: block; }
    .hed-frame[data-anchor^='top'] .hed-anchor { top: 0; }
    .hed-frame[data-anchor^='bottom'] .hed-anchor { top: 100%; }
    .hed-frame[data-anchor$='left'] .hed-anchor { left: 0; }
    .hed-frame[data-anchor$='right'] .hed-anchor { left: 100%; }
    .hed-frame:is([data-anchor$='center'], [data-anchor$='stretch']) .hed-anchor { left: 50%; }
    .hed-frame.is-dragging { cursor: grabbing; }
    .hed-frame.is-grabbed { border-style: dashed; }
    @media (prefers-reduced-motion: no-preference) {
      html:not([data-motion='reduced']) .hed-frame.is-grabbed { animation: hed-grab 0.9s ease-in-out infinite alternate; }
    }
    @keyframes hed-grab { to { box-shadow: 0 0 0 1px rgba(0, 242, 255, 0.4), 0 0 34px rgba(0, 242, 255, 0.6); } }

    .hed-guides { position: absolute; inset: 0; pointer-events: none; }
    .hed-guide { position: absolute; background: var(--accent); box-shadow: 0 0 6px var(--accent); opacity: 0.9; }
    .hed-guide--x { top: 0; bottom: 0; width: 1px; margin-left: -0.5px; }
    .hed-guide--y { left: 0; right: 0; height: 1px; margin-top: -0.5px; }
    .hed-guide.is-item { background: none; box-shadow: none; }
    .hed-guide--x.is-item { border-left: 1px dashed var(--accent); }
    .hed-guide--y.is-item { border-top: 1px dashed var(--accent); }
    .hed-readout { position: absolute; display: none; padding: 3px 8px; border: 1px solid var(--accent-line); border-radius: 3px; background: rgba(2, 4, 8, 0.92); font-family: var(--font-mono); font-size: 11px; color: var(--accent); white-space: nowrap; pointer-events: none; }
    .hed-readout.is-on { display: block; }

    /* CHROME (over the window, never scaled) */
    .hed { position: fixed; inset: 0; z-index: 150; pointer-events: none; font-family: var(--font-ui); color: var(--text); outline: none; }
    .hed [hidden] { display: none !important; }
    .hed-panel { pointer-events: auto; background: var(--surface-strong); border: 1px solid var(--line); border-top-color: var(--accent-line); border-radius: var(--radius-lg); box-shadow: var(--shadow-panel); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); transition: opacity var(--motion-base) var(--ease-out); }
    /* A drag sees through the panels. */
    .hed.is-dragging .hed-panel { opacity: 0.18; pointer-events: none; }
    .hed i[data-lucide], .hed svg.lucide { width: 15px; height: 15px; flex: none; stroke-width: 2; }
    .hed-label { font-family: var(--font-display); font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-dim); }

    .hed-preview { position: fixed; display: none; outline: 1px solid rgba(230, 238, 248, 0.5); box-shadow: 0 0 0 200vmax rgba(2, 4, 8, 0.9); pointer-events: none; }
    .hed-preview.is-on { display: block; }
    .hed-preview__label { position: absolute; left: 0; bottom: calc(100% + 6px); font-family: var(--font-display); font-size: 11px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--text-dim); white-space: nowrap; }

    .hed-bar { position: absolute; top: 88px; left: 50%; transform: translateX(-50%); width: min(1060px, calc(100vw - 48px)); box-sizing: border-box; padding: 14px 18px 10px; display: flex; flex-direction: column; gap: 10px; }
    .hed-bar__row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .hed-title { margin: 0 10px 0 0; font-family: var(--font-display); font-size: 15px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: var(--text); white-space: nowrap; }
    .hed-field { display: flex; align-items: center; gap: 8px; }
    .hed-select { height: 34px; min-width: 210px; max-width: 260px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font-family: var(--font-ui); font-size: 16px; font-weight: 700; letter-spacing: 0.04em; cursor: pointer; }
    .hed-select option, .hed-select optgroup { background: var(--bg); color: var(--text); }
    .hed-status { font-family: var(--font-ui); font-size: 14px; font-weight: 600; letter-spacing: 0.04em; color: var(--text-dim); white-space: nowrap; }
    .hed-status.is-dirty { color: var(--xp); }
    .hed-status.is-dirty::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; background: var(--xp); vertical-align: 1px; }
    .hed-spacer { flex: 1 1 auto; }
    .hed-sep { width: 1px; height: 22px; margin: 0 4px; background: var(--line); }
    .hed-hint { margin: 0; padding-top: 8px; border-top: 1px solid var(--line); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.02em; color: var(--text-dim); text-align: center; }

    .hed-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 34px; padding: 0 12px; box-sizing: border-box; border: 1px solid var(--line); border-radius: var(--radius-sm); background: rgba(2, 4, 8, 0.55); color: var(--text-dim); font-family: var(--font-display); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; cursor: pointer; transition: color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out), background-color var(--motion-fast) var(--ease-out); }
    .hed-btn:hover:not(:disabled) { color: var(--text); border-color: rgba(230, 238, 248, 0.45); background: var(--panel-inset); }
    .hed-btn:disabled { opacity: 0.35; cursor: default; }
    .hed-btn[aria-pressed='true'] { color: var(--accent); border-color: var(--accent-line); background: var(--accent-soft); }
    .hed-btn--primary { color: var(--bg); border-color: var(--text); background: var(--text); }
    .hed-btn--primary:hover:not(:disabled) { color: var(--bg); border-color: #fff; background: #fff; }
    .hed-btn--danger { color: var(--danger); border-color: var(--danger-line); }
    .hed-btn--danger:hover:not(:disabled) { color: var(--danger); border-color: var(--danger); background: var(--danger-soft); }
    .hed-btn--icon { width: 34px; padding: 0; }
    .hed-btn--wide { width: 100%; }
    .hed :is(button, select, input, textarea):focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }

    .hed-seg { display: flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--bg); }
    .hed-seg__btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: 1 1 0; height: 28px; padding: 0 10px; border: 1px solid transparent; border-radius: 3px; background: transparent; color: var(--text-dim); font-family: var(--font-display); font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; cursor: pointer; }
    .hed-seg__btn:hover { color: var(--text); background: var(--panel-inset); }
    .hed-seg__btn[aria-pressed='true'] { color: var(--accent); border-color: var(--accent-line); background: var(--accent-soft); }

    .hed-more { position: relative; }
    .hed-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 2; min-width: 240px; padding: 6px; display: flex; flex-direction: column; border-radius: var(--radius-md); }
    .hed-menu button { display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 10px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text); font-family: var(--font-ui); font-size: 15px; font-weight: 600; text-align: left; cursor: pointer; }
    .hed-menu button:hover:not(:disabled) { background: var(--panel-inset); }
    .hed-menu button:disabled { opacity: 0.35; cursor: default; }
    .hed-menu hr { width: 100%; height: 1px; margin: 4px 0; border: 0; background: var(--line); }

    /* Mid-height on the side, never under the toolbar; it scrolls in a short window. */
    .hed-insp { position: absolute; top: clamp(244px, calc(50% - 190px), 400px); width: 320px; max-height: calc(100vh - 268px); box-sizing: border-box; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 14px; transition: opacity var(--motion-base) var(--ease-out); }
    .hed-insp[data-side='left'] { left: 32px; }
    .hed-insp[data-side='right'] { right: 32px; }
    .hed-insp__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .hed-insp__title { margin: 0; font-family: var(--font-display); font-size: 16px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: var(--text); }
    .hed-insp__place { margin: -8px 0 0; font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); }
    .hed-note { margin: 0; font-size: 15px; line-height: 1.35; color: var(--text-dim); }
    .hed-group { display: flex; flex-direction: column; gap: 8px; }
    .hed-models { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .hed-model { display: flex; flex-direction: column; gap: 7px; padding: 6px; border: 1px solid var(--line); border-radius: var(--radius-md); background: rgba(2, 4, 8, 0.6); color: var(--text-dim); cursor: pointer; text-align: left; }
    .hed-model:hover { border-color: rgba(230, 238, 248, 0.45); color: var(--text); }
    .hed-model[aria-pressed='true'] { border-color: var(--accent-line); background: var(--accent-soft); color: var(--accent); }
    .hed-model__name { padding: 0 2px 2px; font-family: var(--font-display); font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
    .hed-thumb { position: relative; display: block; height: 84px; overflow: hidden; border-radius: 6px; background: radial-gradient(ellipse at 50% 40%, #0d1424, #04060b 75%); pointer-events: none; }
    .hed-thumb__box { position: absolute; left: 0; top: 0; transform-origin: 0 0; --hud-u: 1; font-family: var(--font-ui); font-size: 19.2px; color: var(--text); }
    .hed-thumb__box.is-frame { container-type: size; }
    .hed-thumb :is(.ins-glance, .ins-demand) { opacity: 1; }
    .hed-thumb__slot { position: absolute; left: 0; top: 0; }
    .hed-thumb__slot.is-stretch { right: 0; }
    .hed-range { display: flex; flex-direction: column; gap: 6px; }
    .hed-range__head { display: flex; justify-content: space-between; align-items: baseline; }
    .hed-range output { font-family: var(--font-mono); font-size: 13px; color: var(--text); }
    .hed-range input { width: 100%; }
    .hed-rows { display: flex; flex-direction: column; gap: 4px; }
    .hed-row { display: grid; grid-template-columns: 1fr auto 16px; align-items: center; gap: 10px; height: 40px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: rgba(2, 4, 8, 0.5); color: var(--text); font-family: var(--font-ui); font-size: 16px; text-align: left; cursor: pointer; }
    .hed-row b { font-weight: 700; letter-spacing: 0.03em; }
    .hed-row span { font-size: 13px; color: var(--text-dim); }
    .hed-row:hover { border-color: rgba(230, 238, 248, 0.45); background: var(--panel-inset); }
    .hed-row.is-hidden b { color: var(--text-dim); }

    .hed-toast { position: absolute; top: 248px; left: 50%; transform: translate(-50%, -6px); padding: 8px 16px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-strong); font-size: 15px; font-weight: 600; letter-spacing: 0.03em; color: var(--text); opacity: 0; transition: opacity var(--motion-base) var(--ease-out), transform var(--motion-base) var(--ease-out); pointer-events: none; white-space: nowrap; }
    .hed-toast.is-on { opacity: 1; transform: translate(-50%, 0); }

    .hed-scrim { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(2, 4, 8, 0.6); pointer-events: auto; }
    .hed-dialog { width: min(480px, calc(100vw - 48px)); box-sizing: border-box; padding: 26px; display: flex; flex-direction: column; gap: 14px; }
    .hed-dialog__title { margin: 0; font-family: var(--font-display); font-size: 17px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text); }
    .hed-dialog__text { margin: 0; font-size: 17px; line-height: 1.4; color: var(--text-dim); }
    .hed-dialog__text b { color: var(--text); }
    .hed-dialog__error { margin: -4px 0 0; min-height: 1.2em; font-size: 15px; font-weight: 600; color: var(--danger); }
    .hed-dialog__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    .hed-input { width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font-family: var(--font-ui); font-size: 18px; font-weight: 600; }
    .hed-input--code { resize: none; font-family: var(--font-mono); font-size: 12px; font-weight: 400; line-height: 1.5; word-break: break-all; }
  `;
}
