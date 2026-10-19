// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'gravity_brake',
  order: 20,
  category: 'defense',
  family: 'field',
  rarity: 'common',
  icon: '🌑',
  themeColor: PALETTE.text,
  unlockLevel: 2,
  tags: ['control', 'slow'],
  text: {
    name: 'Gravity Brake',
    summary:
      'A short-range field that drags at anything flying close to the ship.',
    lore: 'The Ring held its rocks in place with fields like this. A small one still works.',
    levels: [
      {
        title: 'Drag Field',
        description: 'Enemies within 120 px move 8% slower.',
        highlights: ['Bosses are not slowed.'],
      },
      {
        title: 'Deep Drag',
        description: 'Enemies within 120 px move 16% slower.',
        highlights: ['Another -8% speed in the field.'],
      },
      {
        title: 'Still Point',
        description: 'Enemies within 120 px move 24% slower.',
        highlights: ['Close rocks crawl.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-gravity-brake',
          payload: { radius: 120, slowFraction: 0.08 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-gravity-brake',
          payload: { radius: 120, slowFraction: 0.16 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-gravity-brake',
          payload: { radius: 120, slowFraction: 0.24 },
        },
      ],
    },
  ],
};
