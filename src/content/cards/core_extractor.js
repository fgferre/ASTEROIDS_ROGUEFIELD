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
        description: 'XP from orbs +15%.',
        highlights: ['More level-ups, so more cards every run.'],
      },
      {
        title: 'Refinery',
        description: 'XP from orbs +30% (cumulative).',
        highlights: ['Builds come together layers sooner.'],
      },
      {
        title: 'Core Press',
        description: 'XP from orbs +50% (cumulative).',
        highlights: ['Every orb is worth half again as much.'],
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
          value: 1.15, // proposta 20/10
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
          value: 1.13, // proposta 20/10; total 1.30
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
          value: 1.154, // proposta 20/10; total 1.50
        },
      ],
    },
  ],
};
