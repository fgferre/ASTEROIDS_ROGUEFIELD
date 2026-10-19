// What every enemy item (src/content/enemies) owes the engine: the fields the
// factory, its pool, the rewards, the Elite affixes, mine blasts and enemy
// shots read, and a class to build it from — for a recipe, behaviors the
// library has, with the params each reads. Every kind a layer asks for is one
// of these items.
import { describe, expect, it } from 'vitest';
import { getContent, listContent } from '../../src/content/registry.js';
import { AFFIX_IDS } from '../../src/data/enemies/affixes.js';
import { LAYERS, LAYER_MODIFIERS } from '../../src/data/layers.js';
import { TYPE_CLASSES } from '../../src/modules/enemies/base/enemyTypeRegistry.js';
import { BEHAVIORS } from '../../src/modules/enemies/behaviors/index.js';

const enemies = listContent('enemies');
const isStringList = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isCount = (value) => Number.isInteger(value) && value > 0;
const recipes = enemies.filter((enemy) => enemy.behaviors);
const isKind = {
  number: Number.isFinite,
  string: (v) => typeof v === 'string',
};

describe('enemy content', () => {
  it.each(enemies)('$id has the stats, components and rewards', (enemy) => {
    const { config, components, rewards } = enemy;
    expect(typeof config.displayName).toBe('string');
    expect(config.radius).toBeGreaterThan(0);
    expect(config.health).toBeGreaterThan(0);
    expect(typeof components.movement.strategy).toBe('string');
    expect(rewards.totalXP).toBeGreaterThan(0);
    if (rewards.baseOrbsMin === undefined) {
      expect(isCount(rewards.baseOrbs)).toBe(true);
    } else {
      expect(isCount(rewards.baseOrbsMin)).toBe(true);
      expect(rewards.baseOrbsMax).toBeGreaterThanOrEqual(rewards.baseOrbsMin);
    }
    expect(rewards.healthHeartChance).toBeGreaterThanOrEqual(0);
    expect(rewards.healthHeartChance).toBeLessThanOrEqual(1);
  });

  it.each(enemies)('$id has a pool, tags and engine flags', (enemy) => {
    expect(isCount(enemy.pool.initial)).toBe(true);
    expect(enemy.pool.max).toBeGreaterThanOrEqual(enemy.pool.initial);
    expect(isStringList(enemy.tags)).toBe(true);
    expect(enemy.tags).toContain('enemy');
    expect(['undefined', 'boolean']).toContain(typeof enemy.explodesOnDeath);
    expect(['undefined', 'string']).toContain(typeof enemy.projectileColor);
  });

  it.each(enemies)('$id rolls only affixes the table has', ({ affixes }) => {
    expect(isStringList(affixes)).toBe(true);
    for (const affix of affixes) expect(AFFIX_IDS).toContain(affix);
  });

  it.each(enemies)('$id has a class to build it from', ({ id }) => {
    expect(typeof TYPE_CLASSES[id]).toBe('function');
  });

  it.each(recipes)(
    '$id names behaviors the library has, with the params each reads',
    ({ behaviors, seeded }) => {
      expect(typeof seeded).toBe('boolean');
      for (const [name, params] of Object.entries(behaviors)) {
        const behavior = BEHAVIORS[name];
        expect(behavior, name).toBeDefined();
        expect(Object.keys(params).sort(), name).toEqual(
          Object.keys(behavior.params).sort()
        );
        for (const [key, kind] of Object.entries(behavior.params)) {
          expect(isKind[kind](params[key]), `${name}.${key}`).toBe(true);
        }
        if (behavior.usesRandom) expect(seeded, name).toBe(true);
      }
    }
  );

  it('names a class only for an enemy item', () => {
    for (const id of Object.keys(TYPE_CLASSES)) {
      expect(getContent('enemies', id), id).toBeDefined();
    }
  });

  it('every kind a layer asks for is an enemy item', () => {
    const kinds = [
      ...LAYERS.flatMap((layer) => layer.roster.map(({ kind }) => kind)),
      ...LAYERS.flatMap((layer) => layer.surges.flatMap(({ kinds }) => kinds)),
      ...Object.values(LAYER_MODIFIERS).flatMap(({ kinds = [] }) => kinds),
    ].filter((kind) => kind !== 'asteroid');
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(getContent('enemies', kind), kind).toBeDefined();
    }
  });
});
