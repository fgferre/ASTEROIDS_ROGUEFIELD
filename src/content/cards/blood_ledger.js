// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'blood_ledger',
  order: 41,
  category: 'utility',
  family: null,
  cursed: true,
  rarity: 'rare',
  icon: '🩸',
  themeColor: PALETTE.boss,
  unlockLevel: 4,
  tags: ['xp', 'cursed'],
  text: {
    name: 'Blood Ledger',
    summary:
      'Sign the ledger: the Field pays double, and stops patching you up.',
    lore: 'Nobody knows who keeps the book. Everybody knows it always balances.',
    levels: [
      {
        title: 'Signed in Red',
        description: 'XP from orbs +100%. Hearts no longer drop.',
        highlights: ['Cursed: only hearts already on the field can heal you.'],
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
          value: 2,
        },
        {
          type: 'event',
          event: 'upgrade-no-heart-drops',
          payload: {},
        },
      ],
    },
  ],
};
