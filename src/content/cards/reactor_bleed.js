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
    summary:
      'While the engines are idle, the reactor bleeds their output into the cannon.',
    lore: 'Every salvager knows the trick and every salvager regrets it at least once.',
    levels: [
      {
        title: 'Open Valve',
        description: 'While no movement key is held, damage +30%.',
        highlights: ['Let go to hit harder; move and the bonus is gone.'],
      },
      {
        title: 'Bypass Line',
        description: 'While no movement key is held, damage +60%.',
        highlights: ['Drifting counts: the ship need not be still.'],
      },
      {
        title: 'Core Tap',
        description: 'While no movement key is held, damage +100%.',
        highlights: ['A dash cuts the bleed until it ends.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-reactor-bleed',
          payload: { idleDamageMultiplier: 1.3 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-reactor-bleed',
          payload: { idleDamageMultiplier: 1.6 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-reactor-bleed',
          payload: { idleDamageMultiplier: 2 }, // proposta 20/10
        },
      ],
    },
  ],
};
