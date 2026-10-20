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
  tags: ['dash', 'distance'],
  text: {
    name: 'Inertial Dampers',
    summary:
      'Dampers soak the kick of the dash drive, so it can push the ship much further.',
    lore: 'Field-grade dampers from a survey skiff. Built to hold still over a crack in a rock.',
    levels: [
      {
        title: 'Soft Kick',
        description: 'The dash goes 25% further.',
        highlights: ['Clear a rock you would have clipped.'],
      },
      {
        title: 'Long Stride',
        description: 'The dash goes 50% further (cumulative).',
        highlights: ['Cross half the gap in one burst.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-dash-distance',
          payload: { multiplier: 1.25 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-dash-distance',
          payload: { multiplier: 1.2 }, // proposta 20/10; total 1.50
        },
      ],
    },
  ],
};
