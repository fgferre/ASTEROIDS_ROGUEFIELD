// src/modules/ui/SettingsPanel.js
//
// The Settings overlay, opened from the menu or over the pause screen:
// category tabs, one control per schema field with its live preview, key
// and pad binding capture, and the accessibility and video preferences
// applied to the page as they change.

import { settingPreview } from './settingsPreview.js';
import {
  formatBindingLabel,
  resolveKeyboardBindingFromPayload,
} from './settings/bindingKeys.js';
import {
  formatRangeValue,
  renderSettingField,
} from './settings/fieldRenderers.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

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
  }) {
    this.refs = refs;
    this.pauseSettingsBtn = pauseSettingsBtn;
    this.settings = settings;
    this.schema = schema;
    this.emit = emit;
    this.announceVisibility = announceVisibility;
    this.setHudBaseScale = setHudBaseScale;
    this.livePreset = livePreset;
    this.settingsSchema = [];
    this.schemaByCategory = new Map();
    this.settingsState = {
      isOpen: false,
      source: 'menu',
      activeCategory: 'graphics',
      capture: null,
      previousFocus: null,
    };
    this.currentVisualPreferences = {
      accessibility: {},
      video: {},
      derived: {},
    };
    this.initializeSettingsMetadata();
  }

  /** Open, and opened from `source` ('menu' or 'pause'). */
  isOpenFrom(source) {
    return this.settingsState.isOpen && this.settingsState.source === source;
  }

  /** A binding button is waiting for its key or pad input. */
  get capturing() {
    return Boolean(this.settingsState.capture);
  }

  /** 'assist' while the color-blind palette is on, else 'standard'. */
  get colorVision() {
    return this.currentVisualPreferences.derived.colorVision || 'standard';
  }

  /** Redraws `categoryId` when it is the one on screen. */
  refreshCategory(categoryId) {
    if (
      this.settingsState.isOpen &&
      this.settingsState.activeCategory === categoryId
    ) {
      this.renderSettingsPanel(categoryId);
    }
  }

  /** LB/RB on a pad: the previous or next category, its tab focused. */
  cycleCategory(step) {
    const ids = this.settingsSchema.map((category) => category.id);
    const index = ids.indexOf(this.settingsState.activeCategory);
    this.switchSettingsCategory(ids[(index + step + ids.length) % ids.length]);
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

    if (!this.schemaByCategory.has(this.settingsState.activeCategory)) {
      this.settingsState.activeCategory = this.settingsSchema[0]?.id || 'audio';
    }
  }

  bootstrapSettingsState() {
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
        ensureArray(accessibilityFallback.fields).forEach((field) => {
          accessibility[field.key] = field.default;
        });
      }

      const videoFallback = this.schema.find(
        (category) => category.id === 'video'
      );
      if (videoFallback) {
        ensureArray(videoFallback.fields).forEach((field) => {
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
          const button = event.target.closest('[data-settings-category]');
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
        const button = event.target.closest('[data-settings-category]');
        if (!button) {
          return;
        }
        event.preventDefault();
        const categoryId = button.dataset.settingsCategory;
        if (categoryId) {
          this.switchSettingsCategory(categoryId);
        }
      });
    }

    if (settingsRefs.overlay) {
      settingsRefs.overlay.addEventListener('click', (event) => {
        if (event.target === settingsRefs.overlay) {
          this.closeSettingsPanel();
        }
      });
      // Capture phase: before InputSystem's listener commits Esc as a binding.
      document.addEventListener(
        'keydown',
        (event) => this.handleSettingsKeyDown(event),
        true
      );
    }

    ensureArray(settingsRefs.closeButtons).forEach((button) => {
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
        this.resetActiveSettingsCategory();
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
      this.settingsState.source = source;
      return;
    }

    this.openSettingsPanel(source);
  }

  handleSettingsChange(change) {
    if (!change) {
      return;
    }

    if (
      this.settingsState.isOpen &&
      change.category === this.settingsState.activeCategory
    ) {
      // The redraw replaces the focused control: focus its twin after.
      const focused = document.activeElement;
      const key = focused?.dataset?.settingKey;
      const segment = focused?.dataset?.segmentValue;
      this.renderSettingsPanel(this.settingsState.activeCategory);
      if (key) {
        const selector = segment
          ? `[data-setting-key="${key}"][data-segment-value="${segment}"]`
          : `input[data-setting-key="${key}"], select[data-setting-key="${key}"]`;
        this.refs.container
          .querySelector(selector)
          ?.focus({ preventScroll: true });
      }
    }
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
      body.classList.toggle('color-assist-mode', colorVision === 'assist');
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
    const root = document.documentElement;
    const hudScale = Number.isFinite(Number(derived?.hudScale))
      ? Number(derived.hudScale)
      : Number.isFinite(Number(values.hudScale))
        ? Number(values.hudScale)
        : 1;
    const baseScale = Math.max(0.6, Math.min(1.4, hudScale));

    if (root) {
      root.style.setProperty('--hud-scale', String(baseScale));
      root.dataset.hudScale = String(baseScale);
    }

    // [NEO-ARCADE] Fullscreen Handling
    if (values.fullscreen !== undefined) {
      const shouldBeFullscreen = Boolean(values.fullscreen);
      const isFullscreen = Boolean(document.fullscreenElement);

      if (shouldBeFullscreen && !isFullscreen) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.warn('[SettingsPanel] Fullscreen request failed:', err);
        });
      } else if (!shouldBeFullscreen && isFullscreen) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch((err) => {
            console.warn('[SettingsPanel] Exit fullscreen failed:', err);
          });
        }
      }
    }

    this.setHudBaseScale(baseScale);

    const body = document.body;
    if (body) {
      const damageFlashEnabled =
        derived?.damageFlash ?? values.damageFlash !== false;
      const reducedParticles =
        derived?.reducedParticles ?? Boolean(values.reducedParticles);

      body.classList.toggle('damage-flash-disabled', !damageFlashEnabled);
      body.classList.toggle('particles-reduced', reducedParticles);
    }
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
    const reducedParticles =
      Boolean(video.reducedParticles) || Boolean(graphics?.reducedParticles);

    const screenShake = Number.isFinite(Number(gameplay?.screenShake))
      ? Number(gameplay.screenShake)
      : 1;

    return {
      contrast: highContrast ? 'high' : 'normal',
      reducedMotion,
      colorVision,
      hudScale,
      damageFlash,
      reducedParticles,

      screenShake,
      postProcessing: graphics?.postProcessing !== false,
      bloom: graphics?.bloom !== false,
      chromaticAberration: graphics?.chromaticAberration !== false,
      antialiasing: graphics?.antialiasing || 'SMAA',
      damageNumbers: gameplay?.damageNumbers !== false,
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

    this.currentVisualPreferences = {
      accessibility,
      video,
      graphics,
      gameplay,
      derived,
    };

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
    const categoryId =
      target.dataset.settingCategory || this.settingsState.activeCategory;
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
    const categoryId =
      target.dataset.settingCategory || this.settingsState.activeCategory;
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
    const captureButton = event.target.closest(
      '[data-action="capture-binding"]'
    );
    if (captureButton) {
      event.preventDefault();
      this.beginBindingCapture(captureButton);
    }
  }

  switchSettingsCategory(categoryId) {
    if (!categoryId || !this.schemaByCategory.has(categoryId)) {
      return;
    }

    if (this.settingsState.activeCategory === categoryId) {
      return;
    }

    this.cancelBindingCapture();
    this.settingsState.activeCategory = categoryId;
    this.renderSettingsCategories();
    this.renderSettingsPanel(categoryId);
  }

  resetActiveSettingsCategory() {
    if (!this.settings) {
      return;
    }

    const categoryId = this.settingsState.activeCategory;
    if (!categoryId) {
      return;
    }

    this.settings.resetCategory(categoryId, { source: 'ui' });
    this.renderSettingsPanel(categoryId);
  }

  openSettingsPanel(source = 'menu') {
    const overlay = this.refs.overlay;
    if (!overlay) {
      return;
    }

    this.settingsState.isOpen = true;
    this.settingsState.source = source;
    // Capture focus before opening
    this.settingsState.previousFocus = document.activeElement;

    this.renderSettingsCategories();
    this.renderSettingsPanel(this.settingsState.activeCategory);

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body?.classList.add('is-settings-open');
    this.announceVisibility(true, { source });

    const activeTab = overlay.querySelector(
      '[data-settings-category].is-active'
    );
    if (activeTab instanceof HTMLElement) {
      activeTab.focus();
    }
  }

  // Esc closes Settings opened outside the pause screen (there Esc resumes,
  // and resuming closes it); never while a key binding is being captured.
  handleSettingsKeyDown(event) {
    const state = this.settingsState;
    if (
      event.key !== 'Escape' ||
      !state.isOpen ||
      state.capture ||
      state.source === 'pause'
    ) {
      return;
    }
    event.preventDefault();
    this.closeSettingsPanel();
  }

  closeSettingsPanel() {
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

    document.body?.classList.remove('is-settings-open');
    this.cancelBindingCapture();
    this.settingsState.isOpen = false;
    this.announceVisibility(false, { source });
  }

  renderSettingsCategories() {
    const tabs = this.refs.tabs;
    if (!tabs) {
      return;
    }

    tabs.innerHTML = '';

    this.settingsSchema.forEach((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-tab';
      button.dataset.settingsCategory = category.id;
      button.textContent = category.label || category.id;
      if (category.id === this.settingsState.activeCategory) {
        button.classList.add('is-active');
        button.setAttribute('aria-current', 'true');
      }
      tabs.appendChild(button);
    });
  }

  renderSettingsPanel(categoryId) {
    const container = this.refs.container;
    if (!container) {
      return;
    }

    const category = this.schemaByCategory.get(categoryId);
    container.innerHTML = '';

    if (!category) {
      const message = document.createElement('p');
      message.className = 'settings-empty-state';
      message.textContent = 'Settings category unavailable.';
      container.appendChild(message);
      return;
    }

    if (category.description) {
      const description = document.createElement('p');
      description.className = 'settings-category-description';
      description.textContent = category.description;
      container.appendChild(description);
    }

    const values = this.settings?.getCategoryValues(categoryId) || {};

    ensureArray(category.fields).forEach((field) => {
      const element = renderSettingField(categoryId, field, values[field.key]);
      if (!element) {
        return;
      }
      const preview = settingPreview(
        field.key,
        values[field.key] ?? field.default,
        {
          livePreset: this.livePreset(),
          postProcessing: values.postProcessing,
        }
      );
      if (preview) {
        const line = document.createElement('p');
        line.className = 'settings-preview';
        line.dataset.previewFor = field.key;
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
      container.appendChild(element);
    });
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
    const device = button.dataset.device;
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
      keyboard: ensureArray(current.keyboard).slice(),
      gamepad: ensureArray(current.gamepad).slice(),
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

    this.renderSettingsPanel(this.settingsState.activeCategory);
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
      ensureArray(category.fields).find((field) => field.key === fieldKey) ||
      null
    );
  }
}
