import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'arc_lattice',
  order: 34,
  category: 'utility',
  family: 'arc',
  rarity: 'epic',
  icon: '🕸️',
  themeColor: PALETTE.status,
  unlockLevel: 3,
  tags: ['combo'],
  text: {
    name: 'Arc Lattice',
    summary: 'Every kill in a chain charges the next one a little more.',
    lore: 'Lattice wire from a Tether, still trying to connect things.',
    levels: [
      {
        title: 'Thin Wire',
        description: 'Each combo kill adds +12% XP multiplier (was +10%).',
        highlights: ['The streak climbs faster.'],
      },
      {
        title: 'Mesh',
        description: 'Each combo kill adds +14% XP multiplier.',
        highlights: ['Reaches the cap sooner.'],
      },
      {
        title: 'Full Lattice',
        description: 'Each combo kill adds +16% XP multiplier.',
        highlights: ['Short chains already pay.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'progression',
          property: 'comboMultiplierStep',
          operation: 'add',
          value: 0.02,
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'progression',
          property: 'comboMultiplierStep',
          operation: 'add',
          value: 0.02,
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'progression',
          property: 'comboMultiplierStep',
          operation: 'add',
          value: 0.02,
        },
      ],
    },
  ],
};
