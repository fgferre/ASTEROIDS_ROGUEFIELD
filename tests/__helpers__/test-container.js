import { ServiceRegistry } from '../../src/core/ServiceRegistry.js';

/**
 * Create a ServiceRegistry test container with a deterministic random seed.
 * Lives apart from setup.js so tests that do not need it skip loading the
 * whole game manifest.
 *
 * @param {string} [seed='test-seed'] - Seed forwarded to the container factory.
 * @returns {ReturnType<typeof ServiceRegistry.createTestContainer>}
 * @example
 * const container = createTestContainer('audio-seed');
 * const random = container.resolve('RandomService');
 */
export function createTestContainer(seed = 'test-seed') {
  return ServiceRegistry.createTestContainer({ randomSeed: seed });
}
