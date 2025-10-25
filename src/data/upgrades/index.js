// src/data/upgrades/index.js

// Aggregator for all upgrade definitions
// Maintains backward compatibility with original upgrades.js structure

import { deepFreeze } from '../../utils/deepFreeze.js';
import { UPGRADE_CATEGORIES } from './categories.js';
import { OFFENSE_UPGRADES } from './offense.js';
import { DEFENSE_UPGRADES } from './defense.js';
import { MOBILITY_UPGRADES } from './mobility.js';
import { UTILITY_UPGRADES } from './utility.js';

const UPGRADE_LIBRARY = deepFreeze([
  ...OFFENSE_UPGRADES,
  ...DEFENSE_UPGRADES,
  ...MOBILITY_UPGRADES,
  ...UTILITY_UPGRADES,
]);

export { UPGRADE_CATEGORIES };
export default UPGRADE_LIBRARY;
