import { PALETTE } from '../../data/constants/palette.js';

// Rounds that hit harder the further they flew (numbers: proposta 20/10).
const MAX_DISTANCE = 400; // px of flight that still adds damage

export default {
  id: 'afterburn_lance',
  order: 5,
  category: 'offense',
  family: 'thermal',
  rarity: 'rare',
  icon: '🔥',
  themeColor: PALETTE.shot,
  unlockLevel: 2,
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
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          payload: { targetingRangeMultiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-long-burn',
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
          payload: { targetingRangeMultiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-long-burn',
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
          payload: { targetingRangeMultiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-long-burn',
          payload: { bonusPer100px: 0.2, maxDistance: MAX_DISTANCE }, // proposta 20/10
        },
      ],
    },
  ],
};
