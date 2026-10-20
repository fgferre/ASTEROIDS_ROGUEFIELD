// src/modules/ui/hud/editor/HudEditor.js
//
// HUD Edit Mode (Settings → Interface → Edit HUD Layout, or Edit HUD on the
// pause screen), after World of Warcraft's Edit Mode: the real HUD with its
// live values, a frame on every instrument. Click, Tab or the d-pad selects
// one; a drag moves it, snapping to the frame's edges, corners and centre
// lines and to the other instruments (Shift or Alt moves freely), and drops
// it anchored to its nearest corner or edge (layoutMath.js); the arrows
// nudge it 1 px (Shift 10). The inspector switches its model (live
// thumbnails), scale, opacity and visibility; the toolbar holds the
// layouts (built-in presets and the player's own, kept by the settings
// service: layoutStore.js), undo and redo, the grid, the safe area, the
// window shapes to preview, reset and layout codes. The run stays paused
// behind; UISystem hides its screens on open and brings them back in
// `onClose`.

import { DEFAULT_HUD_PRESET } from '../../../../data/ui/hudPresets.js';
import { pickFocusTarget } from '../../gamepadNav.js';
import {
  getInstrument,
  listInstruments,
  mountKey,
} from '../instruments/registry.js';
import { EditorDialogs } from './editorDialogs.js';
import { editorKey, editorPad } from './editorInput.js';
import {
  chromeMarkup,
  esc,
  hintText,
  inspectorItem,
  inspectorList,
  placeLabel,
  presetOptions,
  stageMarkup,
} from './editorView.js';
import { getEditorCss } from './editorStyles.js';
import { mountThumb, pushFeedSample, wardenSample } from './editorThumbs.js';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  sameLayout,
  undo,
} from './layoutHistory.js';
import {
  PREVIEW_ASPECTS,
  itemAt,
  itemRect,
  previewBox,
  snapLines,
  snapRect,
} from './layoutMath.js';
import {
  MAX_USER_PRESETS,
  activePreset,
  addPreset,
  allPresets,
  decodeLayout,
  encodeLayout,
  findPreset,
  instrumentCatalog,
  readUserPresets,
  removePreset,
  renamePreset,
  storePreset,
  withModel,
} from './layoutStore.js';

// Screen px within which a drag snaps, and before a press becomes a drag.
const SNAP_PX = 8;
const DRAG_START_PX = 3;
// px at a 1080p window: the safe margin inside each edge (a snap line too)
// and the grid's step.
const MARGIN = 24;
const GRID = 24;
// The on-ship frames round the ship (px at 1080p): the hull ring's radius,
// the recharges' band under it.
const SHIP_RING = 46;
const RECHARGE_BAND = { width: 120, height: 22, gap: 6 };
// A slot's unscaled box (px at 1080p) until the editor has seen it shown.
const FALLBACK_SIZES = {
  'run-info': [161, 63],
  warden: [760, 32],
  radar: [180, 180],
  feed: [240, 79],
  vitals: [400, 121],
  xp: [960, 19],
  build: [230, 45],
};

// What tells the inspector's controls apart (their data attributes).
const FOCUS_KEYS = ['model', 'visible', 'action', 'control', 'select'];

const replaceItem = (items, next) =>
  items.map((item) => (item.slot === next.slot ? next : item));

export class HudEditor {
  /**
   * `hud()`: the mounted AAAHudLayout.
   * `settings`: the settings service (video.hudLayout, video.hudPresets).
   * `setLayout(items)`: puts a layout on the HUD (TacticalHud.setLayout).
   * `refresh()`: feeds the HUD the services' values again.
   * `wardenLive()`: a Warden or Herald bar is up for real (no sample then).
   * `device()`: 'keyboard' | 'gamepad', for the hints.
   */
  constructor({ hud, settings, setLayout, refresh, wardenLive, device }) {
    this.hud = hud;
    this.settings = settings;
    this.setLayout = setLayout;
    this.refresh = refresh;
    this.wardenLive = wardenLive;
    this.device = device;
    this.state = null;
    this.onKeyDown = (event) => editorKey(this, event);
    this.onResize = () => {
      this.applyPreview();
      this.render();
    };
  }

  get isOpen() {
    return Boolean(this.state);
  }

  /**
   * Where the pad moves the focus like on any screen (UISystem): the open
   * dialog, or the panels after Y; null while it drives the instruments.
   */
  get navRoot() {
    const s = this.state;
    if (!s) return null;
    if (this.dialogs.isOpen) return this.el.scrim;
    return s.padPanel ? this.chrome : null;
  }

