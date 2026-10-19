// src/data/constants/visual.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { DRONE_CONFIG, DRONE_REWARDS } from '../../content/enemies/drone.js';
import { HUNTER_CONFIG, HUNTER_REWARDS } from '../../content/enemies/hunter.js';
import { MINE_CONFIG, MINE_REWARDS } from '../../content/enemies/mine.js';
import { HUSK_CONFIG, HUSK_REWARDS } from '../../content/enemies/husk.js';
import { RAM_CONFIG, RAM_REWARDS } from '../../content/enemies/ram.js';
import { WEAVER_CONFIG, WEAVER_REWARDS } from '../../content/enemies/weaver.js';
import {
  BULWARK_CONFIG,
  BULWARK_REWARDS,
} from '../../content/enemies/bulwark.js';
import { CASTER_CONFIG, CASTER_REWARDS } from '../../content/enemies/caster.js';
import { SHADE_CONFIG, SHADE_REWARDS } from '../../content/enemies/shade.js';
import { LEECH_CONFIG, LEECH_REWARDS } from '../../content/enemies/leech.js';
import { HERALD_REWARDS } from '../enemies/herald.js';
import {
  BOSS_CONFIG,
  BOSS_PHYSICS_CONFIG,
  BOSS_EFFECTS_PRESETS,
  BOSS_SCREEN_SHAKES,
  BOSS_REWARDS,
} from '../enemies/boss.js';

// === RE-EXPORTS FOR BACKWARD COMPATIBILITY ===
// NOTE: Enemy stats have been moved to dedicated config files in src/data/enemies/
// This file re-exports that data for consumers that still import from
// visual.js directly.
export const ENEMY_TYPES = deepFreeze({
  drone: DRONE_CONFIG,
  mine: MINE_CONFIG,
  hunter: HUNTER_CONFIG,
  husk: HUSK_CONFIG,
  ram: RAM_CONFIG,
  weaver: WEAVER_CONFIG,
  bulwark: BULWARK_CONFIG,
  caster: CASTER_CONFIG,
  shade: SHADE_CONFIG,
  leech: LEECH_CONFIG,
});

export {
  BOSS_CONFIG,
  BOSS_PHYSICS_CONFIG,
  BOSS_EFFECTS_PRESETS,
  BOSS_SCREEN_SHAKES,
  BOSS_REWARDS,
};

// === ENEMY REWARDS ===
export const ENEMY_REWARDS = deepFreeze({
  asteroid: Object.freeze({
    heartDrop: Object.freeze({
      bySize: Object.freeze({
        large: 0.05,
        medium: 0.02,
        small: 0,
      }),
      variantBonus: 0.03,
      specialVariants: Object.freeze([
        'gold',
        'crystal',
        'volatile',
        'parasite',
      ]),
    }),
  }),
  drone: DRONE_REWARDS,
  mine: MINE_REWARDS,
  hunter: HUNTER_REWARDS,
  husk: HUSK_REWARDS,
  ram: RAM_REWARDS,
  weaver: WEAVER_REWARDS,
  bulwark: BULWARK_REWARDS,
  caster: CASTER_REWARDS,
  shade: SHADE_REWARDS,
  leech: LEECH_REWARDS,
  herald: HERALD_REWARDS,
  boss: BOSS_REWARDS,
});
