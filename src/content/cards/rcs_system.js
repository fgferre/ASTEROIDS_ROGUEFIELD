export default {
  id: 'rcs_system',
  order: 22,
  category: 'mobility',
  family: 'kinetic',
  rarity: 'rare',
  icon: '🛰️',
  themeColor: '#5DADE2',
  unlockLevel: 2,
  tags: ['rotation', 'agility', 'maneuvers'],
  prerequisites: [
    {
      type: 'upgrade',
      id: 'propulsors',
      level: 1,
      text: 'Requires Main Thrusters installed (Lv. 1).',
    },
  ],
  text: {
    name: 'RCS System',
    summary:
      'Enables maneuvering thrusters for precise rotation and agility control.',
    lore: 'Reaction Control System salvaged from abandoned space stations. Allows maneuvers impossible for conventional ships.',
    levels: [
      {
        title: 'Basic RCS',
        description: 'Enables auxiliary thrusters for +15% rotation.',
        highlights: ['Noticeable response in tight turns.'],
      },
      {
        title: 'Active RCS',
        description: 'Rotation +32% and angular damping -12%.',
        highlights: ['Noticeably faster, more precise turns.'],
      },
      {
        title: 'Enhanced RCS',
        description: 'Rotation +55% and angular damping -25%.',
        highlights: ['Space fighter control. Instant turns.'],
      },
      {
        title: 'Vector RCS',
        description: 'Rotation +90% and angular damping -40%.',
        highlights: ['Superhuman control. Instant reversals.'],
      },
      {
        title: 'Omni-directional RCS',
        description: 'Rotation +130% and strafe thrust +15%.',
        highlights: ['Sharper sidesteps around incoming fire.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-rotation-boost',
          payload: { multiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          payload: { level: 1 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-rotation-boost',
          payload: { multiplier: 1.148 }, // Total: 1.32
        },
        {
          type: 'event',
          event: 'upgrade-angular-damping',
          payload: { multiplier: 0.88 }, // -12%
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          payload: { level: 2 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-rotation-boost',
          payload: { multiplier: 1.174 }, // Total: 1.55
        },
        {
          type: 'event',
          event: 'upgrade-angular-damping',
          payload: { multiplier: 0.852 }, // Total: 0.75
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          payload: { level: 3 },
        },
      ],
    },
    {
      rank: 4,
      effects: [
        {
          type: 'event',
          event: 'upgrade-rotation-boost',
          payload: { multiplier: 1.226 }, // Total: 1.90
        },
        {
          type: 'event',
          event: 'upgrade-angular-damping',
          payload: { multiplier: 0.8 }, // Total: 0.60
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          payload: { level: 4 },
        },
      ],
    },
    {
      rank: 5,
      effects: [
        {
          type: 'event',
          event: 'upgrade-rotation-boost',
          payload: { multiplier: 1.211 }, // Total: 2.30
        },
        {
          type: 'event',
          event: 'upgrade-angular-damping',
          payload: { multiplier: 1.0 }, // Total: 0.60 (no change)
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          payload: { level: 5 },
        },
        {
          type: 'event',
          event: 'upgrade-strafe-movement',
          payload: { multiplier: 1.15 },
        },
      ],
    },
  ],
};