  /** Opens over the HUD; `onClose()` runs once it has closed. */
  open({ onClose }) {
    const hud = this.hud();
    if (this.state || !hud?.layer) return;
    const catalog = instrumentCatalog();
    const video = this.settings.getCategoryValues('video') || {};
    const preset = activePreset(video, catalog);
    this.state = {
      onClose,
      catalog,
      userPresets: readUserPresets(video.hudPresets, catalog),
      preset,
      saved: preset.items,
      items: preset.items,
      history: createHistory(preset.items),
      selected: null,
      grid: false,
      safe: false,
      aspect: 'window',
      preview: null,
      side: 'right',
      drag: null,
      grab: false,
      padPanel: false,
      menu: false,
      sizes: new Map(),
      rects: new Map(),
      view: null,
      thumbs: [],
      inspectorKey: '',
      optionsKey: '',
      feedTimer: null,
    };
    this.build(hud.layer);
    document.body.classList.add('is-hud-editing');
    hud.layer.classList.add('is-editing');
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('resize', this.onResize);
    this.setLayout(preset.items);
    // Today's values (and the ship's screen point, for its frames).
    this.refresh();
    this.showSamples();
    this.render();
    this.chrome.focus({ preventScroll: true });
  }

  // The stage inside the HUD layer, the chrome over the window, the sheet.
  build(layer) {
    this.styleEl = document.createElement('style');
    this.styleEl.dataset.hudEditor = '';
    this.styleEl.textContent = getEditorCss();
    document.head.appendChild(this.styleEl);

    this.stage = document.createElement('div');
    this.stage.className = 'hed-stage';
    this.stage.innerHTML = stageMarkup(this.state.catalog.slots);
    layer.appendChild(this.stage);

    this.chrome = document.createElement('div');
    this.chrome.className = 'hed';
    this.chrome.tabIndex = -1;
    this.chrome.innerHTML = chromeMarkup();
    document.body.appendChild(this.chrome);

    const q = (root, selector) => root.querySelector(selector);
    this.el = {
      grid: q(this.stage, '.hed-grid'),
      safe: q(this.stage, '.hed-safe'),
      guides: q(this.stage, '.hed-guides'),
      readout: q(this.stage, '.hed-readout'),
      frames: new Map(
        [...this.stage.querySelectorAll('.hed-frame')].map((el) => [
          el.dataset.slot,
          el,
        ])
      ),
      slots: new Map(
        this.state.catalog.slots.map((slot) => [
          slot,
          q(layer, `[data-slot="${slot}"]`),
        ])
      ),
      preview: q(this.chrome, '.hed-preview'),
      previewLabel: q(this.chrome, '.hed-preview__label'),
      select: q(this.chrome, '[data-control="preset"]'),
      status: q(this.chrome, '.hed-status'),
      hint: q(this.chrome, '.hed-hint'),
      menu: q(this.chrome, '.hed-menu'),
      menuButton: q(this.chrome, '[data-action="menu"]'),
      insp: q(this.chrome, '.hed-insp'),
      toast: q(this.chrome, '.hed-toast'),
      scrim: q(this.chrome, '.hed-scrim'),
    };

    this.dialogs = new EditorDialogs({
      scrim: this.el.scrim,
      toast: this.el.toast,
      refocus: () => this.chrome.focus({ preventScroll: true }),
    });
    this.stage.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.stage.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.stage.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.stage.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    this.chrome.addEventListener('click', (e) => this.onClick(e));
    this.chrome.addEventListener('input', (e) => this.onInput(e));
    this.chrome.addEventListener('change', (e) => this.onChange(e));
  }

  /** Leaves, asking first when there are unsaved changes. */
  requestClose() {
    if (!this.state || this.dialogs.isOpen) return;
    this.whenSaved(() => this.close());
  }

  close() {
    const s = this.state;
    if (!s) return;
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('resize', this.onResize);
    this.dialogs.dispose();
    window.clearTimeout(s.feedTimer);
    this.destroyThumbs();
    this.applyPreview(null);
    const hud = this.hud();
    hud.layer.classList.remove('is-editing');
    this.stage.remove();
    this.chrome.remove();
    this.styleEl.remove();
    document.body.classList.remove('is-hud-editing');
    this.state = null;
    // The saved layout, mounted fresh: the samples go.
    this.setLayout(s.saved);
    hud.setItems(s.saved, { remount: true });
    this.refresh();
    s.onClose();
  }

