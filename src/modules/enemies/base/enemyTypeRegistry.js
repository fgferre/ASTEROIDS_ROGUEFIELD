// src/modules/enemies/base/enemyTypeRegistry.js
// Every enemy type the factory can build: class, pool, defaults and tags.
import { GamePools } from '../../../core/GamePools.js';
import { Asteroid } from '../types/Asteroid.js';
import { Drone } from '../types/Drone.js';
import { Mine } from '../types/Mine.js';
import { Hunter } from '../types/Hunter.js';
import { BossEnemy } from '../types/BossEnemy.js';
import { WARDEN_CLASSES, wardenFactoryKey } from '../types/wardens.js';
import { Husk } from '../types/Husk.js';
import { Ram } from '../types/Ram.js';
import { Weaver } from '../types/Weaver.js';
import { Bulwark } from '../types/Bulwark.js';
import { Caster } from '../types/Caster.js';
import { Shade } from '../types/Shade.js';
import { Leech } from '../types/Leech.js';
import { Herald } from '../types/Herald.js';
import { ENEMY_TYPES, BOSS_CONFIG } from '../../../data/constants/visual.js';
import { DRONE_COMPONENTS } from '../../../data/enemies/drone.js';
import { HUNTER_COMPONENTS } from '../../../data/enemies/hunter.js';
import { MINE_COMPONENTS } from '../../../data/enemies/mine.js';
import {
  BOSS_COMPONENTS,
  WARDEN_KINDS,
  wardenComponents,
} from '../../../data/enemies/boss.js';
import { HUSK_COMPONENTS } from '../../../data/enemies/husk.js';
import { RAM_COMPONENTS } from '../../../data/enemies/ram.js';
import { WEAVER_COMPONENTS } from '../../../data/enemies/weaver.js';
import { BULWARK_COMPONENTS } from '../../../data/enemies/bulwark.js';
import { CASTER_COMPONENTS } from '../../../data/enemies/caster.js';
import { SHADE_COMPONENTS } from '../../../data/enemies/shade.js';
import { LEECH_COMPONENTS } from '../../../data/enemies/leech.js';
import { HERALD_COMPONENTS } from '../../../data/enemies/herald.js';

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

  if (ENEMY_TYPES?.drone) {
    factory.registerType('drone', {
      class: Drone,
      pool: GamePools?.drones || null,
      defaults: { ...ENEMY_TYPES.drone, components: DRONE_COMPONENTS },
      tags: ['enemy', 'hostile', 'ranged'],
    });
  }

  if (ENEMY_TYPES?.mine) {
    factory.registerType('mine', {
      class: Mine,
      pool: GamePools?.mines || null,
      defaults: { ...ENEMY_TYPES.mine, components: MINE_COMPONENTS },
      tags: ['enemy', 'explosive', 'area-of-effect'],
    });
  }

  if (ENEMY_TYPES?.hunter) {
    factory.registerType('hunter', {
      class: Hunter,
      pool: GamePools?.hunters || null,
      defaults: { ...ENEMY_TYPES.hunter, components: HUNTER_COMPONENTS },
      tags: ['enemy', 'hostile', 'ranged', 'elite'],
    });
  }

  const supportKinds = [
    ['husk', Husk, GamePools?.husks, HUSK_COMPONENTS, ['splitter']],
    ['ram', Ram, GamePools?.rams, RAM_COMPONENTS, ['charger']],
    ['weaver', Weaver, GamePools?.weavers, WEAVER_COMPONENTS, ['layer']],
    ['bulwark', Bulwark, GamePools?.bulwarks, BULWARK_COMPONENTS, ['armored']],
    [
      'caster',
      Caster,
      GamePools?.casters,
      CASTER_COMPONENTS,
      ['ranged', 'artillery'],
    ],
    ['shade', Shade, GamePools?.shades, SHADE_COMPONENTS, ['phasing']],
    ['leech', Leech, GamePools?.leeches, LEECH_COMPONENTS, ['scavenger']],
  ];
  for (const [type, EnemyClass, pool, components, tags] of supportKinds) {
    factory.registerType(type, {
      class: EnemyClass,
      pool: pool || null,
      defaults: { ...ENEMY_TYPES[type], components },
      tags: ['enemy', 'hostile', ...tags],
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
