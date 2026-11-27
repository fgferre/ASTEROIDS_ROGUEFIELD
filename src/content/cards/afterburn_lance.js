import { PALETTE } from '../../data/constants/palette.js';
import scatter from '../weapons/scatter.js';

// Rounds that hit harder the further they flew (numbers: proposta 20/10).
const MAX_DISTANCE = 400; // px of flight that still adds damage
// Per rank: the bonus per 100 px and the lock range, cumulative (+%).
const BONUS = [10, 15, 20];
const LOCK_RANGE = [15, 32, 52];
// A flak bolt bursts by the end of its range: the most it can fly.
const BOLT_RANGE = scatter.projectile.range;

export default {
  id: 'afterburn_lance',
  order: 5,
  category: 'offense',
  family: 'thermal',
  rarity: 'rare',
  icon: '🔥',
  themeColor: PALETTE.shot,
  unlockLevel: 2,
  unlock: { by: 'start', at: 3 },
  tags: ['range', 'weaponry'],
  text: {
    name: 'Afterburn Lance',
    summary:
      'Rounds keep burning after the muzzle: they hit harder the further they fly, and the cannon locks from further out.',
    lore: 'Slow-burning propellant packed behind each round. The trail glows long after the shot.',
    levels: [
      {
        title: 'Slow Burn',
        description:
          'Rounds deal +10% damage per 100 px flown (up to +40%). Lock-on range +15%.',
        highlights: ['Fight from range: close hits gain little.'],
      },
      {
        title: 'Long Flame',
        description:
          'Rounds deal +15% damage per 100 px flown (up to +60%). Lock-on range +32% (cumulative).',
        highlights: ['A shot across half the screen hits 50% harder.'],
      },
      {
        title: 'White Lance',
        description:
          'Rounds deal +20% damage per 100 px flown (up to +80%). Lock-on range +52% (cumulative).',
        highlights: ['Hits the edge of the Field before it reaches you.'],
      },
    ],
  },
  // The bonus rides a projectile's own hit (HitResolution): not the beam,
  // not the shrapnel.
  weaponText: {
    // proposta 17/11
    'arc-caster': {
      levels: BONUS.map((bonus) => ({
        description: `Jumps deal +${bonus}% damage per 100 px between the ship and the enemy: the far end of the chain strikes harder.`,
      })),
    },
    // The Halo and the Furnace never aim, and the Arc Caster and the Scatter
    // Coil cannot reach what a longer lock-on finds: no lock-on range to sell
    // any of them (the lock keeps to what the weapon reaches).
    'shard-halo': {
      levels: BONUS.map((bonus) => ({
        description: `Cuts deal +${bonus}% damage per 100 px between the ship and the enemy: the far edge of the halo cuts deeper.`,
      })),
    },
    'furnace-corona': {
      levels: BONUS.map((bonus) => ({
        description: `Pulses deal +${bonus}% damage per 100 px between the ship and the enemy: the ring's edge burns hotter.`,
      })),
    },
    scatter: {
      levels: BONUS.map((bonus) => ({
        description: `Flak bolts deal +${bonus}% damage per 100 px flown: they burst by ${BOLT_RANGE} px, so up to +${Math.round((bonus * BOLT_RANGE) / 100)}%.`,
        highlights: ['Only the bolt’s own hit: its shrapnel gains nothing.'],
      })),
    },
    harmonic: {
      levels: BONUS.map((bonus, rank) => ({
        description: `Lances deal +${bonus}% damage per 100 px flown (up to +${(bonus * MAX_DISTANCE) / 100}%); the beam gains nothing. Lock-on range +${LOCK_RANGE[rank]}%.`,
      })),
    },
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          to: 'combat',
          payload: { targetingRangeMultiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-long-burn',
          to: 'combat',
          lands: 'cards.cardEffects.longBurn',
          payload: { bonusPer100px: 0.1, maxDistance: MAX_DISTANCE }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          to: 'combat',
          payload: { targetingRangeMultiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-long-burn',
          to: 'combat',
          lands: 'cards.cardEffects.longBurn',
          payload: { bonusPer100px: 0.15, maxDistance: MAX_DISTANCE }, // proposta 20/10
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          to: 'combat',
          payload: { targetingRangeMultiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-long-burn',
          to: 'combat',
          lands: 'cards.cardEffects.longBurn',
          payload: { bonusPer100px: 0.2, maxDistance: MAX_DISTANCE }, // proposta 20/10
        },
      ],
    },
  ],
};
