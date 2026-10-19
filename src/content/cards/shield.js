export default {
  id: 'shield',
  order: 15,
  category: 'defense',
  family: 'field',
  rarity: 'common',
  icon: '🛡️',
  themeColor: '#4ECDC4',
  unlockLevel: 1,
  tags: ['health', 'hull'],
  text: {
    name: 'Energy Shield',
    summary:
      'Installs regenerative coils that increase hull structural capacity.',
    lore: 'System adapted from Typhon freighters. Operates in parallel with the activateable deflector shield.',
    levels: [
      {
        title: 'Auxiliary Reserves',
        description: 'Increases max health by +50 points.',
        highlights: [
          'Applies direct bonus of +50 HP and equivalent immediate heal.',
        ],
      },
      {
        title: 'Graphene Layer',
        description: 'Adds another +50 max health points.',
        highlights: ['Cumulative bonus, totaling +100 additional HP.'],
      },
      {
        title: 'Self-Repair Matrix',
        description: 'Expands total reserve by +75 extra points.',
        highlights: ['Total of +175 extra HP after the third level.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: 50 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: 50 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: 75 },
        },
      ],
    },
  ],
};
