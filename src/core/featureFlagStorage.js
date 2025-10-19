export const FEATURE_FLAG_STORAGE_KEY = 'asteroids_feature_flags';

export function readPersistedFeatureFlagOverrides() {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return {};
  }

  try {
    const serialized = window.localStorage.getItem(FEATURE_FLAG_STORAGE_KEY);
    if (!serialized) {
      return {};
    }

    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed;
  } catch (error) {
    console.warn('[FeatureFlags] Failed to read overrides from localStorage:', error);
    return {};
  }
}
