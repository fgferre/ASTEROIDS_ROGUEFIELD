// src/data/sectors.js

import { listContent } from '../content/registry.js';
import { deepFreeze } from '../utils/deepFreeze.js';

// Sector runs: one chapter's layers on their own, won when its Warden (the
// sector's last layer) dies. `headStart` card picks come before the first
// layer, so a later chapter is not flown with a bare ship.
//
// One file per sector in src/content/sectors/, listed by `order`.
export const SECTORS = deepFreeze(listContent('sectors'));

/** The sector with this id, or null. */
export function sectorById(id) {
  return SECTORS.find((sector) => sector.id === id) ?? null;
}

/** A layer's 1-based position inside the sector (its first layer is 1). */
export function localLayer(sector, layer) {
  return layer - sector.layers[0] + 1;
}

/** The sector after this one, or null after the last. */
export function nextSector(sector) {
  const index = SECTORS.findIndex((entry) => entry.id === sector?.id);
  return index < 0 ? null : SECTORS[index + 1] ?? null;
}
