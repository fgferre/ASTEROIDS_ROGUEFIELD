import { refreshFeatureFlagConstants } from './GameConstants.js';

const FEATURE_FLAGS_STORAGE_KEY = 'asteroids:featureFlags';

const DEFAULT_FLAGS = {
  useWaveManager: false,
  asteroidSpawn: false,
  legacySizeDistribution: true,
  legacyPositioning: true,
  strictLegacySpawn: true,
};

const FLAG_MAPPINGS = {
  'use-wave-manager': '__USE_WAVE_MANAGER_OVERRIDE__',
  'asteroid-spawn': '__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__',
  'legacy-size-distribution': '__PRESERVE_LEGACY_SIZE_DISTRIBUTION_OVERRIDE__',
  'legacy-positioning': '__PRESERVE_LEGACY_POSITIONING_OVERRIDE__',
  'strict-legacy-spawn': '__STRICT_LEGACY_SPAWN_SEQUENCE_OVERRIDE__',
};

const FLAG_ID_TO_KEY = {
  'use-wave-manager': 'useWaveManager',
  'asteroid-spawn': 'asteroidSpawn',
  'legacy-size-distribution': 'legacySizeDistribution',
  'legacy-positioning': 'legacyPositioning',
  'strict-legacy-spawn': 'strictLegacySpawn',
};

const FLAG_METADATA = {
  useWaveManager: {
    id: 'use-wave-manager',
    label: 'Enable New Wave Manager',
    description:
      'Activates the new enemy spawning system with support for drones, mines, hunters, and bosses.',
  },
  asteroidSpawn: {
    id: 'asteroid-spawn',
    label: 'WaveManager Handles Asteroids',
    description:
      'Let the new WaveManager control asteroid spawning (requires Wave Manager enabled).',
  },
  legacySizeDistribution: {
    id: 'legacy-size-distribution',
    label: 'Preserve Legacy Size Distribution',
    description:
      'Use original 50/30/20 asteroid size distribution instead of 30/40/30.',
  },
  legacyPositioning: {
    id: 'legacy-positioning',
    label: 'Preserve Legacy Positioning',
    description:
      'Spawn asteroids at screen edges (legacy) instead of safe distance from player.',
  },
  strictLegacySpawn: {
    id: 'strict-legacy-spawn',
    label: 'Strict Legacy Spawn Sequence',
    description:
      'Maintain exact random number sequence from original implementation.',
  },
};

const FLAG_KEY_TO_OVERRIDE = Object.fromEntries(
  Object.entries(FLAG_MAPPINGS).map(([checkboxId, overrideKey]) => [
    FLAG_ID_TO_KEY[checkboxId],
    overrideKey,
  ]),
);

function getStorage() {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  try {
    return globalThis.localStorage ?? null;
  } catch (error) {
    console.warn('[featureFlagManager] Unable to access localStorage.', error);
    return null;
  }
}

function cloneFlags(flags) {
  return {
    useWaveManager: Boolean(flags.useWaveManager),
    asteroidSpawn: Boolean(flags.asteroidSpawn),
    legacySizeDistribution: Boolean(flags.legacySizeDistribution),
    legacyPositioning: Boolean(flags.legacyPositioning),
    strictLegacySpawn: Boolean(flags.strictLegacySpawn),
  };
}

function normalizeFlags(flags) {
  return cloneFlags({
    ...DEFAULT_FLAGS,
    ...(typeof flags === 'object' && flags !== null ? flags : {}),
  });
}

function getGlobal() {
  return typeof globalThis !== 'undefined' ? globalThis : undefined;
}

export function loadFeatureFlags() {
  const storage = getStorage();

  if (!storage) {
    return cloneFlags(DEFAULT_FLAGS);
  }

  try {
    const raw = storage.getItem(FEATURE_FLAGS_STORAGE_KEY);

    if (!raw) {
      return cloneFlags(DEFAULT_FLAGS);
    }

    const parsed = JSON.parse(raw);
    return normalizeFlags(parsed);
  } catch (error) {
    console.warn('[featureFlagManager] Failed to parse feature flag storage.', error);
    return cloneFlags(DEFAULT_FLAGS);
  }
}

export function saveFeatureFlags(flags) {
  const storage = getStorage();
  const normalized = normalizeFlags(flags);

  if (!storage) {
    return normalized;
  }

  try {
    storage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('[featureFlagManager] Failed to save feature flags.', error);
  }

  return normalized;
}

export function applyFeatureFlagsToGlobal(flags) {
  const globalScope = getGlobal();
  const normalized = normalizeFlags(flags);

  if (!globalScope) {
    return normalized;
  }

  Object.entries(FLAG_KEY_TO_OVERRIDE).forEach(([flagKey, overrideKey]) => {
    globalScope[overrideKey] = normalized[flagKey];
  });

  refreshFeatureFlagConstants();

  return normalized;
}

export function resetFeatureFlagsToDefaults() {
  const normalized = cloneFlags(DEFAULT_FLAGS);
  saveFeatureFlags(normalized);
  applyFeatureFlagsToGlobal(normalized);
  return normalized;
}

export function getFeatureFlagStatus() {
  const currentFlags = loadFeatureFlags();

  return Object.entries(FLAG_METADATA).reduce((statusTable, [flagKey, meta]) => {
    statusTable[meta.label] = {
      Enabled: currentFlags[flagKey],
      Description: meta.description,
    };
    return statusTable;
  }, {});
}

export function logFeatureFlagStatus() {
  const globalScope = getGlobal();
  const status = getFeatureFlagStatus();

  if (!globalScope || typeof globalScope.console === 'undefined') {
    return status;
  }

  const consoleRef = globalScope.console;

  if (typeof consoleRef.groupCollapsed === 'function') {
    consoleRef.groupCollapsed('🎮 Wave System Feature Flags');
  } else if (typeof consoleRef.group === 'function') {
    consoleRef.group('🎮 Wave System Feature Flags');
  }

  if (typeof consoleRef.table === 'function') {
    consoleRef.table(status);
  } else {
    consoleRef.log(status);
  }

  consoleRef.info('Adjust feature flags via the Wave System Configuration screen.');

  if (typeof consoleRef.groupEnd === 'function') {
    consoleRef.groupEnd();
  }

  return status;
}

export function getFeatureFlagMappings() {
  return {
    ids: { ...FLAG_ID_TO_KEY },
    overrides: { ...FLAG_MAPPINGS },
  };
}

export { DEFAULT_FLAGS };
