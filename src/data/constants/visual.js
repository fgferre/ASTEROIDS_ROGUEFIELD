// src/data/constants/visual.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { listContent } from '../../content/registry.js';
import { HERALD_REWARDS } from '../enemies/herald.js';
import {
  BOSS_CONFIG,
  BOSS_PHYSICS_CONFIG,
  BOSS_EFFECTS_PRESETS,
  BOSS_SCREEN_SHAKES,
  BOSS_REWARDS,
} from '../enemies/boss.js';

// Each roster enemy's config and rewards, from its file in src/content/enemies/
// (registry order), for the codex, the HUD and the reward tables.
const ROSTER = listContent('enemies');
export const ENEMY_TYPES = deepFreeze(
  Object.fromEntries(ROSTER.map((enemy) => [enemy.id, enemy.config]))
);

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
  ...Object.fromEntries(ROSTER.map((enemy) => [enemy.id, enemy.rewards])),
  herald: HERALD_REWARDS,
  boss: BOSS_REWARDS,
});
