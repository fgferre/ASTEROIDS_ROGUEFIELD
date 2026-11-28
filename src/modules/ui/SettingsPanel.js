// src/modules/ui/SettingsPanel.js
//
// The Settings overlay, opened from the menu or over a stopped run:
// six sections (settings/settingsGroups.js) with a left navigation, one
// control per schema field with its live preview, greyed when another
// setting makes it useless, key and pad binding capture, and the
// accessibility and video preferences applied to the page as they change.

import { settingPreview } from './settingsPreview.js';
import {
  formatBindingLabel,
  resolveKeyboardBindingFromPayload,
} from './settings/bindingKeys.js';
import {
  formatRangeValue,
  renderSettingField,
} from './settings/fieldRenderers.js';
import {
  SETTINGS_SECTIONS,
  inactiveReason,
  sectionFieldRefs,
  splitFieldRef,
} from './settings/settingsGroups.js';
import { asArray } from '../upgradeCatalog.js';
import { resolveService } from '../../core/serviceUtils.js';
import { inputLayers } from '../input/inputLayers.js';

export class SettingsPanel {
  /**
   * `refs`: the overlay's nodes { overlay, tabs, container, resetBtn, closeButtons }.
   * `pauseSettingsBtn`: gets the focus back on close when the opener is gone.
   * `settings`: the settings service (schema, values, writes, resets), or none.
   * `schema`: SETTINGS_SCHEMA, used when the service has no getSchema().
   * `emit(name, payload)`: sends ui-hover and input-binding-capture.
   * `announceVisibility(isOpen, payload)`: the overlay opened or closed.
   * `setHudBaseScale(scale)`: the HUD scale setting; HUD and viewport follow.
   * `livePreset()`: the preset Auto quality runs now (Graphics preview).
   * `openHudEditor()`: HUD & text → Edit HUD Layout.
   * `dependencies`: UISystem's, for the live 'difficulty' (Pressure rung,
   *   greys Difficulty) and 'player' (cannon on the nose, greys the aim-mode
   *   key).
   */
  constructor({
    refs,
    pauseSettingsBtn,
    settings,
    schema,
    emit,
    announceVisibility,
    setHudBaseScale,
    livePreset,
    openHudEditor,
    dependencies,
  }) {
    this.refs = refs;
    this.pauseSettingsBtn = pauseSettingsBtn;
    this.settings = settings;
    this.schema = schema;
    this.emit = emit;
    this.announceVisibility = announceVisibility;
    this.setHudBaseScale = setHudBaseScale;
    this.livePreset = livePreset;
    this.openHudEditor = openHudEditor;
    this.dependencies = dependencies;
    this.settingsSchema = [];
    this.schemaByCategory = new Map();
    this.settingsState = {
      isOpen: false,
      source: 'menu',
      activeSection: SETTINGS_SECTIONS[0].id,
      bindingDevice: 'keyboard',
      folds: {},
      capture: null,
      previousFocus: null,
    };
    // Open, on top of the input layer stack (and staying there): the game's
    // actions pass none.
    this.inputLayer = {
      name: 'settings',
      element: refs.overlay,
      passes: [],
      staysOnTop: true,
      onKey: (event) => this.handleSettingsKeyDown(event),
    };
    this.initializeSettingsMetadata();
  }

  /** Open, and opened from the screen/state the panel covers. */
  isOpenFrom(source) {
    return this.settingsState.isOpen && this.settingsState.source === source;
  }

  /** A binding button is waiting for its key or pad input. */
  get capturing() {
    return Boolean(this.settingsState.capture);
  }

  /** 'keyboard' or 'gamepad' while a binding waits for its input. */
  get captureDevice() {
    return this.settingsState.capture?.device ?? null;
  }

  get activeSection() {
    return SETTINGS_SECTIONS.find(
      (section) => section.id === this.settingsState.activeSection
    );
  }

  /** True when the section on screen shows a field stored under `categoryId`. */
  showsCategory(categoryId) {
    return sectionFieldRefs(this.activeSection).some(
      (ref) => splitFieldRef(ref).categoryId === categoryId
    );
  }

  /**
   * Redraws the section on screen when it shows a field of `categoryId`; a
   * pad's focus stays on the choice it just made.
   */
  refreshCategory(categoryId) {
    if (this.settingsState.isOpen && this.showsCategory(categoryId)) {
      this.redrawKeepingFocus();
    }
  }

