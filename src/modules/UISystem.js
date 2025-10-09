// src/modules/UISystem.js

import {
  DEFAULT_HUD_LAYOUT_ID,
  HUD_LAYOUT_OPTIONS,
  getHudLayoutDefinition,
  getHudLayoutItems,
} from '../data/ui/hudLayout.js';
import SETTINGS_SCHEMA from '../data/settingsSchema.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const COLOR_ASSIST_ACCENTS = {
  offense: '#3366CC',
  defense: '#2F855A',
  mobility: '#E76F51',
  utility: '#8E6CFF',
  default: '#4C6EF5',
};

class UISystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    if (typeof gameServices !== 'undefined') {
      gameServices.register('ui', this);
    }

    this.damageFlashTimeout = null;
    this.currentPauseState = false;
    this.shieldFailTimeout = null;
    this.timePulseTimeout = null;
    this.killsPulseTimeout = null;
    this.levelPulseTimeout = null;
    this.resizeRaf = null;
    this.currentHudBaseScale = 1;
    this.currentHudAutoScale = 1;
    this.currentCanvasScale = 1;
    this.canvasBaseSize = { width: 0, height: 0 };
    this.handleResize = this.handleResize.bind(this);
    this.numberFormatter = this.createNumberFormatter('standard');
    this.compactNumberFormatter = this.createNumberFormatter('compact');

    this.availableHudLayoutIds =
      Array.isArray(HUD_LAYOUT_OPTIONS) && HUD_LAYOUT_OPTIONS.length > 0
        ? HUD_LAYOUT_OPTIONS.map((option) => option.value)
        : [DEFAULT_HUD_LAYOUT_ID];

    const defaultLayout = getHudLayoutDefinition(DEFAULT_HUD_LAYOUT_ID);
    this.currentHudLayoutId = defaultLayout?.id || DEFAULT_HUD_LAYOUT_ID;
    this.hudLayout = getHudLayoutItems(this.currentHudLayoutId);
    this.hudElements = new Map();
    this.hudGroups = new Map();
    this.cachedValues = {
      health: { current: null, max: null },
      shield: {
        level: null,
        maxHP: null,
        currentHP: null,
        isActive: null,
        isUnlocked: null,
        isOnCooldown: null,
        cooldownDuration: null,
        cooldownTimer: null,
        cooldownRatio: null,
        hpRatio: null,
      },
      level: null,
      xp: { current: null, needed: null, percentage: null, level: null },
      sessionKills: null,
      sessionKillsTextLength: 0,
      sessionTimeSeconds: null,
      wave: {
        current: null,
        completedWaves: null,
        totalAsteroids: null,
        asteroidsKilled: null,
        isActive: null,
        timeRemainingSeconds: null,
        breakTimerSeconds: null,
        labelLength: 0,
        enemiesTextLength: 0,
      },
    };

    this.settings = null;
    this.settingsSchema = [];
    this.schemaByCategory = new Map();
    this.settingsState = {
      isOpen: false,
      source: 'menu',
      activeCategory: 'audio',
      capture: null,
    };
    this.creditsState = {
      isOpen: false,
      triggerId: null,
    };
    this.handleCreditsKeyDown = this.handleCreditsKeyDown.bind(this);
    this.levelUpState = {
      isVisible: false,
      options: [],
      buttons: [],
      focusIndex: -1,
      poolSize: 0,
    };
    this.currentVisualPreferences = {
      accessibility: {},
      video: {},
      derived: {},
    };

    this.initializeSettingsMetadata();

    this.domRefs = this.cacheStaticNodes();
    this.setupHudLayout();
    this.updateHudLayoutClass(this.currentHudLayoutId);
    this.setupEventListeners();
    this.bootstrapHudValues();
    this.bindPauseControls();
    this.bindSettingsControls();
    this.bindCreditsControls();
    this.bootstrapSettingsState();
    this.initializeViewportScaling();

    console.log('[UISystem] Initialized');
  }

  getService(name) {
    return resolveService(name, this.dependencies);
  }

  resolveSettingsService() {
    return this.getService('settings');
  }

  cacheStaticNodes() {
    return {
      root: document.getElementById('hud-root') || null,
      gameUi: document.getElementById('game-ui') || null,
      gameField: document.querySelector('#game-ui .game-field') || null,
      canvas: document.getElementById('game-canvas') || null,
      controls: document.querySelector('#game-ui .controls') || null,
      wave: {
        container: null,
        title: null,
        timerValue: null,
        progressTrack: null,
        progressBar: null,
        enemies: null,
        totalKills: null,
        countdown: document.getElementById('wave-countdown') || null,
        countdownValue: document.getElementById('countdown-timer') || null,
      },
      levelUp: {
        container: document.getElementById('upgrades-container') || null,
        text: document.getElementById('levelup-text') || null,
      },
      gameOver: {
        level: document.getElementById('final-level') || null,
        kills: document.getElementById('final-kills') || null,
        waves: document.getElementById('final-waves') || null,
        time: document.getElementById('final-time') || null,
      },
      pause: {
        container: document.getElementById('pause-screen') || null,
        resumeBtn: document.getElementById('pause-resume-btn') || null,
        settingsBtn: document.getElementById('pause-settings-btn') || null,
        exitBtn: document.getElementById('pause-exit-btn') || null,
      },
      settings: {
        overlay: document.getElementById('settings-screen') || null,
        tabs: document.getElementById('settings-tabs') || null,
        container: document.getElementById('settings-content') || null,
        resetBtn: document.getElementById('settings-reset-btn') || null,
        closeButtons: [
          document.getElementById('settings-close-btn'),
          document.getElementById('settings-close-footer-btn'),
        ].filter(Boolean),
      },
      credits: {
        overlay: document.getElementById('credits-screen') || null,
        primaryAction: document.getElementById('credits-back-btn') || null,
        closeButtons: [
          document.getElementById('credits-close-btn'),
          document.getElementById('credits-back-btn'),
        ].filter(Boolean),
      },
    };
  }

  initializeSettingsMetadata() {
    const resolvedSettings = this.resolveSettingsService();
    if (resolvedSettings) {
      this.settings = resolvedSettings;
    }

    if (this.settings && typeof this.settings.getSchema === 'function') {
      this.settingsSchema = this.settings.getSchema();
    } else if (Array.isArray(SETTINGS_SCHEMA)) {
      this.settingsSchema = SETTINGS_SCHEMA.map((category) => ({
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

  createNumberFormatter(mode = 'standard') {
    if (
      typeof Intl === 'undefined' ||
      typeof Intl.NumberFormat !== 'function'
    ) {
      return {
        format: (value) =>
          String(
            Math.max(
              0,
              Math.floor(Number.isFinite(value) ? value : Number(value) || 0)
            )
          ),
      };
    }

    if (mode === 'compact') {
      return new Intl.NumberFormat('pt-BR', {
        notation: 'compact',
        maximumFractionDigits: 1,
      });
    }

    return new Intl.NumberFormat('pt-BR');
  }

  formatCount(value = 0, options = {}) {
    const { allowCompact = true } = options;
    const numericValue = Number(value);
    const normalized =
      Number.isFinite(numericValue) && numericValue > 0
        ? Math.floor(numericValue)
        : 0;

    if (allowCompact && normalized >= 1000 && this.compactNumberFormatter) {
      return this.compactNumberFormatter.format(normalized);
    }

    if (this.numberFormatter) {
      return this.numberFormatter.format(normalized);
    }

    return String(normalized);
  }

  getUnitLabel(unitConfig, value = 0) {
    if (!unitConfig) {
      return '';
    }

    if (typeof unitConfig === 'string') {
      return unitConfig;
    }

    const isSingular = value === 1;
    if (isSingular && unitConfig.singular) {
      return unitConfig.singular;
    }

    if (!isSingular && unitConfig.plural) {
      return unitConfig.plural;
    }

    return unitConfig.plural || unitConfig.singular || '';
  }

  initializeViewportScaling() {
    if (typeof window === 'undefined') {
      return;
    }

    this.requestViewportScaleUpdate(true);
    window.addEventListener('resize', this.handleResize, { passive: true });
  }

  handleResize() {
    this.requestViewportScaleUpdate();
  }

  requestViewportScaleUpdate(force = false) {
    if (typeof window === 'undefined') {
      return;
    }

    if (force) {
      if (this.resizeRaf) {
        window.cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = null;
      }
      this.updateViewportScaling({ force: true });
      return;
    }

    if (this.resizeRaf) {
      return;
    }

    this.resizeRaf = window.requestAnimationFrame(() => {
      this.resizeRaf = null;
      this.updateViewportScaling();
    });
  }

  updateViewportScaling(options = {}) {
    if (typeof window === 'undefined') {
      return;
    }

    const { canvas, gameUi, gameField } = this.domRefs;
    if (!canvas || !gameUi) {
      return;
    }

    if (!this.canvasBaseSize.width || !this.canvasBaseSize.height) {
      this.canvasBaseSize.width =
        Number(canvas.width) || canvas.getBoundingClientRect().width || 800;
      this.canvasBaseSize.height =
        Number(canvas.height) || canvas.getBoundingClientRect().height || 600;
    }

    const baseWidth = this.canvasBaseSize.width;
    const baseHeight = this.canvasBaseSize.height;

    const viewportHeight =
      window.innerHeight ||
      document.documentElement?.clientHeight ||
      baseHeight;
    const viewportWidth =
      window.innerWidth || document.documentElement?.clientWidth || baseWidth;

    const computedStyles = window.getComputedStyle(gameUi);
    const paddingTop = parseFloat(computedStyles.paddingTop || '0') || 0;
    const paddingBottom = parseFloat(computedStyles.paddingBottom || '0') || 0;
    const paddingLeft =
      parseFloat(
        computedStyles.paddingLeft || computedStyles.paddingInlineStart || '0'
      ) || 0;
    const paddingRight =
      parseFloat(
        computedStyles.paddingRight || computedStyles.paddingInlineEnd || '0'
      ) || 0;
    // Overlay now lives above the canvas. Do not reserve extra
    // vertical space for HUD; only account for container paddings.
    const reservedVertical = paddingTop + paddingBottom;
    const availableHeight = viewportHeight - reservedVertical;
    const MIN_SCALE = 0.45;
    const MAX_SCALE = 1.9;
    const heightScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, availableHeight / baseHeight)
    );

    const horizontalReserve = paddingLeft + paddingRight + 48;
    const availableWidth = viewportWidth - horizontalReserve;
    const widthScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, availableWidth / baseWidth)
    );

    const scale = Math.min(heightScale, widthScale);

    if (!options.force && Math.abs(scale - this.currentCanvasScale) < 0.005) {
      return;
    }

    this.currentCanvasScale = scale;

    const scaledWidth = Math.round(baseWidth * scale);
    const scaledHeight = Math.round(baseHeight * scale);

    canvas.style.width = `${scaledWidth}px`;
    canvas.style.height = `${scaledHeight}px`;
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';

    if (gameUi && gameUi instanceof HTMLElement) {
      gameUi.style.setProperty('--game-canvas-width', `${scaledWidth}px`);
      gameUi.style.setProperty('--game-canvas-height', `${scaledHeight}px`);
      const hudMaxWidth = Math.max(Math.min(scaledWidth + 320, 1600), 560);
      gameUi.style.setProperty('--hud-max-width', `${hudMaxWidth}px`);
    }

    if (gameField && gameField instanceof HTMLElement) {
      gameField.style.setProperty('--game-canvas-width', `${scaledWidth}px`);
      gameField.style.setProperty('--game-canvas-height', `${scaledHeight}px`);
    }

    const hudAutoScale = Math.min(1.25, Math.max(0.82, scale));
    this.updateHudScale(hudAutoScale);
  }

  updateHudScale(autoScale = null) {
    if (Number.isFinite(autoScale)) {
      this.currentHudAutoScale = autoScale;
    }

    const baseScale = Number.isFinite(this.currentHudBaseScale)
      ? this.currentHudBaseScale
      : 1;
    const auto = Number.isFinite(this.currentHudAutoScale)
      ? this.currentHudAutoScale
      : 1;
    const effective = Math.max(0.6, Math.min(1.2, baseScale * auto));
    const root = document.documentElement;

    if (root) {
      root.style.setProperty('--hud-scale-auto', auto.toFixed(3));
      root.style.setProperty('--hud-scale-effective', effective.toFixed(3));
    }
  }

  bootstrapSettingsState() {
    let accessibility = {};
    let video = {};

    if (this.settings) {
      accessibility = this.settings.getCategoryValues('accessibility') || {};
      video = this.settings.getCategoryValues('video') || {};
    } else if (Array.isArray(SETTINGS_SCHEMA)) {
      const accessibilityFallback = SETTINGS_SCHEMA.find(
        (category) => category.id === 'accessibility'
      );
      if (accessibilityFallback) {
        ensureArray(accessibilityFallback.fields).forEach((field) => {
          accessibility[field.key] = field.default;
        });
      }

      const videoFallback = SETTINGS_SCHEMA.find(
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

  bindPauseControls() {
    const pauseRefs = this.domRefs.pause;
    if (!pauseRefs) {
      return;
    }

    if (pauseRefs.resumeBtn) {
      pauseRefs.resumeBtn.addEventListener('click', () => {
        if (!this.currentPauseState || typeof gameEvents === 'undefined') {
          return;
        }

        gameEvents.emit('toggle-pause');
      });
    }

    if (pauseRefs.settingsBtn) {
      pauseRefs.settingsBtn.addEventListener('click', () => {
        if (!this.currentPauseState || typeof gameEvents === 'undefined') {
          return;
        }

        gameEvents.emit('settings-menu-requested', { source: 'pause' });
      });
    }

    if (pauseRefs.exitBtn) {
      pauseRefs.exitBtn.addEventListener('click', () => {
        if (!this.currentPauseState || typeof gameEvents === 'undefined') {
          return;
        }

        gameEvents.emit('exit-to-menu-requested', { source: 'pause-menu' });
      });
    }
  }

  bindSettingsControls() {
    const settingsRefs = this.domRefs.settings;
    if (!settingsRefs) {
      return;
    }

    if (settingsRefs.tabs) {
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
    }

    ensureArray(settingsRefs.closeButtons).forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.closeSettingsPanel();
      });
    });

    if (settingsRefs.resetBtn) {
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

  bindCreditsControls() {
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.handleCreditsKeyDown);
    }

    const creditsRefs = this.domRefs.credits;
    if (!creditsRefs) {
      return;
    }

    if (creditsRefs.overlay) {
      creditsRefs.overlay.addEventListener('click', (event) => {
        if (event.target === creditsRefs.overlay) {
          this.closeCreditsOverlay({ restoreFocus: true });
        }
      });
    }

    ensureArray(creditsRefs.closeButtons).forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.closeCreditsOverlay({ restoreFocus: true });
      });
    });
  }

  setupHudLayout() {
    const root = this.domRefs.root;
    if (!root) {
      return;
    }

    this.hudElements.clear();
    this.hudGroups.clear();

    const getRegionContainer = (position) => {
      const map = {
        'top-left': '#hud-region-top-left',
        'top-middle': '#hud-region-top-middle',
        'top-right': '#hud-region-top-right',
        'bottom-left': '#hud-region-bottom-left',
        'bottom-right': '#hud-region-bottom-right',
        'bottom-center': '#hud-region-bottom-center',
      };
      const selector = map[position] || map['top-left'];
      return root.querySelector(selector) || root;
    };

    const ensureGroupContainer = (position, groupId) => {
      const key = `${position}:${groupId}`;
      if (this.hudGroups.has(key)) {
        return this.hudGroups.get(key);
      }

      const region = getRegionContainer(position);
      const groupElement = document.createElement('div');
      groupElement.classList.add('hud-group', `hud-group--${groupId}`);
      groupElement.dataset.hudGroup = groupId;
      region.appendChild(groupElement);
      this.hudGroups.set(key, groupElement);
      return groupElement;
    };

    // Clear known regions (safe: only clears dynamic items, not wave/xp panels)
    [
      '#hud-region-top-left',
      '#hud-region-top-middle',
      '#hud-region-top-right',
      '#hud-region-bottom-left',
      '#hud-region-bottom-center',
      '#hud-region-bottom-right',
    ].forEach((sel) => {
      const region = root.querySelector(sel);
      if (region) {
        region.innerHTML = '';
      }
    });

    this.hudLayout.forEach((itemConfig) => {
      const element = this.createHudItem(itemConfig);
      if (!element) {
        return;
      }

      const target = itemConfig.group
        ? ensureGroupContainer(itemConfig.position, itemConfig.group)
        : getRegionContainer(itemConfig.position);
      target.appendChild(element.root);
      this.hudElements.set(itemConfig.key, element);
    });

    this.refreshWaveDomRefs();
  }

  applyHudLayoutPreference(layoutId) {
    const definition = getHudLayoutDefinition(layoutId);
    const resolvedId = definition?.id || DEFAULT_HUD_LAYOUT_ID;
    this.setHudLayout(resolvedId);
  }

  setHudLayout(layoutId, options = {}) {
    const definition = getHudLayoutDefinition(layoutId);
    const resolvedId = definition?.id || DEFAULT_HUD_LAYOUT_ID;
    const force = Boolean(options.force);

    if (!force && resolvedId === this.currentHudLayoutId) {
      this.updateHudLayoutClass(resolvedId);
      return;
    }

    this.currentHudLayoutId = resolvedId;
    this.hudLayout = getHudLayoutItems(resolvedId);
    this.hudGroups.clear();
    this.setupHudLayout();
    this.updateHudLayoutClass(resolvedId);
    this.refreshHudFromServices(true);
  }

  updateHudLayoutClass(layoutId) {
    const body = document.body;
    if (body) {
      if (!this.availableHudLayoutIds.includes(layoutId)) {
        this.availableHudLayoutIds.push(layoutId);
      }
      this.availableHudLayoutIds.forEach((id) => {
        const className = `hud-layout-${id}`;
        body.classList.toggle(className, id === layoutId);
      });
    }

    const hudRoot = this.domRefs.root;
    if (hudRoot) {
      hudRoot.dataset.hudLayout = layoutId;
    }
  }

  createHudItem(config) {
    if (!config) return null;

    const root = document.createElement('div');
    root.classList.add('hud-item', `hud-item--${config.key}`);
    root.dataset.hudKey = config.key;

    if (config.rootId) {
      root.id = config.rootId;
    }

    if (config.ariaLive) {
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', config.ariaLive);
    }

    if (config.description) {
      root.setAttribute('aria-label', config.description);
    }

    const iconElement = this.createIconElement(config.icon);
    const leadingElement = this.createLeadingElement(config.leading);
    const metaElement = this.createMetaElement(config.meta);
    const metaPosition = config.metaPosition || 'before';

    if (config.layout === 'inline-progress') {
      root.classList.add('hud-item--progress');

      if (iconElement) {
        iconElement.classList.add('hud-item__icon');
        root.appendChild(iconElement);
      }

      if (leadingElement) {
        root.appendChild(leadingElement);
      }

      const progressWrapper = document.createElement('div');
      progressWrapper.classList.add('hud-progress');

      const progressBar = document.createElement('div');
      progressBar.classList.add('hud-bar', 'hud-progress__track');
      if (config.progressBarId) {
        progressBar.id = config.progressBarId;
      }
      progressBar.setAttribute('role', 'progressbar');
      progressBar.setAttribute('aria-valuemin', '0');
      progressBar.setAttribute('aria-valuemax', '100');
      progressBar.setAttribute('aria-valuenow', '0');
      if (config.description) {
        progressBar.setAttribute('aria-label', config.description);
      }

      const progressFill = document.createElement('div');
      progressFill.classList.add('hud-bar__fill', `hud-bar__fill--${config.key}`);
      if (config.progressFillId) {
        progressFill.id = config.progressFillId;
      }
      progressFill.style.width = '0%';
      progressBar.appendChild(progressFill);

      const valueNumber = document.createElement('span');
      valueNumber.classList.add(
        'hud-item__value-number',
        'hud-progress__value',
        'hud-item__value'
      );
      valueNumber.textContent = config.initialValue ?? '--';
      if (config.valueId) {
        valueNumber.id = config.valueId;
      }

      progressWrapper.append(progressBar, valueNumber);

      if (metaElement && metaPosition === 'after-value') {
        metaElement.classList.add('hud-progress__meta');
        progressWrapper.appendChild(metaElement);
      }

      root.appendChild(progressWrapper);

      if (metaElement && metaPosition !== 'after-value') {
        root.appendChild(metaElement);
      }

      if (config.key === 'shield') {
        root.classList.add('locked');
      }

      return {
        key: config.key,
        config,
        root,
        value: valueNumber,
        bar: progressBar,
        barFill: progressFill,
        meta: metaElement,
        leading: leadingElement,
      };
    }

    if (config.layout === 'inline-value') {
      root.classList.add('hud-item--inline-value');

      if (iconElement) {
        iconElement.classList.add('hud-item__icon');
        root.appendChild(iconElement);
      }

      const valueNumber = document.createElement('span');
      valueNumber.classList.add('hud-item__value-number', 'hud-inline-value');
      valueNumber.textContent = config.initialValue ?? '--';
      if (config.valueId) {
        valueNumber.id = config.valueId;
      }

      root.appendChild(valueNumber);

      if (metaElement && metaPosition !== 'after-value') {
        root.appendChild(metaElement);
      }

      return {
        key: config.key,
        config,
        root,
        value: valueNumber,
        meta: metaElement,
      };
    }

    const content = document.createElement('div');
    content.classList.add('hud-item__content');

    if (iconElement) {
      iconElement.classList.add('hud-item__icon');
      root.appendChild(iconElement);
    }

    const label = document.createElement('span');
    label.classList.add('hud-item__label');
    label.textContent = config.label;

    const valueWrapper = document.createElement('span');
    valueWrapper.classList.add('hud-item__value');

    const valueNumber = document.createElement('span');
    valueNumber.classList.add('hud-item__value-number');
    valueNumber.textContent = config.initialValue ?? '--';
    if (config.valueId) {
      valueNumber.id = config.valueId;
    }
    valueWrapper.appendChild(valueNumber);

    let unitElement = null;
    if (config.unit) {
      unitElement = document.createElement('span');
      unitElement.classList.add('hud-item__value-unit');
      const initialUnit = this.getUnitLabel(config.unit, 2);
      if (initialUnit) {
        unitElement.textContent = initialUnit;
      }
      valueWrapper.appendChild(unitElement);
    }

    content.append(label, valueWrapper);
    root.appendChild(content);

    if (metaElement && metaPosition !== 'after-value') {
      root.appendChild(metaElement);
    }

    return {
      key: config.key,
      config,
      root,
      value: valueNumber,
      unit: unitElement,
      meta: metaElement,
    };
  }

  createMetaElement(metaConfig) {
    if (!metaConfig) {
      return null;
    }

    const element = document.createElement('span');
    element.classList.add('hud-item__meta');

    if (Array.isArray(metaConfig.classes)) {
      metaConfig.classes.forEach((className) => {
        if (className) {
          element.classList.add(className);
        }
      });
    }

    if (metaConfig.id) {
      element.id = metaConfig.id;
    }

    if (metaConfig.ariaLabel) {
      element.setAttribute('aria-label', metaConfig.ariaLabel);
    }

    element.textContent = metaConfig.initialValue ?? '';

    return element;
  }

  createLeadingElement(leadingConfig) {
    if (!leadingConfig) {
      return null;
    }

    const element = document.createElement('span');
    element.classList.add('hud-item__leading');

    if (Array.isArray(leadingConfig.classes)) {
      leadingConfig.classes.forEach((className) => {
        if (className) {
          element.classList.add(className);
        }
      });
    }

    if (leadingConfig.id) {
      element.id = leadingConfig.id;
    }

    if (leadingConfig.ariaLabel) {
      element.setAttribute('aria-label', leadingConfig.ariaLabel);
    }

    element.textContent = leadingConfig.initialValue ?? '';

    return element;
  }

  createIconElement(iconConfig) {
    if (!iconConfig) {
      return null;
    }

    if (iconConfig.type === 'svg') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', iconConfig.viewBox || '0 0 24 24');
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('aria-hidden', 'true');

      const paths = Array.isArray(iconConfig.paths) ? iconConfig.paths : [];
      paths.forEach((pathConfig) => {
        const path = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path'
        );
        path.setAttribute('d', pathConfig.d || '');
        if (pathConfig.fill) {
          path.setAttribute('fill', pathConfig.fill);
        }
        svg.appendChild(path);
      });

      return svg;
    }

    if (iconConfig.type === 'text') {
      const span = document.createElement('span');
      span.textContent = iconConfig.value ?? '';
      span.setAttribute('aria-hidden', 'true');
      return span;
    }

    return null;
  }

  refreshWaveDomRefs() {
    const waveRefs = this.domRefs.wave || {};

    const container = document.getElementById('hud-wave');
    const waveLabel = document.getElementById('wave-label');
    const waveNumber = document.getElementById('wave-number');
    const progressTrack = document.getElementById('wave-progress');
    const progressBar = document.getElementById('wave-progress-bar');
    const enemies = document.getElementById('wave-enemies');
    const totalKills = document.getElementById('kills-display');

    this.domRefs.wave = {
      ...waveRefs,
      container: container || null,
      waveLabel: waveLabel || null,
      waveNumber: waveNumber || null,
      progressTrack: progressTrack || null,
      progressBar: progressBar || null,
      enemies: enemies || null,
      totalKills: totalKills || null,
    };
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('experience-changed', (data) => {
      this.updateXPBar(data);
    });

    gameEvents.on('player-health-changed', (data) => {
      this.handleHealthChange(data);
    });

    gameEvents.on('player-leveled-up', (data) => {
      this.updateLevelDisplay(data?.newLevel, { force: true });
    });

    gameEvents.on('upgrade-options-ready', (payload = {}) => {
      this.handleUpgradeOptions(payload);
    });

    gameEvents.on('player-died', (data) => {
      // Delay game over screen to show epic ship explosion
      // Explosion has: 0.35s freeze + 0.8s shockwave + particles flying for ~2s
      setTimeout(() => {
        this.showGameOverScreen(data);
      }, 3000); // 3s delay to fully enjoy the spectacle!
    });

    gameEvents.on('player-took-damage', () => {
      this.flashHealthDisplay();
    });

    gameEvents.on('pause-state-changed', (data) => {
      this.updatePauseScreen(Boolean(data?.isPaused));
    });

    gameEvents.on('toggle-pause', () => {
      const appState = this.getService('game-state');
      if (appState && typeof appState.isPaused === 'function') {
        this.updatePauseScreen(Boolean(appState.isPaused()));
      }
    });

    gameEvents.on('shield-activation-failed', () => {
      this.flashShieldFailure();
    });

    gameEvents.on('shield-stats-changed', (shieldState) => {
      this.updateShieldIndicator(shieldState);
    });

    gameEvents.on('wave-state-updated', (payload) => {
      this.handleWaveStateUpdated(payload);
    });

    gameEvents.on('ui-show-screen', (payload = {}) => {
      if (payload?.screen) {
        this.showScreen(payload.screen, payload.options || {});
      }
    });

    gameEvents.on('settings-menu-requested', (payload = {}) => {
      this.handleSettingsMenuRequest(payload);
    });

    gameEvents.on('settings-changed', (change) => {
      this.handleSettingsChange(change);
    });

    gameEvents.on('credits-menu-requested', (payload = {}) => {
      this.handleCreditsMenuRequest(payload);
    });

    gameEvents.on('settings-controls-changed', (payload = {}) => {
      if (
        this.settingsState.isOpen &&
        this.settingsState.activeCategory === 'controls' &&
        payload?.values
      ) {
        this.renderSettingsPanel('controls');
      }
    });

    gameEvents.on('settings-visual-changed', (payload = {}) => {
      this.handleVisualPreferencesChange(payload);
    });

    gameEvents.on('key-pressed', (payload) => {
      this.handleKeyPressForCapture(payload);
    });

    gameEvents.on('gamepad-input-detected', (payload) => {
      this.handleGamepadInputForCapture(payload);
    });

    gameEvents.on('input-action', (payload = {}) => {
      this.handleLevelUpInputAction(payload);
    });

    gameEvents.on('input-confirmed', () => {
      this.handleLevelUpConfirm();
    });
  }

  handleSettingsMenuRequest(payload = {}) {
    const source = payload?.source || 'menu';

    if (this.settingsState.isOpen) {
      this.settingsState.source = source;
      return;
    }

    this.openSettingsPanel(source);
  }

  handleCreditsMenuRequest(payload = {}) {
    if (payload && payload.open === false) {
      const restoreFocus = payload.restoreFocus !== false;
      this.closeCreditsOverlay({ restoreFocus });
      return;
    }

    if (payload && payload.toggle === true) {
      if (this.creditsState.isOpen) {
        this.closeCreditsOverlay({ restoreFocus: true });
      } else {
        this.openCreditsOverlay(payload.triggerId);
      }
      return;
    }

    this.openCreditsOverlay(payload?.triggerId);
  }

  handleSettingsChange(change) {
    if (!change) {
      return;
    }

    if (
      this.settingsState.isOpen &&
      change.category === this.settingsState.activeCategory
    ) {
      this.renderSettingsPanel(this.settingsState.activeCategory);
    }
  }

  handleVisualPreferencesChange(payload = {}) {
    if (!payload || !payload.values) {
      return;
    }

    this.applyVisualPreferences(payload.values);
  }

  openCreditsOverlay(triggerId = null) {
    const creditsRefs = this.domRefs.credits;
    const overlay = creditsRefs?.overlay;
    if (!overlay) {
      return;
    }

    let resolvedTriggerId = null;
    if (typeof triggerId === 'string' && triggerId) {
      resolvedTriggerId = triggerId;
    } else if (
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement.id
    ) {
      resolvedTriggerId = document.activeElement.id;
    }

    if (resolvedTriggerId) {
      this.creditsState.triggerId = resolvedTriggerId;
    }

    this.creditsState.isOpen = true;

    this.showScreen('credits', { overlay: true, show: true });
    overlay.setAttribute('aria-hidden', 'false');
    document.body?.classList.add('is-credits-open');

    const focusTarget =
      creditsRefs?.primaryAction ||
      overlay.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus();
    }
  }

  closeCreditsOverlay(options = {}) {
    if (!this.creditsState.isOpen) {
      this.creditsState.triggerId = null;
      return;
    }

    const restoreFocus = Boolean(options?.restoreFocus);
    const overlay = this.domRefs.credits?.overlay;

    this.showScreen('credits', { overlay: true, show: false });
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'true');
    }

    document.body?.classList.remove('is-credits-open');

    const triggerId = this.creditsState.triggerId;
    this.creditsState.isOpen = false;
    this.creditsState.triggerId = null;

    if (restoreFocus && triggerId) {
      const trigger = document.getElementById(triggerId);
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
    }
  }

  handleCreditsKeyDown(event) {
    if (!this.creditsState.isOpen) {
      return;
    }

    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      this.closeCreditsOverlay({ restoreFocus: true });
    }
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

    if (body) {
      body.classList.toggle('hud-high-contrast', highContrast);
      body.classList.toggle('motion-reduced', reducedMotion);
      body.classList.toggle('color-assist-mode', colorVision === 'assist');
    }

    if (root) {
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

    this.currentHudBaseScale = baseScale;
    this.updateHudScale();
    this.requestViewportScaleUpdate();

    const body = document.body;
    if (body) {
      const damageFlashEnabled =
        derived?.damageFlash ?? values.damageFlash !== false;
      const reducedParticles =
        derived?.reducedParticles ?? Boolean(values.reducedParticles);

      body.classList.toggle('damage-flash-disabled', !damageFlashEnabled);
      body.classList.toggle('particles-reduced', reducedParticles);
    }

    const layoutPreference =
      (typeof derived?.hudLayout === 'string' && derived.hudLayout) ||
      (typeof values.hudLayout === 'string' && values.hudLayout) ||
      this.currentHudLayoutId ||
      DEFAULT_HUD_LAYOUT_ID;

    this.applyHudLayoutPreference(layoutPreference);
  }

  deriveVisualPreferences(accessibility = {}, video = {}) {
    const highContrast = Boolean(accessibility.highContrastHud);
    const reducedMotion = Boolean(accessibility.reducedMotion);
    const colorVision = accessibility.colorBlindPalette ? 'assist' : 'standard';
    const hudScale = Number.isFinite(Number(video.hudScale))
      ? Number(video.hudScale)
      : 1;
    const damageFlash = video.damageFlash !== false;
    const reducedParticles = Boolean(video.reducedParticles);
    const hudLayout =
      typeof video.hudLayout === 'string' && video.hudLayout
        ? video.hudLayout
        : DEFAULT_HUD_LAYOUT_ID;

    return {
      contrast: highContrast ? 'high' : 'normal',
      reducedMotion,
      colorVision,
      hudScale,
      damageFlash,
      reducedParticles,
      hudLayout,
    };
  }

  applyVisualPreferences(values = {}) {
    const accessibility = values.accessibility || {};
    const video = values.video || {};
    const derived =
      values.derived || this.deriveVisualPreferences(accessibility, video);

    this.currentVisualPreferences = { accessibility, video, derived };

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
    const overlay = this.domRefs.settings?.overlay;
    if (!overlay) {
      return;
    }

    this.settingsState.isOpen = true;
    this.settingsState.source = source;
    this.renderSettingsCategories();
    this.renderSettingsPanel(this.settingsState.activeCategory);

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body?.classList.add('is-settings-open');

    const activeTab = overlay.querySelector(
      '[data-settings-category].is-active'
    );
    if (activeTab instanceof HTMLElement) {
      activeTab.focus();
    }
  }

  closeSettingsPanel() {
    if (!this.settingsState.isOpen) {
      return;
    }

    const overlay = this.domRefs.settings?.overlay;
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }

    document.body?.classList.remove('is-settings-open');
    this.cancelBindingCapture();
    this.settingsState.isOpen = false;
  }

  renderSettingsCategories() {
    const tabs = this.domRefs.settings?.tabs;
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
    const container = this.domRefs.settings?.container;
    if (!container) {
      return;
    }

    const category = this.schemaByCategory.get(categoryId);
    container.innerHTML = '';

    if (!category) {
      const message = document.createElement('p');
      message.className = 'settings-empty-state';
      message.textContent = 'Categoria de configurações indisponível.';
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
      const element = this.renderSettingField(
        categoryId,
        field,
        values[field.key]
      );
      if (element) {
        container.appendChild(element);
      }
    });
  }

  renderSettingField(categoryId, field, value) {
    switch (field.type) {
      case 'toggle':
        return this.renderToggleField(categoryId, field, value);
      case 'range':
        return this.renderRangeField(categoryId, field, value);
      case 'select':
        return this.renderSelectField(categoryId, field, value);
      case 'binding':
        return this.renderBindingField(categoryId, field, value);
      default: {
        const wrapper = document.createElement('div');
        wrapper.className = 'settings-field';
        const label = document.createElement('span');
        label.className = 'settings-field__label';
        label.textContent = field.label || field.key;
        wrapper.appendChild(label);
        if (field.description) {
          const description = document.createElement('p');
          description.className = 'settings-field__description';
          description.textContent = field.description;
          wrapper.appendChild(description);
        }
        return wrapper;
      }
    }
  }

  renderToggleField(categoryId, field, value) {
    const wrapper = document.createElement('label');
    wrapper.className = 'settings-field settings-field--toggle';
    wrapper.dataset.settingKey = field.key;
    wrapper.dataset.settingCategory = categoryId;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(value ?? field.default);
    input.dataset.settingKey = field.key;
    input.dataset.settingCategory = categoryId;
    wrapper.appendChild(input);

    const body = document.createElement('div');
    body.className = 'settings-field__body';

    const label = document.createElement('span');
    label.className = 'settings-field__label';
    label.textContent = field.label;
    body.appendChild(label);

    if (field.description) {
      const description = document.createElement('p');
      description.className = 'settings-field__description';
      description.textContent = field.description;
      body.appendChild(description);
    }

    wrapper.appendChild(body);
    return wrapper;
  }

  renderRangeField(categoryId, field, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-field settings-field--range';
    wrapper.dataset.settingKey = field.key;
    wrapper.dataset.settingCategory = categoryId;

    const header = document.createElement('div');
    header.className = 'settings-field__header';

    const label = document.createElement('span');
    label.className = 'settings-field__label';
    label.textContent = field.label;
    header.appendChild(label);

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'settings-field__value';
    valueDisplay.dataset.valueFor = field.key;
    const numericValue = Number.isFinite(Number(value))
      ? Number(value)
      : Number(field.default ?? field.min ?? 0);
    valueDisplay.textContent = this.formatRangeValue(field, numericValue);
    header.appendChild(valueDisplay);

    wrapper.appendChild(header);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = field.min ?? 0;
    slider.max = field.max ?? 1;
    slider.step = field.step ?? 0.1;
    slider.value = String(numericValue);
    slider.dataset.settingKey = field.key;
    slider.dataset.settingCategory = categoryId;
    slider.className = 'settings-range-input';
    wrapper.appendChild(slider);

    if (field.description) {
      const description = document.createElement('p');
      description.className = 'settings-field__description';
      description.textContent = field.description;
      wrapper.appendChild(description);
    }

    return wrapper;
  }

  renderSelectField(categoryId, field, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-field settings-field--select';
    wrapper.dataset.settingKey = field.key;
    wrapper.dataset.settingCategory = categoryId;

    const label = document.createElement('label');
    const selectId = `setting-${categoryId}-${field.key}`;
    label.className = 'settings-field__label';
    label.setAttribute('for', selectId);
    label.textContent = field.label || field.key;
    wrapper.appendChild(label);

    const select = document.createElement('select');
    select.id = selectId;
    select.className = 'settings-select-input';
    select.dataset.settingKey = field.key;
    select.dataset.settingCategory = categoryId;

    const options = ensureArray(field.options);
    const optionLabels =
      (field.optionLabels && typeof field.optionLabels === 'object'
        ? field.optionLabels
        : {}) || {};

    options.forEach((optionValue) => {
      const optionElement = document.createElement('option');
      optionElement.value = optionValue;
      optionElement.textContent =
        optionLabels[optionValue] ?? String(optionValue);
      select.appendChild(optionElement);
    });

    const defaultValue =
      typeof value === 'string' && value
        ? value
        : typeof field.default === 'string'
          ? field.default
          : options[0];

    if (defaultValue !== undefined && defaultValue !== null) {
      select.value = defaultValue;
    }

    if (options.length === 0) {
      select.disabled = true;
    }

    wrapper.appendChild(select);

    if (field.description) {
      const description = document.createElement('p');
      description.className = 'settings-field__description';
      description.textContent = field.description;
      wrapper.appendChild(description);
    }

    return wrapper;
  }

  renderBindingField(categoryId, field, value = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-field settings-field--binding';
    wrapper.dataset.settingKey = field.key;
    wrapper.dataset.settingCategory = categoryId;

    const header = document.createElement('div');
    header.className = 'settings-field__header';

    const label = document.createElement('span');
    label.className = 'settings-field__label';
    label.textContent = field.label;
    header.appendChild(label);

    if (field.description) {
      const description = document.createElement('p');
      description.className = 'settings-field__description';
      description.textContent = field.description;
      header.appendChild(description);
    }

    wrapper.appendChild(header);

    const groups = document.createElement('div');
    groups.className = 'settings-binding__groups';

    const devices = ['keyboard', 'gamepad'];
    devices.forEach((device) => {
      const bindings = ensureArray(value?.[device]);
      const metadata = field.metadata?.[device] || {};
      const maxSlots = Math.max(
        Number(metadata.max) ||
          bindings.length ||
          ensureArray(field.default?.[device]).length,
        1
      );

      const deviceGroup = document.createElement('div');
      deviceGroup.className = `settings-binding__group settings-binding__group--${device}`;

      const deviceTitle = document.createElement('span');
      deviceTitle.className = 'settings-binding__device';
      deviceTitle.textContent =
        metadata.label || (device === 'keyboard' ? 'Teclado' : 'Gamepad');
      deviceGroup.appendChild(deviceTitle);

      const list = document.createElement('div');
      list.className = 'settings-binding__list';

      for (let slot = 0; slot < maxSlots; slot += 1) {
        const bindingValue = bindings[slot] ?? '';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'settings-binding-btn';
        button.dataset.action = 'capture-binding';
        button.dataset.settingKey = field.key;
        button.dataset.settingCategory = categoryId;
        button.dataset.device = device;
        button.dataset.slot = String(slot);
        button.dataset.label = bindingValue;
        button.textContent = bindingValue
          ? this.formatBindingLabel(bindingValue, device)
          : 'Definir';
        list.appendChild(button);
      }

      deviceGroup.appendChild(list);
      groups.appendChild(deviceGroup);
    });

    wrapper.appendChild(groups);
    return wrapper;
  }

  formatRangeValue(field, value) {
    if (!Number.isFinite(value)) {
      return '--';
    }

    const isPercentage = Number(field.max) === 1 && Number(field.min) === 0;
    if (isPercentage || field.key === 'hudScale') {
      return `${Math.round(value * 100)}%`;
    }

    if (field.key === 'screenShakeIntensity') {
      return `${Math.round(value * 100)}%`;
    }

    return value.toFixed(2).replace(/\.00$/, '');
  }

  updateRangeDisplay(fieldKey, field, value) {
    if (!fieldKey) {
      return;
    }

    const container = this.domRefs.settings?.container;
    if (!container) {
      return;
    }

    const display = container.querySelector(`[data-value-for="${fieldKey}"]`);
    if (display) {
      display.textContent = this.formatRangeValue(field || {}, value);
    }
  }

  formatBindingLabel(value, device) {
    if (!value) {
      return 'Definir';
    }

    if (device === 'keyboard') {
      if (value.startsWith('Key') && value.length === 4) {
        return value.slice(3).toUpperCase();
      }
      if (value.startsWith('Digit')) {
        return value.slice(5);
      }
      if (value === 'Space') {
        return 'Barra de espaço';
      }
      if (value === 'Escape') {
        return 'Esc';
      }
      if (value.startsWith('Arrow')) {
        return `Seta ${value.slice(5).toLowerCase()}`;
      }
      if (value.startsWith('Shift')) {
        return 'Shift';
      }
      if (value.startsWith('Control')) {
        return 'Ctrl';
      }
      if (value.startsWith('Alt')) {
        return 'Alt';
      }
      return value;
    }

    if (device === 'gamepad') {
      if (value.startsWith('button:')) {
        return `Botão ${value.split(':')[1]}`;
      }
      if (value.startsWith('axis:')) {
        const [, index, direction] = value.split(':');
        const symbol =
          direction === 'negative' || direction === '-' ? '−' : '+';
        return `Eixo ${index} ${symbol}`;
      }
    }

    return value;
  }

  resolveKeyboardBindingFromPayload(payload = {}) {
    const event = payload?.event;
    if (event && typeof event.code === 'string' && event.code.length > 0) {
      return event.code;
    }

    if (typeof payload?.code === 'string' && payload.code.length > 0) {
      return this.normalizeCapturedKeyboardCode(payload.code);
    }

    const key =
      typeof payload?.key === 'string' && payload.key.length > 0
        ? payload.key
        : event?.key;
    if (typeof key === 'string' && key.length > 0) {
      return this.normalizeCapturedKeyboardCode(key);
    }

    return '';
  }

  normalizeCapturedKeyboardCode(input) {
    if (typeof input !== 'string') {
      return '';
    }

    if (input === ' ') {
      return 'Space';
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return '';
    }

    const lower = trimmed.toLowerCase();

    if (lower.startsWith('key') && lower.length === 4) {
      return `Key${lower.slice(3).toUpperCase()}`;
    }

    if (lower.startsWith('digit') && lower.length === 6) {
      return `Digit${lower.slice(5)}`;
    }

    if (lower.startsWith('numpad')) {
      return `Numpad${lower.slice(6)}`;
    }

    if (lower.startsWith('arrow')) {
      return `Arrow${lower.slice(5, 6).toUpperCase()}${lower.slice(6)}`;
    }

    if (lower === 'space' || lower === 'spacebar') {
      return 'Space';
    }

    if (lower === 'escape' || lower === 'esc') {
      return 'Escape';
    }

    if (lower === 'enter') {
      return 'Enter';
    }

    if (lower === 'tab') {
      return 'Tab';
    }

    if (lower === 'backspace') {
      return 'Backspace';
    }

    if (lower === 'delete') {
      return 'Delete';
    }

    if (lower.startsWith('shift')) {
      return `Shift${lower.slice(5, 6).toUpperCase()}${lower.slice(6)}`;
    }

    if (lower.startsWith('control')) {
      return `Control${lower.slice(7, 8).toUpperCase()}${lower.slice(8)}`;
    }

    if (lower.startsWith('ctrl')) {
      return `Control${lower.slice(4, 5).toUpperCase()}${lower.slice(5)}`;
    }

    if (lower.startsWith('alt')) {
      return `Alt${lower.slice(3, 4).toUpperCase()}${lower.slice(4)}`;
    }

    if (lower.startsWith('meta')) {
      return `Meta${lower.slice(4, 5).toUpperCase()}${lower.slice(5)}`;
    }

    if (/^f\d{1,2}$/.test(lower)) {
      return lower.toUpperCase();
    }

    if (trimmed.length === 1) {
      if (trimmed === ' ') {
        return 'Space';
      }
      return trimmed.toUpperCase();
    }

    return `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`;
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
    button.textContent = 'Aguardando entrada...';

    this.settingsState.capture = {
      categoryId,
      fieldKey: settingKey,
      device,
      slot,
      element: button,
    };

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('input-binding-capture', { state: 'start' });
    }
  }

  handleKeyPressForCapture(payload) {
    const capture = this.settingsState.capture;
    if (!capture || capture.device !== 'keyboard') {
      return;
    }

    if (!payload || payload.type !== 'down') {
      return;
    }

    const bindingValue = this.resolveKeyboardBindingFromPayload(payload);
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

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('input-binding-capture', { state: 'end' });
    }

    this.renderSettingsPanel(this.settingsState.activeCategory);
  }

  cancelBindingCapture() {
    if (this.settingsState.capture?.element) {
      this.settingsState.capture.element.classList.remove('is-listening');
    }

    if (this.settingsState.capture && typeof gameEvents !== 'undefined') {
      gameEvents.emit('input-binding-capture', { state: 'end' });
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

  bootstrapHudValues() {
    this.refreshHudFromServices(true);
  }

  refreshHudFromServices(force = false) {
    const player = this.getService('player');
    if (player) {
      this.handleHealthChange(
        { current: player.health, max: player.maxHealth },
        { force }
      );

      if (typeof player.getShieldState === 'function') {
        this.updateShieldIndicator(player.getShieldState(), { force });
      }
    }

    const progression = this.getService('progression');
    if (progression) {
      if (typeof progression.getLevel === 'function') {
        this.updateLevelDisplay(progression.getLevel(), { force });
      }

      if (typeof progression.getExperience === 'function') {
        this.updateXPBar(progression.getExperience(), { force });
      }
    }

    const enemies = this.getService('enemies');
    if (enemies) {
      if (typeof enemies.getSessionStats === 'function') {
        this.updateSessionStatsFromData(enemies.getSessionStats(), { force });
      }

      if (typeof enemies.getWaveState === 'function') {
        this.applyWaveState(enemies.getWaveState(), { force });
      }
    }
  }

  update() {
    this.refreshHudFromServices(false);
  }

  handleHealthChange(data = {}, options = {}) {
    const entry = this.hudElements.get('health');
    if (!entry?.value) {
      return;
    }

    const current = Math.max(0, Math.round(data.current ?? 0));
    const max = Math.max(0, Math.round(data.max ?? 0));
    const force = Boolean(options.force);

    if (
      force ||
      current !== this.cachedValues.health.current ||
      max !== this.cachedValues.health.max
    ) {
      entry.value.textContent = `${current}/${max}`;
      this.cachedValues.health.current = current;
      this.cachedValues.health.max = max;
    }

    const ratio = max > 0 ? current / max : 0;
    const percentage = Math.max(0, Math.min(100, ratio * 100));
    const dangerThreshold = entry.config?.thresholds?.danger ?? 0;
    const warningThreshold = Math.max(dangerThreshold, 0.6);
    const isDanger = max > 0 && ratio <= dangerThreshold;
    const isWarning = !isDanger && max > 0 && ratio <= warningThreshold;
    const isLowHealth = max > 0 && ratio <= 0.25 && current > 0; // 25% or less

    entry.root.classList.toggle('is-danger', isDanger);
    entry.root.classList.toggle('is-warning', isWarning);
    entry.root.classList.toggle('is-low-health', isLowHealth);
    entry.root.style.setProperty('--hud-health-ratio', ratio.toFixed(3));

    if (entry.bar) {
      entry.bar.setAttribute('aria-valuenow', `${Math.round(percentage)}`);
    }

    if (entry.barFill) {
      entry.barFill.style.width = `${percentage}%`;
    }
  }

  updateLevelDisplay(level, options = {}) {
    const levelEntry = this.hudElements.get('level');
    const xpEntry = this.hudElements.get('xp');
    const previousLevel = Number.isFinite(this.cachedValues.level)
      ? this.cachedValues.level
      : null;
    const normalizedLevel = Math.max(1, Math.floor(level ?? 1));
    const force = Boolean(options.force);

    if (!force && normalizedLevel === this.cachedValues.level) {
      return;
    }

    this.cachedValues.level = normalizedLevel;

    if (levelEntry?.value) {
      levelEntry.value.textContent = `Level ${normalizedLevel}`;
    }

    if (xpEntry?.meta) {
      xpEntry.meta.textContent = `Lv ${normalizedLevel}`;
    }

    const leveledUp =
      previousLevel !== null && normalizedLevel > previousLevel && !force;

    const pulseEntry = levelEntry?.root ? levelEntry : xpEntry;
    if (pulseEntry?.root && leveledUp) {
      pulseEntry.root.classList.remove('is-levelup');
      void pulseEntry.root.offsetWidth;
      pulseEntry.root.classList.add('is-levelup');

      if (this.levelPulseTimeout) {
        window.clearTimeout(this.levelPulseTimeout);
      }

      this.levelPulseTimeout = window.setTimeout(() => {
        pulseEntry.root.classList.remove('is-levelup');
        this.levelPulseTimeout = null;
      }, 900);
    }

    const hasCachedXp =
      this.cachedValues.xp.current !== null &&
      this.cachedValues.xp.needed !== null;

    if (hasCachedXp && this.hudElements.has('xp')) {
      const cachedPercentage = this.cachedValues.xp.percentage;
      const percentageFallback =
        this.cachedValues.xp.needed > 0
          ? this.cachedValues.xp.current / this.cachedValues.xp.needed
          : 0;

      this.updateXPBar(
        {
          current: this.cachedValues.xp.current,
          needed: this.cachedValues.xp.needed,
          percentage: Number.isFinite(cachedPercentage)
            ? cachedPercentage
            : percentageFallback,
          level: normalizedLevel,
        },
        { force: true }
      );
    }
  }

  updateXPBar(data = {}, options = {}) {
    const entry = this.hudElements.get('xp');
    if (!entry?.value || !entry.bar || !entry.barFill) {
      return;
    }

    const current = Math.max(
      0,
      Math.round(data.current ?? data.experience ?? 0)
    );
    const needed = Math.max(
      1,
      Math.round(data.needed ?? data.experienceToNext ?? 1)
    );
    const percentageRaw = Number.isFinite(data.percentage)
      ? data.percentage
      : needed > 0
        ? current / needed
        : 0;
    const percentage = Math.max(0, Math.min(1, percentageRaw));
    const force = Boolean(options.force);

    const shouldUpdateWidth =
      force || percentage !== this.cachedValues.xp.percentage;

    if (shouldUpdateWidth) {
      entry.barFill.style.width = `${percentage * 100}%`;
      this.cachedValues.xp.percentage = percentage;
    }

    entry.bar.setAttribute('aria-valuenow', `${Math.round(percentage * 100)}`);
    const isMaxed = percentage >= 1;
    entry.bar.classList.toggle('is-maxed', isMaxed);
    entry.barFill.classList.toggle('is-maxed', isMaxed);
    entry.root.classList.toggle('is-maxed', isMaxed);

    const cachedLevel = Number.isFinite(this.cachedValues.level)
      ? this.cachedValues.level
      : null;
    const levelFromData = Math.max(
      1,
      Math.floor(
        data.level ??
          data.currentLevel ??
          data.playerLevel ??
          cachedLevel ??
          1
      )
    );
    const level = cachedLevel ?? levelFromData;

    const shouldUpdateText =
      force ||
      current !== this.cachedValues.xp.current ||
      needed !== this.cachedValues.xp.needed ||
      level !== this.cachedValues.xp.level;

    if (shouldUpdateText) {
      entry.value.textContent = `${current}/${needed}`;
      this.cachedValues.xp.current = current;
      this.cachedValues.xp.needed = needed;
      this.cachedValues.xp.level = level;

      if (entry.meta) {
        entry.meta.textContent = `Lv ${level}`;
      }
    }

    if (entry.leading) {
      const leadingLabel = `XP / Lvl ${level}`;
      if (entry.leading.textContent !== leadingLabel) {
        entry.leading.textContent = leadingLabel;
      }
    }

    if (entry.meta && this.cachedValues.level !== level) {
      entry.meta.textContent = `Lv ${level}`;
    }

    if (
      !Number.isFinite(this.cachedValues.level) ||
      force ||
      this.cachedValues.level !== level
    ) {
      this.cachedValues.level = level;
    }
  }

  updateSessionStatsFromData(sessionData = {}, options = {}) {
    const killsEntry = this.hudElements.get('kills');
    const timeEntry = this.hudElements.get('time');
    const force = Boolean(options.force);
    let layoutNeedsUpdate = false;

    const totalKills = Math.max(0, Math.floor(sessionData.totalKills ?? 0));
    if (killsEntry?.value) {
      const formattedKills = this.formatCount(totalKills, {
        allowCompact: true,
      });
      const nextLength = formattedKills.length;
      const previousLength = this.cachedValues.sessionKillsTextLength ?? 0;
      const shouldUpdateValue =
        force ||
        totalKills !== this.cachedValues.sessionKills ||
        killsEntry.value.textContent !== formattedKills;

      if (shouldUpdateValue) {
        killsEntry.value.textContent = formattedKills;

        if (killsEntry.root) {
          killsEntry.root.classList.remove('is-updating');
          void killsEntry.root.offsetWidth;
          killsEntry.root.classList.add('is-updating');

          if (this.killsPulseTimeout) {
            window.clearTimeout(this.killsPulseTimeout);
          }

          this.killsPulseTimeout = window.setTimeout(() => {
            killsEntry.root.classList.remove('is-updating');
            this.killsPulseTimeout = null;
          }, 340);
        }

        if (killsEntry.unit) {
          const unitLabel = this.getUnitLabel(
            killsEntry.config?.unit,
            totalKills
          );
          if (unitLabel) {
            killsEntry.unit.textContent = unitLabel;
          }
        }

        if (killsEntry.root) {
          killsEntry.root.title = `Asteroides destruídos: ${formattedKills}`;
        }
      }

      if (nextLength > previousLength) {
        layoutNeedsUpdate = true;
      }

      this.cachedValues.sessionKills = totalKills;
      this.cachedValues.sessionKillsTextLength = nextLength;
    }

    const timeSeconds = Math.max(0, Math.floor(sessionData.timeElapsed ?? 0));
    if (timeEntry?.value) {
      if (force || timeSeconds !== this.cachedValues.sessionTimeSeconds) {
        timeEntry.value.textContent = `${timeSeconds}s`;
        this.cachedValues.sessionTimeSeconds = timeSeconds;

        if (timeEntry.root) {
          timeEntry.root.classList.remove('is-updating');
          void timeEntry.root.offsetWidth;
          timeEntry.root.classList.add('is-updating');

          if (this.timePulseTimeout) {
            window.clearTimeout(this.timePulseTimeout);
          }

          this.timePulseTimeout = window.setTimeout(() => {
            timeEntry.root.classList.remove('is-updating');
            this.timePulseTimeout = null;
          }, 340);
        }
      }
    }

    if (layoutNeedsUpdate) {
      this.requestViewportScaleUpdate();
    }
  }

  applyWaveState(waveData, options = {}) {
    const waveRefs = this.domRefs.wave;
    if (!waveRefs?.container || !waveData) {
      return;
    }

    const force = Boolean(options.force);

    const normalized = {
      current: Math.max(1, Math.floor(waveData.current ?? 1)),
      completedWaves: Math.max(0, Math.floor(waveData.completedWaves ?? 0)),
      totalAsteroids: Math.max(0, Math.floor(waveData.totalAsteroids ?? 0)),
      asteroidsKilled: Math.max(0, Math.floor(waveData.asteroidsKilled ?? 0)),
      isActive: Boolean(waveData.isActive ?? true),
      timeRemaining: Math.max(0, Number(waveData.timeRemaining ?? 0)),
      breakTimer: Math.max(0, Number(waveData.breakTimer ?? 0)),
    };

    const timeSeconds = normalized.isActive
      ? Math.max(0, Math.ceil(normalized.timeRemaining))
      : 0;
    const breakSeconds = !normalized.isActive
      ? Math.max(0, Math.ceil(normalized.breakTimer))
      : 0;

    const lastWave = this.cachedValues.wave;
    const formattedKills =
      normalized.isActive || normalized.totalAsteroids > 0
        ? this.formatCount(normalized.asteroidsKilled, { allowCompact: true })
        : null;
    const formattedTotal =
      normalized.totalAsteroids > 0
        ? this.formatCount(normalized.totalAsteroids, { allowCompact: true })
        : null;
    let layoutNeedsUpdate = false;
    const previousLabelLength = this.cachedValues.wave.labelLength ?? 0;
    const previousEnemiesLength = this.cachedValues.wave.enemiesTextLength ?? 0;
    let nextLabelLength = previousLabelLength;
    let nextEnemiesLength = previousEnemiesLength;

    const hasChanged =
      force ||
      lastWave.current !== normalized.current ||
      lastWave.completedWaves !== normalized.completedWaves ||
      lastWave.totalAsteroids !== normalized.totalAsteroids ||
      lastWave.asteroidsKilled !== normalized.asteroidsKilled ||
      lastWave.isActive !== normalized.isActive ||
      lastWave.timeRemainingSeconds !== timeSeconds ||
      lastWave.breakTimerSeconds !== breakSeconds;

    if (!hasChanged) {
      return;
    }

    const numberText = `WAVE ${normalized.current}`;
    let newLabelLength = numberText.length;

    if (waveRefs.waveLabel && waveRefs.waveLabel.textContent !== numberText) {
      waveRefs.waveLabel.textContent = numberText;
    }

    if (waveRefs.waveNumber && waveRefs.waveNumber.textContent !== numberText) {
      waveRefs.waveNumber.textContent = numberText;
    }

    if (newLabelLength > previousLabelLength) {
      layoutNeedsUpdate = true;
    }

    nextLabelLength = newLabelLength;

    if (waveRefs.timerValue) {
      if (normalized.isActive) {
        waveRefs.timerValue.textContent = `${timeSeconds}s`;
      } else if (normalized.totalAsteroids > 0) {
        waveRefs.timerValue.textContent = '0s';
      } else {
        waveRefs.timerValue.textContent = '--';
      }
    }

    if (waveRefs.progressBar) {
      const progress = normalized.totalAsteroids
        ? Math.min(1, normalized.asteroidsKilled / normalized.totalAsteroids)
        : normalized.isActive
          ? 0
          : 1;
      const percentage = Math.max(0, Math.min(100, progress * 100));
      waveRefs.progressBar.style.width = `${percentage.toFixed(2)}%`;
      if (waveRefs.progressTrack) {
        waveRefs.progressTrack.setAttribute(
          'aria-valuenow',
          `${Math.round(percentage)}`
        );
        const valueText = normalized.isActive
          ? formattedTotal
            ? `Wave progress ${formattedKills} of ${formattedTotal}`
            : `Wave progress ${formattedKills}`
          : 'Wave complete';
        waveRefs.progressTrack.setAttribute('aria-valuetext', valueText);
      }
    }

    const inBreak = !normalized.isActive && breakSeconds > 0;
    const waveCompleted =
      !normalized.isActive && breakSeconds === 0 && normalized.totalAsteroids > 0;

    if (waveRefs.enemies) {
      let enemiesText = '--';

      if (normalized.isActive) {
        enemiesText = formattedTotal
          ? `${formattedKills}/${formattedTotal}`
          : `${formattedKills}`;
      } else if (inBreak) {
        enemiesText = `⏱ ${breakSeconds}s`;
      } else if (waveCompleted) {
        enemiesText = '✓ Clear!';
      }

      if (waveRefs.enemies.textContent !== enemiesText) {
        waveRefs.enemies.textContent = enemiesText;
        waveRefs.enemies.title = enemiesText === '--' ? '' : enemiesText;
      }

      const newEnemiesLength = enemiesText.length;
      if (newEnemiesLength > previousEnemiesLength) {
        layoutNeedsUpdate = true;
      }

      nextEnemiesLength = newEnemiesLength;
    }

    if (waveRefs.countdown) {
      const shouldShowCountdown = inBreak;
      waveRefs.countdown.classList.toggle('is-visible', shouldShowCountdown);
      waveRefs.countdown.setAttribute(
        'aria-hidden',
        shouldShowCountdown ? 'false' : 'true'
      );
      waveRefs.countdown.classList.toggle('is-alert', breakSeconds > 0 && breakSeconds <= 5);
      if (waveRefs.countdownValue) {
        const { countdownValue } = waveRefs;
        if (shouldShowCountdown) {
          const nextValue = `${breakSeconds}`;
          if (countdownValue.textContent !== nextValue) {
            countdownValue.textContent = nextValue;
            countdownValue.classList.remove('is-ticking');
            void countdownValue.offsetWidth;
            countdownValue.classList.add('is-ticking');
          }
        } else {
          countdownValue.classList.remove('is-ticking');
        }
      }
    }

    if (layoutNeedsUpdate) {
      this.requestViewportScaleUpdate();
    }

    if (waveRefs.container) {
      waveRefs.container.classList.toggle('hud-panel--wave-break', inBreak);
      waveRefs.container.classList.toggle('hud-panel--wave-complete', waveCompleted);
    }

    waveRefs.container.classList.toggle(
      'is-alert',
      !normalized.isActive && breakSeconds > 0
    );

    this.cachedValues.wave = {
      current: normalized.current,
      completedWaves: normalized.completedWaves,
      totalAsteroids: normalized.totalAsteroids,
      asteroidsKilled: normalized.asteroidsKilled,
      isActive: normalized.isActive,
      timeRemainingSeconds: timeSeconds,
      breakTimerSeconds: breakSeconds,
      labelLength: nextLabelLength,
      enemiesTextLength: nextEnemiesLength,
    };
  }

  handleWaveStateUpdated(payload) {
    if (!payload) {
      return;
    }

    if (payload.session) {
      this.updateSessionStatsFromData(payload.session);
    }

    if (payload.wave) {
      this.applyWaveState(payload.wave);
    }
  }

  updateShieldIndicator(shieldState, options = {}) {
    const entry = this.hudElements.get('shield');
    if (!entry?.root || !entry.value) {
      return;
    }

    const state = shieldState || {
      level: 0,
      maxHP: 0,
      currentHP: 0,
      cooldownTimer: 0,
      cooldownDuration: 0,
      isActive: false,
      isUnlocked: false,
      isOnCooldown: false,
    };

    const force = Boolean(options.force);

    const cooldownRatio =
      state.isOnCooldown && state.cooldownDuration > 0
        ? 1 - Math.max(0, Math.min(1, state.cooldownTimer / state.cooldownDuration))
        : 0;

    const maxHP = Math.max(0, state.maxHP);
    const activeHP = Math.max(0, state.currentHP);
    const effectiveHP = state.isActive ? activeHP : maxHP;
    const hpRatio =
      state.isUnlocked && maxHP > 0
        ? Math.max(0, Math.min(1, effectiveHP / maxHP))
        : 0;

    const cached = this.cachedValues.shield;
    const shouldUpdate =
      force ||
      cached.level !== state.level ||
      cached.maxHP !== state.maxHP ||
      cached.currentHP !== state.currentHP ||
      cached.isActive !== state.isActive ||
      cached.isUnlocked !== state.isUnlocked ||
      cached.isOnCooldown !== state.isOnCooldown ||
      cached.cooldownRatio !== cooldownRatio ||
      cached.hpRatio !== hpRatio;

    if (!shouldUpdate) {
      return;
    }

    entry.root.classList.remove(
      'locked',
      'ready',
      'active',
      'cooldown',
      'is-cooldown',
      'is-low'
    );

    const statusLabel = entry.value;
    let isLowShield = false;

    if (!state.isUnlocked) {
      entry.root.classList.add('locked');
      statusLabel.textContent = '--';

      if (entry.bar) {
        entry.bar.style.opacity = '0.3';
        if (entry.barFill) {
          entry.barFill.style.width = '0%';
        }
      }
    } else {
      const currentHP = effectiveHP;

      statusLabel.textContent = `${currentHP}/${maxHP}`;

      if (entry.bar && entry.barFill) {
        if (state.isOnCooldown) {
          entry.root.classList.add('cooldown', 'is-cooldown');
          entry.bar.style.opacity = '0.5';
          entry.barFill.style.width = `${cooldownRatio * 100}%`;
        } else if (!state.isActive) {
          entry.root.classList.add('ready');
          entry.bar.style.opacity = '0.7';
          entry.barFill.style.width = '100%';
        } else {
          entry.root.classList.add('active');
          entry.bar.style.opacity = '1';
          entry.barFill.style.width = `${hpRatio * 100}%`;

          const lowShieldThreshold = 0.3;
          isLowShield = hpRatio > 0 && hpRatio <= lowShieldThreshold;
        }
      }
    }

    entry.root.classList.toggle('is-low', isLowShield);
    entry.root.style.setProperty('--hud-shield-ratio', hpRatio.toFixed(3));

    this.cachedValues.shield = {
      level: state.level,
      maxHP: state.maxHP,
      currentHP: state.currentHP,
      isActive: state.isActive,
      isUnlocked: state.isUnlocked,
      isOnCooldown: state.isOnCooldown,
      cooldownDuration: state.cooldownDuration,
      cooldownTimer: state.cooldownTimer,
      cooldownRatio,
      hpRatio,
    };
  }

  flashHealthDisplay() {
    const entry = this.hudElements.get('health');
    const healthDisplay = entry?.value;
    if (!healthDisplay) {
      return;
    }

    if (document.body?.classList.contains('damage-flash-disabled')) {
      return;
    }

    healthDisplay.classList.remove('damage-flash');
    void healthDisplay.offsetWidth;
    healthDisplay.classList.add('damage-flash');

    if (this.damageFlashTimeout) {
      clearTimeout(this.damageFlashTimeout);
    }

    this.damageFlashTimeout = window.setTimeout(() => {
      healthDisplay.classList.remove('damage-flash');
      this.damageFlashTimeout = null;
    }, 280);
  }

  flashShieldFailure() {
    const entry = this.hudElements.get('shield');
    const element = entry?.root;
    if (!element) {
      return;
    }

    element.classList.remove('shield-fail');
    void element.offsetWidth;
    element.classList.add('shield-fail');

    if (this.shieldFailTimeout) {
      window.clearTimeout(this.shieldFailTimeout);
    }

    this.shieldFailTimeout = window.setTimeout(() => {
      element.classList.remove('shield-fail');
      this.shieldFailTimeout = null;
    }, 300);
  }

  showScreen(screenName, options = {}) {
    const { overlay = false, show = true } = options;
    try {
      if (overlay) {
        const target = document.getElementById(`${screenName}-screen`);
        if (target) {
          target.classList.toggle('hidden', !show);
        }

        // Keep game-ui visible for pause and gameover overlays
        if ((screenName === 'pause' || screenName === 'gameover') && show) {
          const gameUI = document.getElementById('game-ui');
          if (gameUI) gameUI.classList.remove('hidden');
        }
        return;
      }

      document.querySelectorAll('.screen').forEach((screen) => {
        screen.classList.add('hidden');
      });

      const gameUI = document.getElementById('game-ui');
      if (gameUI) gameUI.classList.add('hidden');

      if (
        this.settingsState.isOpen &&
        this.settingsState.source === 'menu' &&
        screenName !== 'menu'
      ) {
        this.closeSettingsPanel();
      }

      if (screenName === 'playing' || screenName === 'game') {
        if (gameUI) gameUI.classList.remove('hidden');
      } else {
        const screen = document.getElementById(`${screenName}-screen`);
        if (screen) screen.classList.remove('hidden');
      }

      const pauseOverlay = document.getElementById('pause-screen');
      if (pauseOverlay) pauseOverlay.classList.add('hidden');

      const creditsOverlay = document.getElementById('credits-screen');
      if (creditsOverlay) {
        creditsOverlay.classList.add('hidden');
        creditsOverlay.setAttribute('aria-hidden', 'true');
      }

      if (this.creditsState) {
        this.creditsState.isOpen = false;
        this.creditsState.triggerId = null;
      }

      document.body?.classList.remove('is-credits-open');

      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('screen-changed', { screen: screenName });
      }
    } catch (error) {
      console.error('[UISystem] Failed to show screen:', error);
    }
  }

  showGameUI() {
    this.resetLevelUpState();
    this.showScreen('playing');
    this.refreshHudFromServices(true);
  }

  updatePauseScreen(isPaused) {
    const shouldPause = Boolean(isPaused);
    if (this.currentPauseState === shouldPause) return;

    this.currentPauseState = shouldPause;
    this.showScreen('pause', { overlay: true, show: shouldPause });

    document.body?.classList.toggle('is-paused', shouldPause);

    if (
      !shouldPause &&
      this.settingsState.isOpen &&
      this.settingsState.source === 'pause'
    ) {
      this.closeSettingsPanel();
    }
  }

  showLevelUpScreen(data = {}) {
    const options = ensureArray(data.options || data.availableUpgrades);

    if (!options.length) {
      if (data.autoResolved) {
        this.resetLevelUpState();
        this.showGameUI();
      }
      return;
    }

    const levelValue = Number.isFinite(Number(data.level))
      ? Number(data.level)
      : Number.isFinite(Number(data.newLevel))
        ? Number(data.newLevel)
        : null;

    this.levelUpState.isVisible = true;
    this.levelUpState.options = options;
    this.levelUpState.poolSize = Number.isFinite(Number(data.poolSize))
      ? Number(data.poolSize)
      : options.length;
    this.levelUpState.focusIndex = -1;

    this.showScreen('levelup');

    if (this.domRefs.levelUp.text) {
      const optionCount = options.length;
      const poolSize = this.levelUpState.poolSize;
      const optionLabel = optionCount === 1 ? 'opção' : 'opções';
      let suffix = ` (${optionCount} ${optionLabel})`;
      if (poolSize > optionCount) {
        suffix = ` (${optionCount} de ${poolSize} ${optionLabel})`;
      }
      const prefix = Number.isFinite(levelValue)
        ? `Level ${levelValue} - Escolha sua tecnologia`
        : 'Escolha sua tecnologia';
      this.domRefs.levelUp.text.textContent = `${prefix}${suffix}:`;
    }

    const container = this.domRefs.levelUp.container;
    if (container) {
      container.innerHTML = '';
      const fragment = document.createDocumentFragment();
      const buttons = [];

      options.forEach((option, index) => {
        const button = this.createUpgradeOptionButton(option, index);
        fragment.appendChild(button);
        buttons.push(button);
      });

      container.appendChild(fragment);
      this.levelUpState.buttons = buttons;
      this.focusLevelUpOption(0, { preventFocus: false });
    } else {
      this.levelUpState.buttons = [];
    }
  }

  createUpgradeOptionButton(option, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'upgrade-option';
    button.dataset.upgradeId = option.id;
    button.dataset.index = `${index}`;

    const accentColors = this.resolveAccentColors(option);
    button.style.setProperty('--upgrade-accent', accentColors.accent);
    button.style.setProperty('--upgrade-accent-soft', accentColors.soft);

    button.innerHTML = this.buildUpgradeOptionMarkup(option);
    button.addEventListener('click', () => this.selectUpgrade(option.id));
    button.addEventListener('mouseenter', () =>
      this.focusLevelUpOption(index, { preventFocus: true, fromPointer: true })
    );
    button.addEventListener('focus', () =>
      this.focusLevelUpOption(index, { preventFocus: false })
    );

    return button;
  }

  buildUpgradeOptionMarkup(option = {}) {
    const category = option.category || {};
    const currentLevel = Number.isFinite(Number(option.currentLevel))
      ? Number(option.currentLevel)
      : 0;
    const maxLevel = Number.isFinite(Number(option.maxLevel))
      ? Number(option.maxLevel)
      : Math.max(currentLevel, 1);
    const nextLevel = option.nextLevel || null;
    const summary = option.summary ? option.summary : '';
    const highlights = Array.isArray(nextLevel?.highlights)
      ? nextLevel.highlights
      : [];
    const prerequisites = ensureArray(option.prerequisites);

    const categoryIcon = category.icon
      ? `<span class="upgrade-option__category-icon" aria-hidden="true">${category.icon}</span>`
      : '';

    const nextLevelSection = nextLevel
      ? `<section class="upgrade-option__next">
          <p class="upgrade-option__next-label">Próximo: ${
            nextLevel.title || `Nível ${currentLevel + 1}`
          }</p>
          <p class="upgrade-option__description">${
            nextLevel.description || ''
          }</p>
          ${
            highlights.length
              ? `<ul class="upgrade-highlights">
                  ${highlights.map((item) => `<li>${item}</li>`).join('')}
                </ul>`
              : ''
          }
        </section>`
      : '<p class="upgrade-option__maxed">Tecnologia já maximizada.</p>';

    const prerequisitesSection = prerequisites.length
      ? `<footer class="upgrade-option__footer">
          <ul class="upgrade-prerequisites">
            ${prerequisites
              .map((entry) => {
                const label = entry?.label || entry?.description || '';
                if (!label) {
                  return '';
                }
                const stateClass = entry.met ? 'is-met' : 'is-locked';
                const icon = entry.met ? '✔️' : '🔒';
                return `<li class="${stateClass}">${icon} ${label}</li>`;
              })
              .join('')}
          </ul>
        </footer>`
      : '';

    return `
      <header class="upgrade-option__header">
        <span class="upgrade-icon" aria-hidden="true">${
          option.icon || '✨'
        }</span>
        <div class="upgrade-option__meta">
          <span class="upgrade-option__category">
            ${categoryIcon}
            ${category.label || 'Tecnologia'}
          </span>
          <span class="upgrade-option__level">Nv. atual: ${currentLevel}/${
            maxLevel || Math.max(1, currentLevel)
          }</span>
        </div>
      </header>
      <div class="upgrade-option__body">
        <h3 class="upgrade-option__title">${option.name || option.id}</h3>
        ${summary ? `<p class="upgrade-option__summary">${summary}</p>` : ''}
        ${nextLevelSection}
      </div>
      ${prerequisitesSection}
    `;
  }

  selectUpgrade(upgradeId) {
    if (!upgradeId) {
      return;
    }

    const progression = this.getService('progression');

    if (!progression || typeof progression.applyUpgrade !== 'function') {
      this.showGameUI();
      return;
    }

    this.disableLevelUpOptions();
    const success = progression.applyUpgrade(upgradeId);
    if (success) {
      this.showGameUI();
    } else {
      this.enableLevelUpOptions();
    }
  }

  handleUpgradeOptions(payload = {}) {
    const options = ensureArray(payload.options || payload.availableUpgrades);
    this.levelUpState.poolSize = Number.isFinite(Number(payload.poolSize))
      ? Number(payload.poolSize)
      : options.length;
    this.levelUpState.options = options;

    if (
      Number.isFinite(Number(payload.level)) ||
      Number.isFinite(Number(payload.newLevel))
    ) {
      this.updateLevelDisplay(payload.level ?? payload.newLevel, {
        force: true,
      });
    }

    if (!options.length) {
      this.resetLevelUpState();
      if (payload.autoResolved) {
        this.showGameUI();
      }
      return;
    }

    this.showLevelUpScreen({
      level: payload.level ?? payload.newLevel,
      options,
      poolSize: this.levelUpState.poolSize,
      autoResolved: payload.autoResolved,
    });
  }

  focusLevelUpOption(index, options = {}) {
    const buttons = ensureArray(this.levelUpState.buttons);
    if (!buttons.length) {
      this.levelUpState.focusIndex = -1;
      return;
    }

    const safeIndex =
      ((index % buttons.length) + buttons.length) % buttons.length;
    buttons.forEach((button, idx) => {
      if (!button) {
        return;
      }
      if (idx === safeIndex) {
        button.classList.add('is-focused');
        if (!options.preventFocus && document.activeElement !== button) {
          button.focus({ preventScroll: true });
        }
      } else {
        button.classList.remove('is-focused');
      }
    });

    this.levelUpState.focusIndex = safeIndex;
  }

  moveLevelUpFocus(direction) {
    const buttons = ensureArray(this.levelUpState.buttons);
    if (!buttons.length) {
      return;
    }

    const currentIndex =
      this.levelUpState.focusIndex >= 0 ? this.levelUpState.focusIndex : 0;
    this.focusLevelUpOption(currentIndex + direction, { preventFocus: false });
  }

  handleLevelUpInputAction(payload = {}) {
    if (!this.levelUpState.isVisible) {
      return;
    }

    if (payload.phase && payload.phase !== 'pressed') {
      return;
    }

    switch (payload.action) {
      case 'moveUp':
      case 'moveLeft':
        this.moveLevelUpFocus(-1);
        break;
      case 'moveDown':
      case 'moveRight':
        this.moveLevelUpFocus(1);
        break;
      default:
        break;
    }
  }

  handleLevelUpConfirm() {
    if (!this.levelUpState.isVisible) {
      return;
    }

    this.applyFocusedUpgrade();
  }

  applyFocusedUpgrade() {
    const index = this.levelUpState.focusIndex;
    if (index < 0) {
      this.focusLevelUpOption(0, { preventFocus: false });
    }

    const option = this.levelUpState.options?.[this.levelUpState.focusIndex];
    if (option && option.id) {
      this.selectUpgrade(option.id);
    }
  }

  disableLevelUpOptions() {
    ensureArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.disabled = true;
      }
    });
  }

  enableLevelUpOptions() {
    ensureArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.disabled = false;
      }
    });
  }

  resetLevelUpState() {
    ensureArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.classList.remove('is-focused');
        button.disabled = false;
      }
    });

    this.levelUpState = {
      isVisible: false,
      options: [],
      buttons: [],
      focusIndex: -1,
      poolSize: 0,
    };
  }

  resolveAccentColors(option) {
    const fallback = '#3399ff';
    let accent = fallback;
    let categoryId = null;

    if (option && typeof option === 'object') {
      if (
        typeof option.themeColor === 'string' &&
        option.themeColor.trim().length
      ) {
        accent = option.themeColor.trim();
      } else if (
        typeof option.color === 'string' &&
        option.color.trim().length
      ) {
        accent = option.color.trim();
      }

      categoryId =
        option.category?.id ||
        option.categoryId ||
        (typeof option.id === 'string' ? option.id : null);
    } else if (typeof option === 'string' && option.trim().length) {
      accent = option.trim();
    }

    const colorVision =
      this.currentVisualPreferences?.derived?.colorVision || 'standard';

    if (colorVision === 'assist') {
      const assistAccent = this.resolveAssistAccent(categoryId);
      if (assistAccent) {
        accent = assistAccent;
      }
    }

    const normalized =
      typeof accent === 'string' ? accent.trim().toLowerCase() : '';
    const softAlpha = colorVision === 'assist' ? 0.35 : 0.25;
    let soft = 'rgba(51, 153, 255, 0.25)';

    if (normalized.startsWith('#')) {
      soft = this.hexToRgba(normalized, softAlpha);
    } else if (normalized.startsWith('rgb')) {
      soft = normalized.replace('rgb', 'rgba').replace(')', `, ${softAlpha})`);
    } else if (normalized.startsWith('hsl')) {
      soft = normalized.replace('hsl', 'hsla').replace(')', `, ${softAlpha})`);
    } else if (colorVision === 'assist') {
      soft = 'rgba(76, 110, 245, 0.32)';
    }

    return { accent, soft };
  }

  resolveAssistAccent(categoryId) {
    if (!categoryId) {
      return COLOR_ASSIST_ACCENTS.default;
    }

    return COLOR_ASSIST_ACCENTS[categoryId] || COLOR_ASSIST_ACCENTS.default;
  }

  hexToRgba(hex, alpha = 1) {
    const sanitized = typeof hex === 'string' ? hex.replace('#', '') : '';
    const clampedAlpha = Math.min(1, Math.max(0, alpha));

    if (sanitized.length === 3) {
      const r = parseInt(sanitized[0] + sanitized[0], 16);
      const g = parseInt(sanitized[1] + sanitized[1], 16);
      const b = parseInt(sanitized[2] + sanitized[2], 16);
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }

    if (sanitized.length === 6) {
      const r = parseInt(sanitized.slice(0, 2), 16);
      const g = parseInt(sanitized.slice(2, 4), 16);
      const b = parseInt(sanitized.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }

    return `rgba(51, 153, 255, ${clampedAlpha})`;
  }

  showGameOverScreen(data) {
    // Show gameover as overlay so game canvas stays visible with asteroids wandering
    this.showScreen('gameover', { overlay: true, show: true });
    // Simplified game over screen - no stats display
  }
}

export default UISystem;
