// Maneuver cards (R12; numbers: proposta 18/10, for the owner to judge by playing).
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
    summary: 'The emergency brake dumps its charge into the shockwave.',
    lore: 'All that speed has to go somewhere. Now it goes into them.',
    levels: [
      {
        title: 'Charged Ring',
        description:
          'The brake shockwave shoves 40% harder and deals up to 12 damage.',
        highlights: ['Full damage next to the ship, fading toward the edge.'],
      },
      {
        title: 'Detonating Ring',
        description:
          'The brake shockwave shoves 80% harder and deals up to 24 damage.',
        highlights: ['Stop dead in a crowd.'],
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
          payload: { knockbackMultiplier: 1.4, damage: 12 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-reactive-brake',
          payload: { knockbackMultiplier: 1.8, damage: 24 },
        },
      ],
    },
  ],
};
