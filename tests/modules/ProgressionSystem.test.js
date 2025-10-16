import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import RandomService from '../../src/core/RandomService.js';

const noop = () => {};

describe('ProgressionSystem randomised upgrade selection', () => {
  let listeners;
  let emittedEvents;

  const dispatch = (event, payload) => {
    const handlers = listeners.get(event);
    if (!handlers) {
      return;
    }
    handlers.forEach((handler) => handler(payload));
  };

  beforeEach(() => {
    listeners = new Map();
    emittedEvents = [];
    globalThis.gameEvents = {
      on(event, handler) {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(handler);
      },
      emit(event, payload) {
        emittedEvents.push({ event, payload });
        dispatch(event, payload);
      },
    };
  });

  afterEach(() => {
    delete globalThis.gameEvents;
    emittedEvents = null;
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

  const findEvents = (type) =>
    emittedEvents.filter((entry) => entry.event === type).map((entry) => entry.payload);

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

  it('tracks combos and applies multipliers to collected experience', () => {
    const progression = createProgression(9001);

    expect(progression.currentCombo).toBe(0);
    expect(progression.comboMultiplier).toBe(1);

    globalThis.gameEvents.emit('enemy-destroyed', { cause: 'test' });
    expect(progression.currentCombo).toBe(1);
    expect(progression.comboMultiplier).toBe(1);
    expect(progression.comboTimer).toBeCloseTo(progression.comboTimeout);

    globalThis.gameEvents.emit('enemy-destroyed', { cause: 'test' });
    expect(progression.currentCombo).toBe(2);
    expect(progression.comboMultiplier).toBeCloseTo(1.1, 5);

    emittedEvents = [];
    const result = progression.collectXP(100);
    expect(result.gained).toBeGreaterThan(100);
    expect(progression.totalExperience).toBe(result.gained);

    progression.update(progression.comboTimeout + 0.5);
    expect(progression.currentCombo).toBe(0);
    expect(progression.comboMultiplier).toBe(1);

    const comboBrokenEvents = findEvents('combo-broken');
    expect(comboBrokenEvents.length).toBeGreaterThan(0);
    const latestComboBreak = comboBrokenEvents[comboBrokenEvents.length - 1];
    expect(latestComboBreak).toMatchObject({ reason: 'timeout' });
  });
});
