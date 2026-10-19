// Maneuver cards (R12; numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'ram_plating',
  order: 27,
  category: 'mobility',
  family: 'maneuver',
  rarity: 'rare',
  icon: '🐏',
  themeColor: PALETTE.boss,
  unlockLevel: 2,
  tags: ['dash', 'contact damage'],
  text: {
    name: 'Ram Plating',
    summary: 'Armors the bow: the dash slams into whatever it passes through.',
    lore: 'Ore haulers bolted these on to clear drift. Machines break the same way.',
    levels: [
      {
        title: 'Bow Plate',
        description: 'The dash deals 20 damage to each enemy it hits.',
        highlights: ['Once per enemy per dash.'],
      },
      {
        title: 'Reinforced Prow',
        description: 'The dash deals 35 damage to each enemy it hits.',
        highlights: ['Another +15 per hit.'],
      },
      {
        title: 'Battering Ram',
        description: 'The dash deals 50 damage to each enemy it hits.',
        highlights: ['Dash first, shoot after.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-ram-plating',
          payload: { damage: 20 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-ram-plating',
          payload: { damage: 35 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-ram-plating',
          payload: { damage: 50 },
        },
      ],
    },
  ],
};
