// src/data/hangar.js

import { deepFreeze } from '../utils/deepFreeze.js';
import { bastion, solarSlicer } from './shipModels.js';
import { RUN_FINAL_LAYER } from './constants/gameplay.js';

// The Hangar (docs/NORTE.md §7 pillar 7): Salvage earned per run buys small
// permanent upgrades. Every number here is "proposta 18/10" — the owner
// judges by playing. HangarService is the only reader.

export const SALVAGE_PER_LAYER = 10; // proposta 18/10
export const SALVAGE_KILLS_PER_POINT = 5; // proposta 18/10: 1 Salvage per 5 kills
export const SALVAGE_VICTORY_BONUS = 150; // proposta 18/10
export const SALVAGE_PER_ENDLESS_LAYER = 25; // proposta 18/10
export const BOSS_RUSH_SALVAGE_PER_WARDEN = 15; // proposta 18/10
// Salvage for a card pick taken as the Salvage Cache (slots full, nothing to
// level up), paid at the run's end at the difficulty's rate. Proposta 16/11.
export const SALVAGE_PER_CARD_CACHE = 25;

/**
 * Salvage a run is worth: layers reached, kills, victory and endless depth.
 * A Boss Rush run (`bossRushWardens` given) is worth its Wardens killed and
 * the victory. A sector run (`firstLayer` its first layer) counts the layers
 * it played, from `firstLayer`, and has no endless depth.
 */
export function runSalvage({
  layer = 0,
  kills = 0,
  won = false,
  bossRushWardens = null,
  firstLayer = 1,
} = {}) {
  if (bossRushWardens !== null) {
    return (
      bossRushWardens * BOSS_RUSH_SALVAGE_PER_WARDEN +
      (won ? SALVAGE_VICTORY_BONUS : 0)
    );
  }
  const reached = Math.max(0, Math.floor(Number(layer) || 0));
  const played = Math.max(0, reached - firstLayer + 1);
  const base =
    played * SALVAGE_PER_LAYER +
    Math.floor(Math.max(0, Number(kills) || 0) / SALVAGE_KILLS_PER_POINT);
  if (!won) return base;
  const endless = firstLayer === 1 ? Math.max(0, reached - RUN_FINAL_LAYER) : 0;
  return base + SALVAGE_VICTORY_BONUS + endless * SALVAGE_PER_ENDLESS_LAYER;
}

/** What a run starts with when nothing is owned. */
export const BASE_MODIFIERS = deepFreeze({
  hullMultiplier: 1,
  extraRerolls: 0,
  extraBanishes: 0,
  dashCooldownMultiplier: 1,
  pickupRadiusMultiplier: 1,
});

// A hull item's line, from the hull's own `role`: "Bastion — tough, slow."
const hullEffect = (hull) => `${hull.name} — ${hull.role.toLowerCase()}.`;

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
    effect: hullEffect(solarSlicer),
    cost: 400, // proposta 18/10
    unlocksHull: solarSlicer.id,
  },
  {
    id: 'bastion-hull',
    name: 'Bastion Hull',
    effect: hullEffect(bastion),
    cost: 520, // proposta 18/10
    unlocksHull: bastion.id,
  },
]);

