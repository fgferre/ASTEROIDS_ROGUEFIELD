import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'grav_anchor',
  order: 18,
  category: 'defense',
  family: 'field',
  rarity: 'common',
  icon: '⚓',
  themeColor: PALETTE.text,
  unlockLevel: 2,
  tags: ['control', 'hull'],
  text: {
    name: 'Grav Anchor',
    summary:
      'A small field generator that pins the ship in place when you let go.',
    lore: 'Warden docking clamps still answer to a Ring signal. You found the signal.',
    levels: [
      {
        title: 'Soft Clamp',
        description: 'Stopping power +25% and max hull +15.',
        highlights: ['The ship settles faster when you release thrust.'],
      },
      {
        title: 'Hard Clamp',
        description: 'Stopping power +56% and max hull +30 (cumulative).',
        highlights: ['Hold a spot while the Field moves around you.'],
      },
      {
        title: 'Dead Stop',
        description: 'Stopping power +95% and max hull +45 (cumulative).',
        highlights: ['Near-instant stops.'],
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
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: 15 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-linear-damping',
          payload: { multiplier: 1.25 },
        },
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: 15 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-linear-damping',
          payload: { multiplier: 1.25 },
        },
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: 15 },
        },
      ],
    },
  ],
};
