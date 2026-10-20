import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'reactive_brake',
  order: 29,
  category: 'mobility',
  family: 'maneuver',
  rarity: 'rare',
  icon: '💢',
  themeColor: PALETTE.boss,
  unlockLevel: 3,
  tags: ['braking', 'shockwave', 'area damage'],
  prerequisites: [
    {
      type: 'upgrade',
      id: 'braking_system',
      level: 3,
      text: 'Requires the Emergency Brake (Braking System Lv. 3).',
    },
  ],
  text: {
    name: 'Reactive Brake',
    summary:
      'The emergency brake dumps its charge into the shockwave: every reversal hurts.',
    lore: 'All that speed has to go somewhere. Now it goes into them.',
    levels: [
      {
        title: 'Charged Ring',
        description:
          'The brake shockwave shoves 50% harder and deals up to 30 damage.',
        highlights: ['Full damage next to the ship, fading toward the edge.'],
      },
      {
        title: 'Detonating Ring',
        description:
          'The shockwave shoves twice as hard, deals up to 60 damage, and the brake recharges in 0.7 s instead of 1.2 s.',
        highlights: ['Turn back in a crowd, again and again.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-reactive-brake',
          // proposta 20/10
          payload: {
            knockbackMultiplier: 1.5,
            damage: 30,
            cooldownMultiplier: 1,
          },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-reactive-brake',
          // proposta 20/10
          payload: {
            knockbackMultiplier: 2,
            damage: 60,
            cooldownMultiplier: 0.6,
          },
        },
      ],
    },
  ],
};
