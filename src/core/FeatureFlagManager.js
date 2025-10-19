import {
  USE_WAVE_MANAGER,
  WAVEMANAGER_HANDLES_ASTEROID_SPAWN,
  PRESERVE_LEGACY_SIZE_DISTRIBUTION,
  PRESERVE_LEGACY_POSITIONING,
  STRICT_LEGACY_SPAWN_SEQUENCE,
  ASTEROID_EDGE_SPAWN_MARGIN,
} from './GameConstants.js';

const STORAGE_KEY = 'asteroids_feature_flags';

const FEATURE_FLAGS = {
  USE_WAVE_MANAGER: {
    key: 'USE_WAVE_MANAGER',
    type: 'boolean',
    defaultValue: USE_WAVE_MANAGER,
    category: 'waveManager',
    label: 'Usar WaveManager',
    description:
      'Ativa o novo sistema de gerenciamento de ondas substituindo o comportamento legado.',
    requiresRestart: true,
  },
  WAVEMANAGER_HANDLES_ASTEROID_SPAWN: {
    key: 'WAVEMANAGER_HANDLES_ASTEROID_SPAWN',
    type: 'boolean',
    defaultValue: WAVEMANAGER_HANDLES_ASTEROID_SPAWN,
    category: 'waveManager',
    label: 'WaveManager controla spawn de asteroides',
    description:
      'Quando ativo, o WaveManager assume o spawn de asteroides. Depende de USE_WAVE_MANAGER.',
    requiresRestart: true,
  },
  PRESERVE_LEGACY_SIZE_DISTRIBUTION: {
    key: 'PRESERVE_LEGACY_SIZE_DISTRIBUTION',
    type: 'boolean',
    defaultValue: PRESERVE_LEGACY_SIZE_DISTRIBUTION,
    category: 'compatibility',
    label: 'Distribuição legada de tamanhos',
    description:
      'Mantém a distribuição de tamanhos 50/30/20 para comparativos com métricas antigas.',
    requiresRestart: true,
  },
  PRESERVE_LEGACY_POSITIONING: {
    key: 'PRESERVE_LEGACY_POSITIONING',
    type: 'boolean',
    defaultValue: PRESERVE_LEGACY_POSITIONING,
    category: 'spawning',
    label: 'Posicionamento legado de spawn',
    description:
      'Força spawn nas quatro bordas como no sistema original ao invés de distância dinâmica.',
    requiresRestart: true,
  },
  STRICT_LEGACY_SPAWN_SEQUENCE: {
    key: 'STRICT_LEGACY_SPAWN_SEQUENCE',
    type: 'boolean',
    defaultValue: STRICT_LEGACY_SPAWN_SEQUENCE,
    category: 'compatibility',
    label: 'Sequência de spawn legada',
    description:
      'Mantém sequência determinística compatível com testes e métricas do sistema legado.',
    requiresRestart: true,
  },
  ASTEROID_EDGE_SPAWN_MARGIN: {
    key: 'ASTEROID_EDGE_SPAWN_MARGIN',
    type: 'number',
    defaultValue: ASTEROID_EDGE_SPAWN_MARGIN,
    category: 'spawning',
    label: 'Margem de spawn na borda',
    description:
      'Define a margem em pixels utilizada quando PRESERVE_LEGACY_POSITIONING está ativo.',
    requiresRestart: true,
  },
};

function isDevEnvironment() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return Boolean(import.meta.env.DEV);
    }
  } catch (error) {
    // ignore - fallback below
  }

  if (typeof process !== 'undefined' && process?.env?.NODE_ENV) {
    return process.env.NODE_ENV === 'development';
  }

  return false;
}

function isLocalStorageAvailable() {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) {
      return false;
    }

    const testKey = '__feature_flag_test__';
    window.localStorage.setItem(testKey, 'ok');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    console.warn('[FeatureFlagManager] localStorage not available:', error);
    return false;
  }
}

function cloneOverrides(overridesMap) {
  return Object.fromEntries(overridesMap.entries());
}

export default class FeatureFlagManager {
  static getInstance() {
    if (!FeatureFlagManager._instance) {
      FeatureFlagManager._instance = new FeatureFlagManager();
    }

    return FeatureFlagManager._instance;
  }

  constructor() {
    if (FeatureFlagManager._instance) {
      return FeatureFlagManager._instance;
    }

    this._overrides = new Map();
    this._storageAvailable = isLocalStorageAvailable();

    this.loadFromLocalStorage();

    FeatureFlagManager._instance = this;
  }

  setFlag(flagKey, value) {
    const metadata = FEATURE_FLAGS[flagKey];

    if (!metadata) {
      console.warn(`[FeatureFlagManager] Flag desconhecida: ${flagKey}`);
      return false;
    }

    const normalizedValue = this._validateValue(metadata, value);
    if (normalizedValue === null) {
      return false;
    }

    const defaultValue = metadata.defaultValue;

    if (normalizedValue === defaultValue) {
      const hadOverride = this._overrides.delete(flagKey);
      if (hadOverride) {
        this.saveToLocalStorage();
        this._logDev(`Override removido para ${flagKey} (valor padrão restaurado)`);
      }
      return true;
    }

    this._overrides.set(flagKey, normalizedValue);
    this.saveToLocalStorage();
    this._logDev(`Override aplicado: ${flagKey} = ${normalizedValue}`);
    return true;
  }

