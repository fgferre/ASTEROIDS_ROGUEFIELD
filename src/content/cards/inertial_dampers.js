// Maneuver cards (R12; numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'inertial_dampers',
  order: 30,
  category: 'mobility',
  family: 'maneuver',
  rarity: 'common',
  icon: '🧭',
  themeColor: PALETTE.boss,
  unlockLevel: 2,
  tags: ['braking', 'dash', 'control'],
  text: {
    name: 'Inertial Dampers',
    summary: 'Bleeds off drift when you let go, and stretches the dash.',
    lore: 'Field-grade dampers from a survey skiff. Built to hold still over a crack in a rock.',
    levels: [
      {
        title: 'Drift Bleed',
        description: 'Braking damping +25%: faster stops when you let go.',
        highlights: ['Less drift between moves.'],
      },
      {
        title: 'Long Stride',
        description:
          'Braking damping +50% (cumulative) and the dash goes 15% further.',
        highlights: ['Cross the gap, then stop on the spot.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-linear-damping',
          payload: { multiplier: 1.25 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-linear-damping',
          payload: { multiplier: 1.2 }, // Total: 1.50
        },
        {
          type: 'event',
          event: 'upgrade-dash-distance',
          payload: { multiplier: 1.15 },
        },
      ],
    },
  ],
};