  // --- the layout on screen -------------------------------------------

  item(slot) {
    return this.state.items.find((item) => item.slot === slot);
  }

  get dirty() {
    return !sameLayout(this.state.items, this.state.saved);
  }

  // Puts `items` on the HUD without a history step (a drag in progress).
  show(items) {
    const s = this.state;
    const remounted = mountKey(items) !== mountKey(s.items);
    s.items = items;
    this.setLayout(items);
    if (remounted) this.showSamples();
    this.render();
  }

  // One edit: on the HUD and in the history (`key` folds a gesture).
  edit(items, key = null) {
    const s = this.state;
    s.history = commit(s.history, items, { key, now: performance.now() });
    this.show(items);
  }

  undo() {
    const s = this.state;
    if (!canUndo(s.history)) return;
    s.history = undo(s.history);
    this.show(s.history.present);
  }

  redo() {
    const s = this.state;
    if (!canRedo(s.history)) return;
    s.history = redo(s.history);
    this.show(s.history.present);
  }

  // The Warden bar (unless one is up for real) and the feed wear samples.
  showSamples() {
    const s = this.state;
    const hud = this.hud();
    if (!this.wardenLive()) {
      hud.instrument('warden')?.update(wardenSample(performance.now()));
    }
    window.clearTimeout(s.feedTimer);
    const cycle = () => {
      const feed = hud.instrument('feed');
      if (!this.state || !feed) return;
      pushFeedSample(feed);
      s.feedTimer = window.setTimeout(cycle, (feed.life ?? 6000) + 400);
    };
    cycle();
  }

  // --- geometry ---------------------------------------------------------

