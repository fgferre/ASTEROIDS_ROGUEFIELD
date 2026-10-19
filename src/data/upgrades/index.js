// src/data/upgrades/index.js

// Aggregator for all upgrade definitions
// Maintains backward compatibility with original upgrades.js structure
//
// One file per card in src/content/cards/, listed by `order` (the order of
// the catalog, which decides what a level-up offers first).

import { listContent } from '../../content/registry.js';
import { deepFreeze } from '../../utils/deepFreeze.js';
import { UPGRADE_CATEGORIES } from './categories.js';

const UPGRADE_LIBRARY = deepFreeze(listContent('cards'));

export { UPGRADE_CATEGORIES };
export default UPGRADE_LIBRARY;
