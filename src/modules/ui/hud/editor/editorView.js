// src/modules/ui/hud/editor/editorView.js
//
// The HUD editor's markup (HudEditor.js owns the events and the state): the
// stage drawn over the instruments inside the HUD layer, the chrome over
// the window (toolbar, inspector, preview mask, dialogs) and the names the
// player reads. Every string from the player (a preset name, a code) goes
// through esc().

import { PREVIEW_ASPECTS } from './layoutMath.js';
import { MAX_NAME_LENGTH, OPACITY_RANGE, SCALE_RANGE } from './layoutStore.js';

/** The instruments' names in the editor. */
export const SLOT_NAMES = Object.freeze({
  'run-info': 'Run Info',
  warden: 'Warden Bar',
  radar: 'Radar',
  feed: 'Kill Feed',
  vitals: 'Vitals',
  xp: 'XP Line',
  build: 'Build',
  'hull-ring': 'Hull Ring',
  recharges: 'Recharges',
});

const ANCHOR_NAMES = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
  'top-stretch': 'Top, full width',
  'bottom-stretch': 'Bottom, full width',
  screen: 'On the ship',
};

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/** Text made safe for markup. */
export const esc = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ENTITIES[c]);

const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const percent = (n) => `${Math.round(n * 100)}%`;

/** "Top right · 24, 24" (px from that corner) for the inspector and the drag readout. */
export function placeLabel(item) {
  const where = ANCHOR_NAMES[item.anchor];
  return item.anchor === 'screen' ? where : `${where} · ${item.x}, ${item.y}`;
}

/** The stage: grid, safe area, guides and one frame per slot. */
export function stageMarkup(slots) {
  const frames = slots
    .map(
      (slot) => `
      <div class="hed-frame" data-slot="${slot}">
        <span class="hed-tag"><b>${SLOT_NAMES[slot]}</b><em></em></span>
        <i class="hed-anchor"></i>
      </div>`
    )
    .join('');
  return `
    <div class="hed-grid"></div>
    <div class="hed-safe">
      <span class="hed-safe__label">HUD frame · 16:9</span>
      <div class="hed-safe__margin"><span class="hed-safe__label">Safe margin</span></div>
    </div>
    <div class="hed-guides"></div>
    ${frames}
    <div class="hed-readout"></div>`;
}

const aspectButtons = () =>
  PREVIEW_ASPECTS.map(
    ({ id, label }) =>
      `<button type="button" class="hed-seg__btn" data-aspect="${id}" aria-pressed="false">${label}</button>`
  ).join('');

/** The chrome: preview mask, toolbar, inspector, dialog host and toast. */
export function chromeMarkup() {
  return `
    <div class="hed-preview" aria-hidden="true"><span class="hed-preview__label"></span></div>
    <header class="hed-panel hed-bar" role="toolbar" aria-label="HUD Edit Mode">
      <div class="hed-bar__row">
        <h2 class="hed-title">HUD Edit Mode</h2>
        <label class="hed-field">
          <span class="hed-label">Layout</span>
          <select class="hed-select" data-control="preset" aria-label="Layout"></select>
        </label>
        <span class="hed-status" aria-live="polite"></span>
        <span class="hed-spacer"></span>
        <button type="button" class="hed-btn" data-action="save">${icon('save')}Save</button>
        <button type="button" class="hed-btn" data-action="save-as">${icon('copy-plus')}Save as New</button>
        <div class="hed-more">
          <button type="button" class="hed-btn hed-btn--icon" data-action="menu" aria-haspopup="true" aria-expanded="false" aria-label="More layout actions">${icon('ellipsis')}</button>
          <div class="hed-panel hed-menu" role="menu" hidden>
            <button type="button" role="menuitem" data-action="rename">${icon('pencil')}Rename…</button>
            <button type="button" role="menuitem" data-action="duplicate">${icon('copy')}Duplicate</button>
            <button type="button" role="menuitem" data-action="delete">${icon('trash-2')}Delete…</button>
            <hr />
            <button type="button" role="menuitem" data-action="copy-code">${icon('share-2')}Copy Layout Code</button>
            <button type="button" role="menuitem" data-action="paste-code">${icon('clipboard-paste')}Paste Layout Code…</button>
          </div>
        </div>
        <button type="button" class="hed-btn hed-btn--primary" data-action="done">${icon('check')}Done</button>
      </div>
      <div class="hed-bar__row">
        <button type="button" class="hed-btn" data-action="undo" aria-label="Undo">${icon('undo-2')}Undo</button>
        <button type="button" class="hed-btn" data-action="redo" aria-label="Redo">${icon('redo-2')}Redo</button>
        <span class="hed-sep"></span>
        <button type="button" class="hed-btn" data-action="grid" aria-pressed="false">${icon('grid-3x3')}Grid</button>
        <button type="button" class="hed-btn" data-action="safe" aria-pressed="false">${icon('scan')}Safe Area</button>
        <span class="hed-sep"></span>
        <span class="hed-label">Frame</span>
        <div class="hed-seg" role="group" aria-label="Preview window shape">${aspectButtons()}</div>
        <span class="hed-spacer"></span>
        <button type="button" class="hed-btn" data-action="reset-all">${icon('rotate-ccw')}Reset All</button>
      </div>
      <p class="hed-hint"></p>
    </header>
    <aside class="hed-panel hed-insp" aria-label="Instrument"></aside>
    <div class="hed-toast" role="status"></div>
    <div class="hed-scrim" hidden></div>`;
}

