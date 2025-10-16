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
    this.comboPulseTimeout = null;
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
      boss: this.createInitialBossCachedValues(),
      combo: {
        count: null,
        multiplier: null,
        active: false,
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

    this.bossHudState = this.createInitialBossHudState();
    this.bossBannerTimeout = null;
    this.bossHideTimeout = null;

    this.tacticalState = {
      minimap: {
        canvas: null,
        context: null,
        width: 0,
        height: 0,
        range: 300,
        lastSignature: null,
      },
      threats: {
        container: null,
        indicators: new Map(),
        syntheticIds: new WeakMap(),
        syntheticSequence: 0,
        lastSignature: null,
      },
      combo: {
        count: 0,
        multiplier: 1,
        lastEvent: null,
      },
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
      combo: {
        root: document.getElementById('hud-combo') || null,
        value: document.getElementById('combo-display') || null,
        multiplier: document.getElementById('combo-multiplier') || null,
      },
      minimap: {
        root: document.getElementById('hud-minimap') || null,
        canvas: document.getElementById('minimap-canvas') || null,
        meta: document.getElementById('minimap-range') || null,
      },
      threats: {
        container:
          document.getElementById('threat-indicators-overlay') ||
          document.getElementById('threat-indicators-container') ||
          null,
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
      typeof performance !== 'undefined' && typeof performance.now === 'function'
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
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
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
      return includeSecondsSuffix ? `${remainingSeconds}s` : `${remainingSeconds.toString().padStart(2, '0')}s`;
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
    const previousBossId =
      this.cachedValues?.boss?.bossId ?? this.bossHudState?.bossId ?? null;
    if (previousBossId !== null && previousBossId !== undefined) {
      this.removeThreatIndicator(previousBossId);
    }

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
      phaseColors: Array.isArray(state.phaseColors) ? [...state.phaseColors] : [],
      timers: {
        phase: { ...(state.timers?.phase || {}) },
        enrage: { ...(state.timers?.enrage || {}) },
      },
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
        timerPatch.total ?? timerPatch.duration ?? timerPatch.max ?? timerPatch.timeTotal;
      if (totalValue !== undefined) {
        if (Number.isFinite(totalValue)) {
          timer.total = Math.max(0, Number(totalValue));
        } else if (totalValue === null) {
          timer.total = null;
        }
      }

      const remainingValue =
        timerPatch.remaining ?? timerPatch.timeRemaining ?? timerPatch.seconds ?? timerPatch.value;
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
        next.phase = Math.min(normalizedPhase, Math.max(0, next.phaseCount - 1));
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
        this.hideBossBanner(true);
        this.showBossHealthBar(state, { skipUpdate: true });
        this.updateBossHealthBar(state, { force: true });
        break;
      case 'boss-defeated':
        this.updateBossHealthBar(state, { force: true });
        this.showBossBanner('defeated', state, { duration: 6000 });
        if (patch?.bossId !== undefined && patch.bossId !== null) {
          this.removeThreatIndicator(patch.bossId);
        } else if (state?.bossId !== undefined && state.bossId !== null) {
          this.removeThreatIndicator(state.bossId);
        }
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
    const cached = this.cachedValues.boss || this.createInitialBossCachedValues();

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

    entry.root.classList.remove('is-active', 'is-upcoming', 'is-defeated', 'is-visible');
    entry.root.classList.add('is-hidden');
    entry.root.setAttribute('aria-hidden', 'true');

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
    const hasPayload = bossData && typeof bossData === 'object' && Object.keys(bossData).length > 0;
    const state = hasPayload ? bossData : this.getBossHudState();

    const shouldDisplay = Boolean(state.active || state.upcoming || state.defeated);
    if (!shouldDisplay) {
      this.hideBossHealthBar(force);
      return;
    }

    this.showBossHealthBar();

    const normalizedPhaseColors = this.normalizeBossPhaseColors(state.phaseColors);
    const phaseCount = Number.isFinite(state.phaseCount)
      ? Math.max(0, Math.floor(state.phaseCount))
      : 0;
    const phaseIndex = Number.isFinite(state.phase) ? Math.max(0, Math.floor(state.phase)) : null;

    let color =
      typeof state.color === 'string' && state.color.trim().length > 0
        ? state.color.trim()
        : '#ff6b6b';

    if (normalizedPhaseColors.length > 0 && phaseIndex !== null) {
      const paletteIndex = Math.min(phaseIndex, normalizedPhaseColors.length - 1);
      const phaseColor = normalizedPhaseColors[paletteIndex];
      if (phaseColor) {
        color = phaseColor;
      }
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
          softColor = trimmedColor.replace('rgb', 'rgba').replace(/\)$/u, ', 0.35)');
        } else if (trimmedColor.startsWith('hsla')) {
          softColor = trimmedColor.replace(/\)$/u, ', 0.35)');
        } else if (trimmedColor.startsWith('hsl')) {
          softColor = trimmedColor.replace('hsl', 'hsla').replace(/\)$/u, ', 0.35)');
        }
      }

      entry.root.style.setProperty('--boss-accent-soft', softColor);
      cached.color = color;
    }

    const isActive = Boolean(state.active && !state.defeated);
    const isUpcoming = Boolean(state.upcoming && !state.active && !state.defeated);
    const isDefeated = Boolean(state.defeated);

    entry.root.classList.toggle('is-active', isActive);
    entry.root.classList.toggle('is-upcoming', isUpcoming);
    entry.root.classList.toggle('is-defeated', isDefeated);

    if (entry.root) {
      if (phaseIndex !== null && phaseCount > 0) {
        entry.root.dataset.phaseIndex = String(Math.min(phaseIndex + 1, phaseCount));
        entry.root.dataset.phaseCount = String(phaseCount);
      } else {
        entry.root.removeAttribute('data-phase-index');
        entry.root.removeAttribute('data-phase-count');
      }
    }

    const bossName = state.name || 'Boss';
    if (force || cached.name !== bossName) {
      if (entry.name) {
        entry.name.textContent = bossName;
      }
      cached.name = bossName;
    }

    const waveNumber = Number.isFinite(state.wave) ? Math.max(1, Math.floor(state.wave)) : null;

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

    let statusText = '';
    if (isDefeated) {
      statusText = 'Defeated';
    } else if (isActive) {
      statusText = waveNumber !== null ? `Wave ${waveNumber} • Engaged` : 'Engaged';
    } else if (isUpcoming) {
      statusText = waveNumber !== null ? `Wave ${waveNumber} • Approaching` : 'Approaching';
    } else if (waveNumber !== null) {
      statusText = `Wave ${waveNumber}`;
    }

    if (entry.status && (force || cached.status !== statusText)) {
      entry.status.textContent = statusText;
      cached.status = statusText;
    }

    const health = Number.isFinite(state.health) ? Math.max(0, Math.floor(state.health)) : 0;
    const maxHealth = Number.isFinite(state.maxHealth)
      ? Math.max(0, Math.floor(state.maxHealth))
      : 0;
    const ratio = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;

    const healthText = maxHealth > 0
      ? `${this.formatCount(health, { allowCompact: false })} / ${this.formatCount(maxHealth, {
          allowCompact: false,
        })}`
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
      const ariaText = maxHealth > 0
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
    cached.bossId = state?.bossId ?? null;

    const now = this.getHighResolutionTime();
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
      entry.timers.setAttribute('aria-hidden', timersVisible ? 'false' : 'true');
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
    const waveNumber = Number.isFinite(state?.wave) ? Math.max(1, Math.floor(state.wave)) : null;

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
    const shouldDisplay = Boolean(state.active || state.upcoming || state.defeated);

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
    this.refreshTacticalDomRefs();
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

    if (config.layout === 'custom') {
      root.classList.add('hud-item--custom');

      if (iconElement) {
        iconElement.classList.add('hud-item__icon');
        root.appendChild(iconElement);
      }

      if (leadingElement) {
        root.appendChild(leadingElement);
      }

      let customElement = null;
      if (config.custom && typeof config.custom === 'object') {
        const { element = 'div', id, classes, width, height, dataset } = config.custom;
        if (element === 'canvas') {
          customElement = document.createElement('canvas');
          if (Number.isFinite(width) && width > 0) {
            customElement.width = width;
            customElement.style.width = `${width}px`;
          }
          if (Number.isFinite(height) && height > 0) {
            customElement.height = height;
            customElement.style.height = `${height}px`;
          }
        } else {
          customElement = document.createElement(element || 'div');
        }

        if (id) {
          customElement.id = id;
        }

        const classList = Array.isArray(classes) ? classes : [];
        classList.forEach((className) => {
          if (className) {
            customElement.classList.add(className);
          }
        });

        if (dataset && typeof dataset === 'object') {
          Object.entries(dataset).forEach(([key, value]) => {
            if (key && value !== undefined && customElement?.dataset) {
              customElement.dataset[key] = String(value);
            }
          });
        }
      }

      if (!customElement) {
        customElement = document.createElement('div');
        customElement.classList.add('hud-item__custom');
      }

      customElement.classList.add('hud-item__custom-content');
      root.appendChild(customElement);

      if (metaElement && metaPosition !== 'after-value') {
        root.appendChild(metaElement);
      }

      return {
        key: config.key,
        config,
        root,
        custom: customElement,
        meta: metaElement,
        icon: iconElement,
        leading: leadingElement,
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
    const comboRefs = this.domRefs.combo || {};
    const minimapRefs = this.domRefs.minimap || {};
    const threatRefs = this.domRefs.threats || {};

    const comboEntry = this.hudElements.get('comboMeter');
    const minimapEntry = this.hudElements.get('minimap');
    const threatEntry = this.hudElements.get('threatIndicators');

    const comboRoot =
      comboEntry?.root || comboRefs.root || document.getElementById('hud-combo') || null;
    const comboValue =
      comboEntry?.value || comboRefs.value || document.getElementById('combo-display') || null;
    const comboMultiplier =
      comboEntry?.meta ||
      comboRefs.multiplier ||
      document.getElementById('combo-multiplier') ||
      null;

    this.domRefs.combo = {
      root: comboRoot,
      value: comboValue,
      multiplier: comboMultiplier,
    };

    const minimapRoot =
      minimapEntry?.root ||
      minimapRefs.root ||
      document.getElementById('hud-minimap') ||
      null;

    let minimapCanvas = null;
    if (minimapEntry?.custom instanceof HTMLCanvasElement) {
      minimapCanvas = minimapEntry.custom;
    } else if (minimapRefs.canvas instanceof HTMLCanvasElement) {
      minimapCanvas = minimapRefs.canvas;
    } else {
      const queriedCanvas = document.getElementById('minimap-canvas');
      minimapCanvas = queriedCanvas instanceof HTMLCanvasElement ? queriedCanvas : null;
    }

    const minimapMeta =
      minimapEntry?.meta ||
      minimapRefs.meta ||
      document.getElementById('minimap-range') ||
      null;

    this.domRefs.minimap = {
      root: minimapRoot,
      canvas: minimapCanvas,
      meta: minimapMeta,
    };

    if (minimapCanvas instanceof HTMLCanvasElement) {
      this.configureMinimapCanvas(minimapCanvas, minimapEntry);
      this.clearMinimap();
    } else {
      this.tacticalState.minimap.canvas = null;
      this.tacticalState.minimap.context = null;
      this.tacticalState.minimap.width = 0;
      this.tacticalState.minimap.height = 0;
    }

    let threatContainer = null;
    if (threatEntry?.custom instanceof HTMLElement) {
      threatContainer = threatEntry.custom;
    } else if (threatEntry?.root instanceof HTMLElement) {
      threatContainer = threatEntry.root;
    } else if (threatRefs.container instanceof HTMLElement) {
      threatContainer = threatRefs.container;
    } else {
      const queried =
        document.getElementById('threat-indicators-overlay') ||
        document.getElementById('threat-indicators-container');
      threatContainer = queried instanceof HTMLElement ? queried : null;
    }

    if (this.tacticalState.threats.container &&
      this.tacticalState.threats.container !== threatContainer) {
      this.clearThreatIndicators();
    }

    this.tacticalState.threats.container = threatContainer;
    this.domRefs.threats = {
      container: threatContainer,
    };
  }

  configureMinimapCanvas(canvas, entry = null) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      this.tacticalState.minimap.canvas = null;
      this.tacticalState.minimap.context = null;
      this.tacticalState.minimap.width = 0;
      this.tacticalState.minimap.height = 0;
      return;
    }

    const customConfig = entry?.config?.custom || {};
    const datasetRange =
      customConfig?.dataset?.range ??
      canvas.dataset?.range ??
      canvas.getAttribute?.('data-range');
    const parsedRange = Number(datasetRange);
    if (Number.isFinite(parsedRange) && parsedRange > 0) {
      this.tacticalState.minimap.range = parsedRange;
    }

    const widthConfig = Number(customConfig?.width);
    const heightConfig = Number(customConfig?.height);

    const resolvedWidth =
      (Number.isFinite(widthConfig) && widthConfig > 0
        ? widthConfig
        : Number(canvas.dataset?.width)) ||
      Number(canvas.getAttribute?.('width')) ||
      canvas.width ||
      120;

    const resolvedHeight =
      (Number.isFinite(heightConfig) && heightConfig > 0
        ? heightConfig
        : Number(canvas.dataset?.height)) ||
      Number(canvas.getAttribute?.('height')) ||
      canvas.height ||
      resolvedWidth;

    if (Number.isFinite(resolvedWidth) && resolvedWidth > 0) {
      if (canvas.width !== resolvedWidth) {
        canvas.width = resolvedWidth;
      }
      if (canvas.style) {
        canvas.style.width = `${resolvedWidth}px`;
      }
    }

    if (Number.isFinite(resolvedHeight) && resolvedHeight > 0) {
      if (canvas.height !== resolvedHeight) {
        canvas.height = resolvedHeight;
      }
      if (canvas.style) {
        canvas.style.height = `${resolvedHeight}px`;
      }
    }

    const context = canvas.getContext('2d');
    this.tacticalState.minimap.canvas = canvas;
    this.tacticalState.minimap.context = context || null;
    this.tacticalState.minimap.width = canvas.width || resolvedWidth || 0;
    this.tacticalState.minimap.height = canvas.height || resolvedHeight || 0;

    const metaNode =
      entry?.meta instanceof HTMLElement
        ? entry.meta
        : this.domRefs.minimap?.meta instanceof HTMLElement
        ? this.domRefs.minimap.meta
        : null;

    if (metaNode && Number.isFinite(this.tacticalState.minimap.range)) {
      const rangeLabel = `Range ${Math.round(this.tacticalState.minimap.range)}u`;
      if (metaNode.textContent !== rangeLabel) {
        metaNode.textContent = rangeLabel;
      }
    }
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    const registerBossEvent = (eventName) => {
      gameEvents.on(eventName, (payload = {}) => {
        this.handleBossEvent(eventName, payload);
      });
      gameEvents.on(`ui-${eventName}`, (payload = {}) => {
        this.handleBossEvent(eventName, payload);
      });
    };

    ['boss-hud-update', 'boss-wave-started', 'boss-spawned', 'boss-phase-changed', 'boss-defeated'].forEach(
      registerBossEvent
    );

    gameEvents.on('player-reset', () => {
      this.resetBossHudState();
      this.resetTacticalHud({ reason: 'player-reset' });
    });

    gameEvents.on('progression-reset', () => {
      this.resetBossHudState();
      this.resetTacticalHud({ reason: 'progression-reset' });
    });

    gameEvents.on('physics-reset', () => {
      this.resetTacticalHud({ includeCombo: false, reason: 'physics-reset' });
    });

    gameEvents.on('combo-updated', (payload = {}) => {
      this.handleComboUpdated(payload);
    });

    gameEvents.on('combo-broken', () => {
      this.handleComboBroken();
    });

    const refreshTacticalElements = () => {
      this.renderMinimap({ force: true });
      this.updateThreatIndicators({ force: true });
    };

    ['enemy-spawned', 'enemy-destroyed'].forEach((eventName) => {
      gameEvents.on(eventName, refreshTacticalElements);
      gameEvents.on(`ui-${eventName}`, refreshTacticalElements);
    });

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

    gameEvents.on('wave-completed', (payload = {}) => {
      this.handleBossWaveCompletion(payload);
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

      if (typeof progression.getComboState === 'function') {
        const comboState = progression.getComboState();
        if (comboState) {
          this.applyComboState(comboState, { force });
        } else if (force) {
          this.resetComboMeter({ force: true });
        }
      } else if (force) {
        this.resetComboMeter({ force: true });
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
    this.renderBossHud();
    this.updateComboMeter();
    this.renderMinimap();
    this.updateThreatIndicators();
  }

  applyComboState(state = {}, options = {}) {
    const countValue =
      state.comboCount ?? state.count ?? state.hits ?? this.tacticalState.combo.count;
    const multiplierValue =
      state.multiplier ?? state.comboMultiplier ?? state.mult ?? this.tacticalState.combo.multiplier;

    const count = Number.isFinite(countValue) ? Math.max(0, Math.floor(countValue)) : 0;
    const multiplier = Number.isFinite(multiplierValue)
      ? Math.max(1, Number(multiplierValue))
      : count > 0
        ? Math.max(1, this.tacticalState.combo.multiplier)
        : 1;

    this.tacticalState.combo.count = count;
    this.tacticalState.combo.multiplier = multiplier;
    this.tacticalState.combo.lastEvent = options?.reason || 'service';

    this.updateComboMeter(
      { comboCount: count, multiplier },
      { force: Boolean(options.force) }
    );
  }

  handleComboUpdated(payload = {}) {
    this.applyComboState(payload, { force: payload?.force, reason: 'combo-updated' });
  }

  handleComboBroken() {
    this.resetComboMeter({ force: true, reason: 'combo-broken' });
  }

  resetComboMeter(options = {}) {
    this.tacticalState.combo.count = 0;
    this.tacticalState.combo.multiplier = 1;
    this.tacticalState.combo.lastEvent = options?.reason || 'reset';

    this.updateComboMeter(
      { comboCount: 0, multiplier: 1 },
      { force: true }
    );
  }

  updateComboMeter(comboState = null, options = {}) {
    const state = comboState || this.tacticalState.combo || {};
    const entry = this.hudElements.get('comboMeter');
    const refs = this.domRefs.combo || {};

    const root = entry?.root || refs.root || null;
    const valueNode = entry?.value || refs.value || null;
    const multiplierNode = entry?.meta || refs.multiplier || null;

    if (!root && !valueNode && !multiplierNode) {
      return;
    }

    const countValue = state.comboCount ?? state.count ?? state.hits ?? 0;
    const multiplierValue =
      state.multiplier ?? state.comboMultiplier ?? state.mult ?? 1;

    const count = Number.isFinite(countValue) ? Math.max(0, Math.floor(countValue)) : 0;
    const multiplier = Number.isFinite(multiplierValue)
      ? Math.max(1, Number(multiplierValue))
      : 1;
    const force = Boolean(options.force);

    const cached = this.cachedValues.combo || { count: null, multiplier: null, active: false };
    const isActive = count > 0;
    const isHigh = count >= 5;

    if (valueNode && (force || cached.count !== count)) {
      const label = count === 1 ? '1 Hit' : `${count} Hits`;
      valueNode.textContent = label;
    }

    if (multiplierNode && (force || cached.multiplier !== multiplier)) {
      multiplierNode.textContent = `x${multiplier.toFixed(1)}`;
    }

    if (root) {
      root.classList.toggle('is-active', isActive);
      root.classList.toggle('combo-high', isHigh);
      root.dataset.comboCount = String(count);
      root.dataset.comboMultiplier = multiplier.toFixed(1);

      const shouldPulse =
        isActive &&
        (force || cached.count === null || count > cached.count || multiplier > cached.multiplier);

      if (shouldPulse) {
        root.classList.remove('is-pulsing');
        void root.offsetWidth;
        root.classList.add('is-pulsing');

        if (typeof window !== 'undefined') {
          if (this.comboPulseTimeout) {
            window.clearTimeout(this.comboPulseTimeout);
          }
          this.comboPulseTimeout = window.setTimeout(() => {
            if (root) {
              root.classList.remove('is-pulsing');
            }
            this.comboPulseTimeout = null;
          }, 650);
        }
      } else if (!isActive && root.classList.contains('is-pulsing')) {
        root.classList.remove('is-pulsing');
      }
    }

    this.cachedValues.combo = {
      count,
      multiplier,
      active: isActive,
    };
  }

  renderMinimap(options = {}) {
    const minimap = this.tacticalState.minimap || {};
    const canvas = minimap.canvas;
    const context = minimap.context;
    const width = Number(canvas?.width ?? minimap.width ?? 0);
    const height = Number(canvas?.height ?? minimap.height ?? 0);
    const range = Number(minimap.range ?? 0);

    if (!canvas || !context || !Number.isFinite(range) || range <= 0 || width <= 0 || height <= 0) {
      this.clearMinimap();
      return;
    }

    const player = this.getService('player');
    const physics = this.getService('physics');

    if (!player || !physics || typeof physics.getNearbyEnemies !== 'function') {
      this.clearMinimap();
      return;
    }

    const position =
      (typeof player.getPosition === 'function' ? player.getPosition() : player.position) ||
      null;

    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      this.clearMinimap();
      return;
    }

    let nearby = [];
    try {
      nearby = physics.getNearbyEnemies(position.x, position.y, range) || [];
    } catch (error) {
      nearby = [];
    }

    if (!Array.isArray(nearby)) {
      nearby = [];
    }

    const filtered = [];

    for (let i = 0; i < nearby.length; i += 1) {
      const enemy = nearby[i];
      if (!enemy || enemy.destroyed) {
        continue;
      }

      const ex = Number(enemy.x);
      const ey = Number(enemy.y);
      if (!Number.isFinite(ex) || !Number.isFinite(ey)) {
        continue;
      }

      const dx = ex - position.x;
      const dy = ey - position.y;
      const distance = Math.hypot(dx, dy);
      if (!Number.isFinite(distance) || distance <= 0 || distance > range) {
        continue;
      }

      const id = this.getThreatIdentifier(enemy);

      filtered.push({ enemy, dx, dy, distance, id });
    }

    filtered.sort((a, b) => {
      if (a.id === b.id) {
        return 0;
      }
      return a.id > b.id ? 1 : -1;
    });

    const signatureParts = [`p:${position.x.toFixed(1)},${position.y.toFixed(1)}`];
    for (let i = 0; i < filtered.length; i += 1) {
      const item = filtered[i];
      signatureParts.push(
        `${item.id}:${item.distance.toFixed(1)}:${Math.atan2(item.dy, item.dx).toFixed(2)}`
      );
    }

    const signature = signatureParts.join('|');
    if (!options.force && signature === minimap.lastSignature) {
      return;
    }

    minimap.lastSignature = signature;

    context.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(6, Math.min(centerX, centerY) - 4);
    const scale = radius / range;

    context.save();
    context.translate(centerX, centerY);

    context.beginPath();
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    context.lineWidth = 1;
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();

    context.beginPath();
    context.moveTo(-radius, 0);
    context.lineTo(radius, 0);
    context.moveTo(0, -radius);
    context.lineTo(0, radius);
    context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    context.lineWidth = 1;
    context.stroke();

    context.beginPath();
    const playerDot = Math.max(2, Math.min(4, radius * 0.075));
    context.fillStyle = '#ffffff';
    context.arc(0, 0, playerDot, 0, Math.PI * 2);
    context.fill();

    for (let i = 0; i < filtered.length; i += 1) {
      const { enemy, dx, dy, distance } = filtered[i];
      const angle = Math.atan2(dy, dx);
      const color = this.resolveMinimapColor(enemy);
      const enemyRadius = Number(enemy.radius) || 12;
      const type = this.resolveEnemyType(enemy);

      const clampedDistance = Math.min(distance, range);
      const plotRadius = clampedDistance * scale;
      const plotX = Math.cos(angle) * plotRadius;
      const plotY = Math.sin(angle) * plotRadius;

      const baseSize = Math.max(2, Math.min(6, enemyRadius * scale * 0.55));
      const size = type === 'boss' ? Math.max(baseSize * 1.8, radius * 0.12) : baseSize;

      context.beginPath();
      context.fillStyle = color;
      context.arc(plotX, plotY, size, 0, Math.PI * 2);
      context.fill();

      if (type === 'boss') {
        context.beginPath();
        context.strokeStyle = 'rgba(252, 129, 129, 0.7)';
        context.lineWidth = 1.25;
        context.arc(plotX, plotY, size + Math.max(2, size * 0.4), 0, Math.PI * 2);
        context.stroke();
      }
    }

    context.restore();
  }

  clearMinimap() {
    const minimap = this.tacticalState.minimap || {};
    const context = minimap.context;
    const canvas = minimap.canvas;
    const width = Number(canvas?.width ?? minimap.width ?? 0);
    const height = Number(canvas?.height ?? minimap.height ?? 0);

    if (context && width > 0 && height > 0) {
      context.clearRect(0, 0, width, height);
    }

    minimap.lastSignature = null;
  }

  normalizeThreatId(value) {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === 'string') {
      if (value.startsWith('enemy:') || value.startsWith('synthetic:')) {
        return value;
      }
      return `enemy:${value}`;
    }

    if (typeof value === 'number') {
      return `enemy:${value}`;
    }

    return null;
  }

  getThreatIdentifier(enemy) {
    if (!enemy) {
      return null;
    }

    if (enemy.id !== undefined && enemy.id !== null) {
      return `enemy:${enemy.id}`;
    }

    if (!this.tacticalState.threats.syntheticIds) {
      this.tacticalState.threats.syntheticIds = new WeakMap();
    }

    const map = this.tacticalState.threats.syntheticIds;
    if (map.has(enemy)) {
      return map.get(enemy);
    }

    this.tacticalState.threats.syntheticSequence += 1;
    const syntheticId = `synthetic:${this.tacticalState.threats.syntheticSequence}`;
    map.set(enemy, syntheticId);
    return syntheticId;
  }

  ensureThreatIndicator(id, enemy = null) {
    const normalizedId = this.normalizeThreatId(id);
    const container = this.tacticalState.threats.container;

    if (!normalizedId || !(container instanceof HTMLElement)) {
      return null;
    }

    const indicators = this.tacticalState.threats.indicators;
    if (indicators.has(normalizedId)) {
      return indicators.get(normalizedId);
    }

    const element = document.createElement('div');
    element.classList.add('threat-indicator');
    element.dataset.threatId = normalizedId;

    const arrow = document.createElement('span');
    arrow.classList.add('threat-indicator__arrow');
    element.appendChild(arrow);

    const label = document.createElement('span');
    label.classList.add('threat-indicator__label');
    element.appendChild(label);

    container.appendChild(element);

    const indicator = {
      element,
      arrow,
      label,
      typeClass: null,
      enemy,
    };

    indicators.set(normalizedId, indicator);
    container.classList.add('has-indicators');
    return indicator;
  }

  removeThreatIndicator(id) {
    const normalizedId = this.normalizeThreatId(id);
    if (!normalizedId) {
      return;
    }

    const indicators = this.tacticalState.threats.indicators;
    const indicator = indicators.get(normalizedId);
    if (!indicator) {
      return;
    }

    if (indicator.element?.parentNode) {
      indicator.element.parentNode.removeChild(indicator.element);
    }

    indicators.delete(normalizedId);

    if (!indicators.size && this.tacticalState.threats.container) {
      this.tacticalState.threats.container.classList.remove('has-indicators');
    }
  }

  updateThreatIndicators(options = {}) {
    const container = this.tacticalState.threats.container;
    if (!(container instanceof HTMLElement)) {
      this.clearThreatIndicators();
      return;
    }

    const width = container.clientWidth || container.offsetWidth || 0;
    const height = container.clientHeight || container.offsetHeight || 0;
    if (!width || !height) {
      this.clearThreatIndicators();
      return;
    }

    const player = this.getService('player');
    const physics = this.getService('physics');
    if (!player || !physics || typeof physics.getNearbyEnemies !== 'function') {
      this.clearThreatIndicators();
      return;
    }

    const position =
      (typeof player.getPosition === 'function' ? player.getPosition() : player.position) ||
      null;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      this.clearThreatIndicators();
      return;
    }

    const minimapRange = Number.isFinite(this.tacticalState.minimap.range)
      ? this.tacticalState.minimap.range
      : 300;
    const detectionRange = Math.max(minimapRange * 1.6, minimapRange + 160);

    let nearby = [];
    try {
      nearby = physics.getNearbyEnemies(position.x, position.y, detectionRange) || [];
    } catch (error) {
      nearby = [];
    }

    if (!Array.isArray(nearby)) {
      nearby = [];
    }

    const offscreen = [];
    for (let i = 0; i < nearby.length; i += 1) {
      const enemy = nearby[i];
      if (!enemy || enemy.destroyed) {
        continue;
      }

      const ex = Number(enemy.x);
      const ey = Number(enemy.y);
      if (!Number.isFinite(ex) || !Number.isFinite(ey)) {
        continue;
      }

      const dx = ex - position.x;
      const dy = ey - position.y;
      const distance = Math.hypot(dx, dy);

      if (!Number.isFinite(distance) || distance <= minimapRange * 0.98) {
        continue;
      }

      const angle = Math.atan2(dy, dx);
      const id = this.getThreatIdentifier(enemy);
      const type = this.resolveEnemyType(enemy);

      offscreen.push({ enemy, id, angle, distance, type });
    }

    offscreen.sort((a, b) => {
      if (a.id === b.id) {
        return 0;
      }
      return a.id > b.id ? 1 : -1;
    });

    const signatureParts = [`${Math.round(width)}x${Math.round(height)}`];
    for (let i = 0; i < offscreen.length; i += 1) {
      const item = offscreen[i];
      signatureParts.push(
        `${item.id}:${item.type}:${item.distance.toFixed(1)}:${item.angle.toFixed(2)}`
      );
    }

    const signature = signatureParts.join('|');
    if (!options.force && signature === this.tacticalState.threats.lastSignature) {
      return;
    }

    this.tacticalState.threats.lastSignature = signature;

    const activeIds = new Set();
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(24, Math.min(centerX, centerY) - 12);

    for (let i = 0; i < offscreen.length; i += 1) {
      const item = offscreen[i];
      const indicator = this.ensureThreatIndicator(item.id, item.enemy);
      if (!indicator) {
        continue;
      }

      activeIds.add(this.normalizeThreatId(item.id));

      const severity = this.resolveThreatSeverity(item.distance, detectionRange);
      indicator.element.dataset.severity = severity;
      indicator.element.classList.toggle('is-high', severity === 'high');
      indicator.element.classList.toggle('is-medium', severity === 'medium');
      indicator.element.classList.toggle('is-low', severity === 'low');

      const typeClass = `threat-indicator--${item.type}`;
      if (indicator.typeClass && indicator.typeClass !== typeClass) {
        indicator.element.classList.remove(indicator.typeClass);
      }
      if (typeClass) {
        indicator.element.classList.add(typeClass);
        indicator.typeClass = typeClass;
      }

      indicator.element.dataset.threatType = item.type;
      indicator.element.classList.toggle('is-boss', item.type === 'boss');

      if (indicator.label) {
        indicator.label.textContent = this.resolveThreatLabel(item.type);
      }

      if (indicator.arrow) {
        indicator.arrow.style.setProperty('--threat-color', this.resolveMinimapColor(item.enemy));
      }

      const normalized = detectionRange > 0 ? Math.min(item.distance / detectionRange, 1) : 1;
      indicator.element.style.setProperty('--threat-distance', normalized.toFixed(3));

      const posX = centerX + Math.cos(item.angle) * radius;
      const posY = centerY + Math.sin(item.angle) * radius;
      indicator.element.style.left = `${posX}px`;
      indicator.element.style.top = `${posY}px`;
      indicator.element.style.transform = `translate(-50%, -50%) rotate(${item.angle}rad)`;
      indicator.element.classList.add('is-visible');
    }

    const existingIds = Array.from(this.tacticalState.threats.indicators.keys());
    for (let i = 0; i < existingIds.length; i += 1) {
      const key = existingIds[i];
      if (!activeIds.has(key)) {
        this.removeThreatIndicator(key);
      }
    }

    container.classList.toggle('has-indicators', activeIds.size > 0);
  }

  clearThreatIndicators() {
    const indicators = this.tacticalState.threats.indicators;
    indicators.forEach((indicator) => {
      if (indicator?.element?.parentNode) {
        indicator.element.parentNode.removeChild(indicator.element);
      }
    });
    indicators.clear();
    this.tacticalState.threats.lastSignature = null;
    this.tacticalState.threats.syntheticIds = new WeakMap();
    this.tacticalState.threats.syntheticSequence = 0;

    if (this.tacticalState.threats.container) {
      this.tacticalState.threats.container.classList.remove('has-indicators');
    }
  }

  resolveEnemyType(enemy) {
    if (!enemy) {
      return 'unknown';
    }

    const baseType = typeof enemy.type === 'string' ? enemy.type.toLowerCase() : null;
    if (baseType) {
      if (baseType.includes('boss')) {
        return 'boss';
      }
      if (baseType.includes('drone')) {
        return 'drone';
      }
      if (baseType.includes('hunter')) {
        return 'hunter';
      }
      if (baseType.includes('mine')) {
        return 'mine';
      }
      if (baseType.includes('asteroid')) {
        return 'asteroid';
      }
      return baseType;
    }

    if (enemy.tags && typeof enemy.tags.has === 'function') {
      if (enemy.tags.has('boss')) {
        return 'boss';
      }
    }

    return 'unknown';
  }

  resolveMinimapColor(enemy) {
    const type = this.resolveEnemyType(enemy);
    const palette = {
      asteroid: '#a0aec0',
      drone: '#63b3ed',
      hunter: '#9f7aea',
      mine: '#ed8936',
      boss: '#fc8181',
    };

    return palette[type] || '#fbbf24';
  }

  resolveThreatSeverity(distance, detectionRange) {
    if (!Number.isFinite(distance) || distance <= 0) {
      return 'low';
    }

    if (!Number.isFinite(detectionRange) || detectionRange <= 0) {
      return 'high';
    }

    const normalized = Math.min(Math.max(distance / detectionRange, 0), 1);

    if (normalized <= 0.45) {
      return 'high';
    }

    if (normalized <= 0.75) {
      return 'medium';
    }

    return 'low';
  }

  resolveThreatLabel(type) {
    switch (type) {
      case 'boss':
        return 'B';
      case 'drone':
        return 'D';
      case 'hunter':
        return 'H';
      case 'mine':
        return 'M';
      case 'asteroid':
        return 'A';
      default:
        return '!';
    }
  }

  resetTacticalHud(options = {}) {
    const includeCombo = options.includeCombo !== false;
    const includeMinimap = options.includeMinimap !== false;
    const includeThreats = options.includeThreats !== false;

    if (includeCombo) {
      this.resetComboMeter({ force: true, reason: options.reason || 'reset' });
    }

    if (includeMinimap) {
      this.clearMinimap();
    }

    if (includeThreats) {
      this.clearThreatIndicators();
    }

    this.tacticalState.combo.lastEvent = options.reason || 'reset';
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

    const justCompleted =
      waveCompleted &&
      (Boolean(lastWave?.isActive) || (Number.isFinite(lastWave?.breakTimerSeconds) && lastWave.breakTimerSeconds > 0));

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

      if (typeof gameEvents !== 'undefined' && emitEvent) {
        gameEvents.emit('screen-changed', { screen: screenName });
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
