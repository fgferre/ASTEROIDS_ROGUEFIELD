import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import RandomService from '../../src/core/RandomService.js';
import EffectsSystem from '../../src/modules/EffectsSystem.js';
import MenuBackgroundSystem from '../../src/modules/MenuBackgroundSystem.js';

const createSettingsStub = () => ({
  getCategoryValues: vi.fn(() => null),
});

describe('Systems expose random helpers directly', () => {
  let logSpy;
  let warnSpy;

  beforeAll(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
  });

  it('EffectsSystem attaches helper methods to the instance', () => {
    const random = new RandomService('effects-test');
    const system = new EffectsSystem({
      random,
      audio: {},
      settings: createSettingsStub(),
    });

    expect(system.randomHelpers).toBeDefined();
    expect(system.randomFloat).toBe(system.randomHelpers.randomFloat);
    expect(system.randomRange).toBe(system.randomHelpers.randomRange);
    expect(system.randomChance).toBe(system.randomHelpers.randomChance);

    const floatValue = system.randomFloat('base');
    expect(floatValue).toBeGreaterThanOrEqual(0);
    expect(floatValue).toBeLessThan(1);

    const rangeValue = system.randomRange(5, 15, 'particles');
    expect(rangeValue).toBeGreaterThanOrEqual(5);
    expect(rangeValue).toBeLessThan(15);
  });

  it('MenuBackgroundSystem attaches helper methods to the instance', () => {
    const random = new RandomService('menu-test');
    const system = new MenuBackgroundSystem({ random });

    expect(system.randomHelpers).toBeDefined();
    expect(system.randomFloat).toBe(system.randomHelpers.randomFloat);
    expect(system.randomInt).toBe(system.randomHelpers.randomInt);

    const floatValue = system.randomFloat('base');
    expect(floatValue).toBeGreaterThanOrEqual(0);
    expect(floatValue).toBeLessThan(1);

    const intValue = system.randomInt(1, 3, 'starfield');
    expect(intValue).toBeGreaterThanOrEqual(1);
    expect(intValue).toBeLessThanOrEqual(3);
  });
});
