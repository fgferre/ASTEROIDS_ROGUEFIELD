// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'glass_cannon',
  order: 13,
  category: 'offense',
  family: null,
  cursed: true,
  rarity: 'rare',
  icon: '🔺',
  themeColor: PALETTE.boss,
  unlockLevel: 4,
  unlock: { by: 'license', at: 9, cost: 250 },
  tags: ['damage', 'cursed'],
  text: {
    name: 'Glass Cannon',
    summary: 'Strips the armour off the hull and feeds it to the cannon.',
    lore: 'The Ring builders called it a test rig. Nobody who flew it called it anything.',
    levels: [
      {
        title: 'Bare Frame',
        description: 'Damage +60%, max hull -30%.',
        highlights: ['Cursed: the hull loss lasts the whole run.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-damage-boost',
          to: 'player',
          payload: { multiplier: 1.6 },
        },
        {
          type: 'event',
          event: 'upgrade-health-boost',
          to: 'player',
          payload: { multiplier: 0.7 },
        },
      ],
    },
  ],
};
