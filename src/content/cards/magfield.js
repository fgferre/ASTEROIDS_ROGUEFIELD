export default {
  id: 'magfield',
  order: 32,
  category: 'utility',
  family: 'salvage',
  rarity: 'common',
  icon: '🧲',
  themeColor: '#C08BFF',
  unlockLevel: 1,
  tags: ['collection', 'magnetism'],
  text: {
    name: 'Magnetic Field',
    summary:
      'Amplifies ship collector field to attract experience orbs from further away.',
    lore: 'Coils recalibrated with light alloys allow stable magnetism even during sharp maneuvers.',
    levels: [
      {
        title: 'Flux Lenses',
        description: 'Collection range +40% and orb pull +35%.',
        highlights: ['Orbs start flying to you from further away.'],
      },
      {
        title: 'Dual Catalyst',
        description: 'Collection range +75% and orb pull +69% (cumulative).',
        highlights: ['Another +25% range and +25% pull.'],
      },
      {
        title: 'Harmonic Weave',
        description: 'Collection range +100% and orb pull +94% (cumulative).',
        highlights: ['Twice the reach you started with.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'progression',
          property: 'magnetismForce',
          operation: 'multiply',
          value: 1.35,
        },
        {
          type: 'event',
          event: 'upgrade-magnetism',
          payload: { multiplier: 1.4 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'progression',
          property: 'magnetismForce',
          operation: 'multiply',
          value: 1.25,
        },
        {
          type: 'event',
          event: 'upgrade-magnetism',
          payload: { multiplier: 1.25 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'progression',
          property: 'magnetismForce',
          operation: 'multiply',
          value: 1.15,
        },
        {
          type: 'event',
          event: 'upgrade-magnetism',
          payload: { multiplier: 1.15 },
        },
      ],
    },
  ],
};
