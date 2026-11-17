// The new flight only (`newFlight`, ?direcao=nova). The numbers are proposals
// (16/11), the owner's to judge by playing.
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'momentum_rounds',
  newFlight: true,
  order: 44,
  category: 'offense',
  family: 'kinetic',
  rarity: 'common',
  icon: '💨',
  themeColor: PALETTE.shot,
  unlockLevel: 2,
  tags: ['damage', 'speed'],
  text: {
    name: 'Momentum Rounds',
    summary: 'The faster the hull flies, the harder the cannon hits.',
    lore: 'Shells loaded with a little of the ship’s own run. Stand still and they are just shells.',
    levels: [
      {
        title: 'Running Start',
        description:
          'While the ship flies at 60% of its top speed or more, damage +15%.',
        highlights: ['Top speed is the one you fly under right now.'],
      },
      {
        title: 'Full Stride',
        description:
          'While the ship flies at 60% of its top speed or more, damage +30%.',
        highlights: ['Slow below the line and the bonus is gone.'],
      },
      {
        title: 'Flat Out',
        description:
          'While the ship flies at 60% of its top speed or more, damage +45%.',
        highlights: ['Keep moving to keep it.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-momentum-rounds',
          payload: { speedDamageMultiplier: 1.15 }, // proposta 16/11
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-momentum-rounds',
          payload: { speedDamageMultiplier: 1.3 }, // proposta 16/11
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-momentum-rounds',
          payload: { speedDamageMultiplier: 1.45 }, // proposta 16/11
        },
      ],
    },
  ],
};
