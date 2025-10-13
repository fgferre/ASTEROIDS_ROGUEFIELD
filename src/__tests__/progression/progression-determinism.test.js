import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServiceRegistry } from '../../core/ServiceRegistry.js';
import ProgressionSystem from '../../modules/ProgressionSystem.js';

const noop = () => {};

function createEventBus() {
  const listeners = new Map();

  return {
    on(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(handler);
    },
    emit(event, payload) {
      const handlers = listeners.get(event);
      if (!handlers) {
        return;
      }
      handlers.forEach((handler) => handler(payload));
    },
    clear() {
      listeners.clear();
    },
  };
}

describe('ProgressionSystem RNG determinism', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = createEventBus();
    globalThis.gameEvents = eventBus;
  });

  afterEach(() => {
    if (eventBus) {
      eventBus.clear();
    }
    delete globalThis.gameEvents;
  });

  function createProgressionHarness(seed) {
    const container = ServiceRegistry.createTestContainer({ randomSeed: seed });
    const random = container.resolve('random');

    const progression = new ProgressionSystem({
      random,
      player: {},
      ui: {},
      effects: {},
      'xp-orbs': { attachProgression: noop },
    });

    return { container, random, progression };
  }

  function collectUpgradeIds(system, count) {
    return system
      .prepareUpgradeOptions(count)
      .options.map((option) => option?.id)
      .filter(Boolean);
  }

  it('repeats upgrade options after seeded random resets', () => {
    const seed = 424242;
    const { random, progression } = createProgressionHarness(seed);
    const desiredCount = 5;

    const initialOptions = collectUpgradeIds(progression, desiredCount);
    expect(initialOptions).toHaveLength(desiredCount);

    // Advance RNG state to ensure the reset actually restores order
    collectUpgradeIds(progression, desiredCount);

    // Reset the shared RandomService and notify the system about the reset cycle
    random.reset(random.seed);
    globalThis.gameEvents.emit('progression-reset');
    globalThis.gameEvents.emit('player-reset');

    const postResetOptions = collectUpgradeIds(progression, desiredCount);
    expect(postResetOptions).toStrictEqual(initialOptions);
  });
});
