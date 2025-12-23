// Utility helpers for managing snapshot export/import patterns across systems.

// --- Safe value conversion helpers ---
export function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function safeBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return Boolean(value);
}

// --- Clone helpers ---
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  return JSON.parse(JSON.stringify(obj));
}

export function shallowClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.slice();
  }

  return { ...obj };
}

// --- Snapshot validation helpers ---
export function hasRequiredFields(snapshot, fields = []) {
  if (!fields || fields.length === 0) {
    return true;
  }

  for (let i = 0; i < fields.length; i += 1) {
    if (!(fields[i] in (snapshot || {}))) {
      return false;
    }
  }

  return true;
}

export function validateSnapshot(snapshot, requiredFields = []) {
  if (!snapshot || typeof snapshot !== 'object') {
    return false;
  }

  return hasRequiredFields(snapshot, requiredFields);
}

// --- Fallback handling ---
export function createFallbackHandler({
  systemName = 'System',
  warningFlag = '_snapshotFallbackWarningIssued',
  onFallback,
} = {}) {
  return function handleSnapshotFallback(reason) {
    const context = this || {};
    const alreadyWarned = Boolean(warningFlag && context[warningFlag]);
    const detail = reason ? ` (${reason})` : '';

    if (!alreadyWarned) {
      if (warningFlag) {
        context[warningFlag] = true;
      }

      if (
        typeof console !== 'undefined' &&
        typeof console.warn === 'function'
      ) {
        console.warn(
          `[${systemName}] Snapshot data unavailable, performing full reset${detail}`
        );
      }
    }

    if (typeof onFallback === 'function') {
      onFallback.call(context);
    }

    return false;
  };
}
