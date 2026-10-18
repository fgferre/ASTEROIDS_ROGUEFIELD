// src/data/weapons.js

import { deepFreeze } from '../utils/deepFreeze.js';
import { PALETTE } from './constants/palette.js';

// docs/NORTE.md §7 pillar 4 — numbers "proposta 18/10", for the owner to
// judge by playing.

// Colours the palette does not have: the white-hot orange of a burning
// lance and the light violet of a gravitic one (PALETTE.boss is too dark to
// read on an additive trail).
export const WEAPON_COLOR_INCENDIARY = '#ffc98a';
export const WEAPON_COLOR_GRAVITIC = '#b38cff';
export const WEAPON_COLOR_BEAM_MID = '#ffe2b0';
// Scatter Coil: the white-hot core of a flak tracer and the flash of its
// burst, both warmer than PALETTE.text so they read as the amber family.
export const WEAPON_COLOR_FLAK_CORE = '#fff3dc';
export const WEAPON_COLOR_FLAK_BURST = '#ffd28f';

/**
 * The three weapons. `lance` is the default; `harmonic` and `scatter` come
 * from a card each.
 */
export const WEAPONS = deepFreeze({
  lance: {
    id: 'lance',
    name: 'Amber Lance',
    chip: 'LANCE',
    description: 'Short amber traces from the nose.',
  },
  harmonic: {
    id: 'harmonic',
    name: 'Harmonic Plasma Lance',
    chip: 'HARMONIC',
    description: 'Every 4th shot is a short plasma beam that splits rocks.',
    beam: {
      every: 4, // shots; the 4th is the beam
      length: 220, // logical px from the nose
      width: 10, // logical px
      duration: 0.18, // seconds on screen (damage lands on the first frame)
      damageMultiplier: 2.2, // × lance damage, to everything in the segment
      extraFragments: 1, // large/medium rocks killed by the beam
      cooldownPenalty: 0.25, // seconds added to the next shot's cooldown
      kick: 0.2, // 3D impact pass
      flashRadius: 90, // 3D light flash, as a shockwave of this radius
    },
    colors: {
      glow: PALETTE.shot,
      mid: WEAPON_COLOR_BEAM_MID,
      core: PALETTE.text,
    },
  },
  scatter: {
    id: 'scatter',
    name: 'Scatter Coil',
    chip: 'SCATTER',
    description: 'A fan of short flak bolts that burst into shrapnel.',
    // proposta 18/10: the flak volley, for the owner to judge by playing.
    flak: {
      bolts: 5, // per volley; each Multishot shot past the first adds one
      maxBolts: 9,
      fan: 26, // degrees, edge bolt to edge bolt
      speedMultiplier: 0.9, // × lance speed
      range: 180, // logical px from the muzzle, where a bolt that hit nothing bursts
      damageMultiplier: 0.45, // × lance damage, a bolt's direct hit
      burstRadius: 40, // logical px, to the enemy's rim
      burstDamageMultiplier: 0.6, // × lance damage, once per enemy per volley
      cooldownMultiplier: 1.6, // × the lance's cooldown between volleys
      burstDuration: 0.22, // seconds on screen
      trailPoints: 4, // a short tracer, not a lance trail
    },
    colors: {
      tracer: PALETTE.shot,
      core: WEAPON_COLOR_FLAK_CORE,
      burst: WEAPON_COLOR_FLAK_BURST,
    },
  },
});

// How a lance looks before any evolution. `trailLength`, `width` and
// `headLength` are multipliers; an evolution overrides colours and
// multiplies the rest.
export const LANCE_BASE_LOOK = deepFreeze({
  body: PALETTE.shot,
  trail: PALETTE.shot,
  head: PALETTE.text,
  trailLength: 1,
  width: 1,
  headLength: 1,
});

/**
 * Family → weapon evolution, switched on by the family's "3 of a kind"
 * synergy and kept for the run. `look` changes the lance in 2D and 3D.
 */
