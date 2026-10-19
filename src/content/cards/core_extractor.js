import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'core_extractor',
  order: 35,
  category: 'utility',
  family: 'salvage',
  rarity: 'common',
  icon: '💎',
  themeColor: PALETTE.xp,
  unlockLevel: 1,
  tags: ['xp', 'collection'],
  text: {
    name: 'Core Extractor',
    summary: 'Pulls more of the Ring light out of every orb you collect.',
    lore: 'Standard salvage kit. The non-standard part is how hard you run it.',
    levels: [
      {
        title: 'Field Kit',
        description: 'XP from orbs +8%.',
        highlights: ['Applies before the combo multiplier.'],
      },
      {
        title: 'Refinery',
        description: 'XP from orbs +17% (cumulative).',
        highlights: ['Another +8%.'],
      },
      {
        title: 'Core Press',
        description: 'XP from orbs +26% (cumulative).',
        highlights: ['Another +8%.'],
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
          value: 1.08,
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
          value: 1.08,
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
          value: 1.08,
        },
      ],
    },
  ],
};
