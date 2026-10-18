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

/** The two weapons. `lance` is the default; `harmonic` comes from a card. */
export const WEAPONS = deepFreeze({
  lance: {
    id: 'lance',
    name: 'Amber Lance',
    description: 'Short amber traces from the nose.',
  },
  harmonic: {
    id: 'harmonic',
    name: 'Harmonic Plasma Lance',
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
