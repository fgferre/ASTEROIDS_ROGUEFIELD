export function normalizeDependencies(dependencies) {
  if (
    !dependencies ||
    typeof dependencies !== 'object' ||
    Array.isArray(dependencies)
  ) {
    return {};
  }

  return { ...dependencies };
}

export function resolveService(name, dependencies = {}) {
  if (dependencies && dependencies[name]) {
    return dependencies[name];
  }

  const resolver = dependencies?.serviceResolver;
  if (typeof resolver === 'function') {
    try {
      return resolver(name);
    } catch (error) {
      return null;
    }
  }

  return null;
}

// A missing required service is a wiring bug: fail at construction, not as a
// silent per-frame no-op. Use resolveService for genuinely optional lookups.
export function requireService(name, dependencies = {}, caller = 'service') {
  const service = resolveService(name, dependencies);
  if (!service) {
    throw new Error(`[${caller}] required service '${name}' is not registered`);
  }
  return service;
}

export function resolveEventBus(dependencies = {}) {
  const byKey =
    dependencies?.['event-bus'] ||
    dependencies?.eventBus ||
    dependencies?.events;
  if (byKey) {
    return byKey;
  }

  const resolved = resolveService('event-bus', dependencies);
  if (resolved) {
    return resolved;
  }

  return null;
}

export function createServiceResolver(container) {
  if (!container || typeof container.resolve !== 'function') {
    return null;
  }

  return (name, { requireInstantiated = true } = {}) => {
    if (!name) {
      return null;
    }

    if (typeof container.has === 'function' && !container.has(name)) {
      return null;
    }

    if (
      requireInstantiated &&
      typeof container.isInstantiated === 'function' &&
      !container.isInstantiated(name)
    ) {
      return null;
    }

    try {
      return container.resolve(name);
    } catch (error) {
      return null;
    }
  };
}
