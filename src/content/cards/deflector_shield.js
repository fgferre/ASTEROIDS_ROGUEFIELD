export default {
  id: 'deflector_shield',
  order: 16,
  category: 'defense',
  family: 'field',
  rarity: 'epic',
  icon: '💠',
  themeColor: '#5EC8FF',
  unlockLevel: 2,
  unlock: { by: 'medal', medal: 'ring-breaker' },
  tags: ['escudo', 'defesa ativa'],
  prerequisites: [
    {
      type: 'upgrade',
      id: 'shield',
      level: 1,
      text: 'Requires Energy Shield installed (Lvl 1).',
    },
  ],
  text: {
    name: 'Deflection Matrix',
    summary: 'Implements an activatable shield that absorbs damage.',
    lore: 'Experimental system that redistributes reactor energy to a fast directional field.',
    levels: [
      {
        title: 'Initial Field',
        description: 'Activatable shield absorbs 50 damage before recharging.',
        highlights: ['Unlocks ability on configured key (default: E).'],
      },
      {
        title: 'Reinforced Plating',
        description: 'Shield capacity raised to 75 damage.',
        highlights: [
          'Ideal for withstanding medium barrages without immediate recharge.',
        ],
      },
      {
        title: 'Optimized Cooling',
        description: 'Reduces shield recharge time by 5 seconds.',
        highlights: ['Allows more frequent reactivations in prolonged fights.'],
      },
      {
        title: 'Advanced Matrix',
        description: 'Shield capacity raised to 100 damage.',
        highlights: ['Sustains confrontations against aggressive swarms.'],
      },
      {
        title: 'Deflector Overload',
        description:
          'Capacity 125 damage and a shorter recharge. When the shield breaks, it explodes and damages nearby enemies.',
        highlights: ['Unlocks rapid recharge for successive counter-attacks.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-deflector-shield',
          payload: { level: 1 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-deflector-shield',
          payload: { level: 2 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-deflector-shield',
          payload: { level: 3 },
        },
      ],
    },
    {
      rank: 4,
      effects: [
        {
          type: 'event',
          event: 'upgrade-deflector-shield',
          payload: { level: 4 },
        },
      ],
    },
    {
      rank: 5,
      effects: [
        {
          type: 'event',
          event: 'upgrade-deflector-shield',
          payload: { level: 5 },
        },
      ],
    },
  ],
};
