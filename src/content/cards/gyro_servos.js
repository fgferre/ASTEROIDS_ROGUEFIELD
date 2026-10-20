import { PALETTE } from '../../data/constants/palette.js';

// Dash-fed turret (numbers: proposta 20/10): for `duration` s after each
// dash the cannon's cooldown is × `cooldownMultiplier`.
export default {
  id: 'gyro_servos',
  order: 28,
  category: 'offense',
  family: 'maneuver',
  rarity: 'common',
  icon: '🔄',
  themeColor: PALETTE.boss,
  unlockLevel: 1,
  tags: ['dash', 'fire-rate'],
  text: {
    name: 'Gyro Servos',
    summary:
      'The dash spins up the turret gyros, and the gun runs hot while they wind down.',
    lore: 'Lifted from a Warden gun mount. It still twitches toward movement.',
    levels: [
      {
        title: 'Fast Servos',
        description: 'After each dash, fire rate +40% for 1 s.',
        highlights: ['Dash into the fight, not away from it.'],
      },
      {
        title: 'Gyro Lock',
        description: 'After each dash, fire rate +80% for 1.5 s.',
        highlights: ['With a short dash cooldown the gun never cools.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-dash-fire',
          payload: { cooldownMultiplier: 1 / 1.4, duration: 1 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-dash-fire',
          payload: { cooldownMultiplier: 1 / 1.8, duration: 1.5 }, // proposta 20/10
        },
      ],
    },
  ],
};
