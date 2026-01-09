// src/modules/UISystem.js

import {
  DEFAULT_HUD_LAYOUT_ID,
  HUD_LAYOUT_IDS,
  HUD_LAYOUT_OPTIONS,
  getHudLayoutDefinition,
  getHudLayoutItems,
} from '../data/ui/hudLayout.js';
import SETTINGS_SCHEMA from '../data/settingsSchema.js';
import { WAVE_BOSS_INTERVAL } from '../data/constants/gameplay.js';
import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { AAAHudLayout } from './ui/AAAHudLayout.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const COLOR_ASSIST_ACCENTS = {
  offense: '#3366CC',
  defense: '#2F855A',
  mobility: '#E76F51',
  utility: '#8E6CFF',
  default: '#4C6EF5',
};

const MINIMAP_ENTITY_COLORS = {
  asteroid: '#A0AEC0',
  drone: '#63B3ED',
  mine: '#F6AD55',
  hunter: '#B794F4',
  boss: '#F56565',
  default: '#E2E8F0',
};

const THREAT_ICON_LOOKUP = {
  boss: '☠',
  hunter: '✦',
  drone: '▲',
  mine: '✸',
  asteroid: '●',
  default: '•',
};

const DEFAULT_MINIMAP_RANGE = 300;
const DEFAULT_MINIMAP_DETECTION_MULTIPLIER = 1.5;
const MAX_THREAT_INDICATORS = 8;

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
  }

  initialize() {
    this.damageFlashTimeout = null;
    this.currentPauseState = false;
    this.shieldFailTimeout = null;
    this.timePulseTimeout = null;
    this.killsPulseTimeout = null;
    this.levelPulseTimeout = null;
    this.resizeRaf = null;
    this._lastHoverTarget = null; // Track hover state for delegation
    this.currentHudBaseScale = 1;
    this.currentHudAutoScale = 1;
    this.currentCanvasScale = 1;
    this.canvasBaseSize = { width: 0, height: 0 };
    this._waveCompletionEventCache = new Map();
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
    this.aaaTacticalHud = null;
    this.aaaTacticalHudDefinition = null;
    this.aaaTacticalHudMountTarget = null;
    this.aaaTacticalHudRestoreState = null;
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
      boss: this.createInitialBossCachedValues(),
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
    this.settingsSchema = [];
    this.schemaByCategory = new Map();
    this.settingsState = {
      isOpen: false,
      source: 'menu',
      activeCategory: 'audio',
      capture: null,
      previousFocus: null,
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

    this.bossHudState = this.createInitialBossHudState();
    this.bossBannerTimeout = null;
    this.bossHideTimeout = null;

    this.comboBreakTimeout = null;
    this.tacticalState = {
      contactsCache: null,
      threats: new Map(),
      isReady: false,
    };

    this.initializeSettingsMetadata();

    this.domRefs = this.cacheStaticNodes();
    this.setupHudLayout();
    this.updateHudLayoutClass(this.currentHudLayoutId);
    this.bootstrapHudValues();
    this.bindPauseControls();
    this.bindSettingsControls();
    this.bindCreditsControls();
    this.bindMainMenuControls();
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
    const timestamp =
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    return {
      active: false,
      upcoming: false,
      defeated: false,
      bossId: null,
      name: null,
      phase: 0,
      phaseCount: 0,
      health: 0,
      maxHealth: 0,
      wave: null,
      color: '#ff6b6b',
      phaseColors: [],
      lastEvent: null,
      lastUpdate: timestamp,
      invulnerable: false,
      invulnerabilityTimer: null,
      invulnerabilitySource: null,
      timers: {
        phase: {
          remaining: null,
          total: null,
          endsAt: null,
          label: 'Phase shift',
        },
        enrage: {
          remaining: null,
          total: null,
          endsAt: null,
          label: 'Enrage',
        },
      },
    };
  }

  createInitialBossCachedValues() {
    return {
      visible: false,
      bossId: null,
      name: null,
      wave: null,
      phase: null,
      phaseCount: null,
      phaseIndex: null,
      phaseColors: [],
      status: null,
      color: null,
      health: null,
      maxHealth: null,
      healthRatio: null,
      healthText: null,
      phaseTimerSeconds: null,
      phaseTimerText: null,
      enrageTimerSeconds: null,
      enrageTimerText: null,
      bannerType: null,
      invulnerable: false,
      invulnerabilityTimer: null,
      invulnerabilityLabel: null,
    };
  }

  normalizeBossPhaseColors(input) {
    if (!input) {
      return [];
    }

    const collection = Array.isArray(input)
      ? input
      : typeof input[Symbol.iterator] === 'function'
        ? [...input]
        : [];

    return collection
      .map((value) => (typeof value === 'string' ? value.trim() : null))
      .filter((value) => value && value.length > 0);
  }

  getHighResolutionTime() {
    if (
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
    ) {
      return performance.now();
    }

    return Date.now();
  }

  formatBossTimer(seconds, options = {}) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return null;
    }

    const { includeSecondsSuffix = false } = options;
    const clamped = Math.max(0, seconds);
    const minutes = Math.floor(clamped / 60);
    const remainingSeconds = Math.max(0, Math.floor(clamped - minutes * 60));

    if (minutes <= 0) {
      return includeSecondsSuffix
        ? `${remainingSeconds}s`
        : `${remainingSeconds.toString().padStart(2, '0')}s`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  resolveBossTimerSeconds(timerState = {}, now = this.getHighResolutionTime()) {
    if (!timerState) {
      return null;
    }

    if (Number.isFinite(timerState.endsAt)) {
      const seconds = (Number(timerState.endsAt) - now) / 1000;
      if (Number.isFinite(seconds)) {
        return Math.max(0, seconds);
      }
    }

    if (Number.isFinite(timerState.remaining)) {
      return Math.max(0, Number(timerState.remaining));
    }

    return null;
  }

  resetBossHudState() {
    this.bossHudState = this.createInitialBossHudState();
    this.cachedValues.boss = this.createInitialBossCachedValues();

    if (this.bossBannerTimeout) {
      window.clearTimeout(this.bossBannerTimeout);
      this.bossBannerTimeout = null;
    }

    if (this.bossHideTimeout) {
      window.clearTimeout(this.bossHideTimeout);
      this.bossHideTimeout = null;
    }

    this.hideBossBanner(true);
    this.hideBossHealthBar(true);
    return this.bossHudState;
  }

  getBossHudState() {
    const state = this.bossHudState || this.createInitialBossHudState();
    return {
      ...state,
      phaseColors: Array.isArray(state.phaseColors)
        ? [...state.phaseColors]
        : [],
      timers: {
        phase: { ...(state.timers?.phase || {}) },
        enrage: { ...(state.timers?.enrage || {}) },
      },
      invulnerable: Boolean(state.invulnerable),
      invulnerabilityTimer: Number.isFinite(state.invulnerabilityTimer)
        ? Math.max(0, Number(state.invulnerabilityTimer))
        : null,
      invulnerabilitySource: state.invulnerabilitySource || null,
    };
  }

  updateBossHud(patch = {}) {
    const now = this.getHighResolutionTime();

    const current = this.bossHudState || this.createInitialBossHudState();
    const next = {
      ...current,
      timers: {
        phase: { ...(current.timers?.phase || {}) },
        enrage: { ...(current.timers?.enrage || {}) },
      },
    };

    const ensureTimer = (key) => {
      if (!next.timers[key]) {
        next.timers[key] = {};
      }

      const defaults = {
        label: key === 'enrage' ? 'Enrage' : 'Phase shift',
        remaining: null,
        total: null,
        endsAt: null,
      };

      next.timers[key] = { ...defaults, ...next.timers[key] };
      return next.timers[key];
    };

    const updateTimerWithPatch = (key, timerPatch = {}) => {
      if (!timerPatch || typeof timerPatch !== 'object') {
        return;
      }

      const timer = ensureTimer(key);

      if (timerPatch.label !== undefined && timerPatch.label !== null) {
        timer.label = String(timerPatch.label);
      }

      const totalValue =
        timerPatch.total ??
        timerPatch.duration ??
        timerPatch.max ??
        timerPatch.timeTotal;
      if (totalValue !== undefined) {
        if (Number.isFinite(totalValue)) {
          timer.total = Math.max(0, Number(totalValue));
        } else if (totalValue === null) {
          timer.total = null;
        }
      }

      const remainingValue =
        timerPatch.remaining ??
        timerPatch.timeRemaining ??
        timerPatch.seconds ??
        timerPatch.value;
      if (remainingValue !== undefined) {
        if (Number.isFinite(remainingValue)) {
          const normalized = Math.max(0, Number(remainingValue));
          timer.remaining = normalized;
          timer.endsAt = now + normalized * 1000;
        } else if (remainingValue === null) {
          timer.remaining = null;
          timer.endsAt = null;
        }
      }

      if (timerPatch.endsAt !== undefined) {
        if (Number.isFinite(timerPatch.endsAt)) {
          timer.endsAt = Number(timerPatch.endsAt);
        } else if (timerPatch.endsAt === null) {
          timer.endsAt = null;
        }
      }
    };

    if (patch.bossId !== undefined) {
      next.bossId = patch.bossId;
    }

    if (patch.name !== undefined && patch.name !== null) {
      next.name = String(patch.name);
    }

    if (Number.isFinite(patch.maxHealth)) {
      next.maxHealth = Math.max(0, Number(patch.maxHealth));
    }

    if (Number.isFinite(patch.health)) {
      next.health = Math.max(0, Math.min(next.maxHealth, Number(patch.health)));
    } else {
      next.health = Math.max(0, Math.min(next.maxHealth, next.health));
    }

    if (Number.isFinite(patch.phaseCount)) {
      next.phaseCount = Math.max(0, Math.floor(Number(patch.phaseCount)));
    }

    if (Number.isFinite(patch.phase)) {
      const normalizedPhase = Math.max(0, Math.floor(Number(patch.phase)));
      if (next.phaseCount > 0) {
        next.phase = Math.min(
          normalizedPhase,
          Math.max(0, next.phaseCount - 1)
        );
      } else {
        next.phase = normalizedPhase;
      }
    }

    if (Number.isFinite(patch.wave)) {
      next.wave = Number(patch.wave);
    } else if (patch.wave === null) {
      next.wave = null;
    }

    if (typeof patch.color === 'string' && patch.color.trim().length > 0) {
      next.color = patch.color.trim();
    }

    if (patch.phaseColors !== undefined) {
      const colors = this.normalizeBossPhaseColors(patch.phaseColors);
      next.phaseColors = colors;
      if ((!next.color || next.color === '#ff6b6b') && colors.length > 0) {
        next.color = colors[Math.min(next.phase, colors.length - 1)];
      }
    }

    if (typeof patch.active === 'boolean') {
      next.active = patch.active;
    }

    if (typeof patch.upcoming === 'boolean') {
      next.upcoming = patch.upcoming;
    }

    if (typeof patch.defeated === 'boolean') {
      next.defeated = patch.defeated;
    }

    if (patch.invulnerable !== undefined) {
      next.invulnerable = Boolean(patch.invulnerable);
    }

    if (
      patch.invulnerabilityTimer !== undefined ||
      patch.invulnerabilityRemaining !== undefined
    ) {
      const timerValue =
        patch.invulnerabilityTimer !== undefined
          ? patch.invulnerabilityTimer
          : patch.invulnerabilityRemaining;

      if (Number.isFinite(timerValue)) {
        next.invulnerabilityTimer = Math.max(0, Number(timerValue));
      } else if (timerValue === null) {
        next.invulnerabilityTimer = null;
      }
    }

    if (patch.invulnerabilitySource !== undefined) {
      next.invulnerabilitySource =
        patch.invulnerabilitySource === null
          ? null
          : String(patch.invulnerabilitySource);
    }

    if (patch.lastEvent !== undefined && patch.lastEvent !== null) {
      next.lastEvent = patch.lastEvent;
    } else if (patch.event !== undefined && patch.event !== null) {
      next.lastEvent = patch.event;
    }

    if (patch.phaseTimeRemaining !== undefined) {
      updateTimerWithPatch('phase', { remaining: patch.phaseTimeRemaining });
    }

    if (patch.phaseTimeTotal !== undefined) {
      updateTimerWithPatch('phase', { total: patch.phaseTimeTotal });
    }

    if (patch.phaseTimerLabel !== undefined) {
      updateTimerWithPatch('phase', { label: patch.phaseTimerLabel });
    }

    if (patch.enrageTimeRemaining !== undefined) {
      updateTimerWithPatch('enrage', { remaining: patch.enrageTimeRemaining });
    }

    if (patch.enrageTimeTotal !== undefined) {
      updateTimerWithPatch('enrage', { total: patch.enrageTimeTotal });
    }

    if (patch.timers) {
      if (patch.timers.phase) {
        updateTimerWithPatch('phase', patch.timers.phase);
      }

      if (patch.timers.enrage) {
        updateTimerWithPatch('enrage', patch.timers.enrage);
      }
    }

    next.lastUpdate = now;

    if (!next.defeated && next.health > 0) {
      next.active = true;
      next.upcoming = false;
    }

    if (next.defeated) {
      next.active = false;
      next.upcoming = false;
      next.health = 0;
      ensureTimer('phase');
      ensureTimer('enrage');
      next.timers.phase.remaining = null;
      next.timers.phase.endsAt = null;
      next.timers.enrage.remaining = null;
      next.timers.enrage.endsAt = null;
      next.invulnerable = false;
      next.invulnerabilityTimer = null;
    }

    if (!next.color) {
      next.color = '#ff6b6b';
    }

    this.bossHudState = next;
    return this.bossHudState;
  }

  handleBossEvent(eventName, data = {}) {
    if (!eventName) {
      return this.bossHudState;
    }

    const patch = { ...data, lastEvent: eventName };

    switch (eventName) {
      case 'boss-wave-started':
        patch.upcoming = true;
        patch.active = false;
        patch.defeated = false;
        patch.health = 0;
        break;
      case 'boss-spawned':
        patch.active = true;
        patch.upcoming = false;
        patch.defeated = false;
        break;
      case 'boss-phase-changed':
        patch.active = true;
        patch.upcoming = false;
        patch.defeated = false;
        break;
      case 'boss-invulnerability-changed':
        patch.active = true;
        patch.upcoming = false;
        break;
      case 'boss-defeated':
        patch.defeated = true;
        patch.active = false;
        patch.upcoming = false;
        patch.health = 0;
        break;
      case 'boss-hud-update':
      default:
        break;
    }

    const state = this.updateBossHud(patch);

    switch (eventName) {
      case 'boss-wave-started':
        this.showBossHealthBar(state, { skipUpdate: true });
        this.updateBossHealthBar(state, { force: true });
        this.showBossBanner('incoming', state, { duration: 5200 });
        break;
      case 'boss-spawned':
      case 'boss-phase-changed':
      case 'boss-invulnerability-changed':
        this.hideBossBanner(true);
        this.showBossHealthBar(state, { skipUpdate: true });
        this.updateBossHealthBar(state, { force: true });
        break;
      case 'boss-defeated':
        this.updateBossHealthBar(state, { force: true });
        this.showBossBanner('defeated', state, { duration: 6000 });
        if (this.bossHideTimeout) {
          window.clearTimeout(this.bossHideTimeout);
        }
        this.bossHideTimeout = window.setTimeout(() => {
          this.bossHideTimeout = null;
          this.resetBossHudState();
        }, 4500);
        break;
      default:
        this.updateBossHealthBar(state);
        break;
    }

    return state;
  }

  showBossHealthBar(bossData = {}, options = {}) {
    const entry = this.hudElements.get('boss');
    if (!entry?.root) {
      return;
    }

    if (!this.cachedValues.boss) {
      this.cachedValues.boss = this.createInitialBossCachedValues();
    }

    if (this.bossHideTimeout) {
      window.clearTimeout(this.bossHideTimeout);
      this.bossHideTimeout = null;
    }

    const wasVisible = Boolean(this.cachedValues.boss.visible);

    if (!wasVisible) {
      entry.root.classList.remove('is-hidden');
      entry.root.classList.add('is-visible');
      entry.root.setAttribute('aria-hidden', 'false');
    }

    this.cachedValues.boss.visible = true;

    const shouldUpdate =
      !options?.skipUpdate &&
      bossData &&
      typeof bossData === 'object' &&
      Object.keys(bossData).length > 0;

    if (shouldUpdate) {
      this.updateBossHealthBar(bossData, { force: true });
      return;
    }

    if (!wasVisible && !options?.skipUpdate) {
      this.updateBossHealthBar({}, { force: true });
    }
  }

  hideBossHealthBar(force = false) {
    const entry = this.hudElements.get('boss');
    const cached =
      this.cachedValues.boss || this.createInitialBossCachedValues();

    if (!entry?.root) {
      this.cachedValues.boss = this.createInitialBossCachedValues();
      return;
    }

    if (this.bossHideTimeout) {
      window.clearTimeout(this.bossHideTimeout);
      this.bossHideTimeout = null;
    }

    if (!force && !cached.visible) {
      return;
    }

    entry.root.classList.remove(
      'is-active',
      'is-upcoming',
      'is-defeated',
      'is-visible',
      'boss-has-phase-colors'
    );
    entry.root.classList.add('is-hidden');
    entry.root.setAttribute('aria-hidden', 'true');
    delete entry.root.dataset.bossPhase;

    if (entry.barFill) {
      entry.barFill.style.width = '0%';
    }

    if (entry.bar) {
      entry.bar.setAttribute('aria-valuenow', '0');
      entry.bar.setAttribute('aria-valuetext', 'Boss health 0');
    }

    if (entry.health) {
      entry.health.textContent = '--';
    }

    if (entry.phase) {
      entry.phase.textContent = '';
    }

    if (entry.status) {
      entry.status.textContent = '';
    }

    if (entry.phaseTimer) {
      entry.phaseTimer.textContent = '';
      entry.phaseTimer.style.display = 'none';
      entry.phaseTimer.setAttribute('aria-hidden', 'true');
    }

    if (entry.enrageTimer) {
      entry.enrageTimer.textContent = '';
      entry.enrageTimer.style.display = 'none';
      entry.enrageTimer.setAttribute('aria-hidden', 'true');
    }

    if (entry.timers) {
      entry.timers.style.display = 'none';
      entry.timers.setAttribute('aria-hidden', 'true');
    }

    this.hideBossBanner(true);
    this.cachedValues.boss = this.createInitialBossCachedValues();
  }

  hideBossHud(force = false) {
    this.hideBossBanner(force);
    this.hideBossHealthBar(force);
  }

  updateBossHealthBar(bossData = {}, options = {}) {
    const entry = this.hudElements.get('boss');
    if (!entry?.root) {
      return;
    }

    if (!this.cachedValues.boss) {
      this.cachedValues.boss = this.createInitialBossCachedValues();
    }

    const cached = this.cachedValues.boss;
    const force = Boolean(options.force);
    const hasPayload =
      bossData &&
      typeof bossData === 'object' &&
      Object.keys(bossData).length > 0;
    const state = hasPayload ? bossData : this.getBossHudState();

    const shouldDisplay = Boolean(
      state.active || state.upcoming || state.defeated
    );
    if (!shouldDisplay) {
      this.hideBossHealthBar(force);
      return;
    }

    this.showBossHealthBar();

    const phaseColors = Array.isArray(state.phaseColors)
      ? state.phaseColors
      : [];

    const waveNumber = Number.isFinite(state.wave)
      ? Math.max(1, Math.floor(state.wave))
      : null;
    const phaseCount = Number.isFinite(state.phaseCount)
      ? Math.max(0, Math.floor(state.phaseCount))
      : 0;
    const phaseIndex = Number.isFinite(state.phase)
      ? Math.max(0, Math.floor(state.phase))
      : null;
    const normalizedPhaseIndex = phaseIndex !== null ? phaseIndex : null;

    let color = null;
    if (normalizedPhaseIndex !== null && phaseColors.length > 0) {
      const idx = Math.min(normalizedPhaseIndex, phaseColors.length - 1);
      const candidate = phaseColors[idx];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        color = candidate.trim();
      }
    }

    if (!color) {
      color =
        typeof state.color === 'string' && state.color.trim().length > 0
          ? state.color.trim()
          : '#ff6b6b';
    }

    if (force || cached.color !== color) {
      entry.root.style.setProperty('--boss-accent', color);

      let softColor = 'rgba(255, 107, 107, 0.35)';
      if (typeof color === 'string') {
        const trimmedColor = color.trim();
        if (trimmedColor.startsWith('#')) {
          softColor = this.hexToRgba(trimmedColor, 0.35);
        } else if (trimmedColor.startsWith('rgba')) {
          softColor = trimmedColor.replace(/\)$/u, ', 0.35)');
        } else if (trimmedColor.startsWith('rgb')) {
          softColor = trimmedColor
            .replace('rgb', 'rgba')
            .replace(/\)$/u, ', 0.35)');
        } else if (trimmedColor.startsWith('hsla')) {
          softColor = trimmedColor.replace(/\)$/u, ', 0.35)');
        } else if (trimmedColor.startsWith('hsl')) {
          softColor = trimmedColor
            .replace('hsl', 'hsla')
            .replace(/\)$/u, ', 0.35)');
        }
      }

      entry.root.style.setProperty('--boss-accent-soft', softColor);
      cached.color = color;
    }

    const isActive = Boolean(state.active && !state.defeated);
    const isUpcoming = Boolean(
      state.upcoming && !state.active && !state.defeated
    );
    const isDefeated = Boolean(state.defeated);
    const isInvulnerable = Boolean(state.invulnerable);
    const invulnerabilityTimer = Number.isFinite(state.invulnerabilityTimer)
      ? Math.max(0, Number(state.invulnerabilityTimer))
      : null;

    entry.root.classList.toggle('is-active', isActive);
    entry.root.classList.toggle('is-upcoming', isUpcoming);
    entry.root.classList.toggle('is-defeated', isDefeated);
    entry.root.classList.toggle(
      'boss-has-phase-colors',
      phaseColors.length > 0
    );
    entry.root.classList.toggle('is-invulnerable', isInvulnerable);
    if (entry.barFill) {
      entry.barFill.style.opacity = isInvulnerable ? '0.55' : '';
    }
    if (isInvulnerable) {
      entry.root.dataset.bossInvulnerable = 'true';
    } else {
      delete entry.root.dataset.bossInvulnerable;
    }

    if (phaseColors.length > 0 && normalizedPhaseIndex !== null) {
      entry.root.dataset.bossPhase = `${normalizedPhaseIndex + 1}`;
    } else {
      delete entry.root.dataset.bossPhase;
    }

    const bossName = state.name || 'Boss';
    if (force || cached.name !== bossName) {
      if (entry.name) {
        entry.name.textContent = bossName;
      }
      cached.name = bossName;
    }

    let phaseText = '';
    if (phaseCount > 0 && phaseIndex !== null) {
      const displayPhase = Math.min(phaseIndex + 1, phaseCount);
      phaseText = `Phase ${displayPhase}/${phaseCount}`;
    } else if (phaseIndex !== null) {
      phaseText = `Phase ${phaseIndex + 1}`;
    } else if (waveNumber !== null) {
      phaseText = `Wave ${waveNumber}`;
    }

    if (entry.phase && (force || cached.phase !== phaseText)) {
      entry.phase.textContent = phaseText;
      cached.phase = phaseText;
    }

    const now = this.getHighResolutionTime();

    let statusText = '';
    if (isDefeated) {
      statusText = 'Defeated';
    } else if (isActive) {
      statusText =
        waveNumber !== null ? `Wave ${waveNumber} • Engaged` : 'Engaged';
    } else if (isUpcoming) {
      statusText =
        waveNumber !== null
          ? `Wave ${waveNumber} • Approaching`
          : 'Approaching';
    } else if (waveNumber !== null) {
      statusText = `Wave ${waveNumber}`;
    }

    let invulnerabilityLabel = null;
    if (isInvulnerable && !isDefeated) {
      const effectiveSeconds = Number.isFinite(invulnerabilityTimer)
        ? Math.max(
            0,
            invulnerabilityTimer -
              Math.max(
                0,
                (now -
                  (Number.isFinite(state.lastUpdate)
                    ? state.lastUpdate
                    : now)) /
                  1000
              )
          )
        : null;
      const formattedLockTimer = Number.isFinite(effectiveSeconds)
        ? this.formatBossTimer(effectiveSeconds, { includeSecondsSuffix: true })
        : null;
      invulnerabilityLabel = formattedLockTimer
        ? `🔒 Invulnerable (${formattedLockTimer})`
        : '🔒 Invulnerable';
      statusText = statusText
        ? `${statusText} • ${invulnerabilityLabel}`
        : invulnerabilityLabel;
    }

    if (
      entry.status &&
      (force ||
        cached.status !== statusText ||
        cached.invulnerable !== isInvulnerable ||
        cached.invulnerabilityLabel !== invulnerabilityLabel)
    ) {
      entry.status.textContent = statusText;
      cached.status = statusText;
    }

    const health = Number.isFinite(state.health)
      ? Math.max(0, Math.floor(state.health))
      : 0;
    const maxHealth = Number.isFinite(state.maxHealth)
      ? Math.max(0, Math.floor(state.maxHealth))
      : 0;
    const ratio =
      maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;

    const healthText =
      maxHealth > 0
        ? `${this.formatCount(health, { allowCompact: false })} / ${this.formatCount(
            maxHealth,
            {
              allowCompact: false,
            }
          )}`
        : this.formatCount(health, { allowCompact: false });

    if (entry.health && (force || cached.healthText !== healthText)) {
      entry.health.textContent = healthText;
      cached.healthText = healthText;
    }

    if (entry.barFill && (force || cached.healthRatio !== ratio)) {
      entry.barFill.style.width = `${(ratio * 100).toFixed(2)}%`;
    }

    if (entry.bar) {
      entry.bar.setAttribute('aria-valuenow', `${Math.round(ratio * 100)}`);
      const ariaText =
        maxHealth > 0
          ? `Boss health ${health} of ${maxHealth}`
          : `Boss health ${health}`;
      if (force || cached.healthRatio !== ratio) {
        entry.bar.setAttribute('aria-valuetext', ariaText);
      }
    }

    cached.health = health;
    cached.maxHealth = maxHealth;
    cached.healthRatio = ratio;
    cached.visible = true;
    cached.wave = waveNumber;
    cached.phaseCount = phaseCount;
    cached.phaseIndex = normalizedPhaseIndex;
    cached.phaseColors = phaseColors.slice();
    cached.invulnerable = isInvulnerable;
    cached.invulnerabilityTimer = invulnerabilityTimer;
    cached.invulnerabilityLabel = invulnerabilityLabel;

    const phaseTimerState = state.timers?.phase || {};
    const enrageTimerState = state.timers?.enrage || {};
    const phaseSeconds = this.resolveBossTimerSeconds(phaseTimerState, now);
    const enrageSeconds = this.resolveBossTimerSeconds(enrageTimerState, now);

    const buildTimerText = (seconds, label) => {
      if (isDefeated || !Number.isFinite(seconds)) {
        return '';
      }

      const normalizedLabel = label || 'Timer';
      if (seconds <= 0) {
        return `${normalizedLabel}: READY`;
      }

      const formatted = this.formatBossTimer(seconds);
      return formatted ? `${normalizedLabel}: ${formatted}` : '';
    };

    const phaseLabel = phaseTimerState.label || 'Phase shift';
    const enrageLabel = enrageTimerState.label || 'Enrage';
    const phaseTimerText = buildTimerText(phaseSeconds, phaseLabel);
    const enrageTimerText = buildTimerText(enrageSeconds, enrageLabel);

    if (entry.phaseTimer) {
      if (phaseTimerText) {
        entry.phaseTimer.textContent = phaseTimerText;
        entry.phaseTimer.style.display = '';
        entry.phaseTimer.setAttribute('aria-hidden', 'false');
      } else {
        entry.phaseTimer.textContent = '';
        entry.phaseTimer.style.display = 'none';
        entry.phaseTimer.setAttribute('aria-hidden', 'true');
      }
    }

    if (entry.enrageTimer) {
      if (enrageTimerText) {
        entry.enrageTimer.textContent = enrageTimerText;
        entry.enrageTimer.style.display = '';
        entry.enrageTimer.setAttribute('aria-hidden', 'false');
      } else {
        entry.enrageTimer.textContent = '';
        entry.enrageTimer.style.display = 'none';
        entry.enrageTimer.setAttribute('aria-hidden', 'true');
      }
    }

    if (entry.timers) {
      const timersVisible = Boolean(phaseTimerText || enrageTimerText);
      entry.timers.style.display = timersVisible ? '' : 'none';
      entry.timers.setAttribute(
        'aria-hidden',
        timersVisible ? 'false' : 'true'
      );
    }

    cached.phaseTimerSeconds = phaseSeconds;
    cached.phaseTimerText = phaseTimerText;
    cached.enrageTimerSeconds = enrageSeconds;
    cached.enrageTimerText = enrageTimerText;
  }

  showBossBanner(type = 'incoming', state = {}, options = {}) {
    const entry = this.hudElements.get('boss');
    if (!entry?.banner || !entry.bannerText) {
      return;
    }

    if (!this.cachedValues.boss) {
      this.cachedValues.boss = this.createInitialBossCachedValues();
    }

    if (this.bossBannerTimeout) {
      window.clearTimeout(this.bossBannerTimeout);
      this.bossBannerTimeout = null;
    }

    const bossName = state?.name || 'Boss';
    const waveNumber = Number.isFinite(state?.wave)
      ? Math.max(1, Math.floor(state.wave))
      : null;

    let text = options?.text;
    if (!text) {
      const prefix = waveNumber ? `Wave ${waveNumber} - ` : '';
      if (type === 'defeated') {
        text = `${prefix}${bossName} defeated!`;
      } else {
        text = `${prefix}${bossName} incoming!`;
      }
    }

    if (!text) {
      return;
    }

    entry.bannerText.textContent = text;
    entry.banner.dataset.bannerType = type;
    entry.banner.classList.add('is-visible');
    entry.banner.setAttribute('aria-hidden', 'false');

    const duration = Number.isFinite(options?.duration)
      ? Math.max(0, options.duration)
      : 4500;

    if (duration > 0) {
      this.bossBannerTimeout = window.setTimeout(() => {
        this.hideBossBanner();
      }, duration);
    }

    this.cachedValues.boss.bannerType = type;
  }

  hideBossBanner(force = false) {
    const entry = this.hudElements.get('boss');
    if (!entry?.banner) {
      if (this.bossBannerTimeout) {
        window.clearTimeout(this.bossBannerTimeout);
        this.bossBannerTimeout = null;
      }
      return;
    }

    if (!force && !entry.banner.classList.contains('is-visible')) {
      return;
    }

    entry.banner.classList.remove('is-visible');
    entry.banner.setAttribute('aria-hidden', 'true');
    entry.banner.removeAttribute('data-banner-type');
    if (entry.bannerText) {
      entry.bannerText.textContent = '';
    }

    if (this.bossBannerTimeout) {
      window.clearTimeout(this.bossBannerTimeout);
      this.bossBannerTimeout = null;
    }

    if (this.cachedValues.boss) {
      this.cachedValues.boss.bannerType = null;
    }
  }

  renderBossHud(force = false) {
    const state = this.getBossHudState();
    const shouldDisplay = Boolean(
      state.active || state.upcoming || state.defeated
    );

    if (!shouldDisplay) {
      this.hideBossHealthBar(force);
      return;
    }

    if (!this.cachedValues.boss?.visible) {
      this.showBossHealthBar(state, { skipUpdate: true });
      force = true;
    }

    this.updateBossHealthBar(state, { force });
  }

  handleWaveCompletionEvent(payload = {}, sourceEvent = 'wave-complete') {
    if (!this._waveCompletionEventCache) {
      this._waveCompletionEventCache = new Map();
    }

    const canonicalEvent = 'wave-complete';
    const waveNumberCandidate = Number(payload?.wave);
    const hasWaveNumber = Number.isFinite(waveNumberCandidate);
    const normalizedWaveNumber = hasWaveNumber
      ? Math.max(1, Math.floor(waveNumberCandidate))
      : null;
    const cacheKey = hasWaveNumber
      ? waveNumberCandidate
      : `unknown:${sourceEvent}`;
    const previousEntry = this._waveCompletionEventCache.get(cacheKey);

    if (previousEntry) {
      if (
        previousEntry.source === canonicalEvent &&
        sourceEvent !== canonicalEvent
      ) {
        return;
      }

      if (previousEntry.source === sourceEvent) {
        return;
      }

      if (sourceEvent !== canonicalEvent) {
        return;
      }
    }

    this._waveCompletionEventCache.set(cacheKey, {
      source: sourceEvent,
      timestamp: Date.now(),
    });

    const bossInterval = Number(WAVE_BOSS_INTERVAL) || 0;
    const isBossWaveCompletion =
      Boolean(payload?.isBossWave) ||
      (bossInterval > 0 && normalizedWaveNumber !== null
        ? normalizedWaveNumber % bossInterval === 0
        : false);

    if (isBossWaveCompletion) {
      const state = this.getBossHudState();
      const bossVisible = Boolean(this.cachedValues.boss?.visible);
      const bossNeverSpawned =
        !state.active && !state.defeated && (state.upcoming || bossVisible);

      if (bossNeverSpawned) {
        this.hideBossHud(true);
        this.resetBossHudState();
        return;
      }
    }

    this.handleBossWaveCompletion(payload);
  }

  handleBossWaveCompletion(payload = {}) {
    const state = this.getBossHudState();

    if (state.active || state.upcoming) {
      return;
    }

    const hasBossContext =
      this.cachedValues.boss?.visible ||
      state.defeated ||
      state.bossId !== null;

    if (!hasBossContext) {
      return;
    }

    this.resetBossHudState();
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

        this.eventBus?.emit?.('exit-to-menu-requested', {
          source: 'pause-menu',
        });
      });
    }
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
            '.menu-screen__button, .btn, .settings-tab-button, [role="button"]'
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
    this.refreshTacticalDomRefs();

    if (
      typeof lucide !== 'undefined' &&
      typeof lucide.createIcons === 'function'
    ) {
      lucide.createIcons();
    }
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
    const isAAATactical = resolvedId === HUD_LAYOUT_IDS.AAA_TACTICAL;

    if (!force && resolvedId === this.currentHudLayoutId) {
      this.updateHudLayoutClass(resolvedId);
      if (isAAATactical && !this.aaaTacticalHud) {
        this.activateAAATacticalHud(definition);
      }
      return;
    }

    this.currentHudLayoutId = resolvedId;
    this.updateHudLayoutClass(resolvedId);

    if (isAAATactical) {
      this.activateAAATacticalHud(definition);
      this.updateAAATacticalHudFromServices({ force: true });
      return;
    }

    this.deactivateAAATacticalHud();

    this.hudLayout = getHudLayoutItems(resolvedId);
    this.hudGroups.clear();
    this.setupHudLayout();
    this.refreshHudFromServices(true);
    this.renderBossHud(true);
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
  }

  deactivateAAATacticalHud() {
    if (
      this.aaaTacticalHud &&
      typeof this.aaaTacticalHud.unmount === 'function'
    ) {
      this.aaaTacticalHud.unmount();
    }

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

    const playerVelocity =
      player && typeof player.getVelocity === 'function'
        ? player.getVelocity()
        : player?.velocity && typeof player.velocity === 'object'
          ? player.velocity
          : { vx: 0, vy: 0 };

    const velocityX = Number(playerVelocity.vx ?? playerVelocity.x ?? 0) || 0;
    const velocityY = Number(playerVelocity.vy ?? playerVelocity.y ?? 0) || 0;
    const speed = Math.hypot(velocityX, velocityY);

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
      hud.updateTelemetry(
        Number(playerPosition.x ?? 0) || 0,
        Number(playerPosition.y ?? 0) || 0,
        speed
      );
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
      hud.updateStats(null, undefined, comboCount);
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
      const radarRange = Math.max(1, Number(pluginConfig.radarRange) || 1500);

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

        const isBoss =
          enemy?.type === 'boss' ||
          (typeof enemy?.hasTag === 'function' && enemy.hasTag('boss')) ||
          (enemy?.tags && typeof enemy.tags.has === 'function'
            ? enemy.tags.has('boss')
            : false);

        const dx = enemyX - originX;
        const dy = enemyY - originY;
        const distance = Math.hypot(dx, dy);
        if (!Number.isFinite(distance) || distance > radarRange) {
          continue;
        }

        blips.push({
          x: dx / radarRange,
          y: dy / radarRange,
          type: isBoss ? 'boss' : 'enemy',
        });
      }

      hud.updateRadar(blips);
    }

    const bossState = this.getBossHudState();
    const cachedBossVisible = Boolean(this.cachedValues.boss?.visible);
    const bossActive =
      cachedBossVisible ||
      Boolean(bossState.active) ||
      Boolean(bossState.upcoming);

    if (!bossActive) {
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

    if (config.type === 'boss' || config.layout === 'boss') {
      return this.createBossHudItem(config);
    }

    if (config.layout && config.layout.startsWith('aaa-')) {
      return this.createAAAHudItem(config);
    }

    if (config.layout === 'custom') {
      root.classList.add('hud-item--custom');

      if (iconElement) {
        iconElement.classList.add('hud-item__icon');
        root.appendChild(iconElement);
      }

      if (leadingElement) {
        root.appendChild(leadingElement);
      }

      const customWrapper = document.createElement('div');
      customWrapper.classList.add('hud-item__custom');

      const customElement = this.createCustomElement(config.custom);
      if (customElement) {
        customWrapper.appendChild(customElement);
      }

      if (metaElement && metaPosition === 'before') {
        metaElement.classList.add('hud-custom__meta');
        root.appendChild(metaElement);
      }

      root.appendChild(customWrapper);

      if (metaElement && metaPosition !== 'before') {
        metaElement.classList.add('hud-custom__meta');
        customWrapper.appendChild(metaElement);
      }

      return {
        key: config.key,
        config,
        root,
        custom: customElement,
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

  createCustomElement(customConfig) {
    if (!customConfig || typeof document === 'undefined') {
      return null;
    }

    const elementName =
      typeof customConfig.element === 'string' &&
      customConfig.element.trim().length > 0
        ? customConfig.element.trim().toLowerCase()
        : 'div';

    let element = null;
    try {
      if (elementName === 'canvas') {
        element = document.createElement('canvas');
      } else {
        element = document.createElement(elementName);
      }
    } catch (error) {
      console.warn('[UISystem] Failed to create custom HUD element:', error);
      element = document.createElement('div');
    }

    if (customConfig.id) {
      element.id = customConfig.id;
    }

    if (Array.isArray(customConfig.classes)) {
      customConfig.classes.forEach((className) => {
        if (className) {
          element.classList.add(className);
        }
      });
    }

    if (customConfig.textContent !== undefined) {
      element.textContent = `${customConfig.textContent}`;
    } else if (customConfig.initialValue !== undefined) {
      element.textContent = `${customConfig.initialValue}`;
    }

    const isCanvasElement =
      typeof HTMLCanvasElement !== 'undefined' &&
      element instanceof HTMLCanvasElement;

    if (isCanvasElement) {
      if (Number.isFinite(customConfig.width)) {
        element.width = Math.max(1, Math.floor(customConfig.width));
      }
      if (Number.isFinite(customConfig.height)) {
        element.height = Math.max(1, Math.floor(customConfig.height));
      }
    }

    if (customConfig.dataset && typeof customConfig.dataset === 'object') {
      Object.entries(customConfig.dataset).forEach(([key, value]) => {
        if (key) {
          element.dataset[key] = `${value}`;
        }
      });
    }

    if (
      customConfig.attributes &&
      typeof customConfig.attributes === 'object'
    ) {
      Object.entries(customConfig.attributes).forEach(([key, value]) => {
        if (key) {
          element.setAttribute(key, `${value}`);
        }
      });
    }

    return element;
  }

  createBossHudItem(config = {}) {
    const root = document.createElement('div');
    root.classList.add('hud-item', 'hud-item--boss', 'is-hidden');
    root.dataset.hudKey = config.key || 'boss';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-hidden', 'true');

    if (config.rootId) {
      root.id = config.rootId;
    }

    const banner = document.createElement('div');
    banner.classList.add('boss-hud__banner');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'assertive');
    banner.setAttribute('aria-hidden', 'true');

    const bannerText = document.createElement('span');
    bannerText.classList.add('boss-hud__banner-text');
    banner.appendChild(bannerText);
    root.appendChild(banner);

    const header = document.createElement('div');
    header.classList.add('boss-hud__header');
    root.appendChild(header);

    const label = document.createElement('span');
    label.classList.add('boss-hud__label');
    label.textContent = config.label || 'BOSS';
    header.appendChild(label);

    const name = document.createElement('span');
    name.classList.add('boss-hud__name');
    name.textContent = config.initialName || '---';
    header.appendChild(name);

    const phase = document.createElement('span');
    phase.classList.add('boss-hud__phase');
    header.appendChild(phase);

    const status = document.createElement('span');
    status.classList.add('boss-hud__status');
    header.appendChild(status);

    const barWrapper = document.createElement('div');
    barWrapper.classList.add('boss-hud__bar');
    root.appendChild(barWrapper);

    const barTrack = document.createElement('div');
    barTrack.classList.add('boss-hud__bar-track');
    barTrack.setAttribute('role', 'progressbar');
    barTrack.setAttribute('aria-valuemin', '0');
    barTrack.setAttribute('aria-valuemax', '100');
    barTrack.setAttribute('aria-valuenow', '0');
    barWrapper.appendChild(barTrack);

    const barFill = document.createElement('div');
    barFill.classList.add('boss-hud__bar-fill');
    barTrack.appendChild(barFill);

    const healthValue = document.createElement('span');
    healthValue.classList.add('boss-hud__health');
    healthValue.textContent = config.initialValue ?? '--';
    barWrapper.appendChild(healthValue);

    const timers = document.createElement('div');
    timers.classList.add('boss-hud__timers');
    root.appendChild(timers);

    const phaseTimer = document.createElement('span');
    phaseTimer.classList.add('boss-hud__timer', 'boss-hud__timer--phase');
    timers.appendChild(phaseTimer);

    const enrageTimer = document.createElement('span');
    enrageTimer.classList.add('boss-hud__timer', 'boss-hud__timer--enrage');
    timers.appendChild(enrageTimer);

    return {
      key: config.key || 'boss',
      config,
      root,
      banner,
      bannerText,
      header,
      label,
      name,
      phase,
      status,
      bar: barTrack,
      barFill,
      health: healthValue,
      timers,
      phaseTimer,
      enrageTimer,
    };
  }

  createAAAHudItem(config) {
    const root = document.createElement('div');
    root.classList.add('hud-item', `hud-item--${config.key}`);
    root.dataset.hudKey = config.key;

    if (config.rootId) root.id = config.rootId;

    // --- AAA STAT BLOCK ---
    if (config.layout === 'aaa-stat') {
      const block = document.createElement('div');
      block.className = 'stat-block';

      const label = document.createElement('div');
      label.className = 'stat-label';

      // Icon
      if (config.icon) {
        if (config.icon.type === 'lucide') {
          const i = document.createElement('i');
          i.dataset.lucide = config.icon.value;
          i.setAttribute('size', '14');
          label.appendChild(i);
        }
      }
      label.appendChild(
        document.createTextNode(
          ' ' + (config.label || config.key.toUpperCase())
        )
      );

      const value = document.createElement('div');
      value.className = 'stat-value';
      if (config.valueId) value.id = config.valueId;
      value.textContent = config.initialValue || '--';

      block.appendChild(label);
      block.appendChild(value);
      root.appendChild(block);

      return { key: config.key, config, root, value };
    }

    // --- AAA STATS WIDGET (Composite Time & Kills) ---
    if (config.layout === 'aaa-stats-widget') {
      const container = document.createElement('div');
      container.className = 'stats-grid';

      // 1. Time Block
      const timeBlock = document.createElement('div');
      timeBlock.className = 'stat-block';
      timeBlock.innerHTML = `
        <div class="stat-label"><i data-lucide="clock" size="14"></i> TIME</div>
      `;
      const timeVal = document.createElement('div');
      timeVal.className = 'stat-value';
      timeVal.id = 'timer'; // Match mockup ID
      timeVal.textContent = '00:00:00';
      timeBlock.appendChild(timeVal);

      // 2. Kills Block
      const killsBlock = document.createElement('div');
      killsBlock.className = 'stat-block';
      killsBlock.innerHTML = `
        <div class="stat-label"><i data-lucide="crosshair" size="14"></i> KILLS</div>
      `;
      const killsVal = document.createElement('div');
      killsVal.className = 'stat-value';
      killsVal.textContent = '0';
      killsBlock.appendChild(killsVal);

      container.appendChild(timeBlock);
      container.appendChild(killsBlock);
      root.appendChild(container);

      // Manual Bindings
      this.hudElements.set('time', {
        key: 'time',
        config: { ...config, key: 'time' },
        root,
        value: timeVal,
      });

      this.hudElements.set('kills', {
        key: 'kills',
        config: { ...config, key: 'kills' },
        root,
        value: killsVal,
      });

      return { key: config.key, config, root };
    }

    // --- AAA COMBO ---
    if (config.layout === 'aaa-combo') {
      const box = document.createElement('div');
      box.className = 'combo-box';

      const label = document.createElement('div');
      label.className = 'combo-label';
      label.textContent = 'COMBO';

      const val = document.createElement('div');
      val.className = 'combo-val';
      if (config.valueId) val.id = config.valueId;
      val.textContent = config.initialValue || 'x0';

      box.appendChild(label);
      box.appendChild(val);
      root.appendChild(box);

      return { key: config.key, config, root, value: val };
    }

    // --- AAA BOSS ---
    if (config.layout === 'aaa-boss') {
      const container = document.createElement('div');
      container.className = 'boss-bar-container';

      // Skull
      const skull = document.createElement('div');
      skull.className = 'boss-skull';
      // Simple skull ASCII or SVG? Mockup had SVG or just styled div?
      // Mockup had complex clip-path polygon. CSS handles it.
      const skullIcon = document.createElement('i');
      skullIcon.dataset.lucide = 'skull'; // Use Lucide skull
      skullIcon.setAttribute('size', '24');
      skull.appendChild(skullIcon);

      // Fill
      const fill = document.createElement('div');
      fill.className = 'boss-fill';
      // Provide ref for width update

      // Name
      const name = document.createElement('div');
      name.className = 'boss-name';
      name.textContent = '---';

      // Warning Strip (above container)
      const warning = document.createElement('div');
      warning.className = 'warning-strip';
      warning.innerHTML = `
        <span class="warning-light"><i data-lucide="alert-triangle" size="16"></i> WARNING</span>
        <span class="warning-light">WARNING <i data-lucide="alert-triangle" size="16"></i></span>
      `;
      root.appendChild(warning);

      container.appendChild(skull);
      container.appendChild(fill);
      container.appendChild(name);
      root.appendChild(container);

      return {
        key: config.key,
        config,
        root,
        barFill: fill,
        name: name,
        // Map other standard boss refs to null or mocks to avoid errors
        bar: null,
        health: null,
        phase: null,
        status: null,
      };
    }

    // --- AAA RADAR ---
    if (config.layout === 'aaa-radar') {
      // Wrapper matches .radar-structure
      const structure = document.createElement('div');
      structure.className = 'radar-structure';
      if (config.custom && config.custom.id) structure.id = config.custom.id;

      // 1. Bottom SVG Layer (Compass/Background)
      const svgLayer = document.createElement('div');
      svgLayer.className = 'radar-svg-layer';
      svgLayer.innerHTML = `
        <svg viewBox="0 0 200 200" style="width:100%; height:100%;">
          <circle cx="100" cy="100" r="98" fill="none" stroke="var(--secondary-blue)" stroke-width="2" stroke-dasharray="30 15 5 15" opacity="0.6" />
          <circle cx="100" cy="100" r="92" fill="none" stroke="var(--primary-cyan)" stroke-width="1" opacity="0.2" />
          <polygon points="100,10 177.9,55 177.9,145 100,190 22.1,145 22.1,55" fill="rgba(0, 10, 20, 0.7)" stroke="var(--primary-cyan)" stroke-width="1.5" />
        </svg>
      `;

      // 2. Internal Mask (DOM Blips)
      const mask = document.createElement('div');
      mask.className = 'radar-internal-mask';

      // Sweep Animation (inside mask)
      const sweep = document.createElement('div');
      sweep.className = 'radar-sweep';
      mask.appendChild(sweep);

      // 3. Top Grid SVG (Overlay)
      const grid = document.createElement('div');
      grid.className = 'radar-grid-svg';
      grid.innerHTML = `
        <svg viewBox="0 0 200 200" style="width:100%; height:100%;">
          <line x1="100" y1="10" x2="100" y2="190" stroke="var(--secondary-blue)" stroke-width="1" />
          <line x1="22.1" y1="55" x2="177.9" y2="145" stroke="var(--secondary-blue)" stroke-width="1" />
          <line x1="177.9" y1="55" x2="22.1" y2="145" stroke="var(--secondary-blue)" stroke-width="1" />
          <polygon points="100,40 151.9,70 151.9,130 100,160 48.1,130 48.1,70" fill="none" stroke="var(--secondary-blue)" stroke-width="1" opacity="0.5" />
          <circle cx="100" cy="100" r="10" fill="var(--primary-cyan)" opacity="0.3" />
        </svg>
      `;

      // 4. Blip Container
      const blipContainer = document.createElement('div');
      blipContainer.className = 'blip-container';
      blipContainer.id = 'ui-radar-blips';
      // Initialize with player blip
      blipContainer.innerHTML = '<div class="blip player"></div>';

      // Assemble
      structure.appendChild(svgLayer);
      structure.appendChild(mask);
      structure.appendChild(grid);
      structure.appendChild(blipContainer);

      root.appendChild(structure);

      return { key: config.key, config, root };
    }

    // --- AAA STATUS WIDGET (Unified Health & Shield) ---
    if (config.layout === 'aaa-status-widget') {
      // 1. Locked Msg (Top)
      const locked = document.createElement('div');
      locked.className = 'locked-msg glitch-text';
      locked.innerHTML = `
        <div style="color: var(--secondary-blue)"><i data-lucide="lock" size="24"></i></div>
        <div>
          <div style="font-size: 0.6rem; color: #88ccff; letter-spacing: 1px">WEAPON SYSTEM</div>
          <div style="font-weight: bold; color: #fff">LOCKED // LVL 5 REQ</div>
        </div>
      `;
      root.appendChild(locked);

      // 2. Shield Label
      const shieldLabel = document.createElement('span');
      shieldLabel.className = 'shield-label';
      shieldLabel.textContent = '❖ SHIELDS';
      root.appendChild(shieldLabel);

      // 3. Bars Container (Skewed Wrapper)
      const barsContainer = document.createElement('div');
      barsContainer.className = 'bars-container';

      // --- SHIELD ROW (Top Row) ---
      const shieldRow = document.createElement('div');
      shieldRow.className = 'health-bar-row shield';
      shieldRow.id = 'shield-row'; // Match mockup ID for reference logic
      const shieldSegments = [];
      for (let i = 0; i < 20; i++) {
        const seg = document.createElement('div');
        seg.className = 'bar-segment filled';
        shieldRow.appendChild(seg);
        shieldSegments.push(seg);
      }
      barsContainer.appendChild(shieldRow);

      // --- HULL ROW (Bottom Row) ---
      const hullRow = document.createElement('div');
      hullRow.className = 'health-bar-row';
      hullRow.id = 'hp-row';
      const hullSegments = [];
      for (let i = 0; i < 20; i++) {
        const seg = document.createElement('div');
        seg.className = 'bar-segment filled';
        hullRow.appendChild(seg);
        hullSegments.push(seg);
      }
      barsContainer.appendChild(hullRow);

      // --- Hull Text & Integrity Label (Inside Container) ---
      const hullText = document.createElement('div');
      hullText.className = 'health-text';
      hullText.id = 'hp-text';
      hullText.textContent = '100%';
      barsContainer.appendChild(hullText);

      const integrity = document.createElement('div');
      integrity.style.cssText = `
         color: var(--health-green);
         font-weight: bold;
         margin-top: 5px;
         transform: skewX(-15deg);
         margin-left: 5px;
      `;
      integrity.innerHTML = `
         <i data-lucide="heart" size="12" style="fill: var(--health-green); display: inline-block;"></i> HULL INTEGRITY
      `;
      barsContainer.appendChild(integrity);

      root.appendChild(barsContainer);

      // --- MANUAL REGISTRATION FOR UI UPDATES ---
      // We manually populate the map for 'health' and 'shield' so existing logic finds them.
      // This item itself returns a dummy or the container, but we inject the real data bindings.
      this.hudElements.set('health', {
        key: 'health',
        config: { ...config, key: 'health' }, // Mock config
        root,
        value: hullText,
        segments: hullSegments,
      });

      this.hudElements.set('shield', {
        key: 'shield',
        config: { ...config, key: 'shield' }, // Mock config
        root,
        value: null, // Shield usually doesn't have text val in standard logic, or if it does we add it. Mockup has label.
        segments: shieldSegments,
      });

      // Return the widget itself as the 'statusWidget' item
      return { key: config.key, config, root };
    }

    // --- AAA XP BAR ---
    if (config.layout === 'aaa-xp-bar') {
      const container = document.createElement('div');
      container.className = 'xp-bar-container';

      const fill = document.createElement('div');
      fill.className = 'xp-fill';
      fill.style.width = '0%';
      if (config.valueId) fill.id = config.valueId; // Potentially used for text? No, logic sets style.width on fill?
      // Wait, standard logic sets text on valueId. We need a separate ref for width.
      // XP logic updates `updateXPBar` sets style.width on something?
      // UISystem's updateXPBar needs to be checked.

      const label = document.createElement('div');
      label.className = 'xp-label';
      label.textContent = ' XP GAIN';
      const zap = document.createElement('i');
      zap.dataset.lucide = 'zap';
      zap.setAttribute('size', '12');
      zap.setAttribute('fill', '#ddaaff');
      label.prepend(zap);

      container.appendChild(fill);
      container.appendChild(label);
      root.appendChild(container);

      return {
        key: config.key,
        config,
        root,
        barFill: fill,
        label,
        bar: container,
        value: label,
      };
    }

    // --- AAA WAVE CIRCLE ---
    if (config.layout === 'aaa-wave-circle') {
      const indicator = document.createElement('div');
      indicator.className = 'wave-indicator';

      const content = document.createElement('div');
      content.className = 'wave-content';

      const num = document.createElement('div');
      num.className = 'wave-num';
      if (config.valueId) num.id = config.valueId;
      num.textContent = config.initialValue || '0';

      const label = document.createElement('div');
      label.className = 'wave-label';
      label.textContent = 'WAVE';

      content.appendChild(label); // WAVE label first (top)
      content.appendChild(num); // Number second (bottom)
      indicator.appendChild(content);
      root.appendChild(indicator);

      return { key: config.key, config, root, value: num };
    }

    // --- AAA NAV BLOCK ---
    if (config.layout === 'aaa-nav-block') {
      const block = document.createElement('div');
      block.className = 'nav-block';

      const label = document.createElement('div');
      label.className = 'nav-label';
      label.innerHTML = `NAV SYSTEMS <i data-lucide="compass" size="14"></i>`;

      const data = document.createElement('div');
      data.className = 'micro-data';
      // Mocked coords or empty spans to be filled? Mock for visual fidelity.
      data.innerHTML = `
        COORD: <span class="data-val">451.21</span> / <span class="data-val">-89.02</span><br>
        VELOCITY: <span class="data-val">2450</span> km/h
      `;

      block.appendChild(label);
      block.appendChild(data);
      root.appendChild(block);

      return { key: config.key, config, root };
    }

    return this.createHudItem({ ...config, layout: 'default' }); // Fallback
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

  refreshTacticalDomRefs() {
    const minimapRefs = this.domRefs.minimap || {};
    const canvas = document.getElementById('minimap-canvas');
    const context =
      canvas && typeof canvas.getContext === 'function'
        ? canvas.getContext('2d')
        : null;

    const blipContainer = document.getElementById('ui-radar-blips');
    const rangeElement = document.getElementById('minimap-range');
    const container = document.getElementById('hud-minimap');

    this.domRefs.minimap = {
      ...minimapRefs,
      container: container || null,
      canvas: canvas || null,
      blipContainer: blipContainer || null,
      range: rangeElement || null,
      context,
    };

    const threatContainer = document.getElementById(
      'threat-indicators-container'
    );
    const threatOverlay = document.getElementById('threat-indicators-overlay');

    this.domRefs.threatIndicators = {
      container: threatContainer || null,
      overlay: threatOverlay || threatContainer || null,
    };

    const comboContainer = document.getElementById('hud-combo');
    const comboValue = document.getElementById('combo-display');
    const comboMultiplier = document.getElementById('combo-multiplier');

    this.domRefs.combo = {
      container: comboContainer || null,
      value: comboValue || null,
      multiplier: comboMultiplier || null,
    };

    // Update tactical readiness flag: tactical HUD is ready when minimap context is valid OR blip container is ready
    this.tacticalState.isReady =
      !!((canvas && context) || blipContainer) && !!container;
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

    this.registerEventListener('player-reset', () => {
      this.resetBossHudState();
      this.resetTacticalHud();
    });

    this.registerEventListener('progression-reset', () => {
      this.resetBossHudState();
      this.resetTacticalHud();
      if (this._waveCompletionEventCache) {
        this._waveCompletionEventCache.clear();
      }
    });

    this.registerEventListener('wave-started', (payload = {}) => {
      if (payload?.isBossWave) {
        return;
      }

      const state = this.getBossHudState();
      if (!state) {
        return;
      }

      if (state.active || state.upcoming) {
        this.hideBossHud(true);
        this.resetBossHudState();
      }
    });

    this.registerEventListener('experience-changed', (data) => {
      this.updateXPBar(data);
    });

    this.registerEventListener('player-health-changed', (data) => {
      this.handleHealthChange(data);
    });

    this.registerEventListener('player-leveled-up', (data) => {
      this.updateLevelDisplay(data?.newLevel, { force: true });
    });

    this.registerEventListener('upgrade-options-ready', (payload = {}) => {
      this.handleUpgradeOptions(payload);
    });

    this.registerEventListener('player-died', (data) => {
      // Delay game over screen to show epic ship explosion
      // Explosion has: 0.35s freeze + 0.8s shockwave + particles flying for ~2s
      setTimeout(() => {
        this.showGameOverScreen(data);
      }, 3000); // 3s delay to fully enjoy the spectacle!
      this.handleComboBroken({ silent: true });
    });

    this.registerEventListener('player-took-damage', () => {
      this.flashHealthDisplay();
    });

    this.registerEventListener('pause-state-changed', (data) => {
      this.updatePauseScreen(Boolean(data?.isPaused));
    });

    this.registerEventListener('toggle-pause', () => {
      const appState = this.getService('game-state');
      if (appState && typeof appState.isPaused === 'function') {
        this.updatePauseScreen(Boolean(appState.isPaused()));
      }
    });

    this.registerEventListener('shield-activation-failed', () => {
      this.flashShieldFailure();
    });

    this.registerEventListener('shield-stats-changed', (shieldState) => {
      this.updateShieldIndicator(shieldState);
    });

    this.registerEventListener('wave-state-updated', (payload) => {
      this.handleWaveStateUpdated(payload);
    });

    const registerWaveCompletionListener = (eventName) => {
      this.registerEventListener(eventName, (payload = {}) => {
        this.handleWaveCompletionEvent(payload, eventName);
      });
    };

    registerWaveCompletionListener('wave-complete');
    registerWaveCompletionListener('wave-completed');

    this.registerEventListener('combo-updated', (payload = {}) => {
      this.updateComboMeter(payload);
    });

    this.registerEventListener('combo-broken', (payload = {}) => {
      this.handleComboBroken(payload);
    });

    this.registerEventListener('ui-show-screen', (payload = {}) => {
      if (payload?.screen) {
        this.showScreen(payload.screen, payload.options || {});
      }
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

    const layoutPreference =
      (typeof derived?.hudLayout === 'string' && derived.hudLayout) ||
      (typeof values.hudLayout === 'string' && values.hudLayout) ||
      this.currentHudLayoutId ||
      DEFAULT_HUD_LAYOUT_ID;

    this.applyHudLayoutPreference(layoutPreference);
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
    const hudLayout =
      typeof video.hudLayout === 'string' && video.hudLayout
        ? video.hudLayout
        : DEFAULT_HUD_LAYOUT_ID;
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
      hudLayout,
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
        return `Button ${value.split(':')[1]}`;
      }
      if (value.startsWith('axis:')) {
        const [, index, direction] = value.split(':');
        const symbol =
          direction === 'negative' || direction === '-' ? '−' : '+';
        return `Axis ${index} ${symbol}`;
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

      if (typeof progression.getComboState === 'function') {
        this.updateComboMeter(progression.getComboState(), { force });
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
    if (this.aaaTacticalHud) {
      this.updateAAATacticalHudFromServices({ force: false });
      return;
    }

    this.refreshHudFromServices(false);
    this.renderBossHud();
  }

  resetTacticalHud() {
    this.resetComboMeter({ silent: true });
  }

  resetComboMeter(options = {}) {
    const silent = Boolean(options?.silent);
    this.updateComboMeter(
      { comboCount: 0, multiplier: 1 },
      { force: true, silent, reset: true }
    );
  }

  updateComboMeter(comboData = {}, options = {}) {
    if (!this.cachedValues.combo) {
      this.cachedValues.combo = {
        count: 0,
        multiplier: 1,
        valueText: '0 Hits',
        multiplierText: 'x1.0',
        active: false,
        high: false,
      };
    }

    const entry = this.hudElements.get('comboMeter');
    const refs = this.domRefs.combo || {};

    const container = refs.container || entry?.root || null;
    const valueNode = refs.value || entry?.value || null;
    const multiplierNode = refs.multiplier || entry?.meta || null;

    const force = Boolean(options.force);
    const rawCount =
      comboData.comboCount ??
      comboData.count ??
      comboData.value ??
      comboData.current ??
      0;
    const rawMultiplier =
      comboData.multiplier ??
      comboData.comboMultiplier ??
      comboData.multiplierValue ??
      1;

    const count = Number.isFinite(rawCount)
      ? Math.max(0, Math.floor(rawCount))
      : 0;
    const multiplier = Number.isFinite(rawMultiplier)
      ? Math.max(1, Number(rawMultiplier))
      : 1;
    const isActive = count > 0;
    const isHigh = count >= 5;

    const hitsLabel = count === 1 ? 'Hit' : 'Hits';
    const valueText = isActive ? `${count} ${hitsLabel}` : '0 Hits';
    const multiplierText = `x${multiplier.toFixed(1)}`;

    if (
      valueNode &&
      (force || this.cachedValues.combo.valueText !== valueText)
    ) {
      valueNode.textContent = valueText;
      this.cachedValues.combo.valueText = valueText;
    }

    if (
      multiplierNode &&
      (force || this.cachedValues.combo.multiplierText !== multiplierText)
    ) {
      multiplierNode.textContent = multiplierText;
      this.cachedValues.combo.multiplierText = multiplierText;
    }

    if (container) {
      container.classList.toggle('combo-active', isActive);
      container.classList.toggle('combo-high', isHigh);
      if (!options.broken) {
        container.classList.remove('combo-broken');
      }

      if (
        !options.silent &&
        isActive &&
        count !== this.cachedValues.combo.count
      ) {
        container.classList.remove('combo-pulse');
        void container.offsetWidth; // restart animation
        container.classList.add('combo-pulse');
      }
    }

    // AAA Combo specific update
    if (entry && entry.config && entry.config.layout === 'aaa-combo') {
      if (entry.value) {
        entry.value.textContent = `x${multiplier.toFixed(1)}`;
      }
      // AAA mockup doesn't explicitly show hit count, only multiplier.
    }

    this.cachedValues.combo.count = count;
    this.cachedValues.combo.multiplier = multiplier;
    this.cachedValues.combo.active = isActive;
    this.cachedValues.combo.high = isHigh;
  }

  handleComboBroken(payload = {}) {
    const silent = Boolean(payload?.silent);
    const nextCount = Number.isFinite(payload?.comboCount)
      ? payload.comboCount
      : 0;
    const nextMultiplier = Number.isFinite(payload?.multiplier)
      ? payload.multiplier
      : 1;

    this.updateComboMeter(
      { comboCount: nextCount, multiplier: nextMultiplier },
      { force: true, broken: !silent, silent }
    );

    const container =
      this.domRefs.combo?.container || this.hudElements.get('comboMeter')?.root;
    if (!container) {
      return;
    }

    container.classList.remove('combo-pulse');

    if (this.comboBreakTimeout && typeof window !== 'undefined') {
      window.clearTimeout(this.comboBreakTimeout);
      this.comboBreakTimeout = null;
    }

    if (silent || typeof window === 'undefined') {
      container.classList.remove('combo-broken');
      return;
    }

    container.classList.add('combo-broken');
    this.comboBreakTimeout = window.setTimeout(() => {
      container.classList.remove('combo-broken');
      this.comboBreakTimeout = null;
    }, 650);
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
    entry.root.classList.toggle('is-low-health', isLowHealth);
    entry.root.style.setProperty('--hud-health-ratio', ratio.toFixed(3));

    // AAA Segmented Bar Support
    if (Array.isArray(entry.segments)) {
      const totalSegments = entry.segments.length;
      const filledCount = Math.ceil((percentage / 100) * totalSegments);
      for (let i = 0; i < totalSegments; i++) {
        if (i < filledCount) {
          entry.segments[i].classList.add('filled');
          entry.segments[i].classList.remove('empty');
        } else {
          entry.segments[i].classList.remove('filled');
          entry.segments[i].classList.add('empty');
        }
      }
    }

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
    // Loose check to support layouts that might not have 'bar' but have 'barFill'
    if (!entry || (!entry.value && !entry.barFill)) {
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

    if (entry.bar) {
      entry.bar.setAttribute(
        'aria-valuenow',
        `${Math.round(percentage * 100)}`
      );
      const isMaxed = percentage >= 1;
      entry.bar.classList.toggle('is-maxed', isMaxed);
    }
    const isMaxed = percentage >= 1;
    if (entry.barFill) {
      entry.barFill.classList.toggle('is-maxed', isMaxed);
    }
    entry.root.classList.toggle('is-maxed', isMaxed);

    const cachedLevel = Number.isFinite(this.cachedValues.level)
      ? this.cachedValues.level
      : null;
    const levelFromData = Math.max(
      1,
      Math.floor(
        data.level ?? data.currentLevel ?? data.playerLevel ?? cachedLevel ?? 1
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
      // NOTE: `totalAsteroids` maintains legacy parity and represents the
      // asteroid-only total, even when the WaveManager tracks additional enemy
      // types for the same wave. Support/boss totals can be derived from
      // `managerTotals` when present without polluting the legacy HUD.
      totalAsteroids: Math.max(0, Math.floor(waveData.totalAsteroids ?? 0)),
      asteroidsKilled: Math.max(0, Math.floor(waveData.asteroidsKilled ?? 0)),
      isActive: Boolean(waveData.isActive ?? true),
      timeRemaining: Math.max(0, Number(waveData.timeRemaining ?? 0)),
      breakTimer: Math.max(0, Number(waveData.breakTimer ?? 0)),
    };

    const managerTotals = waveData?.managerTotals || null;
    const compatibilityMode = Boolean(waveData?.compatibilityMode);
    const managerAllEnemiesTotal = Number.isFinite(managerTotals?.all)
      ? Math.max(0, Math.floor(managerTotals.all))
      : null;
    const effectiveManagerTotal = compatibilityMode
      ? Math.max(0, normalized.totalAsteroids)
      : managerAllEnemiesTotal;

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
      lastWave.breakTimerSeconds !== breakSeconds ||
      lastWave.managerAllEnemiesTotal !== effectiveManagerTotal ||
      lastWave.compatibilityMode !== compatibilityMode;

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

    // AAA Wave Circle Support
    if (
      waveRefs.container &&
      waveRefs.container.classList.contains('wave-indicator')
    ) {
      // Calculate progress logic for circle
      const progress = normalized.totalAsteroids
        ? Math.min(1, normalized.asteroidsKilled / normalized.totalAsteroids)
        : normalized.isActive
          ? 0
          : 1;
      const percent = Math.round(progress * 100);
      waveRefs.container.style.setProperty('--wave-progress', `${percent}%`);
    }

    const inBreak = !normalized.isActive && breakSeconds > 0;
    const waveCompleted =
      !normalized.isActive &&
      breakSeconds === 0 &&
      normalized.totalAsteroids > 0;

    const justCompleted =
      waveCompleted &&
      (Boolean(lastWave?.isActive) ||
        (Number.isFinite(lastWave?.breakTimerSeconds) &&
          lastWave.breakTimerSeconds > 0));

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
      waveRefs.countdown.classList.toggle(
        'is-alert',
        breakSeconds > 0 && breakSeconds <= 5
      );
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
      waveRefs.container.classList.toggle(
        'hud-panel--wave-complete',
        waveCompleted
      );
    }

    waveRefs.container.classList.toggle(
      'is-alert',
      !normalized.isActive && breakSeconds > 0
    );

    if (justCompleted) {
      this.handleBossWaveCompletion({ wave: normalized.current });
    }

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
      managerAllEnemiesTotal: effectiveManagerTotal,
      compatibilityMode,
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
        ? 1 -
          Math.max(0, Math.min(1, state.cooldownTimer / state.cooldownDuration))
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

    // AAA Segmented Shield Support
    if (Array.isArray(entry.segments)) {
      const totalSegments = entry.segments.length;
      const filledCount = Math.ceil(hpRatio * totalSegments);
      for (let i = 0; i < totalSegments; i++) {
        // For shield, handle cooldown visual?
        // Maybe dim segments if cooldown?
        const seg = entry.segments[i];
        if (i < filledCount) {
          seg.classList.add('filled');
          seg.classList.remove('empty');
          if (state.isOnCooldown) seg.style.opacity = '0.5';
          else seg.style.opacity = '1';
        } else {
          seg.classList.remove('filled');
          seg.classList.add('empty');
        }
      }
    }

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
    const { overlay = false, show = true, emitEvent = true } = options;
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
