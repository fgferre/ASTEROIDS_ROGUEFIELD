// Snappier thrust (numbers: proposta 20/10): under thrust the push and the
// drag both scale by `multiplier`, so the top speed stays and everything that
// leads to it is that much quicker. Measured (modern, base hull): full speed
// from a standstill in 0.53 s and a full reversal in 0.75 s without the card.
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