export const WEAPON_EVOLUTIONS = deepFreeze({
  thermal: {
    id: 'incendiary',
    family: 'thermal',
    name: 'Incendiary Lance',
    description: 'Hits burn for 1.2 s: 3 ticks of 15% damage.',
    burn: { duration: 1.2, ticks: 3, damageFraction: 0.15 },
    look: { trail: WEAPON_COLOR_INCENDIARY, trailLength: 1.8, width: 1.25 },
  },
  kinetic: {
    id: 'railshot',
    family: 'kinetic',
    name: 'Railshot',
    description: 'Lances pierce one extra target.',
    pierce: 1,
    look: { head: PALETTE.text, trailLength: 1.6, width: 0.6, headLength: 1.7 },
  },
  arc: {
    id: 'chain',
    family: 'arc',
    name: 'Chain Lance',
    description: 'Hits arc to the nearest enemy within 140 px for 50% damage.',
    chain: { range: 140, damageFraction: 0.5, jumps: 1, duration: 0.16 },
    look: { head: PALETTE.player, arc: PALETTE.player },
  },
  field: {
    id: 'gravitic',
    family: 'field',
    name: 'Gravitic Lance',
    description: 'Hits slow the target to 60% speed for 0.4 s.',
    slow: { duration: 0.4, factor: 0.6 },
    look: { trail: WEAPON_COLOR_GRAVITIC, body: WEAPON_COLOR_GRAVITIC },
  },
  salvage: {
    id: 'prospector',
    family: 'salvage',
    name: 'Prospector Lance',
    description: 'Lance kills drop 25% more orbs.',
    orbBonus: 0.25,
    look: { head: PALETTE.xp },
  },
});

// Apex colours: whiter versions of each evolution's colour, so a second
// stage reads hotter than the first on the additive trails.
export const APEX_COLOR_FLARE = '#ffeccc';
export const APEX_COLOR_COIL = '#c8fbff';
export const APEX_COLOR_STORM = '#e6ffb0';
export const APEX_COLOR_SINGULARITY = '#ded0ff';
export const APEX_COLOR_MOTHERLODE = '#fff0a0';

/**
 * Family → Apex evolution, switched on at FAMILY_APEX_THRESHOLD cards of the
 * family and kept for the run. It replaces the family's first-stage
 * behaviour; `look` is applied on top of the evolved look. `short` is the
 * HUD chip ("APEX <short>"). Numbers: proposta 18/10.
 */
export const WEAPON_APEX = deepFreeze({
  thermal: {
    id: 'solar-flare',
    family: 'thermal',
    name: 'Solar Flare Lance',
    short: 'FLARE',
    description:
      'Burns spread to enemies within 70 px of a burning one, at half duration.',
    // `radius`: rim to rim. A spread burn: `ticks` ticks over
    // durationFraction × the burn's duration, same damage per tick; spread
    // burns do not spread again.
    spread: { radius: 70, durationFraction: 0.5, ticks: 2 },
    look: { trail: APEX_COLOR_FLARE, outer: PALETTE.shot, width: 1.15 },
  },
  kinetic: {
    id: 'coilgun',
    family: 'kinetic',
    name: 'Coilgun',
    short: 'COIL',
    description: 'Lances pierce everything on their line for +25% damage.',
    pierce: Infinity,
    damageMultiplier: 1.25,
    look: { trail: APEX_COLOR_COIL, outer: PALETTE.player, headLength: 1.25 },
  },
  arc: {
    id: 'storm',
    family: 'arc',
    name: 'Storm Lance',
    short: 'STORM',
    description:
      'Hits arc 3 times for 50% damage; the first jump forks into two.',
    chain: { jumps: 3, fork: 2 },
    look: {
      head: APEX_COLOR_STORM,
      arc: PALETTE.status,
      outer: PALETTE.status,
    },
  },
  field: {
    id: 'singularity',
    family: 'field',
    name: 'Singularity Lance',
    short: 'SINGULARITY',
    description:
      'Hits pull the target and enemies within 90 px toward the hit for 0.5 s.',
    pull: { radius: 90, duration: 0.5, speed: 160 }, // radius: to the rim
    look: { body: APEX_COLOR_SINGULARITY, outer: WEAPON_COLOR_GRAVITIC },
  },
  salvage: {
    id: 'motherlode',
    family: 'salvage',
    name: 'Motherlode',
    short: 'MOTHERLODE',
    description:
      'Lance kills drop twice the orbs; Elites always drop a pickup.',
    orbBonus: 1, // +100 %: orbs ×2
    eliteAlwaysDrops: true,
    look: { head: APEX_COLOR_MOTHERLODE, sparkle: PALETTE.xp },
  },
});
