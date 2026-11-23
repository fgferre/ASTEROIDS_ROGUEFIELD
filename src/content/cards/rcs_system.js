// The side jets (numbers: proposta 20/10): their push and the turn × the
// level's `multiplier`, and the computer stops a released spin firmer each
// level (player/flight.js). The game reads `newFlightText` over `text`, which
// is what the cards said before the jets' flight (22/11).
export default {
  id: 'rcs_system',
  order: 22,
  category: 'mobility',
  family: 'kinetic',
  rarity: 'rare',
  icon: '🛰️',
  themeColor: '#5DADE2',
  unlockLevel: 2,
  tags: ['agility', 'maneuvers'],
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
      'Maneuvering thrusters bite harder: the ship gets to speed, turns and reverses sooner, at the same top speed.',
    lore: 'Reaction Control System salvaged from abandoned space stations. Allows maneuvers impossible for conventional ships.',
    levels: [
      {
        title: 'Basic RCS',
        description:
          'Under thrust, changes of speed and direction are 30% quicker: a full reversal in 0.6 s instead of 0.75 s.',
        highlights: ['Top speed is unchanged: that is Main Thrusters.'],
      },
      {
        title: 'Active RCS',
        description: '60% quicker: a full reversal in 0.5 s.',
        highlights: ['Full speed from a standstill in a third of a second.'],
      },
      {
        title: 'Enhanced RCS',
        description: '90% quicker: a full reversal in 0.4 s.',
        highlights: ['Dodge back the way you came.'],
      },
      {
        title: 'Vector RCS',
        description: '2.2 times as quick: a full reversal in 0.35 s.',
        highlights: ['The ship goes where the keys point.'],
      },
      {
        title: 'Omni-directional RCS',
        description: '2.6 times as quick: a full reversal in 0.3 s.',
        highlights: ['Starts, stops and turns all but instant.'],
      },
    ],
  },
  // The game reads this over `text`: the side jets (flight.js), turning and
  // stopping a released spin. Measured 22/11: turn rate 74°/s bare, 96, 118,
  // 140, 163, 192 per level; a released spin stops in 1.7 s bare, 0.5 s at 1.
  newFlightText: {
    summary:
      'Side thrusters bite harder: the hull turns faster, and the computer stops a spin for you when you let go.',
    levels: [
      {
        title: 'Basic RCS',
        description:
          'Turns 30% faster (96° a second instead of 74°), and a spin stops half a second after you let go instead of drifting on.',
        highlights: ['Line the nose up and it stays there.'],
      },
      {
        title: 'Active RCS',
        description: 'Turns at 118° a second; a spin stops in 0.4 s.',
        highlights: ['Swing the nose onto a target before it moves.'],
      },
      {
        title: 'Enhanced RCS',
        description: 'Turns at 140° a second; a spin stops in 0.35 s.',
        highlights: [
          'With Braking System 3 too, the Flight Computer can show up.',
        ],
      },
      {
        title: 'Vector RCS',
        description: 'Turns at 163° a second; a spin stops in 0.3 s.',
        highlights: ['Spin round and fire back the way you came.'],
      },
      {
        title: 'Omni-directional RCS',
        description:
          'Turns at 192° a second; a spin stops in a quarter of a second.',
        highlights: ['A half turn in just over a second from a standstill.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-thrust-agility',
          payload: { multiplier: 1.3 }, // proposta 20/10
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
          event: 'upgrade-thrust-agility',
          payload: { multiplier: 1.6 }, // proposta 20/10
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
          event: 'upgrade-thrust-agility',
          payload: { multiplier: 1.9 }, // proposta 20/10
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
          event: 'upgrade-thrust-agility',
          payload: { multiplier: 2.2 }, // proposta 20/10
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
          event: 'upgrade-thrust-agility',
          payload: { multiplier: 2.6 }, // proposta 20/10
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          payload: { level: 5 },
        },
      ],
    },
  ],
};
