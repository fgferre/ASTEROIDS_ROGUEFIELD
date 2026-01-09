// src/data/upgrades/categories.js

import { deepFreeze } from '../../utils/deepFreeze.js';

/**
 * @typedef {Object} UpgradeCategory
 * @property {string} id Unique identifier for the category.
 * @property {string} label Human-readable label displayed to players.
 * @property {string} description Summary of the category focus.
 * @property {string} icon Emoji or icon string representing the category.
 * @property {string} themeColor Hex color used for UI theming.
 */

export const UPGRADE_CATEGORIES = deepFreeze({
  offense: {
    id: 'offense',
    label: 'Offense',
    description: 'Boosts main weaponry and increases damage per shot.',
    icon: '✴️',
    themeColor: '#F6C945',
  },
  defense: {
    id: 'defense',
    label: 'Defense',
    description:
      'Strengthens hull, reinforces shields, and enhances survivability.',
    icon: '🛡️',
    themeColor: '#4ECDC4',
  },
  mobility: {
    id: 'mobility',
    label: 'Mobility',
    description: 'Improves thrusters, acceleration, and ship control.',
    icon: '🛰️',
    themeColor: '#5DADE2',
  },
  utility: {
    id: 'utility',
    label: 'Utility',
    description: 'Optimizes collection, magnetism, and tactical support.',
    icon: '🧲',
    themeColor: '#C08BFF',
  },
});
