import { createServiceManifest } from './serviceManifest.js';

export function bootstrapServices({
  container,
  manifestContext = {},
  seed,
  randomOverrides,
  logger = console,
  adapter = null
} = {}) {
  if (!container) {
    throw new Error('[bootstrapServices] DI container instance is required');
  }

  const resolvedManifestContext = { ...manifestContext };

  if (seed !== undefined && resolvedManifestContext.seed === undefined) {
    resolvedManifestContext.seed = seed;
  }

  if (
    randomOverrides !== undefined &&
    resolvedManifestContext.randomOverrides === undefined
  ) {
    resolvedManifestContext.randomOverrides = randomOverrides;
  }

  const manifest = createServiceManifest(resolvedManifestContext);
  const resolvedServices = {};

  manifest.forEach((entry) => {
    try {
      const instance = container.resolve(entry.name);
      resolvedServices[entry.name] = instance;

      if (adapter && typeof adapter.syncInstance === 'function') {
        adapter.syncInstance(entry.name, instance);
      }
    } catch (error) {
      throw new Error(`Failed to bootstrap service '${entry.name}': ${error.message}`);
    }
  });

  if (logger && typeof logger.groupCollapsed === 'function') {
    logger.groupCollapsed('[bootstrapServices] Services initialized');
    logger.table?.(
      Object.entries(resolvedServices).map(([name, instance]) => ({
        name,
        type: instance?.constructor?.name || typeof instance,
        hasReset: typeof instance?.reset === 'function'
      }))
    );
    logger.groupEnd();
  }

  return {
    manifest,
    services: resolvedServices
  };
}
