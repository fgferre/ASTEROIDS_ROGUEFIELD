// What every enemy item (src/content/enemies) owes the engine: the fields the
// factory, its pool, the rewards, the Elite affixes, mine blasts and enemy
// shots read, and a recipe to build it from: behaviors the library has, with
// the params each reads. Its look and sound, when it names them, are effects,
// cues and sizes the engine has. Its roles are ones the layers ask for, on a
// layer it can come to; every enemy one spawns is one of these items.
import { describe, expect, it } from 'vitest';
import { getContent, listContent } from '../../src/content/registry.js';
import { AUDIO_EVENT_CUES } from '../../src/data/audio/eventCues.js';
import { EXPLOSION_PROFILES } from '../../src/data/audio/explosions.js';
import { AFFIX_IDS, ELITE_AFFIXES } from '../../src/data/enemies/affixes.js';
import {
  LAYER_MODIFIERS,
  MODIFIER_FROM,
  directorFor,
  enemiesFor,
} from '../../src/data/layers.js';
import SFXBus from '../../src/modules/audio/SFXBus.js';
import { DEATH_EFFECTS } from '../../src/modules/effects/EnemyEffects.js';
import { FIRE_EFFECTS } from '../../src/modules/effects/EnemyFireEffects.js';
import { BEHAVIORS } from '../../src/modules/enemies/behaviors/index.js';
import { recipeEnemyClass } from '../../src/modules/enemies/types/RecipeEnemy.js';

const enemies = listContent('enemies');
const isStringList = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isCount = (value) => Number.isInteger(value) && value > 0;
const isKind = {
  number: Number.isFinite,
  string: (v) => typeof v === 'string',
};
// The cue kinds the event table reads from an enemy file (`cueOf` rows).
const CUE_KINDS = AUDIO_EVENT_CUES.flatMap(({ cueOf }) => cueOf ?? []);
// The roles layer n asks for, roster and surges.
const rolesOn = (n) => {
  const { roster, surges } = directorFor(n);
  return [
    ...roster.map(({ role }) => role),
    ...surges.flatMap(({ roles }) => roles),
  ];
};
// From an enemy's first layer: the rest of the table and the endless layers
// after it, which repeat layers 14 and 15.
const LAYERS_SCANNED = 20;

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

  it.each(enemies)('$id has a class to build it from', (enemy) => {
    expect(typeof recipeEnemyClass(enemy)).toBe('function');
  });

  it.each(enemies)(
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

  it.each(enemies)(
    '$id names flashes, deaths, cues and an explosion size the engine has',
    ({ effects = {}, cues = {}, explosion }) => {
      expect(['fire', 'death']).toEqual(
        expect.arrayContaining(Object.keys(effects))
      );
      if (effects.fire != null) {
        expect(Object.keys(FIRE_EFFECTS)).toContain(effects.fire);
      }
      if (effects.death !== undefined) {
        expect(Object.keys(DEATH_EFFECTS)).toContain(effects.death);
      }
      for (const [kind, cue] of Object.entries(cues)) {
        expect(CUE_KINDS).toContain(kind);
        expect(typeof SFXBus.prototype[cue], cue).toBe('function');
      }
      if (explosion !== undefined) {
        expect([...Object.keys(EXPLOSION_PROFILES), null]).toContain(explosion);
      }
    }
  );

  // Every one is built in the mirror (tests/modules/render3d/enemyMirror.test.js).
  it.each(enemies)(
    '$id picks its 3D look by name (`view`) or by recipe (`visual`), not both',
    ({ view, visual }) => {
      expect(['undefined', 'string']).toContain(typeof view);
      expect(['undefined', 'object']).toContain(typeof visual);
      expect(view !== undefined && visual !== undefined).toBe(false);
    }
  );

  it.each(enemies)(
    '$id has Codex text and a sighting line of the right shape',
    ({ codex = {}, sighting }) => {
      for (const [key, value] of Object.entries(codex)) {
        expect(['lore', 'hint', 'glyph']).toContain(key);
        expect(typeof value, key).toBe('string');
      }
      if (sighting !== undefined) {
        expect(typeof sighting).toBe('string');
        expect(sighting.length).toBeLessThanOrEqual(90);
      }
    }
  );

  it('every enemy a recipe or the Splitter releases is an enemy item', () => {
    const kinds = [
      ELITE_AFFIXES.splitter.type,
      ...enemies.flatMap(({ behaviors }) =>
        Object.values(behaviors).flatMap(({ type }) => type ?? [])
      ),
    ];
    expect(kinds.length).toBeGreaterThan(1);
    for (const kind of kinds) {
      expect(getContent('enemies', kind), kind).toBeDefined();
    }
  });

  it.each(enemies)(
    '$id has roles, and a weight and first layer when it sets them',
    ({ roles, weight = 1, fromLayer = 1 }) => {
      expect(isStringList(roles)).toBe(true);
      expect(roles.length).toBeGreaterThan(0);
      expect(roles).not.toContain('asteroid');
      expect(Number.isFinite(weight) && weight > 0).toBe(true);
      expect(isCount(fromLayer)).toBe(true);
    }
  );

  it.each(enemies)(
    '$id fills roles a layer asks for once it can come',
    ({ roles, fromLayer = 1 }) => {
      const asked = Array.from({ length: LAYERS_SCANNED }, (_, i) =>
        rolesOn(fromLayer + i)
      ).flat();
      for (const role of roles) expect(asked, role).toContain(role);
    }
  );

  it('every role a modifier keeps has an enemy from the first modifier on', () => {
    const roles = Object.values(LAYER_MODIFIERS).flatMap(
      ({ roles = [] }) => roles
    );
    expect(roles.length).toBeGreaterThan(0);
    for (const role of roles) {
      expect(enemiesFor(role, MODIFIER_FROM).length, role).toBeGreaterThan(0);
    }
  });
});