  getFlag(flagKey) {
    if (this._overrides.has(flagKey)) {
      return this._overrides.get(flagKey);
    }

    const metadata = FEATURE_FLAGS[flagKey];
    return metadata ? metadata.defaultValue : undefined;
  }

  resetFlag(flagKey) {
    const metadata = FEATURE_FLAGS[flagKey];
    if (!metadata) {
      console.warn(`[FeatureFlagManager] Flag desconhecida: ${flagKey}`);
      return undefined;
    }

    this._overrides.delete(flagKey);
    this.saveToLocalStorage();
    this._logDev(`Override resetado: ${flagKey}`);
    return metadata.defaultValue;
  }

  resetAllFlags() {
    if (this._overrides.size === 0) {
      return;
    }

    this._overrides.clear();
    this.saveToLocalStorage(true);
    this._logDev('Todos os overrides foram resetados.');
  }

  getAllFlags() {
    return Object.keys(FEATURE_FLAGS).map((key) => {
      const metadata = FEATURE_FLAGS[key];
      const isOverridden = this._overrides.has(key);
      return {
        ...metadata,
        key,
        currentValue: isOverridden ? this._overrides.get(key) : metadata.defaultValue,
        isOverridden,
        defaultValue: metadata.defaultValue,
      };
    });
  }

  getOverrides() {
    return cloneOverrides(this._overrides);
  }

  hasOverrides() {
    return this._overrides.size > 0;
  }

  loadFromLocalStorage() {
    if (!this._storageAvailable) {
      return;
    }

    try {
      const serialized = window.localStorage.getItem(STORAGE_KEY);
      if (!serialized) {
        return;
      }

      const parsed = JSON.parse(serialized);
      if (!parsed || typeof parsed !== 'object') {
        console.warn('[FeatureFlagManager] Overrides inválidos encontrados no localStorage.');
        return;
      }

      Object.entries(parsed).forEach(([flagKey, value]) => {
        const metadata = FEATURE_FLAGS[flagKey];
        if (!metadata) {
          console.warn(`[FeatureFlagManager] Ignorando flag desconhecida do localStorage: ${flagKey}`);
          return;
        }

        const normalizedValue = this._validateValue(metadata, value);
        if (normalizedValue === null) {
          console.warn(
            `[FeatureFlagManager] Valor inválido para ${flagKey} encontrado no localStorage. Override ignorado.`
          );
          return;
        }

        if (normalizedValue !== metadata.defaultValue) {
          this._overrides.set(flagKey, normalizedValue);
        }
      });
    } catch (error) {
      console.warn('[FeatureFlagManager] Não foi possível carregar overrides do localStorage:', error);
    }
  }

  saveToLocalStorage(removeEntry = false) {
    if (!this._storageAvailable) {
      return;
    }

    try {
      if (removeEntry || this._overrides.size === 0) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }

      const serialized = JSON.stringify(cloneOverrides(this._overrides));
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
      console.warn('[FeatureFlagManager] Não foi possível salvar overrides no localStorage:', error);
    }
  }

  exportConfig() {
    return JSON.stringify(this.getOverrides(), null, 2);
  }

  importConfig(jsonString) {
    if (typeof jsonString !== 'string') {
      console.warn('[FeatureFlagManager] importConfig requer uma string JSON.');
      return false;
    }

    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        console.warn('[FeatureFlagManager] JSON inválido fornecido para importConfig.');
        return false;
      }

      let applied = 0;
      Object.entries(parsed).forEach(([flagKey, value]) => {
        if (this.setFlag(flagKey, value)) {
          applied += 1;
        }
      });

      if (applied > 0) {
        this._logDev(`Config importada com ${applied} override(s).`);
      }

      return applied > 0;
    } catch (error) {
      console.warn('[FeatureFlagManager] Erro ao importar configuração:', error);
      return false;
    }
  }

  logState() {
    this._logState();
  }

  _validateValue(metadata, value) {
    if (metadata.type === 'boolean') {
      if (typeof value === 'boolean') {
        return value;
      }
      console.warn(`[FeatureFlagManager] Valor inválido para ${metadata.key}. Esperado boolean.`);
      return null;
    }

    if (metadata.type === 'number') {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        console.warn(`[FeatureFlagManager] Valor inválido para ${metadata.key}. Esperado número.`);
        return null;
      }

      if (metadata.key === 'ASTEROID_EDGE_SPAWN_MARGIN') {
        if (numericValue < 0 || numericValue > 200) {
          console.warn('[FeatureFlagManager] ASTEROID_EDGE_SPAWN_MARGIN deve estar entre 0 e 200.');
          return null;
        }
      }

      return numericValue;
    }

    console.warn(`[FeatureFlagManager] Tipo não suportado para ${metadata.key}.`);
    return null;
  }

  _logDev(message) {
    if (!isDevEnvironment()) {
      return;
    }

    if (typeof console !== 'undefined') {
      console.log(`[FeatureFlagManager] ${message}`);
    }
  }

  _logState() {
    if (typeof console === 'undefined') {
      return;
    }

    const flags = this.getAllFlags().map((flag) => ({
      Flag: flag.key,
      Valor: flag.currentValue,
      Override: flag.isOverridden ? 'Sim' : 'Não',
      Padrão: flag.defaultValue,
      Categoria: flag.category,
    }));

    if (typeof console.table === 'function') {
      console.table(flags);
    } else {
      flags.forEach((entry) => {
        console.log(entry);
      });
    }
  }
}
