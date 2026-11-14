// src/data/sectors.js

import { listContent } from '../content/registry.js';
import { deepFreeze } from '../utils/deepFreeze.js';
import { bossTier } from './enemies/boss.js';

// Sector runs: a stretch of a chapter's layers on its own, won when the boss
// on the sector's last layer dies. `headStart` card picks come before the
// first layer, so a later chapter is not flown with a bare ship. A sector
// keeps the global layer numbers of its range (HP scaling, biome, music and
// rewards follow them); with `stages` it plays its own definition of each of
// those layers, and with `boss` that boss kind ends it instead of the Warden.
// `look` (optional) names biome fields (sky, haze, veins, dust, lights, bloom,
// debris, structures, tint) that replace its biome's on its layers, so each
// sector is its own place; music stays the biome's. Its `backdrop` names the
// place's 3D set behind the arena (src/modules/render3d/places/index.js).
//
// One file per sector in src/content/sectors/, listed by `order`.
export const SECTORS = deepFreeze(listContent('sectors'));

/** The sector with this id, or null. */
export function sectorById(id) {
  return SECTORS.find((sector) => sector.id === id) ?? null;
}

/** The sectors of a chapter, in order. */
export function chapterSectors(chapter) {
  return SECTORS.filter((sector) => sector.chapter === chapter);
}

/** A chapter's title, with the sector's name when its chapter has several. */
export function sectorTitle(sector, chapterTitle) {
  return sector && chapterSectors(sector.chapter).length > 1
    ? `${chapterTitle} · ${sector.name}`
    : chapterTitle;
}

/** A layer's 1-based position inside the sector (its first layer is 1). */
export function localLayer(sector, layer) {
  return layer - sector.layers[0] + 1;
}

/**
 * Its end boss's rank: its own `boss`'s tier ('Sentinel', 'Sovereign'), else
 * 'Warden'.
 */
export function sectorBossTier(sector) {
  const tier = sector.boss ? bossTier(sector.boss) : 'warden';
  return tier[0].toUpperCase() + tier.slice(1);
}

/** True when the next sector goes on in the same chapter. */
export function nextInChapter(sector) {
  return nextSector(sector)?.chapter === sector?.chapter;
}

/** The sector after this one, or null after the last. */
export function nextSector(sector) {
  const index = SECTORS.findIndex((entry) => entry.id === sector?.id);
  return index < 0 ? null : SECTORS[index + 1] ?? null;
}

/**
 * The sector's own definition of `layer`, or null (no sector, no `stages`, or
 * a layer outside its range: the global table plays it). Its enemy roles are
 * cast from the sector's last layer (`castLayer`), and its last layer carries
 * the sector's `boss` as `bossKind`.
 */
export function sectorStage(sector, layer) {
  const stage = sector?.stages?.[layer - sector.layers[0]];
  if (!stage) return null;
  return deepFreeze({
    ...stage,
    castLayer: sector.layers[1],
    ...(stage.warden && sector.boss && { bossKind: sector.boss }),
  });
}
