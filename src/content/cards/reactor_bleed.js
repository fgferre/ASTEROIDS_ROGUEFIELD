import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'reactor_bleed',
  order: 6,
  category: 'offense',
  family: 'thermal',
  rarity: 'rare',
  icon: '☢️',
  themeColor: PALETTE.shot,
  unlockLevel: 3,
  tags: ['damage', 'trade-off'],
  text: {
    name: 'Reactor Bleed',
    summary: 'Diverts reactor output from the engines into the cannon.',
    lore: 'Every salvager knows the trick and every salvager regrets it at least once.',
    levels: [
      {
        title: 'Open Valve',
        description: 'Damage +15%, top speed -4%.',
        highlights: ['A trade: harder hits, heavier ship.'],
      },
      {
        title: 'Bypass Line',
        description: 'Damage +32%, top speed -8% (cumulative).',
        highlights: ['Applies another +15% damage and -4% speed.'],
      },
      {
        title: 'Core Tap',
        description: 'Damage +52%, top speed -12% (cumulative).',
        highlights: ['The engines run on what the cannon leaves.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-damage-boost',
          payload: { multiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 0.96 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-damage-boost',
          payload: { multiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 0.96 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-damage-boost',
          payload: { multiplier: 1.15 },
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 0.96 },
        },
      ],
    },
  ],
};
