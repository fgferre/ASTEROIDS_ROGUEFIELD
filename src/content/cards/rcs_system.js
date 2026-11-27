// The side jets (numbers: proposta 20/10): their push and the turn × the
// level's `multiplier`, and the computer stops a released spin firmer each
// level (player/flight.js). Measured 22/11: turn rate 74°/s bare, then 96,
// 118, 140, 163, 192; a released spin stops in 1.7 s bare, 0.5 s at level 1.
export default {
  id: 'rcs_system',
  order: 22,
  category: 'mobility',
  family: 'kinetic',
  rarity: 'rare',
  icon: '🛰️',
  themeColor: '#5DADE2',
  unlockLevel: 2,
  unlock: { by: 'pilot', at: 3 },
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
      'Side thrusters bite harder: the hull turns faster, the computer stops a spin for you when you let go, and the strafe pushes harder.',
    lore: 'Reaction Control System salvaged from abandoned space stations. Allows maneuvers impossible for conventional ships.',
    levels: [
      {
        title: 'Basic RCS',
        description:
          'Turns 30% faster (96° a second instead of 74°), and a spin stops half a second after you let go instead of drifting on.',
        highlights: [
          'Line the nose up and it stays there.',
          'The strafe (Z and C, or Space held with A and D) slides the hull sideways harder, more with each level.',
        ],
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
          to: 'player',
          lands: { 'flight.agility': 'multiplier' },
          payload: { multiplier: 1.3 }, // proposta 20/10
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          to: 'player',
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
          to: 'player',
          lands: { 'flight.agility': 'multiplier' },
          payload: { multiplier: 1.6 }, // proposta 20/10
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          to: 'player',
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
          to: 'player',
          lands: { 'flight.agility': 'multiplier' },
          payload: { multiplier: 1.9 }, // proposta 20/10
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          to: 'player',
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
          to: 'player',
          lands: { 'flight.agility': 'multiplier' },
          payload: { multiplier: 2.2 }, // proposta 20/10
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          to: 'player',
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
          to: 'player',
          lands: { 'flight.agility': 'multiplier' },
          payload: { multiplier: 2.6 }, // proposta 20/10
        },
        {
          type: 'event',
          event: 'upgrade-rcs-visual',
          to: 'player',
          payload: { level: 5 },
        },
      ],
    },
  ],
};
