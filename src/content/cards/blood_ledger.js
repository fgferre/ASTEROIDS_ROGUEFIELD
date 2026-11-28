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
  unlock: { by: 'license', at: 11, cost: 250 },
  tags: ['xp', 'cursed'],
  text: {
    name: 'Blood Ledger',
    summary:
      'Sign the ledger: the Field pays double and stops patching you up. The ledger settles only when a Warden falls.',
    lore: 'Nobody knows who keeps the book. Everybody knows it always balances.',
    levels: [
      {
        title: 'Signed in Red',
        description:
          'XP from orbs +100%. Hearts no longer drop. Every Warden you defeat repairs the hull in full.',
        highlights: [
          'Cursed: between Wardens, the Field drops no hearts at all.',
        ],
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
          to: 'enemies',
          payload: {},
        },
        {
          type: 'event',
          event: 'upgrade-boss-repair',
          to: 'player',
          lands: { bossRepairFraction: 'fraction' },
          payload: { fraction: 1 }, // proposta 20/10
        },
      ],
    },
  ],
};
