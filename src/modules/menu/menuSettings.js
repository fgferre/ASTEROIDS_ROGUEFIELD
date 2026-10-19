// src/modules/menu/menuSettings.js
//
// How the menu follows the player's settings: the asteroids' normal
// intensity (Settings → Video) at boot, on every settings change and on the
// video-settings event; every change also re-syncs the hull preview (a
// Hangar purchase, Reduced Motion). MenuBackgroundSystem owns the
// subscription and passes its own updaters; the bodies came from it
// unchanged.

/**
 * @param {() => object} getSettingsService - the system's, asked inside the
 *   guard as before
 * @returns {number} the stored intensity, clamped to 0..2.5 (1 without one)
 */
export function resolveInitialNormalIntensity(getSettingsService) {
  let resolved = 1;

  try {
    const settings = getSettingsService();
    if (settings && typeof settings.getCategoryValues === 'function') {
      const videoValues = settings.getCategoryValues('video');
      const stored = videoValues?.menuAsteroidNormalIntensity;
      if (typeof stored === 'number' && Number.isFinite(stored)) {
        resolved = stored;
      }
    }
  } catch (error) {
    console.warn(
      '[MenuBackgroundSystem] Unable to resolve initial normal intensity from settings:',
      error
    );
  }

  const numeric = Number(resolved);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(2.5, numeric)) : 1;
}

/**
 * The settings listener the system subscribes with.
 * @param {object} settings - the settings service (current video values)
 * @param {object} updaters - syncHullPreview() and
 *   updateNormalIntensity(value), the system's
 */
export function createSettingsListener(
  settings,
  { syncHullPreview, updateNormalIntensity }
) {
  return (change = {}) => {
    if (!change) {
      return;
    }

    syncHullPreview();

    if (change.type === 'snapshot') {
      const snapshotValue = change.value?.video?.menuAsteroidNormalIntensity;
      if (typeof snapshotValue === 'number') {
        updateNormalIntensity(snapshotValue);
      }
      return;
    }

    if (change.category === 'video') {
      if (
        change.key === 'menuAsteroidNormalIntensity' &&
        typeof change.value === 'number'
      ) {
        updateNormalIntensity(change.value);
        return;
      }

      if (typeof settings.getCategoryValues === 'function') {
        const videoValues = settings.getCategoryValues('video');
        const stored = videoValues?.menuAsteroidNormalIntensity;
        if (typeof stored === 'number') {
          updateNormalIntensity(stored);
        }
      }
    }
  };
}

/** The 'settings-video-changed' event: its values, else the one change. */
export function applyVideoSettingsChange(event, updateNormalIntensity) {
  const { values, change } = event;

  if (values && typeof values.menuAsteroidNormalIntensity === 'number') {
    updateNormalIntensity(values.menuAsteroidNormalIntensity);
    return;
  }

  if (
    change &&
    change.key === 'menuAsteroidNormalIntensity' &&
    typeof change.value === 'number'
  ) {
    updateNormalIntensity(change.value);
  }
}
