export default {
  id: 'multishot',
  order: 2,
  category: 'offense',
  family: 'kinetic',
  rarity: 'epic',
  icon: '💥',
  themeColor: '#A56DFF',
  unlockLevel: 1,
  tags: ['projectiles', 'weaponry'],
  text: {
    name: 'Multishot',
    summary:
      'Couples secondary emitters to main cannon to unleash more projectiles.',
    lore: 'Reusable modules salvaged from deactivated military satellites.',
    levels: [
      {
        title: 'Dual Outlet',
        description: 'Fires one additional projectile per sequence.',
        highlights: ['Increases instant fire volume.'],
      },
      {
        title: 'Triangular Grid',
        description: 'Adds a third shot, forming a fan pattern.',
        highlights: ['Covers larger area in front of ship.'],
      },
      {
        title: 'Synchronized Barrage',
        description: 'Includes a fourth projectile per sequence.',
        highlights: ['Maximizes saturation at close range.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-multishot',
          payload: { bonus: 1 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-multishot',
          payload: { bonus: 1 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-multishot',
          payload: { bonus: 1 },
        },
      ],
    },
  ],
};