  // The HUD layer as laid out now: its 16:9 frame, the HUD unit, the
  // preview's scale.
  measure() {
    const layer = this.hud().layer;
    const frame = layer.querySelector('.hud-frame');
    const effective = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--hud-scale-effective'
      )
    );
    return {
      frame: {
        left: frame.offsetLeft,
        top: frame.offsetTop,
        width: frame.offsetWidth,
        height: frame.offsetHeight,
      },
      unit: (effective || 1.2) / 1.2,
      scale: this.state.preview?.scale ?? 1,
      width: layer.offsetWidth,
      height: layer.offsetHeight,
    };
  }

  // Where an item's frame goes, in the layer's pixels.
  rectFor(item, view) {
    const s = this.state;
    const u = view.unit;
    if (item.anchor === 'screen') {
      const ship =
        this.hud().slotState('hull-ring')?.ship ??
        this.hud().slotState('recharges')?.ship;
      const cx = ship ? (ship.x / 800) * view.width : view.width / 2;
      const cy = ship ? (ship.y / 600) * view.height : view.height / 2;
      const r = SHIP_RING * u;
      if (item.slot === 'hull-ring') {
        return { left: cx - r, top: cy - r, width: 2 * r, height: 2 * r };
      }
      const band = RECHARGE_BAND;
      return {
        left: cx - (band.width / 2) * u,
        top: cy + r + band.gap * u,
        width: band.width * u,
        height: band.height * u,
      };
    }
    const key = `${item.slot}/${item.model}`;
    const container = this.el.slots.get(item.slot);
    if (item.visible && container?.offsetWidth > 0) {
      s.sizes.set(key, {
        width: container.offsetWidth,
        height: container.offsetHeight,
      });
    }
    const [w, h] = FALLBACK_SIZES[item.slot] ?? [200, 60];
    const size = s.sizes.get(key) ?? { width: w * u, height: h * u };
    return itemRect(item, view.frame, size, u);
  }

  // A pointer's place in the layer's pixels (a preview scales the layer).
  toLayer(event) {
    const box = this.hud().layer.getBoundingClientRect();
    const scale = this.state.view.scale;
    return {
      x: (event.clientX - box.left) / scale,
      y: (event.clientY - box.top) / scale,
    };
  }

  clampToFrame(rect) {
    const { frame } = this.state.view;
    const clamp = (v, min, max) =>
      Math.min(Math.max(v, min), Math.max(min, max));
    return {
      ...rect,
      left: clamp(rect.left, frame.left, frame.left + frame.width - rect.width),
      top: clamp(rect.top, frame.top, frame.top + frame.height - rect.height),
    };
  }

  // The item moved to `rect` (kept in the frame), anchored again.
  moveTo(item, rect) {
    const { frame, unit } = this.state.view;
    return itemAt(item, this.clampToFrame(rect), frame, unit);
  }

  // The selected instrument moved `dx`, `dy` px at 1080p (arrows, d-pad).
  nudge(dx, dy) {
    const s = this.state;
    const item = s.selected && this.item(s.selected);
    const rect = item && s.rects.get(item.slot);
    if (!rect || item.anchor === 'screen') return;
    const u = s.view.unit;
    const stretch = item.anchor.endsWith('-stretch');
    const moved = {
      ...rect,
      left: rect.left + (stretch ? 0 : dx * u),
      top: rect.top + dy * u,
    };
    this.edit(
      replaceItem(s.items, this.moveTo(item, moved)),
      `nudge:${item.slot}`
    );
  }

  // --- selection ----------------------------------------------------------

  select(slot) {
    const s = this.state;
    s.selected = slot;
    s.grab = false;
    this.render();
  }

  // Slots in reading order: top, middle and bottom bands, left to right.
  readingOrder() {
    const s = this.state;
    const band = (r) =>
      Math.min(2, Math.floor(((r.top + r.height / 2) / s.view.height) * 3));
    const centre = (r) => r.left + r.width / 2;
    return [...s.catalog.slots].sort((a, b) => {
      const ra = s.rects.get(a);
      const rb = s.rects.get(b);
      return band(ra) - band(rb) || centre(ra) - centre(rb);
    });
  }

  cycle(step) {
    const order = this.readingOrder();
    const index = order.indexOf(this.state.selected);
    const next =
      index < 0
        ? step > 0
          ? 0
          : order.length - 1
        : (index + step + order.length) % order.length;
    this.select(order[next]);
  }

  // The nearest instrument `direction` of the selected one (or the centre).
  selectToward(direction) {
    const s = this.state;
    const { frame } = s.view;
    const from = (s.selected && s.rects.get(s.selected)) || {
      left: frame.left + frame.width / 2,
      top: frame.top + frame.height / 2,
      width: 0,
      height: 0,
    };
    const slots = s.catalog.slots.filter((slot) => slot !== s.selected);
    const index = pickFocusTarget(
      from,
      slots.map((slot) => s.rects.get(slot)),
      direction
    );
    if (index >= 0) this.select(slots[index]);
  }

  // --- pointer ------------------------------------------------------------

  onPointerDown(event) {
    const s = this.state;
    if (!s || this.dialogs.isOpen || event.button !== 0) return;
    this.closeMenu();
    this.chrome.focus({ preventScroll: true });
    const frame = event.target.closest('.hed-frame');
    if (!frame) {
      this.select(null);
      return;
    }
    event.preventDefault();
    const slot = frame.dataset.slot;
    s.padPanel = false;
    this.select(slot);
    const item = this.item(slot);
    const rect = s.rects.get(slot);
    if (item.anchor === 'screen' || !rect) return;
    const { view } = s;
    const others = s.catalog.slots
      .filter(
        (other) =>
          other !== slot &&
          !s.catalog.screen.has(other) &&
          this.item(other).visible
      )
      .map((other) => s.rects.get(other));
    s.drag = {
      item,
      rect,
      pointerId: event.pointerId,
      point: this.toLayer(event),
      moved: false,
      lines: snapLines(view.frame, others, {
        margin: MARGIN * view.unit,
        grid: s.grid ? GRID * view.unit : 0,
      }),
    };
    frame.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    const s = this.state;
    const drag = s?.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = this.toLayer(event);
    const dx = point.x - drag.point.x;
    const dy = point.y - drag.point.y;
    if (!drag.moved && Math.hypot(dx, dy) * s.view.scale < DRAG_START_PX) {
      return;
    }
    drag.moved = true;
    this.chrome.classList.add('is-dragging');
    const stretch = drag.item.anchor.endsWith('-stretch');
    let rect = {
      ...drag.rect,
      left: drag.rect.left + (stretch ? 0 : dx),
      top: drag.rect.top + dy,
    };
    let guides = [];
    if (!event.shiftKey && !event.altKey) {
      const snapped = snapRect(rect, drag.lines, SNAP_PX / s.view.scale);
      rect = { ...snapped.rect, left: stretch ? rect.left : snapped.rect.left };
      guides = snapped.guides.filter((g) => !(stretch && g.axis === 'x'));
    }
    const next = this.moveTo(drag.item, rect);
    this.show(replaceItem(s.items, next));
    this.drawGuides(guides);
    this.showReadout(next);
  }

  onPointerUp(event) {
    const s = this.state;
    const drag = s?.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    s.drag = null;
    this.chrome.classList.remove('is-dragging');
    this.drawGuides([]);
    this.showReadout(null);
    if (drag.moved) this.edit(s.items);
    else this.render();
  }

  drawGuides(guides) {
    this.el.guides.innerHTML = guides
      .map(
        ({ axis, at, kind }) =>
          `<i class="hed-guide hed-guide--${axis} is-${kind}" style="${axis === 'x' ? 'left' : 'top'}: ${at}px"></i>`
      )
      .join('');
  }

  showReadout(item) {
    const { readout } = this.el;
    readout.classList.toggle('is-on', Boolean(item));
    if (!item) return;
    const rect = this.state.rects.get(item.slot);
    readout.textContent = placeLabel(item);
    readout.style.left = `${rect.left + rect.width + 8}px`;
    readout.style.top = `${rect.top}px`;
  }

  /** A pad menu press (UISystem routes them here while open). */
  handlePadNav(action) {
    editorPad(this, action);
  }

  setGrab(on) {
    this.state.grab = on;
    this.render();
  }

  // --- the inspector's edits ---------------------------------------------

  setModel(model) {
    const item = this.item(this.state.selected);
    if (!item || item.model === model) return;
    this.edit(replaceItem(this.state.items, withModel(item, model)));
  }

  stepModel(step) {
    const item = this.item(this.state.selected);
    const models = listInstruments(item.slot).map((m) => m.id);
    const index = models.indexOf(item.model);
    this.setModel(models[(index + step + models.length) % models.length]);
  }

  setVisible(visible) {
    const item = this.item(this.state.selected);
    if (!item || item.visible === visible) return;
    this.edit(replaceItem(this.state.items, { ...item, visible }));
  }

  // Scale and opacity: one slider drag is one step.
  setValue(control, value) {
    const item = this.item(this.state.selected);
    if (!item || !Number.isFinite(value)) return;
    this.edit(
      replaceItem(this.state.items, { ...item, [control]: value }),
      `${control}:${item.slot}`
    );
  }

  resetItem() {
    const s = this.state;
    const saved = s.saved.find((item) => item.slot === s.selected);
    if (saved) this.edit(replaceItem(s.items, saved));
  }

  // --- toolbar --------------------------------------------------------------

  toggle(name) {
    this.state[name] = !this.state[name];
    this.render();
  }

  setAspect(id) {
    this.state.aspect = id;
    this.applyPreview();
    this.render();
  }

  // The layer laid out as the previewed window and scaled into this one.
  applyPreview(ratio = this.ratio()) {
    const s = this.state;
    const layer = this.hud().layer;
    const box = ratio
      ? previewBox(ratio, window.innerWidth, window.innerHeight)
      : null;
    s.preview = box;
    Object.assign(layer.style, {
      width: box ? `${box.width}px` : '',
      height: box ? `${box.height}px` : '',
      left: box ? `${box.left}px` : '',
      top: box ? `${box.top}px` : '',
      transform: box ? `scale(${box.scale})` : '',
      transformOrigin: box ? '0 0' : '',
    });
    this.hud().invalidatePanelCorners();
  }

  ratio() {
    return PREVIEW_ASPECTS.find((a) => a.id === this.state.aspect)?.ratio;
  }

  openMenu() {
    this.state.menu = true;
    this.el.menu.hidden = false;
    this.el.menuButton.setAttribute('aria-expanded', 'true');
    this.el.menu.querySelector('button:not(:disabled)')?.focus();
  }

  closeMenu() {
    if (!this.state?.menu) return;
    this.state.menu = false;
    this.el.menu.hidden = true;
    this.el.menuButton.setAttribute('aria-expanded', 'false');
  }

  onClick(event) {
    const s = this.state;
    if (!s) return;
    const target = event.target;
    const dialogButton = target.closest('[data-dialog]');
    if (dialogButton) {
      this.dialogs.run(dialogButton.dataset.dialog);
      return;
    }
    if (this.dialogs.isOpen) {
      if (target === this.el.scrim) this.dialogs.run('cancel');
      return;
    }
    const action = target.closest('[data-action]')?.dataset.action;
    if (action !== 'menu') this.closeMenu();
    const pick = (attr) => target.closest(`[data-${attr}]`)?.dataset;
    if (pick('select')) this.select(pick('select').select);
    else if (pick('model')) this.setModel(pick('model').model);
    else if (pick('visible'))
      this.setVisible(pick('visible').visible === 'true');
    else if (pick('aspect')) this.setAspect(pick('aspect').aspect);
    else if (action) this.runAction(action);
  }

  runAction(action) {
    const s = this.state;
    switch (action) {
      case 'menu':
        if (s.menu) this.closeMenu();
        else this.openMenu();
        break;
      case 'done':
        this.requestClose();
        break;
      case 'save':
        this.save();
        break;
      case 'save-as':
        this.dialogs.askName(
          {
            title: 'Save as new layout',
            text: 'The layout on screen becomes one of your own.',
            value: s.preset.builtIn ? 'My Layout' : `${s.preset.name} Copy`,
            ok: 'Save',
          },
          (name) => this.createPreset(name)
        );
        break;
      case 'rename':
        this.dialogs.askName(
          {
            title: 'Rename layout',
            text: '',
            value: s.preset.name,
            ok: 'Rename',
          },
          (name) => {
            s.userPresets = renamePreset(s.userPresets, s.preset.id, name);
            s.preset = findPreset(s.preset.id, s.userPresets);
            this.persist();
            this.dialogs.toast(`Renamed to ${s.preset.name}`);
            this.render();
          }
        );
        break;
      case 'duplicate':
        this.createPreset(`${s.preset.name} Copy`);
        break;
      case 'delete':
        this.dialogs.open(
          'confirm-delete',
          { name: s.preset.name },
          {
            ok: () => {
              const name = s.preset.name;
              s.userPresets = removePreset(s.userPresets, s.preset.id);
              this.loadPreset(findPreset(DEFAULT_HUD_PRESET, s.userPresets));
              this.dialogs.toast(`Deleted ${name}`);
            },
          }
        );
        break;
      case 'copy-code':
        this.showCode();
        break;
      case 'paste-code':
        this.dialogs.open(
          'paste',
          {},
          {
            ok: (code) => {
              const result = decodeLayout(code, s.catalog);
              if (!result.ok) {
                this.dialogs.error(result.error);
                return false;
              }
              this.dialogs.close();
              this.edit(result.items);
              this.dialogs.toast('Layout code applied. Save to keep it.');
              return true;
            },
          }
        );
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'grid':
      case 'safe':
        this.toggle(action);
        break;
      case 'reset-all':
        this.edit(s.saved);
        this.dialogs.toast(`Back to ${s.preset.name} as saved`);
        break;
      case 'reset-item':
        this.resetItem();
        break;
      case 'deselect':
        this.select(null);
        break;
      default:
        break;
    }
  }

  onInput(event) {
    const control = event.target.dataset?.control;
    if (control === 'scale' || control === 'opacity') {
      this.setValue(control, Number(event.target.value));
    }
  }

  onChange(event) {
    if (event.target.dataset?.control === 'preset') {
      this.switchPreset(event.target.value);
    }
  }

  // --- layouts ----------------------------------------------------------------

  switchPreset(id) {
    const s = this.state;
    const target = findPreset(id, s.userPresets);
    if (!target || target.id === s.preset.id) {
      this.render();
      return;
    }
    this.whenSaved(() => this.loadPreset(target));
    this.render();
  }

  // `preset` becomes the active layout, on screen and in the settings.
  loadPreset(preset) {
    const s = this.state;
    s.preset = preset;
    s.saved = preset.items;
    s.history = createHistory(preset.items);
    this.persist();
    this.show(preset.items);
  }

  // Runs `then` once nothing is left unsaved: asks Save / Discard / Cancel.
  whenSaved(then) {
    const s = this.state;
    if (!this.dirty) {
      then();
      return;
    }
    this.dialogs.open(
      'unsaved',
      { name: s.preset.name },
      {
        save: () => this.save(then),
        discard: () => {
          this.show(s.saved);
          then();
        },
        cancel: () => this.render(),
      }
    );
  }

  // Saves the layout on screen: into the active layout when it is the
  // player's, else as a new one (a built-in preset never changes).
  save(then = null) {
    const s = this.state;
    if (s.preset.builtIn) {
      this.dialogs.askName(
        {
          title: 'Save as new layout',
          text: `${esc(s.preset.name)} is a built-in preset: your changes go into a layout of your own.`,
          value: 'My Layout',
          ok: 'Save',
        },
        (name) => {
          if (this.createPreset(name)) then?.();
        }
      );
      return;
    }
    s.userPresets = storePreset(s.userPresets, s.preset.id, s.items);
    s.preset = findPreset(s.preset.id, s.userPresets);
    s.saved = s.items;
    this.persist();
    this.dialogs.toast(`Saved ${s.preset.name}`);
    this.render();
    then?.();
  }

  // A new layout of the player's from what is on screen, made active.
  createPreset(name) {
    const s = this.state;
    const added = addPreset(s.userPresets, name, s.items);
    if (!added) {
      this.dialogs.toast(
        `${MAX_USER_PRESETS} layouts saved: delete one first.`
      );
      return false;
    }
    s.userPresets = added.presets;
    s.preset = findPreset(added.id, s.userPresets);
    s.saved = s.items;
    this.persist();
    this.dialogs.toast(`Saved as ${s.preset.name}`);
    this.render();
    return true;
  }

  persist() {
    const s = this.state;
    const options = { source: 'hud-editor' };
    this.settings.setSetting('video', 'hudPresets', s.userPresets, options);
    this.settings.setSetting('video', 'hudLayout', s.preset.id, options);
  }

  showCode() {
    const code = encodeLayout(this.state.items);
    const copy = () =>
      navigator.clipboard
        ?.writeText(code)
        .then(() =>
          this.dialogs.text(
            'Copied to the clipboard. Share it: anyone can paste it in their HUD editor.'
          )
        )
        .catch(() =>
          this.dialogs.text('Select it and copy it (Ctrl+C) to share it.')
        );
    this.dialogs.open(
      'code',
      { code, text: 'Anyone can paste this in their HUD editor.' },
      {
        copy: () => {
          this.el.scrim.querySelector('[data-dialog-input]')?.select();
          copy();
          return false;
        },
      }
    );
    copy();
  }

  // --- drawing ------------------------------------------------------------------

  render() {
    const s = this.state;
    if (!s) return;
    const view = this.measure();
    s.view = view;
    for (const item of s.items) {
      const rect = this.rectFor(item, view);
      s.rects.set(item.slot, rect);
      const el = this.el.frames.get(item.slot);
      const onShip = item.anchor === 'screen';
      Object.assign(el.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      el.dataset.anchor = item.anchor;
      // The name tag sits above the frame, else inside a tall one, else under.
      const selected = item.slot === s.selected;
      el.dataset.tag =
        rect.top >= 22 * view.unit
          ? 'above'
          : rect.height >= 44 * view.unit && !selected
            ? 'inside'
            : 'below';
      el.classList.toggle('is-selected', selected);
      el.classList.toggle('is-hidden', !item.visible);
      el.classList.toggle('is-ship', onShip);
      el.classList.toggle('is-grabbed', item.slot === s.selected && s.grab);
      el.classList.toggle('is-dragging', s.drag?.item.slot === item.slot);
      el.querySelector('em').textContent = !item.visible
        ? 'Hidden'
        : onShip
          ? 'On the ship'
          : '';
    }
    this.renderOverlays(view);
    this.renderToolbar();
    this.renderInspector();
  }

  // After each drawn frame (UISystem.placeOnField): the on-ship frames follow
  // the ship, as the camera keeps moving behind the paused run.
  followShip() {
    const s = this.state;
    if (!s?.view) return;
    for (const item of s.items) {
      if (item.anchor !== 'screen') continue;
      const rect = this.rectFor(item, s.view);
      s.rects.set(item.slot, rect);
      const { style } = this.el.frames.get(item.slot);
      style.left = `${rect.left}px`;
      style.top = `${rect.top}px`;
    }
  }

  renderOverlays(view) {
    const s = this.state;
    const { frame, unit } = view;
    const place = (el) =>
      Object.assign(el.style, {
        left: `${frame.left}px`,
        top: `${frame.top}px`,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
      });
    this.el.grid.hidden = !s.grid;
    this.el.safe.hidden = !s.safe;
    place(this.el.grid);
    place(this.el.safe);
    this.el.grid.style.setProperty('--grid', `${GRID * unit}px`);
    this.el.safe.style.setProperty('--margin', `${MARGIN * unit}px`);
    this.el.safe.dataset.outside = String(frame.width < view.width - 1);

    const box = s.preview;
    this.el.preview.classList.toggle('is-on', Boolean(box));
    if (box) {
      Object.assign(this.el.preview.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width * box.scale}px`,
        height: `${box.height * box.scale}px`,
      });
      this.el.previewLabel.textContent = `${s.aspect} preview · ${box.width} × ${box.height}`;
    }
  }

  renderToolbar() {
    const s = this.state;
    const q = (selector) => this.chrome.querySelector(selector);
    const presets = allPresets(s.userPresets);
    const optionsKey = JSON.stringify(presets.map((p) => [p.id, p.name]));
    if (optionsKey !== s.optionsKey) {
      s.optionsKey = optionsKey;
      this.el.select.innerHTML = presetOptions(presets, s.preset.id);
    }
    this.el.select.value = s.preset.id;
    const dirty = this.dirty;
    this.el.status.classList.toggle('is-dirty', dirty);
    this.el.status.textContent = dirty
      ? 'Unsaved changes'
      : s.preset.builtIn
        ? 'Built-in preset'
        : 'Saved';
    q('[data-action="save"]').disabled = !dirty;
    q('[data-action="undo"]').disabled = !canUndo(s.history);
    q('[data-action="redo"]').disabled = !canRedo(s.history);
    q('[data-action="reset-all"]').disabled = !dirty;
    q('[data-action="rename"]').disabled = s.preset.builtIn;
    q('[data-action="delete"]').disabled = s.preset.builtIn;
    q('[data-action="grid"]').setAttribute('aria-pressed', String(s.grid));
    q('[data-action="safe"]').setAttribute('aria-pressed', String(s.safe));
    this.chrome.querySelectorAll('[data-aspect]').forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.aspect === s.aspect)
      );
    });
    this.el.hint.textContent = hintText(this.device());
  }

  renderInspector() {
    const s = this.state;
    const item = s.selected && this.item(s.selected);
    const { insp } = this.el;
    const rect = item && s.rects.get(item.slot);
    if (rect) {
      // Docked across the screen from the selected instrument.
      const box = this.hud().layer.getBoundingClientRect();
      const centre = box.left + (rect.left + rect.width / 2) * s.view.scale;
      const third = window.innerWidth / 3;
      if (centre > window.innerWidth - third) s.side = 'left';
      else if (centre < third) s.side = 'right';
    }
    insp.dataset.side = s.side;

    const key = item
      ? `${item.slot}|${item.model}|${item.visible}`
      : `list|${mountKey(s.items)}`;
    if (key !== s.inspectorKey) {
      s.inspectorKey = key;
      this.destroyThumbs();
      // The focused control's twin gets the focus back after the redraw.
      const focused = insp.contains(document.activeElement)
        ? document.activeElement
        : null;
      const twin =
        focused && FOCUS_KEYS.find((attr) => attr in focused.dataset);
      const value = twin && focused.dataset[twin];
      insp.innerHTML = item
        ? inspectorItem(item, listInstruments(item.slot))
        : inspectorList(
            this.readingOrder().map((slot) => this.item(slot)),
            ({ slot, model }) => getInstrument(slot, model)?.name ?? model
          );
      if (item) this.mountThumbs(item);
      globalThis.lucide?.createIcons();
      if (focused) {
        const again = twin && insp.querySelector(`[data-${twin}="${value}"]`);
        (again ?? this.chrome).focus({ preventScroll: true });
      }
    }
    if (!item) return;
    const place = insp.querySelector('[data-output="place"]');
    if (place) place.textContent = placeLabel(item);
    for (const control of ['scale', 'opacity']) {
      const input = insp.querySelector(`[data-control="${control}"]`);
      if (!input) continue;
      if (document.activeElement !== input) input.value = String(item[control]);
      insp.querySelector(`[data-output="${control}"]`).textContent =
        `${Math.round(item[control] * 100)}%`;
    }
  }

  mountThumbs(item) {
    const s = this.state;
    const hud = this.hud();
    const wardenLive = this.wardenLive();
    for (const stage of this.el.insp.querySelectorAll('[data-thumb]')) {
      const model = getInstrument(item.slot, stage.dataset.thumb);
      s.thumbs.push(
        mountThumb(model, stage, {
          onShip: item.anchor === 'screen',
          stretch: withModel(item, model.id).anchor.endsWith('-stretch'),
          live: hud.slotState(item.slot),
          wardenLive,
        })
      );
    }
  }

  destroyThumbs() {
    this.state.thumbs.forEach((destroy) => destroy());
    this.state.thumbs = [];
  }
}
