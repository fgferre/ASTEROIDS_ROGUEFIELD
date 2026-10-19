// src/modules/enemies/base/enemyTypeRegistry.js
// Every enemy type the factory can build: class, pool, defaults and tags. The
// roster's data is its src/content/enemies file; a recipe there (`behaviors`)
// is built by RecipeEnemy, and only the rest have a class named here.
import { GamePools } from '../../../core/GamePools.js';
import { listContent } from '../../../content/registry.js';
import { Asteroid } from '../types/Asteroid.js';
import { Drone } from '../types/Drone.js';
import { Mine } from '../types/Mine.js';
import { Hunter } from '../types/Hunter.js';
import { BossEnemy } from '../types/BossEnemy.js';
import { WARDEN_CLASSES, wardenFactoryKey } from '../types/wardens.js';
import { Ram } from '../types/Ram.js';
import { Weaver } from '../types/Weaver.js';
import { recipeEnemyClass } from '../types/RecipeEnemy.js';
import { Herald } from '../types/Herald.js';
import { BOSS_CONFIG } from '../../../data/constants/visual.js';
import {
  BOSS_COMPONENTS,
  WARDEN_KINDS,
  wardenComponents,
} from '../../../data/enemies/boss.js';
import { HERALD_COMPONENTS } from '../../../data/enemies/herald.js';

// The roster enemies not yet recipes (PLAN.md 0a.3), by content id.
const HAND_CLASSES = {
  drone: Drone,
  mine: Mine,
  hunter: Hunter,
  ram: Ram,
  weaver: Weaver,
};

// The class behind each roster enemy, by content id (GamePools builds its
// pools from it too): its recipe's RecipeEnemy class, else its own class.
export const TYPE_CLASSES = Object.freeze(
  Object.fromEntries(
    listContent('enemies').map((item) => [
      item.id,
      item.behaviors ? recipeEnemyClass(item) : HAND_CLASSES[item.id],
    ])
  )
);

/**
 * Registers every enemy type with the factory. The boss minion list is
 * filtered by the caller's getAvailableBossMinionTypes, which reads the
 * factory being filled here.
 */
export function registerEnemyTypes(factory, { getAvailableBossMinionTypes }) {
  // Register asteroid type with factory
  factory.registerType('asteroid', {
    class: Asteroid,
    pool: GamePools?.asteroids || null,
    defaults: {
      size: 'medium',
      variant: 'common',
    },
    tags: ['destructible', 'enemy'],
  });

  // The roster: every src/content/enemies item, in its `order`.
  for (const { id, config, components, tags } of listContent('enemies')) {
    factory.registerType(id, {
      class: TYPE_CLASSES[id],
      pool: GamePools.enemyPools.get(id) || null,
      defaults: { ...config, components },
      tags,
    });
  }

  // Heralds: one per layer at most, unpooled like the Wardens; the kind
  // (`heraldKind`) comes with each spawn.
  factory.registerType('herald', {
    class: Herald,
    defaults: { components: HERALD_COMPONENTS },
    tags: ['enemy', 'hostile', 'herald'],
  });

  if (BOSS_CONFIG) {
    const bossDefaults = { ...BOSS_CONFIG };
    const sanitizedMinions = getAvailableBossMinionTypes(
      bossDefaults.minionTypes
    );

    if (Array.isArray(sanitizedMinions) && sanitizedMinions.length > 0) {
      bossDefaults.minionTypes = [...sanitizedMinions];
    } else {
      delete bossDefaults.minionTypes;
    }

    // Wardens are unpooled: releaseAsteroid never returns a boss, so a
    // pooled one would stay in the pool's in-use set after its fight.
    factory.registerType('boss', {
      class: BossEnemy,
      defaults: { ...bossDefaults, components: BOSS_COMPONENTS },
      tags: ['enemy', 'boss', 'elite'],
    });
    // Choir and Null: their own classes.
    for (const kind of Object.keys(WARDEN_KINDS)) {
      if (kind === 'prime') continue;
      factory.registerType(wardenFactoryKey(kind), {
        class: WARDEN_CLASSES[kind],
        defaults: { ...bossDefaults, components: wardenComponents(kind) },
        tags: ['enemy', 'boss', 'elite'],
      });
    }
  }
}
