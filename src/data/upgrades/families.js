// src/data/upgrades/families.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { PALETTE } from '../constants/palette.js';

// Three distinct upgrades of one family switch its bonus on.
export const FAMILY_SYNERGY_THRESHOLD = 3;
// Five raise the family's weapon evolution to its Apex (data/weapons.js);
// Maneuver has no weapon evolution, its Apex is the dash (`apex` below).
export const FAMILY_APEX_THRESHOLD = 5;

// Family bonuses — proposta 17/10: numbers for the owner to judge by playing.
export const SYNERGY_OVERHEAT_DAMAGE_MULTIPLIER = 1.2;
export const SYNERGY_MOMENTUM_SPEED_MULTIPLIER = 1.12;
export const SYNERGY_MOMENTUM_ACCELERATION_MULTIPLIER = 1.12;
export const SYNERGY_CHAIN_COMBO_WINDOW_BONUS = 1; // seconds
export const SYNERGY_CHAIN_COMBO_STEP_BONUS = 0.05;
export const SYNERGY_BULWARK_HULL_BONUS = 60;
export const SYNERGY_SCAVENGER_XP_MULTIPLIER = 1.15;
// Maneuver — proposta 18/10.
export const SYNERGY_AFTERBURN_LIFE = 0.6; // seconds the dash trail burns
export const SYNERGY_AFTERBURN_DAMAGE = 6; // per tick, to each enemy on it
export const SYNERGY_AFTERBURN_TICK = 0.25; // seconds between burn ticks
export const SYNERGY_AFTERBURN_RADIUS = 26; // px reach of each trail point
export const APEX_BLINK_HIDE_SECONDS = 0.12; // ship gone at the dash start
export const APEX_BLINK_RADIUS = 100; // px of the landing shove ring
export const APEX_BLINK_KNOCKBACK = 220; // px/s the ring shoves enemies

/**
 * The tag families of the Ring's machine (docs/positioning.md promised
 * fire/cryo/chain/tech/kinetic; renamed to fit the fiction):
 * thermal ← fire, kinetic ← kinetic, arc ← chain, field ← cryo, salvage ← tech;
 * maneuver (R12) is the dash, the brake and the turret.
 * A bonus uses the same effect schema as an upgrade level.
 */
export const UPGRADE_FAMILIES = deepFreeze({
  kinetic: {
    id: 'kinetic',
    name: 'Kinetic',
    color: PALETTE.player,
    fantasy: 'Mass and momentum: more shots, more thrust, tighter turns.',
    bonus: {
      name: 'Momentum',
      description: `+${Math.round((SYNERGY_MOMENTUM_SPEED_MULTIPLIER - 1) * 100)}% top speed and acceleration.`,
      effects: [
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: SYNERGY_MOMENTUM_SPEED_MULTIPLIER },
        },
        {
          type: 'event',
          event: 'upgrade-acceleration-boost',
          payload: { multiplier: SYNERGY_MOMENTUM_ACCELERATION_MULTIPLIER },
        },
      ],
    },
  },
  thermal: {
    id: 'thermal',
    name: 'Thermal',
    color: PALETTE.shot,
    fantasy: 'The Ring burned hot: harder, faster, longer-reaching shots.',
    bonus: {
      name: 'Overheat',
      description: `+${Math.round((SYNERGY_OVERHEAT_DAMAGE_MULTIPLIER - 1) * 100)}% damage on every shot.`,
      effects: [
        {
          type: 'event',
          event: 'upgrade-damage-boost',
          payload: { multiplier: SYNERGY_OVERHEAT_DAMAGE_MULTIPLIER },
        },
      ],
    },
  },
  arc: {
    id: 'arc',
    name: 'Arc',
    color: PALETTE.status,
    fantasy: 'Current that jumps: fast rounds and kills that chain.',
    bonus: {
      name: 'Chain Reaction',
      description: `Combo window +${SYNERGY_CHAIN_COMBO_WINDOW_BONUS}s and +${SYNERGY_CHAIN_COMBO_STEP_BONUS} multiplier per kill.`,
      effects: [
        {
          type: 'progression',
          property: 'comboTimeout',
          operation: 'add',
          value: SYNERGY_CHAIN_COMBO_WINDOW_BONUS,
        },
        {
          type: 'progression',
          property: 'comboMultiplierStep',
          operation: 'add',
          value: SYNERGY_CHAIN_COMBO_STEP_BONUS,
        },
      ],
    },
  },
  field: {
    id: 'field',
    name: 'Field',
    color: PALETTE.text,
    fantasy: "The Ring's shielding: a hull that holds and a field that stops.",
    bonus: {
      name: 'Bulwark',
      description: `+${SYNERGY_BULWARK_HULL_BONUS} max hull, repaired at once.`,
      effects: [
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: SYNERGY_BULWARK_HULL_BONUS },
        },
      ],
    },
  },
  salvage: {
    id: 'salvage',
    name: 'Salvage',
    color: PALETTE.xp,
    fantasy: 'You came to strip the Field: pull in more, keep more.',
    bonus: {
      name: 'Scavenger',
      description: `+${Math.round((SYNERGY_SCAVENGER_XP_MULTIPLIER - 1) * 100)}% XP from every orb.`,
      effects: [
        {
          type: 'progression',
          property: 'xpGainMultiplier',
          operation: 'multiply',
          value: SYNERGY_SCAVENGER_XP_MULTIPLIER,
        },
      ],
    },
  },
  maneuver: {
    id: 'maneuver',
    name: 'Maneuver',
    color: PALETTE.boss,
    fantasy: 'The Field is a maze: dash more, turn faster, stop on the spot.',
    bonus: {
      name: 'Afterburn',
      description: `The dash leaves a trail that burns for ${SYNERGY_AFTERBURN_LIFE}s.`,
      effects: [
        {
          type: 'event',
          event: 'upgrade-afterburn',
          payload: {
            damage: SYNERGY_AFTERBURN_DAMAGE,
            tickInterval: SYNERGY_AFTERBURN_TICK,
            life: SYNERGY_AFTERBURN_LIFE,
            radius: SYNERGY_AFTERBURN_RADIUS,
          },
        },
      ],
    },
    // Five cards: the dash becomes a jump (PlayerSystem, on apex-unlocked).
    apex: {
      name: 'Blink',
      description:
        'The ship vanishes as it dashes and lands with a shockwave that shoves enemies away.',
      hide: APEX_BLINK_HIDE_SECONDS,
      radius: APEX_BLINK_RADIUS,
      knockback: APEX_BLINK_KNOCKBACK,
    },
  },
});
