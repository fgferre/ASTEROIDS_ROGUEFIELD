// src/modules/UISystem.js

import {
  DEFAULT_HUD_LAYOUT_ID,
  getHudLayoutDefinition,
} from '../data/ui/hudLayout.js';
import {
  DEFAULT_HULL_ID,
  getAllShipModels,
  getShipModelById,
} from '../data/shipModels.js';
import SETTINGS_SCHEMA from '../data/settingsSchema.js';
import { LAYER_MODIFIERS, directorFor } from '../data/layers.js';
import { HERALD_KINDS } from '../data/enemies/herald.js';
import { RUN_FINAL_LAYER } from '../data/constants/gameplay.js';
import { biomeForLayer } from '../data/biomes.js';
import { BaseSystem } from '../core/BaseSystem.js';
import {
  applyCanvasResolution,
  resolveDevicePixelRatio,
} from '../core/viewport.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/GameConstants.js';
import { resolveService } from '../core/serviceUtils.js';
import { AAAHudLayout, radarGlyph } from './ui/AAAHudLayout.js';
import { controlSchemeFromUrl } from './PlayerSystem.js';
import { Onboarding, onboardingPrompts } from './ui/onboarding.js';
import { RunCinematics } from './ui/runCinematics.js';
import {
  TransmissionQueue,
  chapterTransmission,
  deathTransmission,
  victoryTransmission,
  wardenTransmission,
} from './ui/transmissions.js';
import { PICKUP_KINDS } from '../data/pickups.js';
import {
  buildBlockMarkup,
  collectBuild,
  killerName,
  pipsMarkup,
  runLocationLine,
} from './ui/runRecap.js';
import {
  hangarItemMarkup,
  salvageBalanceText,
  salvageLine,
} from './ui/hangar.js';
import { adjacentCodexTab, codexTabView } from './ui/codexTabs.js';
import {
  GAMEPAD_FOCUSABLE_SELECTOR,
  GAMEPAD_NAV_SCREENS,
  pickFocusTarget,
} from './ui/gamepadNav.js';
import {
  PAD_BUTTON_GLYPHS,
  PAD_STICK_GLYPHS,
} from '../data/constants/gamepad.js';
import { settingPreview } from './ui/settingsPreview.js';
import { menuStatusItems, menuStatusMarkup } from './ui/menuStatus.js';
import { loadRecords } from '../services/runRecords.js';
import { playLevelUpExit, staggerCardEntry } from './ui/levelUpTransition.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

// Level-up cards and the victory buttons ignore input this long after showing.
const SCREEN_INPUT_LOCKOUT_MS = 400;
const UPGRADE_RARITY_LABELS = { common: 'Common', rare: 'Rare', epic: 'Epic' };

const COLOR_ASSIST_ACCENTS = {
  offense: '#3366CC',
  defense: '#2F855A',
  mobility: '#E76F51',
  utility: '#8E6CFF',
  default: '#4C6EF5',
};

class UISystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      enableRandomManagement: true,
      systemName: 'UISystem',
      serviceName: 'ui',
      randomForkLabels: {
        base: 'ui.base',
        animations: 'ui.animations',
        transitions: 'ui.transitions',
      },
    });
    // `?replay=` runs without the first-run onboarding tips.
    this.onboardingDisabled = false;
  }

  initialize() {
    this.damageFlashTimeout = null;
    this.currentPauseState = false;
    this.shieldFailTimeout = null;
    this.timePulseTimeout = null;
    this.killsPulseTimeout = null;
    this.levelPulseTimeout = null;
    this.resizeRaf = null;
    this.menuShipSelectorRefreshFrame = null;
    this._lastHoverTarget = null;
    this.currentHudBaseScale = 1;
    this.currentHudAutoScale = 1;
    this.currentCanvasScale = 1;
    this.currentCanvasDpr = 0;
    this.canvasBaseSize = { width: GAME_WIDTH, height: GAME_HEIGHT };
    this.handleResize = this.handleResize.bind(this);

    // Force AAA Tactical HUD
    this.currentHudLayoutId = DEFAULT_HUD_LAYOUT_ID;
    this.aaaTacticalHud = null;
    this.transmissions = null;
    this.transmissionRaf = null;
    this.transmissionLayer = 1;
    this.cinematics = new RunCinematics({
      eventBus: this.eventBus,
      renderer: () => this.getService('renderer'),
      hud: () => this.aaaTacticalHud,
      // The session's pause flag alone: no pause screen, no fixed steps.
      holdSim: (held) => this.getService('game-state')?.setPaused(held),
      bindSkip: (skip) => {
        // Capture on window runs before every other key handler: the key
        // only skips (a held key's repeats are swallowed too).
        const onKey = (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!event.repeat) skip();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      },
      onIntroEnd: () =>
        this.handleLayerStarted({ wave: this.transmissionLayer }),
    });
    this.aaaTacticalHudDefinition = getHudLayoutDefinition(
      this.currentHudLayoutId
    );
    this.aaaTacticalHudMountTarget = null;
    this.aaaTacticalHudRestoreState = null;
    this.onboarding = new Onboarding(
      {
        showTip: (id) => this.showOnboardingTip(id),
        hideTip: () => this.aaaTacticalHud?.hideOnboardingTip(),
      },
      (id) => this.eventBus?.emit('onboarding-step', { id })
    );

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
        managerAllEnemiesTotal: null,
        compatibilityMode: false,
      },
      boss: { visible: false }, // Simplified boss cache
      combo: {
        count: 0,
        multiplier: 1,
        valueText: '0 Hits',
        multiplierText: 'x1.0',
        active: false,
        high: false,
      },
      minimap: {
        range: 0,
        detectionRange: 0,
        width: 0,
        height: 0,
      },
    };

    this.settings = null;
    this.liveQualityPreset = null;
    this.settingsSchema = [];
    this.schemaByCategory = new Map();
    this.settingsState = {
      isOpen: false,
      source: 'menu',
      activeCategory: 'graphics',
      capture: null,
      previousFocus: null,
    };
    this.creditsState = {
      isOpen: false,
      triggerId: null,
    };
    this.handleCreditsKeyDown = this.handleCreditsKeyDown.bind(this);
    this.codexState = { isOpen: false, trigger: null, tab: 'enemies' };
    this.hangarState = { isOpen: false, trigger: null };
    this.levelUpState = {
      isVisible: false,
      options: [],
      buttons: [],
      focusIndex: -1,
      poolSize: 0,
      level: null,
      lockedUntil: 0,
      banishMode: false,
      exitTimer: null,
    };
    this.quitConfirm = { button: null, label: '', timeoutId: null };
    this.currentVisualPreferences = {
      accessibility: {},
      video: {},
      derived: {},
    };
    this.bossHudState = this.createInitialBossHudState();

    this.tacticalState = {
      contactsCache: null,
      threats: new Map(),
      isReady: false,
    };

    this.initializeSettingsMetadata();

    this.domRefs = this.cacheStaticNodes();
    // The static keyboard hints show the scheme in use (style.css).
    document.body.dataset.controls = controlSchemeFromUrl();

    // Direct AAA HUD Activation
    this.activateAAATacticalHud(this.aaaTacticalHudDefinition);
    this.updateAAATacticalHudFromServices({ force: true });

    this.bindPauseControls();
    this.bindCopySeedLink();
    this.bindLevelUpControls();
    this.bindSettingsControls();
    this.bindCreditsControls();
    this.bindCodexControls();
    this.bindHangarControls();
    this.bindMainMenuControls();
    this.initializeMenuShipSelector();
    this.refreshMenuStatus();
    this.bootstrapSettingsState();
    this.initializeViewportScaling();
  }

  getService(name) {
    return resolveService(name, this.dependencies);
  }

  resolveSettingsService() {
    return this.getService('settings');
  }

  cacheStaticNodes() {
    return {
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
      },
      levelUp: {
        container: document.getElementById('upgrades-container') || null,
        text: document.getElementById('levelup-text') || null,
        rerollBtn: document.getElementById('levelup-reroll-btn') || null,
        banishBtn: document.getElementById('levelup-banish-btn') || null,
        banishHint: document.getElementById('levelup-banish-hint') || null,
      },
      gameOver: {
        time: document.getElementById('gameover-time') || null,
        wave: document.getElementById('gameover-wave') || null,
        kills: document.getElementById('gameover-kills') || null,
        combo: document.getElementById('gameover-combo') || null,
        level: document.getElementById('gameover-level') || null,
        killer: document.getElementById('gameover-killer') || null,
        location: document.getElementById('gameover-location') || null,
        salvage: document.getElementById('gameover-salvage') || null,
        build: document.getElementById('gameover-build') || null,
        seed: document.getElementById('gameover-seed') || null,
        copySeedBtn: document.getElementById('gameover-copy-seed-btn') || null,
        retryBtn: document.getElementById('retry-game-btn') || null,
        restartBtn: document.getElementById('restart-game-btn') || null,
        quitBtn: document.getElementById('quit-game-btn') || null,
      },
      victory: {
        time: document.getElementById('victory-time') || null,
        wave: document.getElementById('victory-wave') || null,
        kills: document.getElementById('victory-kills') || null,
        combo: document.getElementById('victory-combo') || null,
        level: document.getElementById('victory-level') || null,
        build: document.getElementById('victory-build') || null,
        synergies: document.getElementById('victory-synergies') || null,
        best: document.getElementById('victory-best') || null,
        salvage: document.getElementById('victory-salvage') || null,
        continueBtn: document.getElementById('victory-continue-btn') || null,
        restartBtn: document.getElementById('victory-restart-btn') || null,
        quitBtn: document.getElementById('victory-quit-btn') || null,
      },
      pause: {
        container: document.getElementById('pause-screen') || null,
        resumeBtn: document.getElementById('pause-resume-btn') || null,
        settingsBtn: document.getElementById('pause-settings-btn') || null,
        exitBtn: document.getElementById('pause-exit-btn') || null,
        location: document.getElementById('pause-build-location') || null,
        build: document.getElementById('pause-build-block') || null,
        tools: document.getElementById('pause-build-tools') || null,
        seed: document.getElementById('pause-run-seed') || null,
      },
      codex: {
        overlay: document.getElementById('codex-screen') || null,
        list: document.getElementById('codex-list') || null,
        count: document.getElementById('codex-count') || null,
        openBtn: document.getElementById('menu-codex-btn') || null,
        backBtn: document.getElementById('codex-back-btn') || null,
        closeBtn: document.getElementById('codex-close-btn') || null,
        tabs: Array.from(document.querySelectorAll('[data-codex-tab]')),
      },
      hangar: {
        overlay: document.getElementById('hangar-screen') || null,
        list: document.getElementById('hangar-list') || null,
        hulls: document.getElementById('hangar-hulls') || null,
        balance: document.getElementById('hangar-balance') || null,
        openBtn: document.getElementById('menu-hangar-btn') || null,
        backBtn: document.getElementById('hangar-back-btn') || null,
        closeBtn: document.getElementById('hangar-close-btn') || null,
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
      minimap: {
        container: document.getElementById('hud-minimap') || null,
        canvas: document.getElementById('minimap-canvas') || null,
        range: document.getElementById('minimap-range') || null,
        context: null,
      },
      threatIndicators: {
        container:
          document.getElementById('threat-indicators-container') || null,
        overlay: document.getElementById('threat-indicators-overlay') || null,
      },
      combo: {
        container: document.getElementById('hud-combo') || null,
        value: document.getElementById('combo-display') || null,
        multiplier: document.getElementById('combo-multiplier') || null,
      },
      menu: {
        screen: document.getElementById('menu-screen') || null,
        shipSelector: document.getElementById('menu-ship-selector') || null,
        shipSelectorOptions:
          document.getElementById('menu-ship-selector-options') || null,
        status: document.getElementById('menu-status') || null,
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

  createInitialBossHudState() {
    return {
      active: false,
      upcoming: false,
      defeated: false,
      bossId: null,
      name: null,
      health: 0,
      maxHealth: 0,
      phase: 0,
      phaseCount: 0,
      phaseColors: [],
      invulnerable: false,
    };
  }

  getBossHudState() {
    const state =
      this.bossHudState && typeof this.bossHudState === 'object'
        ? this.bossHudState
        : this.createInitialBossHudState();

    return {
      ...this.createInitialBossHudState(),
      ...state,
      phaseColors: Array.isArray(state.phaseColors)
        ? [...state.phaseColors]
        : [],
    };
  }

  handleBossEvent(eventName, data = {}) {
    if (!eventName) {
      return this.getBossHudState();
    }

    const current = this.getBossHudState();
    const next = {
      ...current,
      ...data,
      phaseColors: Array.isArray(data?.phaseColors)
        ? [...data.phaseColors]
        : current.phaseColors,
    };

    switch (eventName) {
      case 'boss-wave-started':
        this.aaaTacticalHud?.holdBossBar();
        next.active = false;
        next.upcoming = true;
        next.defeated = false;
        next.health = 0;
        next.maxHealth = Number(data?.maxHealth ?? next.maxHealth ?? 0) || 0;
        break;
      case 'boss-spawned':
        if (!current.active) {
          this.aaaTacticalHud?.showBossIntro(
            data?.enemy?.displayName,
            data?.enemy?.subtitle
          );
        }
        next.active = true;
        next.upcoming = false;
        next.defeated = false;
        break;
      case 'boss-phase-changed':
      case 'boss-invulnerability-changed':
        next.active = true;
        next.upcoming = false;
        next.defeated = false;
        break;
      case 'boss-defeated':
        next.active = false;
        next.upcoming = false;
        next.defeated = true;
        next.health = 0;
        next.invulnerable = false;
        break;
      case 'boss-hud-update':
      default:
        break;
    }

    next.phase = Math.max(0, Math.floor(Number(next.phase ?? 0) || 0));
    next.phaseCount = Math.max(
      next.phase + 1,
      Math.floor(Number(next.phaseCount ?? 0) || 0)
    );
    next.health = Math.max(0, Number(next.health ?? 0) || 0);
    next.maxHealth = Math.max(
      next.health,
      Number(next.maxHealth ?? next.health ?? 0) || 0
    );
    next.wave = Number.isFinite(Number(next.wave))
      ? Math.max(1, Math.floor(Number(next.wave)))
      : null;
    next.invulnerable = Boolean(next.invulnerable);
    next.name =
      typeof next.name === 'string' && next.name.trim() ? next.name : 'BOSS';

    this.bossHudState = next;
    this.cachedValues.boss = {
      ...(this.cachedValues.boss || {}),
      visible: Boolean(next.active || next.upcoming || next.defeated),
    };

    this.updateAAATacticalHudFromServices({ force: true });
    return this.getBossHudState();
  }

  handleLayerStarted(payload = {}) {
    const hud = this.aaaTacticalHud;
    if (!hud) {
      return;
    }
    const layer = Math.max(1, Math.floor(Number(payload.wave) || 1));
    this.transmissionLayer = layer;
    // The intro's end shows this layer's title card.
    if (this.cinematics.introActive) {
      return;
    }
    const boss = Boolean(payload.isBossWave) || directorFor(layer).warden;
    const biome = biomeForLayer(layer);
    const firstOfBiome = biome.layers[0] === layer;
    hud.showLayerBanner(layer, {
      boss,
      chapter: firstOfBiome
        ? biome.title
        : layer > RUN_FINAL_LAYER
          ? 'DEEP FIELD'
          : '',
    });
    if (firstOfBiome) {
      this.queueTransmission(chapterTransmission(biome.id));
    }
  }

  handleWaveCompletionEvent(payload = {}, sourceEvent = 'wave-complete') {
    const state = this.getBossHudState();
    const completedWave = Number.isFinite(Number(payload?.wave))
      ? Math.max(1, Math.floor(Number(payload.wave)))
      : null;
    const isBossWave =
      Boolean(payload?.isBossWave) ||
      (completedWave !== null && directorFor(completedWave).warden);
    const hasBossContext =
      Boolean(this.cachedValues.boss?.visible) ||
      Boolean(state.bossId) ||
      Boolean(state.defeated);
    const waveMatches =
      completedWave === null ||
      state.wave === null ||
      state.wave === completedWave;

    if (!hasBossContext || !waveMatches) {
      return;
    }

    if (state.active || state.upcoming) {
      return;
    }

    if (!isBossWave && !state.defeated && sourceEvent !== 'wave-complete') {
      return;
    }

    this.bossHudState = this.createInitialBossHudState();
    this.cachedValues.boss = { visible: false };
    this.updateAAATacticalHudFromServices({ force: true });
  }

  initializeViewportScaling() {
    if (typeof window === 'undefined') {
      return;
    }

    this.requestViewportScaleUpdate(true);
    window.addEventListener('resize', this.handleResize, { passive: true });
  }

  handleResize() {
    this.aaaTacticalHud?.invalidatePanelCorners();
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

    const dpr = resolveDevicePixelRatio();
    if (
      !options.force &&
      dpr === this.currentCanvasDpr &&
      Math.abs(scale - this.currentCanvasScale) < 0.005
    ) {
      return;
    }

    this.currentCanvasScale = scale;
    this.currentCanvasDpr = dpr;

    const scaledWidth = Math.round(baseWidth * scale);
    const scaledHeight = Math.round(baseHeight * scale);

    // Backing store at native resolution; drawing stays in 800×600 logical
    // units through the base transform the renderer applies each frame.
    applyCanvasResolution(canvas, scaledWidth, scaledHeight, dpr);
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
    this.aaaTacticalHud?.invalidatePanelCorners();
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

  getSelectedHullId() {
    const gameplayValues =
      this.settings && typeof this.settings.getCategoryValues === 'function'
        ? this.settings.getCategoryValues('gameplay') || null
        : null;
    const hullDefinition = getShipModelById(gameplayValues?.selectedHull);
    return this.getService('hangar').hullFor(
      hullDefinition?.id || DEFAULT_HULL_ID
    );
  }

  getHullDisplayName(hullDefinition) {
    if (!hullDefinition) {
      return 'Unknown Hull';
    }

    return hullDefinition.name || hullDefinition.id;
  }

  initializeMenuShipSelector() {
    const menuRefs = this.domRefs.menu;
    if (!menuRefs?.shipSelector || !menuRefs.shipSelectorOptions) {
      return;
    }

    this.buildMenuShipSelectorButtons();
    this.refreshMenuShipSelector();
  }

  buildMenuShipSelectorButtons() {
    const container = this.domRefs.menu?.shipSelectorOptions;
    if (!container) {
      return;
    }

    container.innerHTML = '';

    const fragment = document.createDocumentFragment();
    getAllShipModels().forEach((hullDefinition) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-ship-selector__option';
      button.dataset.hullId = hullDefinition.id;
      button.setAttribute('aria-pressed', 'false');

      const preview = document.createElement('canvas');
      preview.className = 'menu-ship-selector__preview';
      preview.width = 112;
      preview.height = 112;
      preview.setAttribute('aria-hidden', 'true');
      button.appendChild(preview);

      const label = document.createElement('span');
      label.className = 'menu-ship-selector__name';
      label.textContent = this.getHullDisplayName(hullDefinition);
      label.title = label.textContent;
      button.appendChild(label);

      button.addEventListener('click', () => {
        if (!this.settings || typeof this.settings.setSetting !== 'function') {
          return;
        }

        this.settings.setSetting(
          'gameplay',
          'selectedHull',
          hullDefinition.id,
          {
            source: 'ui',
          }
        );
      });

      fragment.appendChild(button);
    });

    container.appendChild(fragment);
  }

  requestMenuShipSelectorRefresh() {
    if (this.menuShipSelectorRefreshFrame !== null) {
      return;
    }

    const schedule =
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => setTimeout(callback, 16);

    this.menuShipSelectorRefreshFrame = schedule(() => {
      this.menuShipSelectorRefreshFrame = null;
      this.refreshMenuShipSelector();
    });
  }

  refreshMenuShipSelector() {
    const container = this.domRefs.menu?.shipSelectorOptions;
    if (!container) {
      return;
    }

    const selectedHullId = this.getSelectedHullId();
    const hangar = this.getService('hangar');
    container
      .querySelectorAll('.menu-ship-selector__option')
      .forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        const isActive = button.dataset.hullId === selectedHullId;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        const locked = !hangar.isHullUnlocked(button.dataset.hullId);
        button.disabled = locked;
        button.classList.toggle('is-locked', locked);
        button.title = locked ? 'Unlock in the Hangar' : '';
      });

    this.renderMenuShipSelectorPreviews();
  }

  // The records strip under the menu title (ui/menuStatus.js).
  refreshMenuStatus() {
    const strip = this.domRefs.menu?.status;
    if (!strip) {
      return;
    }
    strip.innerHTML = menuStatusMarkup(
      menuStatusItems({
        records: loadRecords(),
        hangar: this.getService('hangar'),
        codex: this.getService('codex'),
        achievements: this.getService('achievements'),
        difficulty: this.getService('difficulty'),
        quality: this.settings?.getCategoryValues('graphics')?.quality,
        livePreset: this.liveQualityPreset,
      })
    );
  }

  renderMenuShipSelectorPreviews() {
    const container = this.domRefs.menu?.shipSelectorOptions;
    const player = this.getService('player');
    if (
      !container ||
      !player ||
      typeof player.renderHullPreview !== 'function'
    ) {
      return;
    }

    container
      .querySelectorAll('.menu-ship-selector__option')
      .forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        const preview = button.querySelector('.menu-ship-selector__preview');
        if (!(preview instanceof HTMLCanvasElement)) {
          return;
        }

        const context = preview.getContext('2d');
        if (!context) {
          return;
        }

        const hullDefinition = getShipModelById(button.dataset.hullId);
        player.renderHullPreview(context, hullDefinition, {
          padding: 12,
        });
      });
  }

  bindLevelUpControls() {
    const { rerollBtn, banishBtn } = this.domRefs.levelUp;
    rerollBtn?.addEventListener('click', () => this.rerollLevelUpOptions());
    banishBtn?.addEventListener('click', () => this.toggleBanishMode());

    document.addEventListener('keydown', (event) => {
      if (!this.levelUpState.isVisible || event.repeat) {
        return;
      }
      if (event.code === 'KeyR') {
        this.rerollLevelUpOptions();
      } else if (event.code === 'KeyB') {
        this.toggleBanishMode();
      } else if (event.key === 'Escape' && this.levelUpState.banishMode) {
        this.setBanishMode(false);
      }
    });
  }

  // The death recap's "Copy seed link": this run's seed and difficulty as a
  // `?seed=&difficulty=` link (clipboard may be missing or refused).
  bindCopySeedLink() {
    const button = this.domRefs.gameOver?.copySeedBtn;
    if (!button) return;
    button.addEventListener('click', () => {
      const link = this.getService('difficulty').shareLink(
        window.location.origin,
        import.meta.env.BASE_URL
      );
      const done = (label) => {
        button.textContent = label;
      };
      if (!navigator.clipboard?.writeText) {
        done('Copy unavailable');
        return;
      }
      navigator.clipboard.writeText(link).then(
        () => done('Link copied'),
        () => done('Copy failed')
      );
    });
  }

  bindPauseControls() {
    const pauseRefs = this.domRefs.pause;
    if (!pauseRefs) {
      return;
    }

    if (pauseRefs.resumeBtn) {
      pauseRefs.resumeBtn.addEventListener('mouseenter', () => {
        this.eventBus?.emit?.('ui-hover', {
          source: 'pause-menu',
          button: 'resume',
        });
      });
      pauseRefs.resumeBtn.addEventListener('click', () => {
        if (!this.currentPauseState) {
          return;
        }

        this.eventBus?.emit?.('toggle-pause');
      });
    }

    if (pauseRefs.settingsBtn) {
      pauseRefs.settingsBtn.addEventListener('mouseenter', () => {
        this.eventBus?.emit?.('ui-hover', {
          source: 'pause-menu',
          button: 'settings',
        });
      });
      pauseRefs.settingsBtn.addEventListener('click', () => {
        if (!this.currentPauseState) {
          return;
        }

        this.eventBus?.emit?.('settings-menu-requested', { source: 'pause' });
      });
    }

    if (pauseRefs.exitBtn) {
      pauseRefs.exitBtn.addEventListener('mouseenter', () => {
        this.eventBus?.emit?.('ui-hover', {
          source: 'pause-menu',
          button: 'exit',
        });
      });
      pauseRefs.exitBtn.addEventListener('click', () => {
        if (!this.currentPauseState) {
          return;
        }

        if (!this.confirmQuit(pauseRefs.exitBtn)) {
          return;
        }

        this.eventBus?.emit?.('exit-to-menu-requested', {
          source: 'pause-menu',
        });
      });
    }

    const quitBtn = this.domRefs.gameOver?.quitBtn;
    if (quitBtn) {
      // Runs before GameSessionService's document-level click handler.
      quitBtn.addEventListener('click', (event) => {
        if (!this.confirmQuit(quitBtn)) {
          event.stopPropagation();
        }
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.cancelQuitConfirm();
      }
    });
  }

  confirmQuit(button) {
    const state = this.quitConfirm;
    if (state.button === button) {
      this.cancelQuitConfirm();
      return true;
    }

    this.cancelQuitConfirm();
    state.button = button;
    state.label = button.textContent;
    button.textContent = 'Quit? Press again';
    button.classList.add('is-confirming');
    button.setAttribute('aria-live', 'polite');
    state.timeoutId = setTimeout(() => this.cancelQuitConfirm(), 3000);
    return false;
  }

  cancelQuitConfirm() {
    const state = this.quitConfirm;
    clearTimeout(state.timeoutId);
    if (state.button) {
      state.button.textContent = state.label;
      state.button.classList.remove('is-confirming');
      state.button.removeAttribute('aria-live');
    }
    state.button = null;
    state.timeoutId = null;
  }

  bindSettingsControls() {
    const settingsRefs = this.domRefs.settings;
    if (!settingsRefs) {
      return;
    }

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
            this.eventBus?.emit?.('ui-hover', {
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
        this.eventBus?.emit?.('ui-hover', {
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
        this.eventBus?.emit?.('ui-hover', {
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
      button.addEventListener('mouseenter', () => {
        // Only emit if credits menu is visible
        if (
          creditsRefs.overlay &&
          creditsRefs.overlay.classList.contains('hidden')
        ) {
          return;
        }
        this.eventBus?.emit?.('ui-hover', {
          source: 'credits-menu',
          element: 'close',
        });
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.closeCreditsOverlay({ restoreFocus: true });
      });
    });
  }

  bindMainMenuControls() {
    // Generic UI Hover Sound Delegation
    // Listens for all menu buttons and interactive elements
    if (typeof document !== 'undefined') {
      document.addEventListener(
        'mouseover',
        (event) => {
          // Check for common button classes or interactive elements
          const target = event.target.closest(
            '.menu-screen__button, .menu-ship-selector__option, .btn, .settings-tab-button, [role="button"]'
          );

          // Debounce/Check if it's a new hover target to avoid spam
          if (target && target !== this._lastHoverTarget) {
            this._lastHoverTarget = target;

            // Determine source based on context
            let source = 'ui';
            if (target.closest('#main-menu')) source = 'main-menu';
            else if (target.closest('#pause-screen')) source = 'pause-menu';
            else if (target.closest('#settings-screen'))
              source = 'settings-menu';
            else if (target.closest('#gameover-screen'))
              source = 'gameover-menu';
            else if (target.closest('#victory-screen')) source = 'victory-menu';
            else if (target.closest('#levelup-screen')) source = 'levelup-menu';

            this.eventBus?.emit?.('ui-hover', {
              source,
              button: target.id || target.className || 'unknown',
            });
          }
        },
        { passive: true }
      );

      // Reset last hover target when mouse leaves
      document.addEventListener(
        'mouseout',
        (event) => {
          if (event.target === this._lastHoverTarget) {
            this._lastHoverTarget = null;
          }
        },
        { passive: true }
      );
    }
  }

  resolveAAATacticalMountTarget() {
    const gameField = this.domRefs.gameField;
    if (gameField && typeof gameField.querySelector === 'function') {
      const overlay = gameField.querySelector('.game-field__overlay');
      if (overlay instanceof HTMLElement) {
        return overlay;
      }
    }

    const gameUi = this.domRefs.gameUi;
    if (gameUi && typeof gameUi.querySelector === 'function') {
      const overlay = gameUi.querySelector('.game-field__overlay');
      if (overlay instanceof HTMLElement) {
        return overlay;
      }
    }

    return null;
  }

  activateAAATacticalHud(definition = null) {
    if (this.aaaTacticalHud) {
      this.aaaTacticalHudDefinition = definition;
      return;
    }

    const mountTarget = this.resolveAAATacticalMountTarget();
    if (!mountTarget) {
      console.warn('[UISystem] AAA tactical HUD mount target not found.');
      return;
    }

    this.aaaTacticalHudRestoreState = {
      mountTarget,
      mountPadding: mountTarget.style.padding,
    };

    mountTarget.style.padding = '0px';

    this.aaaTacticalHud = new AAAHudLayout();
    this.aaaTacticalHudDefinition = definition;
    this.aaaTacticalHudMountTarget = mountTarget;
    this.aaaTacticalHud.mount(mountTarget);
    this.transmissions = new TransmissionQueue(
      this.aaaTacticalHud,
      ({ speaker, key }) => {
        this.eventBus.emit('transmission-shown', { speaker, key });
      }
    );
  }

  /** Queues a Warden transmission and keeps the frame loop that plays it. */
  queueTransmission(entry, { interrupt = false } = {}) {
    const queue = this.transmissions;
    if (!queue || !entry) {
      return;
    }
    if (interrupt) {
      queue.interrupt(entry);
    } else {
      queue.push(entry);
    }
    if (this.transmissionRaf) {
      return;
    }
    // Wall-clock UI timing like the HUD banners: it keeps playing while the
    // run is paused, dead or won.
    const tick = () => {
      if (this.transmissions !== queue) {
        this.transmissionRaf = null;
        return;
      }
      queue.update(performance.now(), this.prefersReducedMotion());
      this.transmissionRaf = queue.active
        ? window.requestAnimationFrame(tick)
        : null;
    };
    this.transmissionRaf = window.requestAnimationFrame(tick);
  }

  deactivateAAATacticalHud() {
    if (
      this.aaaTacticalHud &&
      typeof this.aaaTacticalHud.unmount === 'function'
    ) {
      this.aaaTacticalHud.unmount();
    }
    this.transmissions = null;

    const restore = this.aaaTacticalHudRestoreState;
    if (restore?.mountTarget instanceof HTMLElement) {
      restore.mountTarget.style.padding =
        typeof restore.mountPadding === 'string' ? restore.mountPadding : '';
    }

    this.aaaTacticalHud = null;
    this.aaaTacticalHudDefinition = null;
    this.aaaTacticalHudMountTarget = null;
    this.aaaTacticalHudRestoreState = null;
  }

  formatAAATacticalClock(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const pad = (value) => `${Math.max(0, value)}`.padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(remainder)}`;
  }

  updateAAATacticalHudFromServices(options = {}) {
    const hud = this.aaaTacticalHud;
    if (!hud) {
      return;
    }

    const force = Boolean(options.force);

    const player = this.getService('player');
    const enemies = this.getService('enemies');
    const progression = this.getService('progression');

    const playerPosition =
      player && typeof player.getPosition === 'function'
        ? player.getPosition()
        : player?.position && typeof player.position === 'object'
          ? { x: player.position.x ?? 0, y: player.position.y ?? 0 }
          : { x: 0, y: 0 };

    if (player || force) {
      const hull = Number(player?.health ?? 0) || 0;
      const maxHull = Number(player?.maxHealth ?? 0) || 0;

      let shield = 0;
      let maxShield = 0;

      if (player && typeof player.getShieldState === 'function') {
        const shieldState = player.getShieldState() || {};
        shield =
          Number(shieldState.currentHP ?? shieldState.currentHits ?? 0) || 0;
        maxShield = Number(shieldState.maxHP ?? shieldState.maxHits ?? 0) || 0;
      } else {
        shield = Number(player?.shieldHP ?? 0) || 0;
        maxShield = Number(player?.shieldMaxHP ?? 0) || 0;
      }

      hud.updateVitals(shield, maxShield, hull, maxHull);
      if (player) {
        hud.updateDashCooldown(player.getDashCooldownFraction());
      }
    }

    if (enemies && typeof enemies.getSessionStats === 'function') {
      const session = enemies.getSessionStats() || {};
      const timeElapsed =
        session.timeElapsed ?? session.sessionTimeSeconds ?? 0;
      const totalKills = session.totalKills ?? session.kills ?? 0;

      hud.updateStats(
        this.formatAAATacticalClock(timeElapsed),
        totalKills,
        undefined
      );
    }

    if (progression && typeof progression.getComboState === 'function') {
      const comboState = progression.getComboState() || {};
      const comboCount = Number(comboState.comboCount ?? 0) || 0;
      hud.updateStats(null, undefined, comboCount, comboState.multiplier);
    }

    // Plan 01.07 Task 5/6 — render combat mode indicators from CombatSystem
    // state. Single source of truth: CombatSystem.getSpreadMode() / .getAimMode().
    const combat = this.getService('combat');
    if (combat && typeof hud.updateModeIndicators === 'function') {
      const spreadMode =
        typeof combat.getSpreadMode === 'function'
          ? combat.getSpreadMode()
          : 'concentrated';
      const aimMode =
        typeof combat.getAimMode === 'function' ? combat.getAimMode() : 'auto';
      hud.updateModeIndicators(spreadMode, aimMode);
      hud.updateWeapon(combat.getWeaponState());
    }

    const waveState =
      enemies && typeof enemies.getWaveState === 'function'
        ? enemies.getWaveState() || null
        : null;

    if (progression) {
      const level =
        typeof progression.getLevel === 'function'
          ? progression.getLevel()
          : Number(progression.level ?? 1) || 1;
      const xp =
        typeof progression.getExperience === 'function'
          ? progression.getExperience()
          : null;

      hud.updateExperience(
        level,
        xp?.current ?? 0,
        xp?.needed ?? 1,
        waveState?.current ?? 1
      );
    }

    if (typeof hud.updateNextWaveTimer === 'function') {
      const isActive = waveState ? Boolean(waveState.isActive ?? true) : true;
      const breakTimerRaw =
        waveState?.breakTimer ?? waveState?.breakTimerSeconds ?? 0;
      const breakSeconds = !isActive
        ? Math.max(0, Math.ceil(Number(breakTimerRaw) || 0))
        : 0;
      hud.updateNextWaveTimer(breakSeconds);
    }

    const physics = this.getService('physics');
    if (
      (physics && typeof physics.getNearbyEnemies === 'function' && player) ||
      (enemies && typeof enemies.getActiveEnemies === 'function' && player)
    ) {
      const pluginConfig = this.aaaTacticalHudDefinition?.plugin || {};
      const radarRange = Math.max(
        1,
        (Number(pluginConfig.radarRange) || 1500) * hud.radarRangeFactor
      );

      let radarEnemies = [];
      if (physics && typeof physics.getNearbyEnemies === 'function') {
        try {
          radarEnemies = physics.getNearbyEnemies(
            Number(playerPosition.x) || 0,
            Number(playerPosition.y) || 0,
            radarRange
          );
        } catch (error) {
          radarEnemies = [];
        }
      } else if (enemies && typeof enemies.getActiveEnemies === 'function') {
        radarEnemies = enemies.getActiveEnemies() || [];
      }

      const blips = [];
      const originX = Number(playerPosition.x) || 0;
      const originY = Number(playerPosition.y) || 0;
      const limit = 80;

      for (let index = 0; index < radarEnemies.length; index += 1) {
        if (blips.length >= limit) {
          break;
        }

        const enemy = radarEnemies[index];
        if (!enemy) {
          continue;
        }

        const enemyX = Number(enemy?.position?.x ?? enemy?.x ?? 0);
        const enemyY = Number(enemy?.position?.y ?? enemy?.y ?? 0);
        if (!Number.isFinite(enemyX) || !Number.isFinite(enemyY)) {
          continue;
        }

        const dx = enemyX - originX;
        const dy = enemyY - originY;
        const distance = Math.hypot(dx, dy);
        if (!Number.isFinite(distance) || distance > radarRange) {
          continue;
        }

        blips.push({
          x: dx / radarRange,
          y: dy / radarRange,
          type: radarGlyph(enemy),
        });
      }

      const pickups = this.getService('pickups')?.getActivePickups() || [];
      for (let i = 0; i < pickups.length && blips.length < limit; i += 1) {
        const dx = pickups[i].x - originX;
        const dy = pickups[i].y - originY;
        if (Math.hypot(dx, dy) <= radarRange) {
          blips.push({
            x: dx / radarRange,
            y: dy / radarRange,
            type: 'pickup',
          });
        }
      }

      hud.updateRadar(blips);
    }

    // Off-screen arrows (Wardens, Heralds, then pickups) and the Herald's bar.
    const renderer = this.getService('renderer');
    const arrowTargets = [];
    let herald = null;
    if (renderer && player && enemies) {
      const toTarget = (kind, entity, color, labelled) => {
        const point = renderer.worldToScreen(entity.x, entity.y);
        if (!point) return;
        arrowTargets.push({
          kind,
          x: point.x,
          y: point.y,
          color,
          distance: labelled
            ? Math.hypot(
                entity.x - playerPosition.x,
                entity.y - playerPosition.y
              )
            : undefined,
        });
      };
      const active = enemies.getActiveEnemies();
      for (let i = 0; i < active.length; i += 1) {
        const enemy = active[i];
        if (enemy.type === 'boss') toTarget('warden', enemy, null, true);
        if (enemy.type === 'herald') {
          toTarget('herald', enemy, null, true);
          herald = herald || enemy;
        }
      }
      const pickups = this.getService('pickups')?.getActivePickups() || [];
      for (let i = 0; i < pickups.length; i += 1) {
        toTarget('pickup', pickups[i], pickups[i].color, false);
      }
    }
    hud.updateEdgeArrows(arrowTargets);

    const bossState = this.getBossHudState();
    const cachedBossVisible = Boolean(this.cachedValues.boss?.visible);
    const bossActive =
      cachedBossVisible ||
      Boolean(bossState.active) ||
      Boolean(bossState.upcoming);

    if (!bossActive && herald) {
      hud.updateBoss(
        true,
        herald.displayName,
        Math.max(0, Math.min(100, (herald.health / herald.maxHealth) * 100)),
        {
          phase: 0,
          phaseCount: 1,
          herald: true,
          invulnerable: Boolean(herald.invulnerable),
        }
      );
    } else if (!bossActive) {
      hud.updateBoss(false);
    } else {
      const bossName = bossState.name || 'BOSS';
      const maxHealth = Number(bossState.maxHealth ?? 0) || 0;
      const currentHealth = Number(bossState.health ?? 0) || 0;
      const percent =
        maxHealth > 0
          ? Math.max(0, Math.min(100, (currentHealth / maxHealth) * 100))
          : 100;
      const phaseInfo = {
        phase: bossState.phase ?? 0,
        phaseCount: bossState.phaseCount ?? 1,
        phaseColors: bossState.phaseColors || [],
        invulnerable: Boolean(bossState.invulnerable),
      };
      hud.updateBoss(true, bossName, percent, phaseInfo);
    }
  }

  // Legacy Standard HUD creation and refresh methods removed.

  refreshHudFromServices(force = false) {
    this.updateAAATacticalHudFromServices({ force });
  }

  setupEventListeners() {
    const registerBossEvent = (eventName) => {
      this.registerEventListener(eventName, (payload = {}) => {
        this.handleBossEvent(eventName, payload);
      });
      this.registerEventListener(`ui-${eventName}`, (payload = {}) => {
        this.handleBossEvent(eventName, payload);
      });
    };

    [
      'boss-hud-update',
      'boss-wave-started',
      'boss-spawned',
      'boss-phase-changed',
      'boss-invulnerability-changed',
      'boss-defeated',
    ].forEach(registerBossEvent);

    this.registerEventListener('wave-started', (payload = {}) => {
      this.handleLayerStarted(payload);
    });

    this.registerEventListener('boss-warning', (payload = {}) => {
      this.queueTransmission(
        wardenTransmission(payload.nextBossWave, 'warning')
      );
    });

    this.registerEventListener('boss-defeated', (payload = {}) => {
      this.queueTransmission(wardenTransmission(payload.wave, 'defeated'));
    });

    this.registerEventListener('player-died', () => {
      if (this.runWon) {
        return;
      }
      this.queueTransmission(
        deathTransmission(this.getRandomFork('base'), this.transmissionLayer),
        { interrupt: true }
      );
    });

    this.registerEventListener('surge-started', (payload = {}) => {
      this.aaaTacticalHud?.showSurgeBanner(payload.label);
    });

    this.registerEventListener('field-event-started', (payload = {}) => {
      this.aaaTacticalHud?.showFieldEventBanner(payload.label);
      if (payload.kind === 'sensor-jam') {
        this.aaaTacticalHud?.setRadarJammed(true);
      }
    });

    this.registerEventListener('field-event-ended', (payload = {}) => {
      if (payload.kind === 'sensor-jam') {
        this.aaaTacticalHud?.setRadarJammed(false);
      }
    });

    // A layer modifier's banner follows the LAYER one; Dense Fog shortens
    // the radar until the layer ends.
    this.registerEventListener('layer-modifier-started', (payload = {}) => {
      this.aaaTacticalHud?.showModifierBanner(payload.label, payload.color);
      if (payload.id === 'dense-fog') {
        this.aaaTacticalHud?.setRadarRange(
          LAYER_MODIFIERS['dense-fog'].radarRange
        );
      }
    });
    this.registerEventListener('layer-modifier-ended', (payload = {}) => {
      if (payload.id === 'dense-fog') this.aaaTacticalHud?.setRadarRange(1);
    });

    // A Herald arrives under a violet banner; Silence jams the radar while it
    // lives (a new run clears it).
    this.registerEventListener('herald-spawned', ({ kind } = {}) => {
      const herald = HERALD_KINDS[kind];
      if (!herald) return;
      this.aaaTacticalHud?.showHeraldBanner(
        herald.displayName,
        herald.subtitle
      );
      if (herald.jamsRadar) this.aaaTacticalHud?.setRadarJammed(true);
    });
    this.registerEventListener('herald-defeated', ({ kind } = {}) => {
      if (HERALD_KINDS[kind]?.jamsRadar) {
        this.aaaTacticalHud?.setRadarJammed(false);
      }
    });
    this.registerEventListener('game-started', () => {
      this.aaaTacticalHud?.setRadarJammed(false);
      this.aaaTacticalHud?.setRadarRange(1);
      this.aaaTacticalHud?.setAimStick(false);
    });
    this.registerEventListener('aim-stick-changed', ({ active } = {}) => {
      this.aaaTacticalHud?.setAimStick(active);
    });

    this.registerEventListener(
      'player-took-damage',
      ({ playerPosition, damageSource } = {}) => {
        const renderer = this.getService('renderer');
        if (!playerPosition || !damageSource || !renderer) return;
        this.aaaTacticalHud?.showDamageFrom(
          renderer.worldToScreen(playerPosition.x, playerPosition.y),
          renderer.worldToScreen(damageSource.x, damageSource.y)
        );
      }
    );

    this.registerEventListener('enemy-destroyed', (payload = {}) => {
      this.aaaTacticalHud?.addKillFeed(
        payload.enemy?.type,
        payload.enemy?.elite
      );
    });

    this.registerEventListener('xp-orb-collected', (payload = {}) => {
      this.aaaTacticalHud?.addXpFeed(Number(payload.value));
    });

    this.registerEventListener('pickup-collected', ({ kind } = {}) => {
      const pickup = PICKUP_KINDS[kind];
      this.aaaTacticalHud?.addPickupFeed(
        pickup.label,
        pickup.detail,
        pickup.color
      );
      if (pickup.duration) {
        this.aaaTacticalHud?.startBuff(
          kind,
          pickup.label,
          pickup.duration,
          pickup.color
        );
      }
    });

    this.registerEventListener('achievement-unlocked', ({ title } = {}) => {
      this.aaaTacticalHud?.addAchievementFeed(title);
    });

    this.registerEventListener('weapon-beam-fired', () => {
      this.aaaTacticalHud?.flashBeam();
    });

    this.registerEventListener('pause-state-changed', (data) => {
      this.updatePauseScreen(Boolean(data?.isPaused));
    });

    this.registerEventListener('screen-changed', (payload = {}) => {
      this.handleScreenChanged(payload);
    });

    this.registerEventListener('hangar-purchased', () =>
      this.refreshMenuStatus()
    );

    // Renderer3D's Auto quality picked a preset: menu strip and the
    // Graphics preview name it.
    this.registerEventListener('quality-changed', ({ preset } = {}) => {
      this.liveQualityPreset = preset;
      this.refreshMenuStatus();
      if (
        this.settingsState.isOpen &&
        this.settingsState.activeCategory === 'graphics'
      ) {
        this.renderSettingsPanel('graphics');
      }
    });

    this.registerEventListener('toggle-pause', () => {
      const appState = this.getService('game-state');
      if (appState && typeof appState.isPaused === 'function') {
        this.updatePauseScreen(Boolean(appState.isPaused()));
      }
    });

    const registerWaveCompletionListener = (eventName) => {
      this.registerEventListener(eventName, (payload = {}) => {
        this.handleWaveCompletionEvent(payload, eventName);
      });
    };

    registerWaveCompletionListener('wave-complete');
    registerWaveCompletionListener('wave-completed');

    this.registerEventListener('ui-show-screen', (payload = {}) => {
      if (payload?.screen) {
        this.showScreen(payload.screen, payload.options || {});
      }
    });

    this.registerEventListener('run-won', () => {
      this.runWon = true;
      this.cinematics.startEpilogue();
      this.queueTransmission(victoryTransmission(), { interrupt: true });
    });
    this.registerEventListener('run-continued', () => {
      this.runWon = false;
      this.cinematics.release();
    });
    this.registerEventListener('game-started', () => {
      this.runWon = false;
      this.transmissions?.clear();
      this.cinematics.stop();
      // After startNewRun has unpaused: the intro holds the first step.
      queueMicrotask(() => this.cinematics.startIntro());
      this.aaaTacticalHud?.clearBuffs();
      this.removeOnboardingCardsTip();
      if (this.isOnboardingEnabled()) {
        this.onboarding.start();
      } else {
        this.onboarding.stop();
      }
    });
    this.registerEventListener('player-dashed', () => {
      this.onboarding.dashed();
    });
    this.registerEventListener('shield-activated', () => {
      this.onboarding.shieldRaised();
    });
    this.registerEventListener('upgrade-applied', () => {
      this.onboarding.cardPicked();
      this.removeOnboardingCardsTip();
    });
    this.registerEventListener('upgrade-options-ready', (payload = {}) => {
      this.handleUpgradeOptions(payload);
    });
    this.registerEventListener('upgrade-rerolled', (payload = {}) => {
      this.refreshLevelUpOptions(payload);
    });
    this.registerEventListener('upgrade-banished', (payload = {}) => {
      this.refreshLevelUpOptions(payload);
    });

    this.registerEventListener('settings-menu-requested', (payload = {}) => {
      this.handleSettingsMenuRequest(payload);
    });

    this.registerEventListener('settings-changed', (change) => {
      this.handleSettingsChange(change);
    });

    this.registerEventListener('credits-menu-requested', (payload = {}) => {
      this.handleCreditsMenuRequest(payload);
    });

    this.registerEventListener('settings-controls-changed', (payload = {}) => {
      if (
        this.settingsState.isOpen &&
        this.settingsState.activeCategory === 'controls' &&
        payload?.values
      ) {
        this.renderSettingsPanel('controls');
      }
    });

    this.registerEventListener('settings-visual-changed', (payload = {}) => {
      this.handleVisualPreferencesChange(payload);
    });

    this.registerEventListener('key-pressed', (payload) => {
      this.handleKeyPressForCapture(payload);
    });

    this.registerEventListener('gamepad-input-detected', (payload) => {
      this.handleGamepadInputForCapture(payload);
    });

    this.registerEventListener('input-action', (payload = {}) => {
      this.handleLevelUpInputAction(payload);
    });

    this.registerEventListener('input-confirmed', () => {
      this.handleLevelUpConfirm();
    });

    this.registerEventListener('gamepad-ui-nav', (payload = {}) => {
      this.handleGamepadNav(payload.action);
    });

    this.registerEventListener('input-device-changed', (payload = {}) => {
      this.handleInputDeviceChanged(payload.device);
    });
  }

  /** Hints and tips name the keys or pad buttons of the last device used. */
  handleInputDeviceChanged(device) {
    document.body.dataset.inputDevice = device;
    if (this.onboarding.shown && this.onboarding.current) {
      this.showOnboardingTip(this.onboarding.current);
    }
  }

  /** The topmost visible screen a pad can navigate, or null during play. */
  getGamepadNavScreen() {
    for (const id of GAMEPAD_NAV_SCREENS) {
      const element = document.getElementById(`${id}-screen`);
      if (element && !element.classList.contains('hidden')) {
        return { id, element };
      }
    }
    return null;
  }

  /**
   * One pad navigation press (InputSystem 'gamepad-ui-nav'): d-pad/stick move
   * the focus, A activates, B goes back, LB/RB switch tabs, X/Y reroll and
   * banish on the level-up screen (whose cards already follow the move and
   * confirm bindings).
   */
  handleGamepadNav(action) {
    const screen = this.getGamepadNavScreen();
    if (!screen || this.settingsState.capture) {
      return;
    }
    const { id, element } = screen;

    if (id === 'levelup') {
      if (action === 'reroll') this.rerollLevelUpOptions();
      else if (action === 'banish') this.toggleBanishMode();
      else if (action === 'back' && this.levelUpState.banishMode) {
        this.setBanishMode(false);
      }
      return;
    }

    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        this.moveGamepadFocus(element, action);
        break;
      case 'confirm': {
        const active = document.activeElement;
        if (active && element.contains(active) && active !== element) {
          active.click();
        } else {
          this.moveGamepadFocus(element, null);
        }
        break;
      }
      case 'back':
        if (id === 'settings') this.closeSettingsPanel();
        else if (id === 'codex') this.closeCodex();
        else if (id === 'hangar') this.closeHangar();
        else if (id === 'credits') {
          this.closeCreditsOverlay({ restoreFocus: true });
        } else if (id === 'pause') this.eventBus?.emit?.('toggle-pause');
        break;
      case 'tabPrev':
      case 'tabNext': {
        const step = action === 'tabPrev' ? -1 : 1;
        if (id === 'codex') {
          this.showCodexTab(adjacentCodexTab(this.codexState.tab, step), {
            focusTab: true,
          });
        } else if (id === 'settings') {
          const ids = this.settingsSchema.map((category) => category.id);
          const index = ids.indexOf(this.settingsState.activeCategory);
          this.switchSettingsCategory(
            ids[(index + step + ids.length) % ids.length]
          );
          this.domRefs.settings.tabs
            ?.querySelector('.settings-tab.is-active')
            ?.focus({ preventScroll: true });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Focus the nearest control `direction` of the focused one (null: first). */
  moveGamepadFocus(root, direction) {
    const active = document.activeElement;
    const current = active && root.contains(active) ? active : null;
    // Sliders and selects take left/right as a value change.
    if (current && (direction === 'left' || direction === 'right')) {
      const step = direction === 'left' ? -1 : 1;
      if (current.type === 'range') {
        if (step < 0) current.stepDown();
        else current.stepUp();
        current.dispatchEvent(new Event('input', { bubbles: true }));
        current.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (current.tagName === 'SELECT') {
        const count = current.options.length;
        current.selectedIndex = (current.selectedIndex + step + count) % count;
        current.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
    const candidates = [
      ...root.querySelectorAll(GAMEPAD_FOCUSABLE_SELECTOR),
    ].filter(
      (candidate) => candidate !== current && candidate.getClientRects().length
    );
    const index = pickFocusTarget(
      current?.getBoundingClientRect() ?? null,
      candidates.map((candidate) => candidate.getBoundingClientRect()),
      direction
    );
    if (index >= 0) {
      candidates[index].focus();
      candidates[index].scrollIntoView?.({ block: 'nearest' });
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
      // The redraw replaces the focused control: focus its twin after.
      const focused = document.activeElement;
      const key = focused?.dataset?.settingKey;
      const segment = focused?.dataset?.segmentValue;
      this.renderSettingsPanel(this.settingsState.activeCategory);
      if (key) {
        const selector = segment
          ? `[data-setting-key="${key}"][data-segment-value="${segment}"]`
          : `input[data-setting-key="${key}"], select[data-setting-key="${key}"]`;
        this.domRefs.settings.container
          .querySelector(selector)
          ?.focus({ preventScroll: true });
      }
    }

    if (change.category === 'gameplay' || change.type === 'reset-all') {
      this.requestMenuShipSelectorRefresh();
    }

    if (
      change.category === 'graphics' ||
      change.key === 'difficulty' ||
      change.type === 'reset-all'
    ) {
      this.refreshMenuStatus();
    }

    if (change.category === 'gameplay' && change.key === 'onboardingTips') {
      if (change.value === false) {
        this.onboarding.stop();
        this.removeOnboardingCardsTip();
      } else if (change.previous === false) {
        this.onboarding.replay();
      }
    }
  }

  handleVisualPreferencesChange(payload = {}) {
    if (!payload || !payload.values) {
      return;
    }

    this.applyVisualPreferences(payload.values);
  }

  emitOverlayVisibilityChanged(overlay, isOpen, payload = {}) {
    if (!overlay || !this.eventBus?.emit) {
      return;
    }

    this.eventBus.emit('ui-overlay-visibility-changed', {
      overlay,
      isOpen: Boolean(isOpen),
      ...payload,
    });
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
    this.emitOverlayVisibilityChanged('credits', true, { source: 'menu' });

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
    const triggerId = this.creditsState.triggerId;

    if (restoreFocus && triggerId) {
      const trigger = document.getElementById(triggerId);
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
    }

    const overlay = this.domRefs.credits?.overlay;

    this.showScreen('credits', { overlay: true, show: false });
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'true');
    }

    document.body?.classList.remove('is-credits-open');
    this.emitOverlayVisibilityChanged('credits', false, { source: 'menu' });

    this.creditsState.isOpen = false;
    this.creditsState.triggerId = null;
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

  bindCodexControls() {
    const refs = this.domRefs.codex;
    if (!refs.overlay) return;
    refs.openBtn?.addEventListener('click', () => this.openCodex());
    [refs.backBtn, refs.closeBtn].forEach((button) =>
      button?.addEventListener('click', () => this.closeCodex())
    );
    refs.overlay.addEventListener('click', (event) => {
      if (event.target === refs.overlay) this.closeCodex();
    });
    refs.tabs.forEach((button) =>
      button.addEventListener('click', () =>
        this.showCodexTab(button.dataset.codexTab)
      )
    );
    document.addEventListener('keydown', (event) => {
      if (!this.codexState.isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeCodex();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = event.key === 'ArrowLeft' ? -1 : 1;
        this.showCodexTab(adjacentCodexTab(this.codexState.tab, step), {
          focusTab: true,
        });
      }
    });
  }

  showCodexTab(tab, { focusTab = false } = {}) {
    const refs = this.domRefs.codex;
    const view = codexTabView(tab, {
      enemies: this.getService('codex').getEntries(),
      achievements: this.getService('achievements').getEntries(),
    });
    refs.list.innerHTML = view.markup;
    refs.list.setAttribute('aria-label', view.label);
    refs.list.scrollTop = 0;
    refs.count.textContent = view.count;
    refs.tabs.forEach((button) => {
      const active = button.dataset.codexTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      if (active && focusTab) button.focus({ preventScroll: true });
    });
    this.codexState.tab = tab;
  }

  openCodex() {
    const refs = this.domRefs.codex;
    this.codexState = {
      isOpen: true,
      trigger: document.activeElement,
      tab: 'enemies',
    };
    this.showCodexTab('enemies');
    this.showScreen('codex', { overlay: true, show: true });
    refs.overlay.setAttribute('aria-hidden', 'false');
    this.emitOverlayVisibilityChanged('codex', true, { source: 'menu' });
    refs.backBtn?.focus({ preventScroll: true });
  }

  closeCodex() {
    if (!this.codexState.isOpen) return;
    const refs = this.domRefs.codex;
    this.showScreen('codex', { overlay: true, show: false });
    refs.overlay.setAttribute('aria-hidden', 'true');
    this.emitOverlayVisibilityChanged('codex', false, { source: 'menu' });
    this.codexState.trigger?.focus?.({ preventScroll: true });
    this.codexState = { isOpen: false, trigger: null, tab: 'enemies' };
  }

  bindHangarControls() {
    const refs = this.domRefs.hangar;
    if (!refs.overlay) return;
    refs.openBtn?.addEventListener('click', () => this.openHangar());
    [refs.backBtn, refs.closeBtn].forEach((button) =>
      button?.addEventListener('click', () => this.closeHangar())
    );
    refs.overlay.addEventListener('click', (event) => {
      if (event.target === refs.overlay) {
        this.closeHangar();
        return;
      }
      const buy = event.target.closest('[data-hangar-buy]');
      if (buy) {
        const id = buy.dataset.hangarBuy;
        this.getService('hangar').buy(id);
        this.renderHangar();
        refs.list
          .querySelector(`[data-hangar-item="${id}"] .hangar-item__action`)
          ?.focus({ preventScroll: true });
        return;
      }
      const hull = event.target.closest('[data-hangar-hull]');
      if (hull) {
        this.settings.setSetting(
          'gameplay',
          'selectedHull',
          hull.dataset.hangarHull,
          { source: 'ui' }
        );
        this.renderHangar();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (this.hangarState.isOpen && event.key === 'Escape') {
        event.preventDefault();
        this.closeHangar();
      }
    });
  }

  renderHangar() {
    const refs = this.domRefs.hangar;
    const hangar = this.getService('hangar');
    refs.balance.textContent = salvageBalanceText(hangar.salvage);
    refs.list.innerHTML = hangar.getItems().map(hangarItemMarkup).join('');
    const selected = this.getSelectedHullId();
    refs.hulls.innerHTML = getAllShipModels()
      .map((hull) => {
        const locked = !hangar.isHullUnlocked(hull.id);
        const active = hull.id === selected;
        return `<button type="button" class="hangar-hull${
          active ? ' is-active' : ''
        }" data-hangar-hull="${hull.id}" aria-pressed="${active}"${
          locked ? ' disabled' : ''
        }>${this.getHullDisplayName(hull)}${locked ? ' · Locked' : ''}</button>`;
      })
      .join('');
  }

  openHangar() {
    const refs = this.domRefs.hangar;
    this.renderHangar();
    this.hangarState = { isOpen: true, trigger: document.activeElement };
    this.showScreen('hangar', { overlay: true, show: true });
    refs.overlay.setAttribute('aria-hidden', 'false');
    this.emitOverlayVisibilityChanged('hangar', true, { source: 'menu' });
    refs.backBtn?.focus({ preventScroll: true });
  }

  closeHangar() {
    if (!this.hangarState.isOpen) return;
    const refs = this.domRefs.hangar;
    this.showScreen('hangar', { overlay: true, show: false });
    refs.overlay.setAttribute('aria-hidden', 'true');
    this.emitOverlayVisibilityChanged('hangar', false, { source: 'menu' });
    this.requestMenuShipSelectorRefresh();
    this.hangarState.trigger?.focus?.({ preventScroll: true });
    this.hangarState = { isOpen: false, trigger: null };
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
          console.warn('[UISystem] Fullscreen request failed:', err);
        });
      } else if (!shouldBeFullscreen && isFullscreen) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch((err) => {
            console.warn('[UISystem] Exit fullscreen failed:', err);
          });
        }
      }
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
    const overlay = this.domRefs.settings?.overlay;
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
    this.emitOverlayVisibilityChanged('settings', true, { source });

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
        const pauseBtn = this.domRefs.pause?.settingsBtn;
        pauseBtn?.focus();
      }
    }
    this.settingsState.previousFocus = null;

    const overlay = this.domRefs.settings?.overlay;
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }

    document.body?.classList.remove('is-settings-open');
    this.cancelBindingCapture();
    this.settingsState.isOpen = false;
    this.emitOverlayVisibilityChanged('settings', false, { source });
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
      const element = this.renderSettingField(
        categoryId,
        field,
        values[field.key]
      );
      if (!element) {
        return;
      }
      const preview = settingPreview(
        field.key,
        values[field.key] ?? field.default,
        {
          livePreset: this.liveQualityPreset,
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

  renderSettingField(categoryId, field, value) {
    if (field.control === 'segmented') {
      return this.renderSegmentedField(categoryId, field, value);
    }
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

  // A select shown as one button per option; a click sets it at once.
  renderSegmentedField(categoryId, field, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-field settings-field--wide';
    wrapper.dataset.settingKey = field.key;
    wrapper.dataset.settingCategory = categoryId;

    const label = document.createElement('span');
    label.className = 'settings-field__label';
    label.id = `setting-${categoryId}-${field.key}-label`;
    label.textContent = field.label;
    wrapper.appendChild(label);

    const group = document.createElement('div');
    group.className = 'settings-segmented';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', label.id);
    const current = value ?? field.default;
    ensureArray(field.options).forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-segment';
      button.dataset.settingKey = field.key;
      button.dataset.settingCategory = categoryId;
      button.dataset.segmentValue = option;
      button.setAttribute('aria-pressed', String(option === current));
      button.textContent = field.optionLabels?.[option] ?? option;
      group.appendChild(button);
    });
    wrapper.appendChild(group);

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
        metadata.label || (device === 'keyboard' ? 'Keyboard' : 'Gamepad');
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
          : 'Set';
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
      return 'Set';
    }

    if (device === 'keyboard') {
      if (value.startsWith('Key') && value.length === 4) {
        return value.slice(3).toUpperCase();
      }
      if (value.startsWith('Digit')) {
        return value.slice(5);
      }
      if (value === 'Space') {
        return 'Spacebar';
      }
      if (value === 'Escape') {
        return 'Esc';
      }
      if (value.startsWith('Arrow')) {
        return `Arrow ${value.slice(5)}`;
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
        const index = Number(value.split(':')[1]);
        return PAD_BUTTON_GLYPHS[index] ?? `Button ${index}`;
      }
      if (value.startsWith('axis:')) {
        const [, index, direction] = value.split(':');
        const negative = direction === 'negative' || direction === '-';
        const stick = PAD_STICK_GLYPHS[Math.floor(Number(index) / 2)];
        if (!stick) {
          return `Axis ${index} ${negative ? '−' : '+'}`;
        }
        const arrows = Number(index) % 2 === 0 ? ['←', '→'] : ['↑', '↓'];
        return `${stick} ${arrows[negative ? 0 : 1]}`;
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
    button.textContent = 'Waiting for input...';

    this.settingsState.capture = {
      categoryId,
      fieldKey: settingKey,
      device,
      slot,
      element: button,
    };

    this.eventBus?.emit?.('input-binding-capture', { state: 'start' });
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

    this.eventBus?.emit?.('input-binding-capture', { state: 'end' });

    this.renderSettingsPanel(this.settingsState.activeCategory);
  }

  cancelBindingCapture() {
    if (this.settingsState.capture?.element) {
      this.settingsState.capture.element.classList.remove('is-listening');
    }

    if (this.settingsState.capture) {
      this.eventBus?.emit?.('input-binding-capture', { state: 'end' });
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

  update(deltaTime) {
    if (this.aaaTacticalHud) {
      this.updateAAATacticalHudFromServices({ force: false });
      this.aaaTacticalHud.tickBuffs(deltaTime);
    }
    if (this.onboarding.current) {
      const moving = this.getService('input').getMovementInput();
      this.onboarding.update(deltaTime, {
        moving: moving.up || moving.down || moving.left || moving.right,
        shieldReady: this.getService('player').getShieldState().maxHits > 0,
        bannerBusy: Boolean(this.aaaTacticalHud?.isBannerBusy()),
      });
    }
  }

  handleScreenChanged(payload = {}) {
    const screenName = payload?.screen;
    if (typeof screenName !== 'string' || !screenName.length) {
      return;
    }

    if (screenName === 'pause') {
      this.showScreen('pause', { overlay: true, show: true, emitEvent: false });
      return;
    }

    if (screenName === 'levelup') {
      this.showScreen('levelup', {
        overlay: true,
        show: true,
        emitEvent: false,
      });
      return;
    }

    if (screenName === 'gameover') {
      this.showGameOverScreen(payload);
      return;
    }

    if (screenName === 'victory') {
      const show = () => this.showVictoryScreen(payload);
      if (!this.cinematics.deferUntilEpilogueEnds(show)) {
        show();
      }
      return;
    }

    this.showScreen(screenName, { emitEvent: false });
  }

  // Legacy Standard HUD update methods removed.

  showScreen(screenName, options = {}) {
    const { overlay = false, show = true, emitEvent = true } = options;
    try {
      if (overlay) {
        const target = document.getElementById(`${screenName}-screen`);
        if (target) {
          target.classList.toggle('hidden', !show);
        }

        // Keep game-ui visible for pause, level-up and gameover overlays
        if (
          (screenName === 'pause' ||
            screenName === 'levelup' ||
            screenName === 'gameover' ||
            screenName === 'victory') &&
          show
        ) {
          const gameUI = document.getElementById('game-ui');
          if (gameUI) gameUI.classList.remove('hidden');
        }

        // The session service pauses the game on any non-'playing' screen.
        if (screenName === 'levelup' && show && emitEvent) {
          this.eventBus?.emit?.('screen-changed', { screen: screenName });
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

      this.closeCodex();
      this.closeHangar();

      document.body?.classList.remove('is-credits-open');

      if (screenName === 'menu') {
        this.requestMenuShipSelectorRefresh();
        this.refreshMenuStatus();
      }

      if (emitEvent) {
        this.eventBus?.emit?.('screen-changed', { screen: screenName });
      }
    } catch (error) {
      console.error('[UISystem] Failed to show screen:', error);
    }
  }

  showGameUI(options = {}) {
    this.resetLevelUpState();
    this.showScreen('playing', options);
    this.refreshHudFromServices(true);
  }

  updatePauseScreen(isPaused) {
    const shouldPause = Boolean(isPaused);
    if (this.currentPauseState === shouldPause) return;

    this.currentPauseState = shouldPause;
    this.showScreen('pause', { overlay: true, show: shouldPause });

    const resumeBtn = this.domRefs.pause?.resumeBtn;
    if (shouldPause) {
      this.renderPauseBuild();
      resumeBtn?.focus({ preventScroll: true });
    } else {
      this.cancelQuitConfirm();
      resumeBtn?.blur();
    }

    document.body?.classList.toggle('is-paused', shouldPause);

    if (
      !shouldPause &&
      this.settingsState.isOpen &&
      this.settingsState.source === 'pause'
    ) {
      this.closeSettingsPanel();
    }
  }

  // The pause panel: the same build block as the death recap, plus the
  // level-up tools left and where the run is.
  renderPauseBuild() {
    const refs = this.domRefs.pause;
    const progression = this.getService('progression');
    if (!refs.build || !progression) return;
    refs.build.innerHTML = buildBlockMarkup(
      collectBuild(progression, this.getService('combat'))
    );
    refs.location.textContent = runLocationLine(this.transmissionLayer);
    refs.tools.textContent = `Rerolls ${progression.rerollsLeft} · Banishes ${progression.banishesLeft}`;
    refs.seed.textContent = this.getService('difficulty').runLabel();
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
    this.levelUpState.level = levelValue;
    this.showScreen('levelup', { overlay: true, show: true });
    this.renderLevelUpOptions(options, data.poolSize);
    this.showOnboardingCardsTip();
  }

  // Cards, subtitle and reroll/banish buttons for the offered options; new
  // cards restart the input lockout so a held key can't pick one unseen.
  renderLevelUpOptions(options, offeredPoolSize) {
    const levelValue = this.levelUpState.level;
    this.levelUpState.options = options;
    this.levelUpState.poolSize = Number.isFinite(Number(offeredPoolSize))
      ? Number(offeredPoolSize)
      : options.length;
    this.levelUpState.focusIndex = -1;
    this.levelUpState.lockedUntil = Date.now() + SCREEN_INPUT_LOCKOUT_MS;
    this.setBanishMode(false);
    this.updateLevelUpActionButtons();

    if (this.domRefs.levelUp.text) {
      const optionCount = options.length;
      const poolSize = this.levelUpState.poolSize;
      const optionLabel = optionCount === 1 ? 'option' : 'options';
      let suffix = ` (${optionCount} ${optionLabel})`;
      if (poolSize > optionCount) {
        suffix = ` (${optionCount} of ${poolSize} ${optionLabel})`;
      }
      const prefix = Number.isFinite(levelValue)
        ? `Level ${levelValue} - Choose your technology`
        : 'Choose your technology';
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
      if (!this.prefersReducedMotion()) {
        staggerCardEntry(buttons);
      }
      this.focusLevelUpOption(0, { preventFocus: false });
    } else {
      this.levelUpState.buttons = [];
    }
  }

  // After a reroll or banish: redraw the cards, or close if none are left.
  refreshLevelUpOptions(payload = {}) {
    if (!this.levelUpState.isVisible) {
      return;
    }
    const options = ensureArray(payload.options);
    if (!options.length) {
      this.resetLevelUpState();
      this.showGameUI();
      return;
    }
    this.renderLevelUpOptions(options, payload.poolSize);
  }

  updateLevelUpActionButtons() {
    const progression = this.getService('progression');
    const { rerollBtn, banishBtn } = this.domRefs.levelUp;
    [
      [rerollBtn, progression?.rerollsLeft ?? 0],
      [banishBtn, progression?.banishesLeft ?? 0],
    ].forEach(([button, left]) => {
      if (!button) {
        return;
      }
      button.disabled = left <= 0;
      const count = button.querySelector('[data-count]');
      if (count) {
        count.textContent = `${left} left`;
      }
    });
  }

  isLevelUpLocked() {
    return Date.now() < this.levelUpState.lockedUntil;
  }

  rerollLevelUpOptions() {
    if (!this.levelUpState.isVisible || this.isLevelUpLocked()) {
      return;
    }
    this.getService('progression')?.rerollUpgradeOptions();
  }

  toggleBanishMode() {
    if (!this.levelUpState.isVisible || this.isLevelUpLocked()) {
      return;
    }
    const progression = this.getService('progression');
    if (!this.levelUpState.banishMode && !(progression?.banishesLeft > 0)) {
      return;
    }
    this.setBanishMode(!this.levelUpState.banishMode);
  }

  // Banish pick mode: the next card chosen is banished instead of taken.
  setBanishMode(active) {
    this.levelUpState.banishMode = active;
    const { banishBtn, banishHint } = this.domRefs?.levelUp || {};
    banishBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');
    banishHint?.classList.toggle('hidden', !active);
    document
      .getElementById('levelup-screen')
      ?.classList.toggle('is-banishing', active);
  }

  createUpgradeOptionButton(option, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `upgrade-option upgrade-option--${option.rarity || 'common'}${
      option.cursed ? ' upgrade-option--cursed' : ''
    }`;
    button.dataset.upgradeId = option.id;
    button.dataset.index = `${index}`;

    const accentColors = this.resolveAccentColors(option);
    button.style.setProperty('--upgrade-accent', accentColors.accent);
    button.style.setProperty('--upgrade-accent-soft', accentColors.soft);
    if (option.family) {
      button.style.setProperty('--family-color', option.family.color);
    }

    button.innerHTML = this.buildUpgradeOptionMarkup(option);
    button.addEventListener('click', () => this.selectUpgrade(option.id));
    button.addEventListener('mouseenter', () => {
      this.eventBus?.emit?.('ui-hover', { source: 'upgrade-selection', index });
      this.focusLevelUpOption(index, { preventFocus: true, fromPointer: true });
    });
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

    const familySection = this.buildFamilyProgressMarkup(option.family);

    const categoryIcon = category.icon
      ? `<span class="upgrade-option__category-icon" aria-hidden="true">${category.icon}</span>`
      : '';

    const nextLevelSection = nextLevel
      ? `<section class="upgrade-option__next">
          <p class="upgrade-option__next-label">Next: ${
            nextLevel.title || `Level ${currentLevel + 1}`
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
      : '<p class="upgrade-option__maxed">Technology maxed out.</p>';

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

    const rarity = option.rarity || 'common';

    return `
      <p class="upgrade-option__rarity">${
        option.cursed ? 'Cursed' : UPGRADE_RARITY_LABELS[rarity]
      }</p>
      <header class="upgrade-option__header">
        <span class="upgrade-icon" aria-hidden="true">${
          option.icon || '✨'
        }</span>
        <div class="upgrade-option__meta">
          <div class="upgrade-option__chips">
            <span class="upgrade-option__category">
              ${categoryIcon}
              ${category.label || 'Tecnologia'}
            </span>
            ${
              option.family
                ? `<span class="upgrade-option__family">${option.family.name}</span>`
                : ''
            }
          </div>
          <span class="upgrade-option__level">Lv. ${currentLevel}/${
            maxLevel || Math.max(1, currentLevel)
          }</span>
        </div>
      </header>
      <div class="upgrade-option__body">
        <h3 class="upgrade-option__title">${option.name || option.id}</h3>
        ${summary ? `<p class="upgrade-option__summary">${summary}</p>` : ''}
        ${familySection}
        ${nextLevelSection}
      </div>
      ${prerequisitesSection}
    `;
  }

  // Pips for distinct upgrades held in the family; names the bonus a pick unlocks.
  buildFamilyProgressMarkup(family) {
    if (!family) {
      return '';
    }
    const pips = pipsMarkup(family.owned, family.required);
    let state = '';
    let label = `${family.name} ${Math.min(family.owned, family.required)}/${family.required} · ${family.bonusName}`;
    if (family.active) {
      state = ' is-active';
      label = `${family.bonusName} online`;
    } else if (family.completesSynergy) {
      state = ' is-unlocking';
      label = `Unlocks: ${family.bonusName} — ${family.bonusDescription}`;
    } else if (family.owned > 0) {
      state = ' is-building';
    }
    return `<p class="upgrade-option__family-progress${state}">
        <span class="family-pips" aria-hidden="true">${pips}</span>
        <span>${label}</span>
      </p>`;
  }

  selectUpgrade(upgradeId) {
    if (!upgradeId) {
      return;
    }

    if (this.isLevelUpLocked()) {
      return;
    }

    const progression = this.getService('progression');

    if (this.levelUpState.banishMode) {
      progression?.banishUpgrade(upgradeId);
      return;
    }

    if (!progression || typeof progression.applyUpgrade !== 'function') {
      this.showGameUI();
      return;
    }

    this.disableLevelUpOptions();
    const success = progression.applyUpgrade(upgradeId);
    if (success) {
      this.leaveLevelUp(upgradeId);
    } else {
      this.enableLevelUpOptions();
    }
  }

  // Cards out (ui/levelUpTransition.js), input locked, then back to the run.
  leaveLevelUp(upgradeId) {
    const buttons = ensureArray(this.levelUpState.buttons);
    this.levelUpState.lockedUntil = Infinity;
    this.levelUpState.exitTimer = playLevelUpExit({
      screen: document.getElementById('levelup-screen'),
      cards: buttons,
      picked: buttons.find((button) => button.dataset.upgradeId === upgradeId),
      target: document.getElementById('ui-weapon-chip'),
      reducedMotion: this.prefersReducedMotion(),
      done: () => this.showGameUI(),
    });
  }

  prefersReducedMotion() {
    return (
      document.body.classList.contains('motion-reduced') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  handleUpgradeOptions(payload = {}) {
    if (this.runWon) {
      return;
    }

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

  updateLevelDisplay() {
    // Standard HUD legacy method.
    // AAA HUD updates via updateAAATacticalHudFromServices.
    // Kept as stub for shared logic calls.
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
    clearTimeout(this.levelUpState.exitTimer);
    document.getElementById('levelup-screen')?.classList.remove('is-leaving');
    ensureArray(this.levelUpState.buttons).forEach((button) => {
      if (button) {
        button.classList.remove('is-focused');
        button.disabled = false;
      }
    });
    this.setBanishMode(false);

    this.levelUpState = {
      isVisible: false,
      options: [],
      buttons: [],
      focusIndex: -1,
      poolSize: 0,
      level: null,
      lockedUntil: 0,
      banishMode: false,
      exitTimer: null,
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

  showVictoryScreen(payload) {
    this.showScreen('victory', { overlay: true, show: true });

    const data = payload?.data || {};
    const refs = this.domRefs.victory;
    const setText = (node, value) => {
      if (node) node.textContent = value;
    };

    const totalSeconds = Math.max(
      0,
      Math.floor(Number(data.stats?.timeElapsed) || 0)
    );
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const wave = typeof data.wave === 'number' ? data.wave : data.wave?.current;
    const level = data.player?.level ?? data.level;

    setText(refs.time, `${minutes}:${seconds}`);
    setText(refs.wave, `${wave ?? '—'}`);
    setText(refs.kills, `${data.stats?.totalKills ?? data.stats?.kills ?? 0}`);
    setText(refs.combo, `x${data.maxCombo ?? 0}`);
    setText(refs.level, `${level ?? '—'}`);
    setText(refs.best, `Best layer: ${data.bestLayer ?? wave ?? '—'}`);
    setText(refs.salvage, salvageLine(this.getService('hangar').lastAward));

    if (refs.build) {
      refs.build.innerHTML = '';
      const upgrades = ensureArray(data.upgrades);
      if (!upgrades.length) {
        const empty = document.createElement('li');
        empty.className = 'gameover-build__empty';
        empty.textContent = 'No upgrades';
        refs.build.appendChild(empty);
      }
      upgrades.forEach(({ name, id, level: rank }) => {
        const item = document.createElement('li');
        item.className = 'gameover-build__item';
        item.append(`${name || id} `);
        const rankNode = document.createElement('span');
        rankNode.className = 'gameover-build__rank';
        rankNode.textContent = `Lv.${rank}`;
        item.appendChild(rankNode);
        refs.build.appendChild(item);
      });
    }

    if (refs.synergies) {
      refs.synergies.innerHTML = '';
      ensureArray(data.synergies).forEach(({ name, family }) => {
        const item = document.createElement('li');
        item.className = 'gameover-build__item';
        item.textContent = name || family;
        refs.synergies.appendChild(item);
      });
    }

    const buttons = [refs.continueBtn, refs.restartBtn, refs.quitBtn];
    buttons.forEach((button) => {
      if (button) button.disabled = true;
    });
    clearTimeout(this.victoryLockoutTimer);
    this.victoryLockoutTimer = setTimeout(() => {
      buttons.forEach((button) => {
        if (button) button.disabled = false;
      });
      refs.continueBtn?.focus({ preventScroll: true });
    }, SCREEN_INPUT_LOCKOUT_MS);
  }

  showGameOverScreen(payload) {
    // Show gameover as overlay so game canvas stays visible with asteroids wandering
    this.showScreen('gameover', { overlay: true, show: true });

    const data = payload?.data || {};
    const refs = this.domRefs.gameOver;
    const setText = (node, value) => {
      if (node) node.textContent = value;
    };

    const totalSeconds = Math.max(
      0,
      Math.floor(Number(data.stats?.timeElapsed) || 0)
    );
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const wave = typeof data.wave === 'number' ? data.wave : data.wave?.current;
    const level = data.player?.level ?? data.level;

    setText(refs.time, `${minutes}:${seconds}`);
    setText(refs.wave, `${wave ?? '—'}`);
    setText(refs.kills, `${data.stats?.totalKills ?? data.stats?.kills ?? 0}`);
    setText(refs.combo, `x${data.maxCombo ?? 0}`);
    setText(refs.level, `${level ?? '—'}`);
    setText(refs.killer, `Killed by ${killerName(data.killedBy)}`);
    setText(
      refs.location,
      runLocationLine(wave, totalSeconds, data.bestLayer ?? null)
    );
    setText(refs.salvage, salvageLine(this.getService('hangar').lastAward));
    setText(refs.seed, this.getService('difficulty').runLabel());
    setText(refs.copySeedBtn, 'Copy seed link');

    const progression = this.getService('progression');
    if (refs.build && progression) {
      refs.build.innerHTML = buildBlockMarkup(
        collectBuild(progression, this.getService('combat'))
      );
    }

    const focusTarget = refs.retryBtn?.disabled
      ? refs.restartBtn
      : refs.retryBtn || refs.restartBtn;
    focusTarget?.focus({ preventScroll: true });
  }

  isOnboardingEnabled() {
    return (
      !this.onboardingDisabled &&
      this.resolveSettingsService()?.getSetting(
        'gameplay',
        'onboardingTips'
      ) !== false
    );
  }

  /** The in-play tip `id`, naming the keys or buttons the player bound. */
  showOnboardingTip(id) {
    const controls =
      this.resolveSettingsService()?.getCategoryValues('controls') || {};
    const device = this.getService('input').getActiveDevice();
    const keys = {};
    [
      'moveUp',
      'moveDown',
      'moveLeft',
      'moveRight',
      'dash',
      'activateShield',
    ].forEach((action) => {
      keys[action] = this.formatBindingLabel(
        controls[action]?.[device]?.[0],
        device
      );
    });
    const prompt = onboardingPrompts(
      keys,
      this.getService('player')?.controlScheme,
      device
    )[id];
    this.aaaTacticalHud?.showOnboardingTip(prompt.keys, prompt.text);
  }

  /** The cards tip in the level-up footer, on the first level-up only. */
  showOnboardingCardsTip() {
    const text = this.onboarding.cardsTip(
      this.getService('input').getActiveDevice()
    );
    const content = document.querySelector('#levelup-screen .levelup-content');
    if (!text || !content || content.querySelector('.onboarding-cards-tip')) {
      return;
    }
    const tip = document.createElement('p');
    tip.className = 'levelup-hint onboarding-cards-tip';
    tip.setAttribute('role', 'status');
    tip.textContent = text;
    content.appendChild(tip);
  }

  removeOnboardingCardsTip() {
    document.querySelector('.onboarding-cards-tip')?.remove();
  }
}

export default UISystem;
