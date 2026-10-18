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
import {
  LAYER_MODIFIERS,
  bossRushStage,
  bossRushStageTitle,
  directorFor,
} from '../data/layers.js';
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
import { SettingsPanel } from './ui/SettingsPanel.js';
import { LevelUpScreen } from './ui/LevelUpScreen.js';
import { PauseScreen } from './ui/PauseScreen.js';
import { RunEndScreens } from './ui/RunEndScreens.js';
import { CreditsOverlay } from './ui/CreditsOverlay.js';
import {
  TransmissionQueue,
  bossRushTransmission,
  chapterTransmission,
  deathTransmission,
  hangarTransmission,
  heraldTransmission,
  sightingTransmission,
  victoryTransmission,
  wardenTransmission,
} from './ui/transmissions.js';
import { PICKUP_KINDS } from '../data/pickups.js';
import {
  hangarItemMarkup,
  hullLockText,
  salvageBalanceText,
} from './ui/hangar.js';
import { adjacentCodexTab, codexTabView } from './ui/codexTabs.js';
import {
  GAMEPAD_FOCUSABLE_SELECTOR,
  GAMEPAD_NAV_SCREENS,
  pickFocusTarget,
} from './ui/gamepadNav.js';
import { menuStatusItems, menuStatusMarkup } from './ui/menuStatus.js';
import { isBossRushUnlocked, loadRecords } from '../services/runRecords.js';

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
    // The line shown since the death or the win, quoted on the end screen.
    this.lastTransmission = null;
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

    this.settings = this.resolveSettingsService();
    this.liveQualityPreset = null;
    this.codexState = { isOpen: false, trigger: null, tab: 'enemies' };
    this.hangarState = { isOpen: false, trigger: null };
    this.bossHudState = this.createInitialBossHudState();

    this.tacticalState = {
      contactsCache: null,
      threats: new Map(),
      isReady: false,
    };

    this.domRefs = this.cacheStaticNodes();
    this.settingsPanel = new SettingsPanel({
      refs: this.domRefs.settings,
      pauseSettingsBtn: this.domRefs.pause.settingsBtn,
      settings: this.settings,
      schema: SETTINGS_SCHEMA,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('settings', isOpen, payload),
      setHudBaseScale: (scale) => {
        this.currentHudBaseScale = scale;
        this.updateHudScale();
        this.requestViewportScaleUpdate();
      },
      livePreset: () => this.liveQualityPreset,
    });
    this.levelUpScreen = new LevelUpScreen({
      refs: this.domRefs.levelUp,
      progression: () => this.getService('progression'),
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      showGameUI: () => this.showGameUI(),
      showCardsTip: () => this.showOnboardingCardsTip(),
      prefersReducedMotion: () => this.prefersReducedMotion(),
      colorVision: () => this.settingsPanel.colorVision,
    });
    this.pauseScreen = new PauseScreen({
      refs: this.domRefs.pause,
      gameOverQuitBtn: this.domRefs.gameOver.quitBtn,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      progression: () => this.getService('progression'),
      combat: () => this.getService('combat'),
      difficulty: () => this.getService('difficulty'),
      layer: () => this.transmissionLayer,
      settingsOpenHere: () => this.settingsPanel.isOpenFrom('pause'),
      closeSettings: () => this.settingsPanel.closeSettingsPanel(),
    });
    this.runEndScreens = new RunEndScreens({
      refs: { gameOver: this.domRefs.gameOver, victory: this.domRefs.victory },
      showScreen: (name, options) => this.showScreen(name, options),
      progression: () => this.getService('progression'),
      combat: () => this.getService('combat'),
      difficulty: () => this.getService('difficulty'),
      hangar: () => this.getService('hangar'),
      lastTransmission: () => this.lastTransmission,
    });
    this.creditsOverlay = new CreditsOverlay({
      refs: this.domRefs.credits,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('credits', isOpen, payload),
    });
    // The static keyboard hints show the scheme in use (style.css).
    document.body.dataset.controls = controlSchemeFromUrl();

    // Direct AAA HUD Activation
    this.activateAAATacticalHud(this.aaaTacticalHudDefinition);
    this.updateAAATacticalHudFromServices({ force: true });

    this.pauseScreen.bindPauseControls();
    this.runEndScreens.bindCopySeedLink();
    this.levelUpScreen.bindLevelUpControls();
    this.settingsPanel.bindSettingsControls();
    this.creditsOverlay.bindCreditsControls();
    this.bindCodexControls();
    this.bindHangarControls();
    this.bindMainMenuControls();
    this.initializeMenuShipSelector();
    this.refreshMenuStatus();
    this.refreshBossRushLock();
    this.settingsPanel.bootstrapSettingsState();
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
        quote: document.getElementById('gameover-quote') || null,
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
        title: document.getElementById('victory-title') || null,
        time: document.getElementById('victory-time') || null,
        wave: document.getElementById('victory-wave') || null,
        kills: document.getElementById('victory-kills') || null,
        combo: document.getElementById('victory-combo') || null,
        level: document.getElementById('victory-level') || null,
        quote: document.getElementById('victory-quote') || null,
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
        hullLock: document.getElementById('hangar-hull-lock') || null,
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
        bossRushBtn: document.getElementById('boss-rush-btn') || null,
        bossRushLock: document.getElementById('boss-rush-lock') || null,
      },
    };
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
    const stage = this.bossRush ? bossRushStage(layer) : 0;
    hud.showLayerBanner(layer, {
      boss,
      bossRush: this.bossRush,
      chapter: stage
        ? bossRushStageTitle(stage)
        : firstOfBiome
          ? biome.title
          : layer > RUN_FINAL_LAYER
            ? 'DEEP FIELD'
            : '',
    });
    if (firstOfBiome) {
      this.queueTransmission(chapterTransmission(biome.id));
    }
    if (stage === 1) {
      this.queueTransmission(bossRushTransmission());
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

  // Boss Rush stays locked until a run has beaten Warden Prime.
  refreshBossRushLock() {
    const { bossRushBtn, bossRushLock } = this.domRefs.menu;
    if (!bossRushBtn) {
      return;
    }
    const locked = !isBossRushUnlocked();
    bossRushBtn.disabled = locked;
    bossRushLock.classList.toggle('hidden', !locked);
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
      ({ speaker, key, text }) => {
        this.lastTransmission = { speaker, text };
        this.eventBus.emit('transmission-shown', { speaker, key });
      },
      ({ key }) => {
        this.eventBus.emit('transmission-finished', { key });
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
          // A phased Shade still shows on the radar, dimmed.
          radarEnemies = physics.getNearbyEnemies(
            Number(playerPosition.x) || 0,
            Number(playerPosition.y) || 0,
            radarRange,
            { includeIntangible: true }
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
          phased: Boolean(enemy.intangible),
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
      // The run's mode rides on every layer start (the intro's end reads it).
      this.bossRush = Boolean(payload.bossRush);
      this.handleLayerStarted(payload);
    });

    this.registerEventListener('boss-warning', (payload = {}) => {
      // Boss Rush: the breather names the next Warden.
      if (this.bossRush) {
        this.aaaTacticalHud?.showLayerBanner(payload.nextBossWave, {
          boss: true,
          bossRush: true,
          chapter: bossRushStageTitle(bossRushStage(payload.nextBossWave)),
        });
      }
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
      this.pilotDown = true;
      this.lastTransmission = null;
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

    // A Herald arrives under a violet banner, then speaks; Silence jams the
    // radar while it lives (a new run clears it).
    this.registerEventListener('herald-spawned', ({ kind } = {}) => {
      const herald = HERALD_KINDS[kind];
      if (!herald) return;
      this.aaaTacticalHud?.showHeraldBanner(
        herald.displayName,
        herald.subtitle
      );
      if (herald.jamsRadar) this.aaaTacticalHud?.setRadarJammed(true);
      this.queueTransmission(heraldTransmission(kind, 'spawned'));
    });
    this.registerEventListener('herald-defeated', ({ kind } = {}) => {
      this.queueTransmission(heraldTransmission(kind, 'defeated'));
      if (HERALD_KINDS[kind]?.jamsRadar) {
        this.aaaTacticalHud?.setRadarJammed(false);
      }
    });
    // The Ring names a machine the first time it is ever seen; not over the
    // intro or once the run has ended.
    this.registerEventListener('codex-discovered', ({ type } = {}) => {
      if (this.cinematics.introActive || this.runWon || this.pilotDown) {
        return;
      }
      this.queueTransmission(sightingTransmission(type));
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
        payload.enemy?.elite,
        payload.enemy?.displayName
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
      this.pauseScreen.updatePauseScreen(Boolean(data?.isPaused));
    });

    this.registerEventListener('screen-changed', (payload = {}) => {
      this.handleScreenChanged(payload);
    });

    // The run's transmission banner is hidden in the menu: the Ring's line
    // for a purchase shows in the caption under the Hangar's hull stage,
    // scrolled into view.
    this.registerEventListener('hangar-purchased', ({ id } = {}) => {
      this.refreshMenuStatus();
      const line = hangarTransmission(id);
      const caption = this.domRefs.hangar.hullLock;
      if (line && caption) {
        caption.textContent = `${line.speaker}: ${line.text}`;
        caption.hidden = false;
        caption.scrollIntoView({ block: 'nearest' });
      }
    });

    // Renderer3D's Auto quality picked a preset: menu strip and the
    // Graphics preview name it.
    this.registerEventListener('quality-changed', ({ preset } = {}) => {
      this.liveQualityPreset = preset;
      this.refreshMenuStatus();
      this.settingsPanel.refreshCategory('graphics');
    });

    this.registerEventListener('toggle-pause', () => {
      const appState = this.getService('game-state');
      if (appState && typeof appState.isPaused === 'function') {
        this.pauseScreen.updatePauseScreen(Boolean(appState.isPaused()));
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
      this.lastTransmission = null;
      this.cinematics.startEpilogue();
      this.queueTransmission(victoryTransmission(), { interrupt: true });
    });
    this.registerEventListener('run-continued', () => {
      this.runWon = false;
      this.cinematics.release();
    });
    this.registerEventListener('game-started', () => {
      this.runWon = false;
      this.pilotDown = false;
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
      if (this.runWon) {
        return;
      }
      this.levelUpScreen.handleUpgradeOptions(payload);
    });
    this.registerEventListener('upgrade-rerolled', (payload = {}) => {
      this.levelUpScreen.refreshLevelUpOptions(payload);
    });
    this.registerEventListener('upgrade-banished', (payload = {}) => {
      this.levelUpScreen.refreshLevelUpOptions(payload);
    });

    this.registerEventListener('settings-menu-requested', (payload = {}) => {
      this.settingsPanel.handleSettingsMenuRequest(payload);
    });

    this.registerEventListener('settings-changed', (change) => {
      this.settingsPanel.handleSettingsChange(change);
      this.followSettingsChange(change);
    });

    this.registerEventListener('credits-menu-requested', (payload = {}) => {
      this.creditsOverlay.handleCreditsMenuRequest(payload);
    });

    this.registerEventListener('settings-controls-changed', (payload = {}) => {
      if (payload?.values) {
        this.settingsPanel.refreshCategory('controls');
      }
    });

    this.registerEventListener('settings-visual-changed', (payload = {}) => {
      this.settingsPanel.handleVisualPreferencesChange(payload);
    });

    this.registerEventListener('key-pressed', (payload) => {
      this.settingsPanel.handleKeyPressForCapture(payload);
    });

    this.registerEventListener('gamepad-input-detected', (payload) => {
      this.settingsPanel.handleGamepadInputForCapture(payload);
    });

    this.registerEventListener('input-action', (payload = {}) => {
      this.levelUpScreen.handleLevelUpInputAction(payload);
    });

    this.registerEventListener('input-confirmed', () => {
      this.levelUpScreen.handleLevelUpConfirm();
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
    if (!screen || this.settingsPanel.capturing) {
      return;
    }
    const { id, element } = screen;

    if (id === 'levelup') {
      this.levelUpScreen.handleGamepadNav(action);
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
        if (id === 'settings') this.settingsPanel.closeSettingsPanel();
        else if (id === 'codex') this.closeCodex();
        else if (id === 'hangar') this.closeHangar();
        else if (id === 'credits') {
          this.creditsOverlay.closeCreditsOverlay({ restoreFocus: true });
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
          this.settingsPanel.cycleCategory(step);
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

  // The menu strip, the ship selector and the onboarding tips follow a
  // setting change.
  followSettingsChange(change) {
    if (!change) {
      return;
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
    // The 3D hull preview follows the hovered or focused hull button; a
    // locked hull shows as a silhouette with its price over the stage.
    const previewHull = (event) => {
      const hull = event.target.closest?.('[data-hangar-hull]');
      const hullId = hull?.dataset.hangarHull ?? null;
      const locked = Boolean(hull?.disabled);
      refs.hullLock.hidden = !locked;
      refs.hullLock.textContent = locked ? hullLockText(hullId) : '';
      this.eventBus.emit('hangar-hull-hovered', { hullId, locked });
    };
    refs.hulls?.addEventListener('pointerover', previewHull);
    refs.hulls?.addEventListener('focusin', previewHull);
    ['pointerleave', 'focusout'].forEach((type) =>
      refs.hulls?.addEventListener(type, () => {
        refs.hullLock.hidden = true;
        this.eventBus.emit('hangar-hull-hovered', { hullId: null });
      })
    );
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
    refs.hullLock.hidden = true;
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
      this.runEndScreens.showGameOverScreen(payload);
      return;
    }

    if (screenName === 'victory') {
      const show = () => this.runEndScreens.showVictoryScreen(payload);
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

      if (this.settingsPanel.isOpenFrom('menu') && screenName !== 'menu') {
        this.settingsPanel.closeSettingsPanel();
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

      this.creditsOverlay.markClosed();

      this.closeCodex();
      this.closeHangar();

      document.body?.classList.remove('is-credits-open');

      if (screenName === 'menu') {
        this.requestMenuShipSelectorRefresh();
        this.refreshMenuStatus();
        this.refreshBossRushLock();
      }

      if (emitEvent) {
        this.eventBus?.emit?.('screen-changed', { screen: screenName });
      }
    } catch (error) {
      console.error('[UISystem] Failed to show screen:', error);
    }
  }

  showGameUI(options = {}) {
    this.levelUpScreen.resetLevelUpState();
    this.showScreen('playing', options);
    this.refreshHudFromServices(true);
  }

  /** GameSessionService clears the cards when a run starts or ends. */
  resetLevelUpState() {
    this.levelUpScreen.resetLevelUpState();
  }

  prefersReducedMotion() {
    return (
      document.body.classList.contains('motion-reduced') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
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
      keys[action] = this.settingsPanel.formatBindingLabel(
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
