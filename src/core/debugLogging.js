// src/core/debugLogging.js
// Utilidades centralizadas para controlar logs de depuração em todo o jogo.

export const DEBUG_LOGGING_QUERY_PARAM = 'debugLogging';
export const DEBUG_LOGGING_STORAGE_KEY = 'asteroids:debugLogging';
export const DEBUG_LOGGING_DEFAULT = true;
export const DEBUG_LOGGING_GLOBAL_FLAG = '__DEBUG_LOGGING_ENABLED__';

const debugControllers = new Map();
let cachedPreference;

function getGlobalScope() {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof window !== 'undefined') return window;
  if (typeof global !== 'undefined') return global;
  return undefined;
}

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return undefined;
}

export function parseBoolean(value, fallback = DEBUG_LOGGING_DEFAULT) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return fallback;
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return true;
    }

    if (['true', '1', 'yes', 'y', 'on', 'enable', 'enabled'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'n', 'off', 'disable', 'disabled'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function readFromQueryString() {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(DEBUG_LOGGING_QUERY_PARAM)) {
      return null;
    }

    const value = params.get(DEBUG_LOGGING_QUERY_PARAM);
    if (value === null || value === '') {
      return true;
    }

    return parseBoolean(value, true);
  } catch (error) {
    console.warn('[debugLogging] Não foi possível ler parâmetro de query:', error);
    return null;
  }
}

function readFromStorage() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const storedValue = storage.getItem(DEBUG_LOGGING_STORAGE_KEY);
    if (storedValue === null) {
      return null;
    }

    return parseBoolean(storedValue, DEBUG_LOGGING_DEFAULT);
  } catch (error) {
    console.warn('[debugLogging] Não foi possível acessar localStorage:', error);
    return null;
  }
}

export function resolveDebugPreference() {
  const fromQuery = readFromQueryString();
  if (fromQuery !== null) {
    cachedPreference = fromQuery;
    return fromQuery;
  }

  const fromStorage = readFromStorage();
  if (fromStorage !== null) {
    cachedPreference = fromStorage;
    return fromStorage;
  }

  cachedPreference = DEBUG_LOGGING_DEFAULT;
  return DEBUG_LOGGING_DEFAULT;
}

export function isDebugLoggingEnabled() {
  if (typeof cachedPreference === 'boolean') {
    return cachedPreference;
  }

  return resolveDebugPreference();
}

function persistPreference(value) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(DEBUG_LOGGING_STORAGE_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.warn('[debugLogging] Não foi possível salvar preferência de debug:', error);
  }
}

function notifyControllers(enabled) {
  debugControllers.forEach((controller, name) => {
    try {
      controller(enabled);
    } catch (error) {
      console.error(
        `[debugLogging] Erro ao atualizar controlador '${name}':`,
        error
      );
    }
  });
}

export function applyDebugPreference(preference, options = {}) {
  const { persist = true } = options;
  const enabled = parseBoolean(preference, DEBUG_LOGGING_DEFAULT);
  const previous = cachedPreference;
  cachedPreference = enabled;

  const scope = getGlobalScope();
  if (scope) {
    scope[DEBUG_LOGGING_GLOBAL_FLAG] = enabled;
  }

  if (persist) {
    persistPreference(enabled);
  }

  if (previous !== enabled) {
    notifyControllers(enabled);
  }

  return enabled;
}

export function registerDebugLoggingController(
  name,
  controller,
  options = {}
) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    console.warn('[debugLogging] Nome do controlador deve ser uma string não vazia.');
    return () => {};
  }

  if (typeof controller !== 'function') {
    console.warn(`[debugLogging] Controlador '${name}' deve ser uma função.`);
    return () => {};
  }

  const normalizedName = name.trim();

  if (debugControllers.has(normalizedName)) {
    console.warn(
      `[debugLogging] Controlador '${normalizedName}' já registrado. Sobrescrevendo.`
    );
  }

  debugControllers.set(normalizedName, controller);

  const { applyCurrent = true } = options;
  if (applyCurrent) {
    try {
      controller(isDebugLoggingEnabled());
    } catch (error) {
      console.error(
        `[debugLogging] Erro ao aplicar controlador '${normalizedName}':`,
        error
      );
    }
  }

  return () => {
    unregisterDebugLoggingController(normalizedName);
  };
}

export function unregisterDebugLoggingController(name) {
  if (typeof name !== 'string') {
    return false;
  }

  return debugControllers.delete(name.trim());
}

export function getRegisteredDebugLoggingControllers() {
  return Array.from(debugControllers.keys());
}

// Inicializa estado global com valor resolvido na carga do módulo
applyDebugPreference(resolveDebugPreference(), { persist: false });