/** The toolbar's layout picker: built-in presets, then the player's. */
export function presetOptions(presets, activeId) {
  const group = (label, list) =>
    list.length
      ? `<optgroup label="${label}">${list
          .map(
            ({ id, name }) =>
              `<option value="${esc(id)}"${id === activeId ? ' selected' : ''}>${esc(name)}</option>`
          )
          .join('')}</optgroup>`
      : '';
  return (
    group(
      'Presets',
      presets.filter((p) => p.builtIn)
    ) +
    group(
      'Your Layouts',
      presets.filter((p) => !p.builtIn)
    )
  );
}

/** Keyboard or pad: how to drive the editor. */
export function hintText(device) {
  return device === 'gamepad'
    ? 'D-pad select · A move · LB / RB model · X show / hide · Y panels · B back'
    : 'Drag to move · Shift or Alt moves freely · Arrows nudge (Shift ×10) · Tab next · Ctrl+Z / Ctrl+Shift+Z · Esc done';
}

/** The inspector with nothing selected: every instrument, to pick one. */
export function inspectorList(items, modelName) {
  const rows = items
    .map(
      (item) => `
      <button type="button" class="hed-row${item.visible ? '' : ' is-hidden'}" data-select="${item.slot}">
        <b>${SLOT_NAMES[item.slot]}</b>
        <span>${esc(modelName(item))}${item.visible ? '' : ' · Hidden'}</span>
        ${icon('chevron-right')}
      </button>`
    )
    .join('');
  return `
    <div class="hed-insp__head">
      <h3 class="hed-insp__title">Instruments</h3>
    </div>
    <p class="hed-note">Click an instrument on the screen or press Tab. Drag it to move it.</p>
    <div class="hed-rows">${rows}</div>`;
}

const range = (control, label, value, { min, max }) => `
  <label class="hed-range">
    <span class="hed-range__head"><span class="hed-label">${label}</span><output data-output="${control}">${percent(value)}</output></span>
    <input type="range" class="settings-range-input" data-control="${control}" min="${min}" max="${max}" step="0.05" value="${value}" />
  </label>`;

/**
 * The inspector for one item: its models (each card holds a live
 * thumbnail, mounted after), scale, opacity, show / hide and reset.
 */
