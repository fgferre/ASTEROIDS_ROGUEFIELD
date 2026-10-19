export default {
  id: 'deflector_shield',
  order: 16,
  category: 'defense',
  family: 'field',
  rarity: 'epic',
  icon: '💠',
  themeColor: '#5EC8FF',
  unlockLevel: 2,
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
    summary:
      'Implements an activateable shield capable of absorbing direct impacts.',
    lore: 'Experimental system that redistributes reactor energy to a fast directional field.',
    levels: [
      {
        title: 'Initial Field',
        description:
          'Activateable shield absorbs up to 3 impacts before recharging.',
        highlights: ['Unlocks ability on configured key (default: E).'],
      },
      {
        title: 'Reinforced Plating',
        description: 'Capacity increased to 4 impacts per activation.',
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
        description: 'Final capacity of 5 impacts per activation.',
        highlights: ['Sustains confrontations against aggressive swarms.'],
      },
      {
        title: 'Deflector Overload',
        description: 'Further reduces total shield cooldown.',
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