  /** LB/RB on a pad: the previous or next section, its nav item focused. */
  cycleCategory(step) {
    const ids = SETTINGS_SECTIONS.map((section) => section.id);
    const index = ids.indexOf(this.settingsState.activeSection);
    this.switchSettingsSection(ids[(index + step + ids.length) % ids.length]);
    this.refs.tabs
      ?.querySelector('.settings-tab.is-active')
      ?.focus({ preventScroll: true });
  }

  initializeSettingsMetadata() {
    if (this.settings && typeof this.settings.getSchema === 'function') {
      this.settingsSchema = this.settings.getSchema();
    } else if (Array.isArray(this.schema)) {
      this.settingsSchema = this.schema.map((category) => ({
        id: category.id,
        label: category.label,
        description: category.description,
        fields: category.fields.map((field) => ({ ...field })),
      }));
    }

    this.settingsSchema.forEach((category) => {
      this.schemaByCategory.set(category.id, category);
    });
  }

  bootstrapSettingsState() {
    // A saved "on" is stale: a page load never starts fullscreen.
    this.syncFullscreenSetting();

    let accessibility = {};
    let video = {};

    if (this.settings) {
      accessibility = this.settings.getCategoryValues('accessibility') || {};
      video = this.settings.getCategoryValues('video') || {};
    } else if (Array.isArray(this.schema)) {
      const accessibilityFallback = this.schema.find(
        (category) => category.id === 'accessibility'
      );
      if (accessibilityFallback) {
        asArray(accessibilityFallback.fields).forEach((field) => {
          accessibility[field.key] = field.default;
        });
      }

      const videoFallback = this.schema.find(
        (category) => category.id === 'video'
      );
      if (videoFallback) {
        asArray(videoFallback.fields).forEach((field) => {
          video[field.key] = field.default;
        });
      }
    }

    this.applyVisualPreferences({ accessibility, video });
  }

  bindSettingsControls() {
    const settingsRefs = this.refs;

    if (settingsRefs.tabs) {
      settingsRefs.tabs.addEventListener(
        'mouseenter',
        (event) => {
          // Only emit if settings menu is visible
          if (
            settingsRefs.overlay &&
            settingsRefs.overlay.classList.contains('hidden')
          ) {
            return;
          }
          const button = event.target.closest('[data-settings-section]');
          if (button) {
            this.emit('ui-hover', {
              source: 'settings-menu',
              element: 'tab',
            });
          }
        },
        true
      ); // Use capture phase for delegation
      settingsRefs.tabs.addEventListener('click', (event) => {
        const button = event.target.closest('[data-settings-section]');
        if (!button) {
          return;
        }
        event.preventDefault();
        this.switchSettingsSection(button.dataset.settingsSection);
      });
    }

    document.addEventListener('fullscreenchange', () =>
      this.syncFullscreenSetting()
    );

    if (settingsRefs.overlay) {
      settingsRefs.overlay.addEventListener('click', (event) => {
        if (event.target === settingsRefs.overlay) {
          this.closeSettingsPanel();
        }
      });
    }

    asArray(settingsRefs.closeButtons).forEach((button) => {
      button.addEventListener('mouseenter', () => {
        // Only emit if settings menu is visible
        if (
          settingsRefs.overlay &&
          settingsRefs.overlay.classList.contains('hidden')
        ) {
          return;
        }
        this.emit('ui-hover', {
          source: 'settings-menu',
          element: 'close',
        });
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.closeSettingsPanel();
      });
    });

    if (settingsRefs.resetBtn) {
      settingsRefs.resetBtn.addEventListener('mouseenter', () => {
        // Only emit if settings menu is visible
        if (
          settingsRefs.overlay &&
          settingsRefs.overlay.classList.contains('hidden')
        ) {
          return;
        }
        this.emit('ui-hover', {
          source: 'settings-menu',
          element: 'reset',
        });
      });
      settingsRefs.resetBtn.addEventListener('click', (event) => {
        event.preventDefault();
        this.resetActiveSection();
      });
    }

    if (settingsRefs.container) {
      settingsRefs.container.addEventListener('change', (event) => {
        this.handleSettingsInputChange(event);
      });

      settingsRefs.container.addEventListener('input', (event) => {
        this.handleSettingsInputInput(event);
      });

      settingsRefs.container.addEventListener('click', (event) => {
        this.handleSettingsClick(event);
      });
    }
  }