// Control of the draw (progression plan H3, prices "proposta 16/11"): never
// raw power. A rung of a ladder sells after the one before it (`requires`);
// the Flight School after the First Victory medal (`requiresMedal`). Rerolls
// and banishes add to the run's like the items above; Hold, Seal and the
// Flight School are read by the card draw through the Hangar's contract.
export const CONTROL_ITEMS = deepFreeze([
  {
    id: 'reroll-1',
    name: 'Reroll I',
    effect: '+1 reroll per run',
    cost: 200,
    modifiers: { extraRerolls: 1 },
  },
  {
    id: 'reroll-2',
    name: 'Reroll II',
    effect: '+1 reroll per run',
    cost: 400,
    requires: 'reroll-1',
    modifiers: { extraRerolls: 1 },
  },
  {
    id: 'reroll-3',
    name: 'Reroll III',
    effect: '+1 reroll per run',
    cost: 700,
    requires: 'reroll-2',
    modifiers: { extraRerolls: 1 },
  },
  {
    id: 'banish-1',
    name: 'Banish I',
    effect: '+1 banish per run',
    cost: 200,
    modifiers: { extraBanishes: 1 },
  },
  {
    id: 'banish-2',
    name: 'Banish II',
    effect: '+1 banish per run',
    cost: 400,
    requires: 'banish-1',
    modifiers: { extraBanishes: 1 },
  },
  {
    id: 'banish-3',
    name: 'Banish III',
    effect: '+1 banish per run',
    cost: 700,
    requires: 'banish-2',
    modifiers: { extraBanishes: 1 },
  },
  {
    id: 'seal-1',
    name: 'Seal I',
    effect: 'Seal 1 card out of the draw before launch',
    cost: 400,
    contract: { seals: 1 },
  },
  {
    id: 'seal-2',
    name: 'Seal II',
    effect: 'Seal 1 more card out of the draw',
    cost: 800,
    requires: 'seal-1',
    contract: { seals: 1 },
  },
  {
    id: 'hold',
    name: 'Hold',
    effect: 'Keep one offered card for the next level',
    cost: 600,
    contract: { holds: 1 },
  },
  {
    id: 'flight-school',
    name: 'Flight School',
    effect: 'Launch with a piloting card of your choice',
    cost: 500,
    requiresMedal: 'first-victory',
  },
]);

// The piloting track (plan): outside the card slots, never in the starting
// draw, a licence or a seal. The Flight School starts a run on one of its
// first steps (the ones with no prerequisite).
export const PILOT_TRACK = deepFreeze([
  'propulsors',
  'braking_system',
  'rcs_system',
  'auto_aim',
  'flight_computer',
]);

// The starting draw (plan, decided by the lead): four combat cards a family,
// the ones that close its bonus of 3, and the Scatter and Arc Caster weapons.
// Every other card comes from a licence, bought or paid by a medal.
export const STARTING_DRAW = deepFreeze([
  'plasma',
  'heat_sink',
  'afterburn_lance',
  'cinder_trail',
  'multishot',
  'ballast_rounds',
  'recoil_dampers',
  'close_quarters',
  'overcharge_coil',
  'static_shell',
  'capacitor_bank',
  'targeting_suite',
  'shield',
  'ablative_plating',
  'grav_anchor',
  'gravity_brake',
  'afterburner',
  'gyro_servos',
  'inertial_dampers',
  'ram_plating',
  'magfield',
  'core_extractor',
  'wide_net',
  'scrap_compactor',
  'scatter_coil',
  'arc_caster',
]);

// Licences (plan H3): the weapons and cards left out of the starting draw.
// A licence bought stays; switching it off (free) takes the card out of the
// draw. Seven more cards are licensed by medals (data/achievements.js).
export const LICENSES = deepFreeze([
  { id: 'furnace_corona', kind: 'weapon', cost: 325 },
  { id: 'shard_halo', kind: 'weapon', cost: 325 },
  { id: 'harmonic_resonator', kind: 'weapon', cost: 325 },
  { id: 'seeker_swarm', kind: 'weapon', cost: 325 },
  { id: 'chain_capacitor', kind: 'card', cost: 250 },
  { id: 'momentum_rounds', kind: 'card', cost: 250 },
  { id: 'phase_skin', kind: 'card', cost: 250 },
  { id: 'reactive_brake', kind: 'card', cost: 250 },
  { id: 'glass_cannon', kind: 'card', cost: 250 },
  { id: 'overclocked_core', kind: 'card', cost: 250 },
  { id: 'blood_ledger', kind: 'card', cost: 250 },
]);
