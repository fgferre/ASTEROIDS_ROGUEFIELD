import { PALETTE } from '../../data/constants/palette.js';

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
      'Rounds keep burning after the muzzle, so the cannon locks and hits from further out.',
    lore: 'Slow-burning propellant packed behind each round. The trail glows long after the shot.',
    levels: [
      {
        title: 'Slow Burn',
        description: 'Lock-on range and round lifetime +15%.',
        highlights: ['Auto-aim picks targets earlier.'],
      },
      {
        title: 'Long Flame',
        description: 'Lock-on range and round lifetime +32% (cumulative).',
        highlights: ['Reaches across most of the screen.'],
      },
      {
        title: 'White Lance',
        description: 'Lock-on range and round lifetime +52% (cumulative).',
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
          payload: {
            targetingRangeMultiplier: 1.15,
            bulletLifetimeMultiplier: 1.15,
          },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          payload: {
            targetingRangeMultiplier: 1.15,
            bulletLifetimeMultiplier: 1.15,
          },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          payload: {
            targetingRangeMultiplier: 1.15,
            bulletLifetimeMultiplier: 1.15,
          },
        },
      ],
    },
  ],
};