  handleSettingsMenuRequest(payload = {}) {
    const source = payload?.source || 'menu';

    if (this.settingsState.isOpen) {
      return;
    }

    this.openSettingsPanel(source);
  }

  /** The key: flips the toggle, which asks the browser (see below). */
  toggleFullscreen() {
    this.settings?.setSetting(
      'video',
      'fullscreen',
      !document.fullscreenElement,
      { source: 'ui' }
    );
  }

  /** The toggle shows what the browser is doing, Esc included. */
  syncFullscreenSetting() {
    this.settings?.setSetting(
      'video',
      'fullscreen',
      Boolean(document.fullscreenElement),
      { source: 'fullscreen' }
    );
  }

  /**
   * Only an edit of the toggle (or a reset) asks the browser, which allows it
   * from a click or key alone: saved values at boot never do. A refusal puts
   * the toggle back to what the browser is doing.
   */
  followFullscreenChange(change) {
    const edited =
      (change.category === 'video' && change.key === 'fullscreen') ||
      change.type === 'reset-all';
    if (!edited || change.source === 'fullscreen') {
      return;
    }
    const want = Boolean(this.settings.getSetting('video', 'fullscreen'));
    if (want === Boolean(document.fullscreenElement)) {
      return;
    }
    (want
      ? document.documentElement.requestFullscreen()
      : document.exitFullscreen()
    ).catch(() => this.syncFullscreenSetting());
  }

  handleSettingsChange(change) {
    if (!change) {
      return;
    }

    this.followFullscreenChange(change);

    // A reset of everything carries no category: redraw for it too.
    if (
      this.settingsState.isOpen &&
      (!change.category || this.showsCategory(change.category))
    ) {
      // The slider being dragged keeps its element (and the drag).
      const dragged = document.activeElement;
      if (
        dragged?.type === 'range' &&
        dragged.dataset?.settingKey === change.key
      ) {
        return;
      }
      this.redrawKeepingFocus();
    }
  }

  // The redraw replaces the focused control: focus its twin after.
  redrawKeepingFocus() {
    const {
      settingKey,
      settingCategory,
      segmentValue,
      bindingDevice,
      slot,
      action,
    } = document.activeElement?.dataset ?? {};
    this.renderSettingsPanel();
    if (!settingKey && action !== 'binding-device') {
      return;
    }
    const attribute = (name, value) =>
      value === undefined ? '' : `[data-${name}="${value}"]`;
    const selector =
      action === 'binding-device'
        ? `[data-action="binding-device"]${attribute('binding-device', bindingDevice)}`
        : `[data-setting-key="${settingKey}"]${attribute(
            'setting-category',
            settingCategory
          )}${attribute('segment-value', segmentValue)}${attribute(
            'binding-device',
            bindingDevice
          )}${attribute('slot', slot)}`;
    this.refs.container.querySelector(selector)?.focus({ preventScroll: true });
  }

  handleVisualPreferencesChange(payload = {}) {
    if (!payload || !payload.values) {
      return;
    }

    this.applyVisualPreferences(payload.values);
  }

  applyAccessibilitySettings(values = {}, derived = null) {
    const body = document.body;
    const root = document.documentElement;

    const highContrast = derived?.contrast
      ? derived.contrast === 'high'
      : Boolean(values.highContrastHud);
    const reducedMotion =
      derived?.reducedMotion ?? Boolean(values.reducedMotion);
    const colorVision = derived?.colorVision
      ? derived.colorVision
      : values.colorBlindPalette
        ? 'assist'
        : 'standard';

    const textScale = Number(values.textScale);

    if (body) {
      body.classList.toggle('hud-high-contrast', highContrast);
      body.classList.toggle('motion-reduced', reducedMotion);
      body.classList.toggle('flashing-reduced', Boolean(values.reduceFlashing));
      body.classList.toggle('subtitles-large', Boolean(values.largeSubtitles));
    }

    if (root) {
      root.style.setProperty(
        '--text-scale',
        String(Number.isFinite(textScale) && textScale > 0 ? textScale : 1)
      );
      root.dataset.contrast = highContrast ? 'high' : 'normal';
      root.dataset.motion = reducedMotion ? 'reduced' : 'standard';
      root.dataset.colorVision = colorVision;
    }
  }

