import { describe, expect, it, vi } from 'vitest';

import { EnemyFactory } from '../../../src/modules/enemies/base/EnemyFactory.js';
import { RewardManager } from '../../../src/modules/enemies/managers/RewardManager.js';
import Husk from '../../../src/modules/enemies/types/Husk.js';
import {
  HUSK_COMPONENTS,
  HUSK_CONFIG,
} from '../../../src/content/enemies/husk.js';
import { ELITE_MODIFIERS } from '../../../src/data/enemies/elite.js';
import { createDeterministicRandom } from '../../__helpers__/stubs.js';

const createHusk = (config) => {
  const factory = new EnemyFactory({ eventBus: { emit: vi.fn() } });
  factory.registerType('husk', {
    class: Husk,
    defaults: { ...HUSK_CONFIG, components: HUSK_COMPONENTS },
  });
  return factory.create('husk', { x: 100, y: 100, wave: 1, ...config });
};

const xpDropped = (enemy) => {
  const createXPOrb = vi.fn();
  new RewardManager({
    xpOrbSystem: { createXPOrb },
    random: createDeterministicRandom({ chanceValue: false }),
  }).dropRewards(enemy);
  return {
    orbs: createXPOrb.mock.calls.length,
    xp: createXPOrb.mock.calls.reduce((sum, call) => sum + call[2], 0),
  };
};

describe('Elite modifier', () => {
  it('scales health, radius and rewards and prefixes the name', () => {
    const normal = createHusk({});
    const elite = createHusk({ elite: true });

    expect(normal.displayName).toBe('Husk');
    expect(elite.displayName).toBe('Elite Husk');
    expect(elite.maxHealth).toBeCloseTo(normal.maxHealth * 2.5, 5);
    expect(elite.health).toBe(elite.maxHealth);
    expect(elite.radius).toBeCloseTo(normal.radius * 1.3, 5);
    expect(elite.contactDamage).toBeCloseTo(normal.contactDamage * 1.5, 5);
    expect(elite.movementConfig.maxSpeed).toBeCloseTo(
      normal.movementConfig.maxSpeed * 0.9,
      5
    );

    const normalDrop = xpDropped(normal);
    const eliteDrop = xpDropped(elite);
    expect(eliteDrop.xp).toBe(normalDrop.xp * ELITE_MODIFIERS.rewards);
    expect(eliteDrop.orbs).toBe(normalDrop.orbs * ELITE_MODIFIERS.rewards);
  });
});
