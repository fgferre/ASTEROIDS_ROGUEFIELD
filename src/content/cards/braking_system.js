export default {
  id: 'braking_system',
  order: 23,
  category: 'mobility',
  family: 'kinetic',
  rarity: 'common',
  icon: '⚙️',
  themeColor: '#5DADE2',
  unlockLevel: 3,
  tags: ['control', 'braking', 'precision'],
  prerequisites: [
    {
      type: 'upgrade',
      id: 'rcs_system',
      level: 2,
      text: 'Requires RCS System active (Lv. 2).',
    },
  ],
  text: {
    name: 'Braking System',
    summary: 'Installs inertial brakes for quick stops and precise control.',
    lore: 'Mining technology adapted for combat. Allows impossible stops and sharp direction changes.',
    levels: [
      {
        title: 'Inertial Brakes',
        description: 'Linear damping +30%. Faster stops.',
        highlights: [
          'Reduces inertia when releasing movement keys. Improved control.',
        ],
      },
      {
        title: 'Retro Thrusters',
        description: 'Linear damping +60%. Near-instant reversals.',
        highlights: ['Very fast stops. Ideal for close-quarters combat.'],
      },
      {
        title: 'Emergency Brake',
        description: 'Linear damping +100%. Unlocks the emergency brake.',
        highlights: [
          'Hold the reverse key (S) against your motion for 0.25 s: full stop and a shockwave that shoves enemies back.',
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
          event: 'upgrade-linear-damping',
          payload: { multiplier: 1.3 },
        },
        {
          type: 'event',
          event: 'upgrade-braking-visual',
          payload: { level: 1 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-linear-damping',
          payload: { multiplier: 1.231 }, // Total: 1.60
        },
        {
          type: 'event',
          event: 'upgrade-braking-visual',
          payload: { level: 2 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-linear-damping',
          payload: { multiplier: 1.25 }, // Total: 2.00
        },
        {
          type: 'event',
          event: 'upgrade-braking-visual',
          payload: { level: 3 },
        },
        {
          type: 'event',
          event: 'upgrade-emergency-brake',
          // proposta 18/10: hold S against the motion `hold` s → stop over
          // `stopTime` s with a shove-only shockwave of `radius` px.
          payload: {
            hold: 0.25,
            minSpeed: 40,
            stopTime: 0.1,
            radius: 110,
            knockback: 160,
            cooldown: 1.2,
          },
        },
      ],
    },
  ],
};
