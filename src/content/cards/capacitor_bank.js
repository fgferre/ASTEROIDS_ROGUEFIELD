import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'capacitor_bank',
  order: 33,
  category: 'utility',
  family: 'arc',
  rarity: 'rare',
  icon: '🔋',
  themeColor: PALETTE.status,
  unlockLevel: 2,
  tags: ['combo'],
  text: {
    name: 'Capacitor Bank',
    summary: 'Stores charge between kills so a chain survives the gaps.',
    lore: 'Ring capacitors never fully drain. Neither does a good streak.',
    levels: [
      {
        title: 'Spare Cells',
        description: 'Combo window +0.5 s.',
        highlights: ['3.0 s becomes 3.5 s between kills.'],
      },
      {
        title: 'Stacked Cells',
        description: 'Combo window +1.0 s (cumulative).',
        highlights: ['4.0 s between kills.'],
      },
      {
        title: 'Ring Cells',
        description: 'Combo window +1.5 s (cumulative).',
        highlights: ['4.5 s between kills.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'progression',
          property: 'comboTimeout',
          operation: 'add',
          value: 0.5,
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'progression',
          property: 'comboTimeout',
          operation: 'add',
          value: 0.5,
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'progression',
          property: 'comboTimeout',
          operation: 'add',
          value: 0.5,
        },
      ],
    },
  ],
};