  applyVideoSettings(values = {}, derived = null) {
    const hudScale = Number.isFinite(Number(derived?.hudScale))
      ? Number(derived.hudScale)
      : Number.isFinite(Number(values.hudScale))
        ? Number(values.hudScale)
        : 1;

    this.setHudBaseScale(hudScale);
  }

  deriveVisualPreferences(
    accessibility = {},
    video = {},
    graphics = {},
    gameplay = {}
  ) {
    const highContrast = Boolean(accessibility.highContrastHud);
    const reducedMotion = Boolean(accessibility.reducedMotion);
    const colorVision = accessibility.colorBlindPalette ? 'assist' : 'standard';
    const hudScale = Number.isFinite(Number(video.hudScale))
      ? Number(video.hudScale)
      : 1;
    const damageFlash = video.damageFlash !== false;

    const screenShake = Number.isFinite(Number(gameplay?.screenShake))
      ? Number(gameplay.screenShake)
      : 1;

    return {
      contrast: highContrast ? 'high' : 'normal',
      reducedMotion,
      colorVision,
      hudScale,
      damageFlash,

      screenShake,
      postProcessing: graphics?.postProcessing !== false,
      bloom: graphics?.bloom !== false,
      chromaticAberration: graphics?.chromaticAberration !== false,
      antialiasing: graphics?.antialiasing || 'SMAA',
      hitMarkers: gameplay?.hitMarkers !== false,
    };
  }

  applyVisualPreferences(values = {}) {
    const accessibility = values.accessibility || {};
    const video = values.video || {};
    const graphics = values.graphics || {};
    const gameplay = values.gameplay || {};
    const derived =
      values.derived ||
      this.deriveVisualPreferences(accessibility, video, graphics, gameplay);

    this.applyAccessibilitySettings(accessibility, derived);
    this.applyVideoSettings(video, derived);
  }

  handleSettingsInputChange(event) {
    const target = event.target;
    const isInput = target instanceof HTMLInputElement;
    const isSelect = target instanceof HTMLSelectElement;
    if (!isInput && !isSelect) {
      return;
    }

    const fieldKey = target.dataset.settingKey;
    const categoryId = target.dataset.settingCategory;
    if (!fieldKey || !this.settings || !categoryId) {
      return;
    }

    const field = this.getFieldDefinition(categoryId, fieldKey);

    if (isInput && target.type === 'checkbox') {
      this.settings.setSetting(categoryId, fieldKey, target.checked, {
        source: 'ui',
      });
      return;
    }

    if (isInput && target.type === 'range') {
      const value = Number(target.value);
      if (Number.isFinite(value)) {
        this.settings.setSetting(categoryId, fieldKey, value, { source: 'ui' });
        this.updateRangeDisplay(fieldKey, field, value);
      }
      return;
    }

    if (isSelect) {
      this.settings.setSetting(categoryId, fieldKey, target.value, {
        source: 'ui',
      });
    }
  }

  handleSettingsInputInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'range') {
      return;
    }

    const fieldKey = target.dataset.settingKey;
    const categoryId = target.dataset.settingCategory;
    if (!fieldKey || !this.settings || !categoryId) {
      return;
    }

    const field = this.getFieldDefinition(categoryId, fieldKey);
    const value = Number(target.value);
    if (!Number.isFinite(value)) {
      return;
    }

    this.settings.setSetting(categoryId, fieldKey, value, { source: 'ui' });
    this.updateRangeDisplay(fieldKey, field, value);
  }

  handleSettingsClick(event) {
    const segment = event.target.closest('[data-segment-value]');
    if (segment && this.settings) {
      this.settings.setSetting(
        segment.dataset.settingCategory,
        segment.dataset.settingKey,
        segment.dataset.segmentValue,
        { source: 'ui' }
      );
      return;
    }
    if (event.target.closest('[data-action="edit-hud-layout"]')) {
      this.openHudEditor();
      return;
    }
    const deviceButton = event.target.closest('[data-action="binding-device"]');
    if (deviceButton) {
      this.cancelBindingCapture();
      this.settingsState.bindingDevice = deviceButton.dataset.bindingDevice;
      this.redrawKeepingFocus();
      return;
    }
    const captureButton = event.target.closest(
      '[data-action="capture-binding"]'
    );
    if (captureButton) {
      event.preventDefault();
      this.beginBindingCapture(captureButton);
    }
  }

  switchSettingsSection(sectionId) {
    if (
      !SETTINGS_SECTIONS.some((section) => section.id === sectionId) ||
      this.settingsState.activeSection === sectionId
    ) {
      return;
    }

    this.cancelBindingCapture();
    this.settingsState.activeSection = sectionId;
    this.renderSettingsNav();
    this.renderSettingsPanel();
  }

  /** Resets exactly the fields the section on screen shows. */
  resetActiveSection() {
    if (!this.settings) {
      return;
    }

    this.cancelBindingCapture();
    sectionFieldRefs(this.activeSection).forEach((ref) => {
      const { categoryId, key } = splitFieldRef(ref);
      if (this.getFieldDefinition(categoryId, key)?.keepOnReset) {
        return;
      }
      this.settings.resetSetting(categoryId, key, { source: 'ui' });
    });
    this.renderSettingsPanel();
  }

  openSettingsPanel(source = 'menu') {
    const overlay = this.refs.overlay;
    if (!overlay) {
      return;
    }

    this.settingsState.isOpen = true;
    this.settingsState.source = source;
    inputLayers.push(this.inputLayer);
    // Capture focus before opening
    this.settingsState.previousFocus = document.activeElement;

    this.renderSettingsNav();
    this.renderSettingsPanel();

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    this.announceVisibility(true, { source });

    const activeTab = overlay.querySelector(
      '[data-settings-section].is-active'
    );
    if (activeTab instanceof HTMLElement) {
      activeTab.focus();
    }
  }

  // A key on top of the stack (input/inputLayers.js). A binding waiting for its
  // input takes every key (InputSystem's key-pressed makes it the binding),
  // none for the screens under it or the game; else Escape closes Settings
  // without also reaching the game's pause binding.
  handleSettingsKeyDown(event) {
    if (this.settingsState.capture) {
      event.preventDefault();
      return true;
    }
    if (event.key !== 'Escape') return false;
    event.preventDefault();
    this.closeSettingsPanel();
    return true;
  }

  /** The run goes back to play under it (the cards closed, a scene over, a
   * Retry's countdown ended): it waits paused, as when Settings opens in
   * flight; closing resumes it. Only a run in play is paused, so a second
   * call changes nothing. */
  holdRun() {
    if (!this.settingsState.isOpen) return;
    this.settingsState.source = 'playing';
    const state = resolveService('game-state', this.dependencies);
    if (state.getScreen() === 'playing' && !state.isPaused()) {
      this.emit('toggle-pause');
    }
  }

  closeSettingsPanel({ resumeRun = true } = {}) {
    if (!this.settingsState.isOpen) {
      return;
    }

    const source = this.settingsState.source;

    // Restore focus BEFORE hiding the overlay to avoid "aria-hidden" warning
    if (
      this.settingsState.previousFocus instanceof HTMLElement &&
      document.body.contains(this.settingsState.previousFocus)
    ) {
      this.settingsState.previousFocus.focus();
    } else {
      // Fallback if previous element is lost
      if (this.settingsState.source === 'menu') {
        const menuBtn = document.getElementById('open-settings-btn');
        menuBtn?.focus();
      } else if (this.settingsState.source === 'pause') {
        const pauseBtn = this.pauseSettingsBtn;
        pauseBtn?.focus();
      }
    }
    this.settingsState.previousFocus = null;

    const overlay = this.refs.overlay;
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }

    this.cancelBindingCapture();
    this.settingsState.isOpen = false;
    inputLayers.remove(this.inputLayer);
    this.announceVisibility(false, { source });
    if (resumeRun && source === 'playing') this.emit('toggle-pause');
  }

  renderSettingsNav() {
    const tabs = this.refs.tabs;
    if (!tabs) {
      return;
    }

    tabs.innerHTML = '';

    SETTINGS_SECTIONS.forEach((section) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-tab';
      button.dataset.settingsSection = section.id;
      const title = document.createElement('span');
      title.className = 'settings-tab__title';
      title.textContent = section.title;
      button.appendChild(title);
      const sub = document.createElement('small');
      sub.className = 'settings-tab__sub';
      sub.textContent = section.sub;
      button.appendChild(sub);
      if (section.id === this.settingsState.activeSection) {
        button.classList.add('is-active');
        button.setAttribute('aria-current', 'true');
      }
      tabs.appendChild(button);
    });

    if (this.refs.resetBtn) {
      this.refs.resetBtn.textContent = `Reset ${this.activeSection.title}`;
    }
  }

  // What greys a row, read afresh at every render.
  inactiveState(valuesByCategory) {
    return {
      value: (categoryId, key) => valuesByCategory[categoryId]?.[key],
      pressureRung:
        resolveService('difficulty', this.dependencies)?.getPressure() ?? 0,
      // Out of a run (opened from the menu) there is no cannon: counts as nose.
      aimByNose:
        this.settingsState.source === 'menu' ||
        (resolveService('player', this.dependencies)?.noseAim ?? true),
    };
  }

  renderSettingsPanel(sectionId = this.settingsState.activeSection) {
    const container = this.refs.container;
    if (!container) {
      return;
    }

    const section = SETTINGS_SECTIONS.find((item) => item.id === sectionId);
    // A redraw keeps the folds as the player left them.
    container.querySelectorAll('details[data-fold-title]').forEach((fold) => {
      this.settingsState.folds[fold.dataset.foldTitle] = fold.open;
    });
    container.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'settings-page-title';
    const title = document.createElement('h3');
    title.textContent = section.title;
    heading.appendChild(title);
    const intro = document.createElement('p');
    intro.textContent = section.intro;
    heading.appendChild(intro);
    container.appendChild(heading);

    const valuesByCategory = {};
    this.settingsSchema.forEach((category) => {
      valuesByCategory[category.id] =
        this.settings?.getCategoryValues(category.id) || {};
    });
    const state = this.inactiveState(valuesByCategory);
    const row = (ref) => this.renderSettingRow(ref, valuesByCategory, state);

    section.groups.forEach((group) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'settings-group';
      if (group.title) {
        const groupTitle = document.createElement('h4');
        groupTitle.className = 'settings-group__title';
        groupTitle.textContent = group.title;
        wrapper.appendChild(groupTitle);
      }
      if (group.bindings) {
        wrapper.appendChild(this.renderDeviceSwitch());
        // Shown by touch only (data-device), where a binding cannot be set.
        const note = document.createElement('p');
        note.className = 'settings-field__description';
        note.dataset.device = 'touch';
        note.textContent =
          'Bindings take a keyboard or a gamepad. By touch, the left thumb steers; dash, shield and pause are on screen.';
        wrapper.appendChild(note);
      }
      asArray(group.fields).forEach((ref) => wrapper.appendChild(row(ref)));
      asArray(group.folds).forEach((fold) => {
        const details = document.createElement('details');
        details.className = 'settings-fold';
        details.dataset.foldTitle = fold.title;
        details.open =
          this.settingsState.folds[fold.title] ?? fold.open ?? false;
        const summary = document.createElement('summary');
        summary.textContent = fold.title;
        details.appendChild(summary);
        fold.fields.forEach((ref) => details.appendChild(row(ref)));
        wrapper.appendChild(details);
      });
      container.appendChild(wrapper);
    });
  }

  // Keyboard | Gamepad: which device's slots the binding rows show.
  renderDeviceSwitch() {
    const group = document.createElement('div');
    group.className = 'settings-device-switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Binding device');
    ['keyboard', 'gamepad'].forEach((device) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-device-btn';
      button.dataset.action = 'binding-device';
      button.dataset.bindingDevice = device;
      button.setAttribute(
        'aria-pressed',
        String(this.settingsState.bindingDevice === device)
      );
      button.textContent = device === 'keyboard' ? 'Keyboard' : 'Gamepad';
      group.appendChild(button);
    });
    return group;
  }

  renderSettingRow(ref, valuesByCategory, state) {
    const { categoryId, key } = splitFieldRef(ref);
    const field = this.getFieldDefinition(categoryId, key);
    const values = valuesByCategory[categoryId];
    const inactive = inactiveReason(ref, state);
    const element = renderSettingField(categoryId, field, values[key], values, {
      device: this.settingsState.bindingDevice,
      inactive,
    });
    const preview = inactive
      ? null
      : settingPreview(key, values[key] ?? field.default, {
          livePreset: this.livePreset(),
        });
    if (preview) {
      const line = document.createElement('p');
      line.className = 'settings-preview';
      line.dataset.previewFor = key;
      if ('glow' in preview) {
        const dot = document.createElement('span');
        dot.className = `settings-preview__glow${preview.glow ? ' is-on' : ''}`;
        line.appendChild(dot);
      }
      line.appendChild(document.createTextNode(preview.text));
      (element.querySelector('.settings-field__body') || element).appendChild(
        line
      );
    }
    return element;
  }

  updateRangeDisplay(fieldKey, field, value) {
    if (!fieldKey) {
      return;
    }

    const container = this.refs.container;
    if (!container) {
      return;
    }

    const display = container.querySelector(`[data-value-for="${fieldKey}"]`);
    if (display) {
      display.textContent = formatRangeValue(field || {}, value);
    }
  }

  formatBindingLabel(value, device) {
    return formatBindingLabel(value, device);
  }

  beginBindingCapture(button) {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const settingKey = button.dataset.settingKey;
    const categoryId = button.dataset.settingCategory || 'controls';
    const device = button.dataset.bindingDevice;
    const slot = Number(button.dataset.slot ?? '0');

    if (!settingKey || !device || Number.isNaN(slot)) {
      return;
    }

    this.cancelBindingCapture();

    button.classList.add('is-listening');
    button.textContent = 'Waiting for input...';

    this.settingsState.capture = {
      categoryId,
      fieldKey: settingKey,
      device,
      slot,
      element: button,
    };

    this.emit('input-binding-capture', { state: 'start' });
  }

  handleKeyPressForCapture(payload) {
    const capture = this.settingsState.capture;
    if (!capture || capture.device !== 'keyboard') {
      return;
    }

    if (!payload || payload.type !== 'down') {
      return;
    }

    const bindingValue = resolveKeyboardBindingFromPayload(payload);
    if (!bindingValue) {
      return;
    }

    this.commitBindingCapture(bindingValue, 'keyboard');
  }

  handleGamepadInputForCapture(payload) {
    const capture = this.settingsState.capture;
    if (!capture || capture.device !== 'gamepad' || !payload) {
      return;
    }

    if (payload.type === 'button' && Number.isInteger(payload.index)) {
      this.commitBindingCapture(`button:${payload.index}`, 'gamepad');
      return;
    }

    if (payload.type === 'axis' && Number.isInteger(payload.index)) {
      const direction =
        payload.direction === 'negative' || payload.direction === '-'
          ? '-'
          : '+';
      this.commitBindingCapture(
        `axis:${payload.index}:${direction}`,
        'gamepad'
      );
    }
  }

  commitBindingCapture(bindingValue, device) {
    if (!this.settingsState.capture || !this.settings) {
      return;
    }

    const { categoryId, fieldKey, slot } = this.settingsState.capture;
    const current = this.settings.getSetting(categoryId, fieldKey) || {};
    const updated = {
      keyboard: asArray(current.keyboard).slice(),
      gamepad: asArray(current.gamepad).slice(),
    };

    const field = this.getFieldDefinition(categoryId, fieldKey);
    const maxSlots = Math.max(
      Number(field?.metadata?.[device]?.max) || updated[device].length || 1,
      slot + 1
    );

    while (updated[device].length < maxSlots) {
      updated[device].push('');
    }

    updated[device][slot] = bindingValue;

    this.settings.setSetting(categoryId, fieldKey, updated, { source: 'ui' });
    this.finishBindingCapture();
  }

  finishBindingCapture() {
    if (this.settingsState.capture?.element) {
      this.settingsState.capture.element.classList.remove('is-listening');
    }

    this.settingsState.capture = null;

    this.emit('input-binding-capture', { state: 'end' });

    this.renderSettingsPanel();
  }

  cancelBindingCapture() {
    if (this.settingsState.capture?.element) {
      this.settingsState.capture.element.classList.remove('is-listening');
    }

    if (this.settingsState.capture) {
      this.emit('input-binding-capture', { state: 'end' });
    }

    this.settingsState.capture = null;
  }

  getFieldDefinition(categoryId, fieldKey) {
    const category = this.schemaByCategory.get(categoryId);
    if (!category) {
      return null;
    }

    return (
      asArray(category.fields).find((field) => field.key === fieldKey) || null
    );
  }
}