export function inspectorItem(item, models) {
  const onShip = item.anchor === 'screen';
  const cards = models
    .map(
      (model) => `
      <button type="button" class="hed-model" data-model="${model.id}" aria-pressed="${model.id === item.model}">
        <span class="hed-thumb" data-thumb="${model.id}"></span>
        <span class="hed-model__name">${esc(model.name)}</span>
      </button>`
    )
    .join('');
  return `
    <div class="hed-insp__head">
      <h3 class="hed-insp__title">${SLOT_NAMES[item.slot]}</h3>
      <button type="button" class="hed-btn hed-btn--icon" data-action="deselect" aria-label="Close">${icon('x')}</button>
    </div>
    <p class="hed-insp__place" data-output="place">${esc(placeLabel(item))}</p>
    <div class="hed-group">
      <span class="hed-label">Model</span>
      <div class="hed-models">${cards}</div>
    </div>
    ${
      onShip
        ? '<p class="hed-note">Drawn on the ship: it follows the ship and keeps its size.</p>'
        : range('scale', 'Scale', item.scale, SCALE_RANGE)
    }
    ${range('opacity', 'Opacity', item.opacity, OPACITY_RANGE)}
    <div class="hed-group">
      <span class="hed-label">Show</span>
      <div class="hed-seg" role="group" aria-label="Show">
        <button type="button" class="hed-seg__btn" data-visible="true" aria-pressed="${item.visible}">${icon('eye')}Shown</button>
        <button type="button" class="hed-seg__btn" data-visible="false" aria-pressed="${!item.visible}">${icon('eye-off')}Hidden</button>
      </div>
    </div>
    <button type="button" class="hed-btn hed-btn--wide" data-action="reset-item">${icon('rotate-ccw')}Reset Instrument</button>`;
}

const actions = (list) =>
  `<div class="hed-dialog__actions">${list
    .map(
      ([action, label, kind = '']) =>
        `<button type="button" class="hed-btn${kind ? ` hed-btn--${kind}` : ''}" data-dialog="${action}">${label}</button>`
    )
    .join('')}</div>`;

/**
 * A dialog: 'unsaved' (Save / Discard / Cancel), 'name' (a preset name),
 * 'confirm-delete', 'code' (a layout code to copy) and 'paste'.
 */
export function dialogMarkup(kind, data = {}) {
  const head = (title, text) =>
    `<h3 class="hed-dialog__title" id="hed-dialog-title">${title}</h3>${text ? `<p class="hed-dialog__text">${text}</p>` : ''}`;
  let body = '';
  if (kind === 'unsaved') {
    body =
      head(
        'Unsaved changes',
        `Save the changes to <b>${esc(data.name)}</b> before you go on?`
      ) +
      actions([
        ['cancel', 'Cancel'],
        ['discard', 'Discard', 'danger'],
        ['save', 'Save', 'primary'],
      ]);
  } else if (kind === 'name') {
    body =
      head(data.title, data.text) +
      `<input class="hed-input" data-dialog-input type="text" maxlength="${MAX_NAME_LENGTH}" value="${esc(data.value)}" aria-label="Layout name" spellcheck="false" />
      <p class="hed-dialog__error" data-dialog-error></p>` +
      actions([
        ['cancel', 'Cancel'],
        ['ok', data.ok, 'primary'],
      ]);
  } else if (kind === 'confirm-delete') {
    body =
      head(
        'Delete layout',
        `Delete <b>${esc(data.name)}</b>? This can't be undone.`
      ) +
      actions([
        ['cancel', 'Cancel'],
        ['ok', 'Delete', 'danger'],
      ]);
  } else if (kind === 'code') {
    body =
      head('Layout code', esc(data.text)) +
      `<textarea class="hed-input hed-input--code" data-dialog-input readonly rows="4" aria-label="Layout code">${esc(data.code)}</textarea>` +
      actions([
        ['copy', 'Copy'],
        ['cancel', 'Close', 'primary'],
      ]);
  } else if (kind === 'paste') {
    body =
      head(
        'Paste layout code',
        'Paste a code copied from Copy Layout Code. It replaces the layout on screen; Save keeps it.'
      ) +
      `<textarea class="hed-input hed-input--code" data-dialog-input rows="4" aria-label="Layout code" spellcheck="false" placeholder="HUD1.…"></textarea>
      <p class="hed-dialog__error" data-dialog-error></p>` +
      actions([
        ['cancel', 'Cancel'],
        ['ok', 'Apply', 'primary'],
      ]);
  }
  return `<div class="hed-panel hed-dialog" role="dialog" aria-modal="true" aria-labelledby="hed-dialog-title">${body}</div>`;
}
