import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'bounty_ledger',
  order: 37,
  category: 'utility',
  family: 'salvage',
  rarity: 'rare',
  icon: '📜',
  themeColor: PALETTE.xp,
  unlockLevel: 3,
  tags: ['combo', 'xp'],
  text: {
    name: 'Bounty Ledger',
    summary: 'Raises the ceiling on what a long streak can earn.',
    lore: 'Salvage claims are paid by the streak. Someone kept very good books.',
    levels: [
      {
        title: 'Open Account',
        description: 'Combo XP multiplier cap +0.25 (x2.0 to x2.25).',
        highlights: ['Pays off on long streaks only.'],
      },
      {
        title: 'Senior Claim',
        description: 'Combo cap x2.5.',
        highlights: ['Another +0.25.'],
      },
      {
        title: 'Prime Claim',
        description: 'Combo cap x2.75.',
        highlights: ['Another +0.25.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'progression',
          property: 'comboMultiplierCap',
          operation: 'add',
          value: 0.25,
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'progression',
          property: 'comboMultiplierCap',
          operation: 'add',
          value: 0.25,
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'progression',
          property: 'comboMultiplierCap',
          operation: 'add',
          value: 0.25,
        },
      ],
    },
  ],
};
