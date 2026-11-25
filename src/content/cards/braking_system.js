export default {
  id: 'braking_system',
  order: 23,
  category: 'mobility',
  family: 'kinetic',
  rarity: 'common',
  icon: '⚙️',
  themeColor: '#5DADE2',
  unlockLevel: 3,
  unlock: { by: 'pilot', at: 2 },
  tags: ['control', 'braking', 'precision'],
  prerequisites: [
    {
      type: 'upgrade',
      id: 'propulsors',
      level: 1,
      text: 'Requires Main Thrusters installed (Lv. 1).',
    },
  ],
  // The computer's brake on the jets once every key is let go (player/
  // flight.js; measured 22/11 from top speed, 132 px/s, to under 10 px/s:
  // never bare, 1.23 / 1.02 / 0.80 s per level; since 23/11 it waits
  // BRAKE_WAIT_S, 0.25 s, first: 1.48 / 1.27 / 1.05 s).
  text: {
    name: 'Braking System',
    summary:
      'The computer brakes for you: let go of every key and the retro and side jets stop the ship.',
    lore: 'Mining technology adapted for combat. Allows impossible stops and sharp direction changes.',
    levels: [
      {
        title: 'Inertial Brakes',
        description:
          'Let go of every key and the ship stops in 1.5 s, where it used to glide on forever. S pulls harder too.',
        highlights: ['A turn or a quick tap of thrust keeps your speed.'],
      },
      {
        title: 'Retro Thrusters',
        description: 'Stronger brakes: a stop in 1.3 s.',
        highlights: ['Thrust carries you; letting go settles you.'],
      },
      {
        title: 'Emergency Brake',
        description: 'A stop in 1.1 s. Unlocks the emergency brake.',
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
