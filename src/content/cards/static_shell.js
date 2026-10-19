// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'static_shell',
  order: 19,
  category: 'defense',
  family: 'arc',
  rarity: 'common',
  icon: '⚡',
  themeColor: PALETTE.status,
  unlockLevel: 1,
  tags: ['retaliation', 'hull'],
  text: {
    name: 'Static Shell',
    summary:
      'Charges the hull plating: whatever hits you gets the current back.',
    lore: 'A Warden trick. Their hulls bit back, and now yours does too.',
    levels: [
      {
        title: 'Live Plating',
        description:
          'Taking a hit discharges a 90 px arc: 20 damage to every enemy in reach.',
        highlights: ['Shield hits count too.'],
      },
      {
        title: 'Hot Plating',
        description: 'The arc deals 40 damage.',
        highlights: ['Another +20 per discharge.'],
      },
      {
        title: 'Storm Plating',
        description: 'The arc deals 60 damage.',
        highlights: ['Getting hit becomes an attack.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-static-shell',
          payload: { radius: 90, damage: 20 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-static-shell',
          payload: { radius: 90, damage: 40 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-static-shell',
          payload: { radius: 90, damage: 60 },
        },
      ],
    },
  ],
};
