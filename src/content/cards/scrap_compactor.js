// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'scrap_compactor',
  order: 39,
  category: 'utility',
  family: 'salvage',
  rarity: 'common',
  icon: '🗜️',
  themeColor: PALETTE.xp,
  unlockLevel: 1,
  tags: ['xp', 'collection'],
  text: {
    name: 'Scrap Compactor',
    summary:
      'Crushes the slag out of every orb so only the Ring light is left.',
    lore: 'Bolted to the hold by a salvager who hated wasted space.',
    levels: [
      {
        title: 'Hand Press',
        description: 'XP from orbs +6%.',
        highlights: ['Applies before the combo multiplier.'],
      },
      {
        title: 'Hydraulic Press',
        description: 'XP from orbs +12% (cumulative).',
        highlights: ['Another +6%.'],
      },
      {
        title: 'Mass Press',
        description: 'XP from orbs +19% (cumulative).',
        highlights: ['Another +6%.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'progression',
          property: 'xpGainMultiplier',
          operation: 'multiply',
          value: 1.06,
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'progression',
          property: 'xpGainMultiplier',
          operation: 'multiply',
          value: 1.06,
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'progression',
          property: 'xpGainMultiplier',
          operation: 'multiply',
          value: 1.06,
        },
      ],
    },
  ],
};
