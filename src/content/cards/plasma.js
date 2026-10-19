export default {
  id: 'plasma',
  order: 1,
  category: 'offense',
  family: 'thermal',
  rarity: 'rare',
  icon: '⚡',
  themeColor: '#F6C945',
  unlockLevel: 1,
  tags: ['damage', 'weaponry'],
  text: {
    name: 'Plasma Gun',
    summary:
      'Condenses the main cannon into superheated plasma to multiply offensive potential.',
    lore: 'Technology salvaged from the devastated hulls of the Perseus fleet. Requires constant temperature monitoring.',
    levels: [
      {
        title: 'Fusion Coil',
        description: 'Standard projectiles deal immediately +25% damage.',
        highlights: ['Multiplier applied directly to base damage.'],
      },
      {
        title: 'Twinned Capacitors',
        description: 'Enhances system to reach +50% accumulated damage.',
        highlights: ['Applies additional 20% over current damage.'],
      },
      {
        title: 'Harmonic Matrix',
        description: 'Stabilizes plasma for +70% total damage.',
        highlights: ['Provides extra 15% multiplier on current value.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-damage-boost',
          payload: { multiplier: 1.25 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-damage-boost',
          payload: { multiplier: 1.2 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-damage-boost',
          payload: { multiplier: 1.15 },
        },
      ],
    },
  ],
};
