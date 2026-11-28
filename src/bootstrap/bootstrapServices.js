import { isDebugLoggingEnabled } from '../core/debugLogging.js';

// Second phase of boot: ServiceRegistry.setupServices registered every
// service; this creates the eager ones, and a failure is thrown.
export function bootstrapServices({ container, logger = console } = {}) {
  if (!container) {
    throw new Error('[bootstrapServices] DI container instance is required');
  }

  const resolvedServices = container.createEagerServices();

  if (
    isDebugLoggingEnabled() &&
    logger &&
    typeof logger.groupCollapsed === 'function'
  ) {
    logger.groupCollapsed('[bootstrapServices] Services initialized');
    logger.table?.(
      Object.entries(resolvedServices).map(([name, instance]) => ({
        name,
        type: instance?.constructor?.name || typeof instance,
        hasReset: typeof instance?.reset === 'function',
      }))
    );
    logger.groupEnd();
  }

  return { services: resolvedServices };
}
