// Maneuver cards (R12; numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'gyro_servos',
  order: 28,
  category: 'mobility',
  family: 'maneuver',
  rarity: 'common',
  icon: '🔄',
  themeColor: PALETTE.boss,
  unlockLevel: 1,
  tags: ['turret', 'aim'],
  text: {
    name: 'Gyro Servos',
    summary: 'Faster turret motors: the gun swings onto a new target sooner.',
    lore: 'Lifted from a Warden gun mount. It still twitches toward movement.',
    levels: [
      {
        title: 'Fast Servos',
        description: 'Turret turn speed +25%.',
        highlights: ['Quicker swings onto targets behind you.'],
      },
      {
        title: 'Gyro Lock',
        description: 'Turret turn speed +50% (cumulative).',
        highlights: ['The gun is where you look.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-turret-turn',
          payload: { multiplier: 1.25 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-turret-turn',
          payload: { multiplier: 1.2 }, // Total: 1.50
        },
      ],
    },
  ],
};
