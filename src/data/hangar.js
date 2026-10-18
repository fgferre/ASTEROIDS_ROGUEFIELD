// src/data/hangar.js

import { deepFreeze } from '../utils/deepFreeze.js';
import { BASTION_HULL_ID, SOLAR_SLICER_HULL_ID } from './shipModels.js';
import { RUN_FINAL_LAYER } from './constants/gameplay.js';

// The Hangar (docs/NORTE.md §7 pillar 7): Salvage earned per run buys small
// permanent upgrades. Every number here is "proposta 18/10" — the owner
// judges by playing. HangarService is the only reader.

export const SALVAGE_PER_LAYER = 10; // proposta 18/10
export const SALVAGE_KILLS_PER_POINT = 5; // proposta 18/10: 1 Salvage per 5 kills
export const SALVAGE_VICTORY_BONUS = 150; // proposta 18/10
export const SALVAGE_PER_ENDLESS_LAYER = 25; // proposta 18/10
export const BOSS_RUSH_SALVAGE_PER_WARDEN = 15; // proposta 18/10

/**
 * Salvage a run is worth: layers reached, kills, victory and endless depth.
 * A Boss Rush run (`bossRushWardens` given) is worth its Wardens killed and
 * the victory.
 */
export function runSalvage({
  layer = 0,
  kills = 0,
  won = false,
  bossRushWardens = null,
} = {}) {
  if (bossRushWardens !== null) {
    return (
      bossRushWardens * BOSS_RUSH_SALVAGE_PER_WARDEN +
      (won ? SALVAGE_VICTORY_BONUS : 0)
    );
  }
  const reached = Math.max(0, Math.floor(Number(layer) || 0));
  const base =
    reached * SALVAGE_PER_LAYER +
    Math.floor(Math.max(0, Number(kills) || 0) / SALVAGE_KILLS_PER_POINT);
  if (!won) return base;
  return (
    base +
    SALVAGE_VICTORY_BONUS +
    Math.max(0, reached - RUN_FINAL_LAYER) * SALVAGE_PER_ENDLESS_LAYER
  );
}

/** What a run starts with when nothing is owned. */
export const BASE_MODIFIERS = deepFreeze({
  hullMultiplier: 1,
  extraRerolls: 0,
  extraBanishes: 0,
  dashCooldownMultiplier: 1,
  pickupRadiusMultiplier: 1,
});

// `modifiers`: keys ending in Multiplier multiply, the others add.
export const HANGAR_ITEMS = deepFreeze([
  {
    id: 'reinforced-plating',
    name: 'Reinforced Plating',
    effect: '+5% max hull',
    cost: 120, // proposta 18/10
    modifiers: { hullMultiplier: 1.05 },
  },
  {
    id: 'spare-capacitor',
    name: 'Spare Capacitor',
    effect: '+1 reroll per run',
    cost: 150, // proposta 18/10
    modifiers: { extraRerolls: 1 },
  },
  {
    id: 'field-ledger',
    name: 'Field Ledger',
    effect: '+1 banish per run',
    cost: 150, // proposta 18/10
    modifiers: { extraBanishes: 1 },
  },
  {
    id: 'dash-coils',
    name: 'Dash Coils',
    effect: '-10% dash cooldown',
    cost: 180, // proposta 18/10
    modifiers: { dashCooldownMultiplier: 0.9 },
  },
  {
    id: 'salvage-magnet',
    name: 'Salvage Magnet',
    effect: '+15% XP pickup radius',
    cost: 200, // proposta 18/10
    modifiers: { pickupRadiusMultiplier: 1.15 },
  },
  {
    id: 'solar-slicer-hull',
    name: 'Solar Slicer Hull',
    effect: 'Solar Slicer — lighter blade hull: faster, thinner.',
    cost: 400, // proposta 18/10
    unlocksHull: SOLAR_SLICER_HULL_ID,
  },
  {
    id: 'bastion-hull',
    name: 'Bastion Hull',
    effect: 'Bastion — heavy escort hull: tougher, slower.',
    cost: 520, // proposta 18/10
    unlocksHull: BASTION_HULL_ID,
  },
]);
