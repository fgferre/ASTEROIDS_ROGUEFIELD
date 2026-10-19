export default {
  id: 'propulsors',
  order: 21,
  category: 'mobility',
  family: 'kinetic',
  rarity: 'common',
  icon: '🚀',
  themeColor: '#5DADE2',
  unlockLevel: 1,
  tags: ['speed', 'mobility', 'acceleration'],
  text: {
    name: 'Main Thrusters',
    summary: 'Upgrades the main engines for better acceleration and top speed.',
    lore: 'Modular propulsion system that evolves from tuned nozzles to vectored plasma overload.',
    levels: [
      {
        title: 'Tuned Nozzles',
        description: 'Acceleration +12% and top speed +10%.',
        highlights: ['Slightly faster response to controls.'],
      },
      {
        title: 'Stable Burn',
        description: 'Acceleration +25% and speed +22% (cumulative).',
        highlights: ['Visibly improved thrust.'],
      },
      {
        title: 'Dual Injection',
        description: 'Acceleration +45% and speed +38% (cumulative).',
        highlights: ['Combat fighter performance.'],
      },
      {
        title: 'Superheated Plasma',
        description: 'Acceleration +75% and speed +60% (cumulative).',
        highlights: ['Thrusters overloaded. White flames visible.'],
      },
      {
        title: 'Vector Overload',
        description: 'Acceleration +110% and speed +85% (cumulative).',
        highlights: [
          'Thrust leaves a 0.5 s ion trail: 8 damage every 0.2 s to machines that touch it.',
        ],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-acceleration-boost',
          payload: { multiplier: 1.12 },
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 1.1 },
        },
        {
          type: 'event',
          event: 'upgrade-thruster-visual',
          payload: { level: 1 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-acceleration-boost',
          payload: { multiplier: 1.116 }, // Total: 1.25
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 1.109 }, // Total: 1.22
        },
        {
          type: 'event',
          event: 'upgrade-thruster-visual',
          payload: { level: 2 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-acceleration-boost',
          payload: { multiplier: 1.16 }, // Total: 1.45
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 1.131 }, // Total: 1.38
        },
        {
          type: 'event',
          event: 'upgrade-thruster-visual',
          payload: { level: 3 },
        },
      ],
    },
    {
      rank: 4,
      effects: [
        {
          type: 'event',
          event: 'upgrade-acceleration-boost',
          payload: { multiplier: 1.207 }, // Total: 1.75
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 1.159 }, // Total: 1.60
        },
        {
          type: 'event',
          event: 'upgrade-thruster-visual',
          payload: { level: 4 },
        },
      ],
    },
    {
      rank: 5,
      effects: [
        {
          type: 'event',
          event: 'upgrade-acceleration-boost',
          payload: { multiplier: 1.2 }, // Total: 2.10
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 1.156 }, // Total: 1.85
        },
        {
          type: 'event',
          event: 'upgrade-thruster-visual',
          payload: { level: 5 },
        },
        {
          type: 'event',
          event: 'upgrade-ion-trail',
          // proposta 18/10: machines only (rocks pass), bosses take half.
          payload: {
            damage: 8,
            life: 0.5,
            tickInterval: 0.2,
            radius: 10,
            bossFactor: 0.5,
          },
        },
      ],
    },
  ],
};
