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
      'A field around the ship drags at anything flying close: enemies and their shots alike.',
    lore: 'The Ring held its rocks in place with fields like this. A small one still works.',
    levels: [
      {
        title: 'Drag Field',
        description:
          'Enemies and enemy shots within 140 px of the ship move 20% slower.',
        highlights: ['Warden shots slow too; Wardens themselves do not.'],
      },
      {
        title: 'Deep Drag',
        description: 'Within 160 px, 35% slower.',
        highlights: ['Time to slip between incoming shots.'],
      },
      {
        title: 'Still Point',
        description: 'Within 180 px, 50% slower.',
        highlights: ['Close rocks crawl and bullets hang in the air.'],
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
          payload: { radius: 140, slowFraction: 0.2 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-gravity-brake',
          payload: { radius: 160, slowFraction: 0.35 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-gravity-brake',
          payload: { radius: 180, slowFraction: 0.5 }, // proposta 20/10
        },
      ],
    },
  ],
};
