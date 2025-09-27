// src/modules/SettingsSystem.js

import SETTINGS_SCHEMA from '../data/settingsSchema.js';

const VISUAL_CATEGORIES = new Set(['accessibility', 'video']);

const STORAGE_KEY = 'astro:settings:v1';

function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('[SettingsSystem] Failed to clone value:', error);
    return value;
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

class SettingsSystem {
  constructor() {
    this.schema = Array.isArray(SETTINGS_SCHEMA) ? SETTINGS_SCHEMA : [];
    this.storageKey = STORAGE_KEY;
    this.defaults = this.buildDefaultState();
    this.values = deepClone(this.defaults);
    this.subscribers = new Set();

    this.applyStoredValues();
    this.registerService();
    this.setupEventListeners();
    this.broadcastInitialCategories();

    console.log('[SettingsSystem] Initialized');
  }

  registerService() {
    if (typeof gameServices !== 'undefined') {
      gameServices.register('settings', this);
    }
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('settings-update-requested', (payload = {}) => {
      const { category, key, value, source } = payload;
      if (!category || !key) {
        return;
      }
      this.setSetting(category, key, value, { source: source ?? 'event' });
    });

    gameEvents.on('settings-reset-requested', (payload = {}) => {
      const { category, key, scope = 'category', source } = payload;
      if (key && category) {
        this.resetSetting(category, key, { source: source ?? 'event' });
        return;
      }

      if (category) {
        this.resetCategory(category, { source: source ?? 'event' });
        return;
      }

      if (scope === 'all') {
        this.resetAll({ source: source ?? 'event' });
      }
    });
  }

  buildDefaultState() {
    const state = {};
    this.schema.forEach((category) => {
      if (!category?.id || !Array.isArray(category.fields)) {
        return;
      }

      state[category.id] = {};
      category.fields.forEach((field) => {
        state[category.id][field.key] = deepClone(
          field.default !== undefined
            ? field.default
            : this.getFallbackDefault(field.type)
        );
      });
    });

    return state;
  }

  getFallbackDefault(type) {
    switch (type) {
      case 'toggle':
        return false;
      case 'range':
        return 0;
      case 'binding':
        return { keyboard: [], gamepad: [] };
      default:
        return null;
    }
  }

  applyStoredValues() {
    const stored = this.loadFromStorage();
    if (!stored) {
      return;
    }

    Object.entries(stored).forEach(([categoryId, categoryValues]) => {
      if (!this.values[categoryId] || typeof categoryValues !== 'object') {
        return;
      }

      Object.entries(categoryValues).forEach(([key, value]) => {
        if (!(key in this.values[categoryId])) {
          return;
        }

        const field = this.findField(categoryId, key);
        if (!field) {
          return;
        }

        this.values[categoryId][key] = this.normalizeValue(field, value);
      });
    });
  }

  loadFromStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }

      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }

      return JSON.parse(raw);
    } catch (error) {
      console.warn(
        '[SettingsSystem] Failed to load settings from storage:',
        error
      );
      return null;
    }
  }

  persist() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }

      window.localStorage.setItem(this.storageKey, JSON.stringify(this.values));
    } catch (error) {
      console.warn('[SettingsSystem] Failed to persist settings:', error);
    }
  }

  findField(categoryId, key) {
    const category = this.schema.find((entry) => entry.id === categoryId);
    if (!category) {
      return null;
    }

    return category.fields?.find((field) => field.key === key) || null;
  }

  normalizeValue(field, rawValue) {
    switch (field.type) {
      case 'toggle':
        return Boolean(rawValue);
      case 'range': {
        const min = Number.isFinite(field.min) ? field.min : 0;
        const max = Number.isFinite(field.max) ? field.max : 1;
        const step = Number.isFinite(field.step) ? field.step : null;
        const numeric = Number(rawValue);
        let clamped = clamp(numeric, min, max);
        if (step && Number.isFinite(step) && step > 0) {
          const steps = Math.round((clamped - min) / step);
          clamped = min + steps * step;
          clamped = clamp(clamped, min, max);
        }
        return clamped;
      }
      case 'binding':
        return this.normalizeBindingValue(field, rawValue);
      case 'select': {
        const options = ensureArray(field.options);
        if (options.length === 0) {
          return rawValue ?? field.default ?? null;
        }
        return options.includes(rawValue) ? rawValue : options[0];
      }
      default:
        return rawValue ?? field.default ?? null;
    }
  }

  normalizeBindingValue(field, rawValue) {
    const defaultValue =
      field.default && typeof field.default === 'object'
        ? field.default
        : { keyboard: [], gamepad: [] };

    const devices = Array.isArray(field.devices)
      ? field.devices
      : Object.keys(defaultValue);

    if (devices.length === 0) {
      devices.push('keyboard');
    }

    const normalized = {};

    devices.forEach((device) => {
      const maxBindings = Math.max(
        1,
        Number(field.metadata?.[device]?.max) ||
          ensureArray(defaultValue[device]).length ||
          2
      );
      const rawList =
        rawValue &&
        typeof rawValue === 'object' &&
        Array.isArray(rawValue[device])
          ? rawValue[device]
          : ensureArray(defaultValue[device]);

      const seen = new Set();
      const cleaned = [];

      rawList.forEach((entry) => {
        if (typeof entry !== 'string') {
          return;
        }

        const trimmed = entry.trim();
        if (!trimmed) {
          return;
        }

        const canonical = trimmed.toLowerCase();
        if (seen.has(canonical)) {
          return;
        }

        seen.add(canonical);
        cleaned.push(trimmed);
      });

      if (cleaned.length === 0 && Array.isArray(defaultValue[device])) {
        cleaned.push(...defaultValue[device]);
      }

      normalized[device] = cleaned.slice(0, maxBindings);
    });

    return normalized;
  }

  setSetting(categoryId, key, rawValue, options = {}) {
    if (!this.values[categoryId]) {
      console.warn(`[SettingsSystem] Unknown category: ${categoryId}`);
      return null;
    }

    if (!(key in this.values[categoryId])) {
      console.warn(
        `[SettingsSystem] Unknown setting '${key}' in category '${categoryId}'`
      );
      return null;
    }

    const field = this.findField(categoryId, key);
    if (!field) {
      console.warn(
        `[SettingsSystem] Schema field not found for ${categoryId}.${key}`
      );
      return null;
    }

    const normalized = this.normalizeValue(field, rawValue);
    const previous = this.values[categoryId][key];

    if (this.areValuesEqual(previous, normalized)) {
      return normalized;
    }

    this.values[categoryId][key] = normalized;
    if (!options.skipPersist) {
      this.persist();
    }

    this.emitChange({
      category: categoryId,
      key,
      value: deepClone(normalized),
      previous: deepClone(previous),
      source: options.source || 'direct',
      field,
      type: 'update',
    });

    return normalized;
  }

  areValuesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  getSetting(categoryId, key) {
    if (!this.values[categoryId]) {
      return undefined;
    }
    return deepClone(this.values[categoryId][key]);
  }

  getCategoryValues(categoryId) {
    if (!this.values[categoryId]) {
      return null;
    }
    return deepClone(this.values[categoryId]);
  }

  getSchema() {
    return this.schema.map((category) => ({
      id: category.id,
      label: category.label,
      description: category.description,
      fields: category.fields.map((field) => ({ ...field })),
    }));
  }

  getCategorySchema(categoryId) {
    const category = this.schema.find((entry) => entry.id === categoryId);
    return category
      ? {
          id: category.id,
          label: category.label,
          description: category.description,
          fields: category.fields.map((field) => ({ ...field })),
        }
      : null;
  }

  resetSetting(categoryId, key, options = {}) {
    if (!this.defaults[categoryId] || !(key in this.defaults[categoryId])) {
      return;
    }

    const defaultValue = deepClone(this.defaults[categoryId][key]);
    this.setSetting(categoryId, key, defaultValue, {
      ...options,
      source: options.source || 'reset',
    });
  }

  resetCategory(categoryId, options = {}) {
    if (!this.defaults[categoryId]) {
      return;
    }

    Object.keys(this.defaults[categoryId]).forEach((key) => {
      this.setSetting(categoryId, key, this.defaults[categoryId][key], {
        ...options,
        skipPersist: true,
        source: options.source || 'reset',
      });
    });

    this.persist();

    this.emitChange({
      category: categoryId,
      key: null,
      value: this.getCategoryValues(categoryId),
      previous: null,
      source: options.source || 'reset',
      type: 'reset-category',
    });
  }

  resetAll(options = {}) {
    Object.keys(this.defaults).forEach((categoryId) => {
      this.values[categoryId] = deepClone(this.defaults[categoryId]);
    });

    this.persist();

    this.emitChange({
      category: null,
      key: null,
      value: this.getSnapshot(),
      previous: null,
      source: options.source || 'reset',
      type: 'reset-all',
    });

    this.broadcastInitialCategories();
  }

  getSnapshot() {
    return deepClone(this.values);
  }

  subscribe(callback, options = {}) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    this.subscribers.add(callback);

    if (options.immediate) {
      callback({
        category: null,
        key: null,
        value: this.getSnapshot(),
        previous: null,
        type: 'snapshot',
        source: 'subscribe',
      });
    }

    return () => {
      this.subscribers.delete(callback);
    };
  }

  emitChange(change) {
    this.subscribers.forEach((callback) => {
      try {
        callback(change);
      } catch (error) {
        console.error('[SettingsSystem] Subscriber error:', error);
      }
    });

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('settings-changed', change);

      if (change.category === 'audio') {
        gameEvents.emit('settings-audio-changed', {
          values: this.getCategoryValues('audio'),
          change,
        });
      }

      if (change.category === 'controls') {
        gameEvents.emit('settings-controls-changed', {
          values: this.getCategoryValues('controls'),
          change,
        });
      }

      if (change.category === 'accessibility') {
        gameEvents.emit('settings-accessibility-changed', {
          values: this.getCategoryValues('accessibility'),
          change,
        });
      }

      if (change.category === 'video') {
        gameEvents.emit('settings-video-changed', {
          values: this.getCategoryValues('video'),
          change,
        });
      }

      if (
        VISUAL_CATEGORIES.has(change.category) ||
        change.type === 'reset-all'
      ) {
        gameEvents.emit('settings-visual-changed', {
          values: this.getVisualPreferences(),
          change,
        });
      }
    }
  }

  broadcastInitialCategories() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    ['audio', 'controls', 'accessibility', 'video'].forEach((categoryId) => {
      const values = this.getCategoryValues(categoryId);
      if (!values) {
        return;
      }

      gameEvents.emit(`settings-${categoryId}-changed`, {
        values,
        change: {
          category: categoryId,
          key: null,
          value: values,
          type: 'init',
          source: 'init',
        },
      });
    });

    gameEvents.emit('settings-visual-changed', {
      values: this.getVisualPreferences(),
      change: {
        category: null,
        key: null,
        value: this.getVisualPreferences(),
        type: 'init',
        source: 'init',
      },
    });
  }

  getVisualPreferences() {
    const accessibility = this.getCategoryValues('accessibility') || {};
    const video = this.getCategoryValues('video') || {};

    const hudScale = Number.isFinite(Number(video.hudScale))
      ? Number(video.hudScale)
      : 1;
    const screenShake = Number.isFinite(Number(video.screenShakeIntensity))
      ? Number(video.screenShakeIntensity)
      : 1;

    return {
      accessibility,
      video,
      derived: {
        contrast: accessibility.highContrastHud ? 'high' : 'normal',
        colorVision: accessibility.colorBlindPalette ? 'assist' : 'standard',
        reducedMotion: Boolean(accessibility.reducedMotion),
        hudScale,
        screenShake,
        damageFlash: video.damageFlash !== false,
        reducedParticles: Boolean(video.reducedParticles),
      },
    };
  }
}

export default SettingsSystem;
