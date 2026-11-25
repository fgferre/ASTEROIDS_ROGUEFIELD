// A piloting-flight card (`newFlight`). The numbers are proposals
// (16/11), the owner's to judge by playing.
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'close_quarters',
  newFlight: true,
  order: 49,
  category: 'offense',
  family: 'kinetic',
  rarity: 'rare',
  icon: '🎯',
  themeColor: PALETTE.shot,
  unlockLevel: 4,
  unlock: { by: 'start', at: 8 },
  tags: ['damage', 'risk'],
  text: {
    name: 'Close Quarters',
    summary: 'Fight with enemies at your hull and the cannon hits harder.',
    lore: 'The old gunners swore the best shot is the one you can smell.',
    levels: [
      {
        title: 'Point Blank',
        description:
          'While any enemy is within 150 px of the ship, damage +20%.',
        highlights: ['Asteroids count as enemies.'],
      },
      {
        title: 'Knife Range',
        description:
          'While any enemy is within 150 px of the ship, damage +40%.',
        highlights: [
          'The bonus drops the moment the last one is out of reach.',
        ],
      },
      {
        title: 'Breath on the Glass',
        description:
          'While any enemy is within 150 px of the ship, damage +60%.',
        highlights: ['Danger is the price of the bonus.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-close-quarters',
          payload: { closeDamageMultiplier: 1.2, radius: 150 }, // proposta 16/11
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-close-quarters',
          payload: { closeDamageMultiplier: 1.4, radius: 150 }, // proposta 16/11
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-close-quarters',
          payload: { closeDamageMultiplier: 1.6, radius: 150 }, // proposta 16/11
        },
      ],
    },
  ],
};
