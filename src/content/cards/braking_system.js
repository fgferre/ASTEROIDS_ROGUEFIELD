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
      id: 'propulsors',
      level: 1,
      text: 'Requires Main Thrusters installed (Lv. 1).',
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
          'Hold a direction against your motion for 0.25 s: full stop and a shockwave that shoves enemies back.',
        ],
      },
    ],
  },
  // The new flight (the default; ?direcao=antiga is the old flight) reads this over `text`: in glide the
  // brakes act when the thrust is let go (measured 16/11 from top speed,
  // 132 px/s, to under 10 px/s: 7.4 s bare, 2.0 / 1.2 / 0.75 s per level).
  newFlightText: {
    summary:
      'Brakes for the glide: let go of the thrust and the ship slows down by itself.',
    levels: [
      {
        title: 'Inertial Brakes',
        description:
          'Let go of the thrust and the ship comes to a stop in 2 s instead of 7 s.',
        highlights: ['Turning without thrust bleeds speed too.'],
      },
      {
        title: 'Retro Thrusters',
        description: 'Stronger brakes: a stop in 1.2 s.',
        highlights: ['Thrust carries you; letting go settles you.'],
      },
      {
        title: 'Emergency Brake',
        description: 'A stop in 0.75 s. Unlocks the emergency brake.',
        highlights: [
          'Hold reverse (S) against your drift for 0.25 s: a dead stop and a shockwave that shoves enemies back.',
          'With RCS System 3 too, the Flight Computer can show up.',
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
          // proposta 18/10: hold a direction against the motion `hold` s →
          // stop over `stopTime` s with a shove-only shockwave of `radius` px.
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
