const RANGE_CONSTRAINTS = {
  ASTEROID_EDGE_SPAWN_MARGIN: { min: 0, max: 200 },
};

function resolveExpectedType(type, defaultValue) {
  if (type) {
    return type;
  }

  return typeof defaultValue;
}

export function normalizeFeatureFlagValue(flagKey, rawValue, { type, defaultValue } = {}) {
  const expectedType = resolveExpectedType(type, defaultValue);

  if (expectedType === 'boolean') {
    return typeof rawValue === 'boolean' ? rawValue : null;
  }

  if (expectedType === 'number') {
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    const limits = RANGE_CONSTRAINTS[flagKey];
    if (limits) {
      const { min, max } = limits;
      if (typeof min === 'number' && numericValue < min) {
        return null;
      }
      if (typeof max === 'number' && numericValue > max) {
        return null;
      }
    }

    return numericValue;
  }

  return null;
}
