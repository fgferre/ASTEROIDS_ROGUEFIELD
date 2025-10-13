import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import RandomService from '../../src/core/RandomService.js';

const noop = () => {};

describe('ProgressionSystem randomised upgrade selection', () => {
  let listeners;

  const dispatch = (event, payload) => {
    const handlers = listeners.get(event);
    if (!handlers) {
      return;
    }
    handlers.forEach((handler) => handler(payload));
  };

  beforeEach(() => {
    listeners = new Map();
    globalThis.gameEvents = {
      on(event, handler) {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(handler);
      },
      emit(event, payload) {
        dispatch(event, payload);
      },
    };
  });

  afterEach(() => {
    delete globalThis.gameEvents;
  });

  const createProgression = (seed) =>
    new ProgressionSystem({
      random: new RandomService(seed),
      player: {},
      ui: {},
      effects: {},
      'xp-orbs': { attachProgression: noop },
    });

  const collectUpgradeIds = (progression, count = 3) =>
    progression
      .prepareUpgradeOptions(count)
      .options.map((option) => option?.id)
      .filter(Boolean);

  it('produces identical upgrade options after deterministic resets', () => {
    const seed = 424242;
    const progression = createProgression(seed);
    const desiredCount = 5;

    const firstRun = collectUpgradeIds(progression, desiredCount);
    expect(firstRun.length).toBe(desiredCount);

    globalThis.gameEvents.emit('progression-reset');
    const secondRun = collectUpgradeIds(progression, desiredCount);
    expect(secondRun).toStrictEqual(firstRun);

    globalThis.gameEvents.emit('player-reset');
    const thirdRun = collectUpgradeIds(progression, desiredCount);
    expect(thirdRun).toStrictEqual(firstRun);
  });

  it('matches upgrade options for separate instances with the same seed', () => {
    const seed = 1337;
    const desiredCount = 4;
    const first = createProgression(seed);
    const second = createProgression(seed);

    const firstOptions = collectUpgradeIds(first, desiredCount);
    const secondOptions = collectUpgradeIds(second, desiredCount);

    expect(firstOptions).toStrictEqual(secondOptions);
  });
});
