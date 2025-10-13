import { describe, expect, it, vi } from 'vitest';

import MenuBackgroundSystem from '../../modules/MenuBackgroundSystem.js';
import RandomService from '../../core/RandomService.js';

describe('MenuBackgroundSystem deterministic UUID integration', () => {
  it('replaces THREE.MathUtils.generateUUID with a deterministic generator', () => {
    const mathRandomSpy = vi.spyOn(global.Math, 'random');

    const system = new MenuBackgroundSystem({ random: new RandomService('menu-test-seed') });

    const mathUtils = {};
    Object.defineProperty(mathUtils, 'generateUUID', {
      value: vi.fn(() => 'original-uuid'),
      configurable: true,
      writable: false,
    });
    system.THREE = { MathUtils: mathUtils };

    system.applyDeterministicThreeUuidGenerator();
    system.applyDeterministicThreeUuidGenerator();

    const firstSequence = [
      system.THREE.MathUtils.generateUUID(),
      system.THREE.MathUtils.generateUUID(),
      system.THREE.MathUtils.generateUUID(),
    ];

    expect(mathRandomSpy).not.toHaveBeenCalled();
    expect(firstSequence).toHaveLength(3);
    firstSequence.forEach((uuid) => {
      expect(uuid).not.toBe('original-uuid');
      expect(uuid.startsWith('menu-background.three-uuid')).toBe(true);
    });

    system.reset();

    const secondSequence = [
      system.THREE.MathUtils.generateUUID(),
      system.THREE.MathUtils.generateUUID(),
      system.THREE.MathUtils.generateUUID(),
    ];

    expect(secondSequence).toEqual(firstSequence);

    mathRandomSpy.mockRestore();
  });
});
