import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'grav_anchor',
  order: 18,
  category: 'defense',
  family: 'field',
  rarity: 'common',
  icon: '⚓',
  themeColor: PALETTE.text,
  unlockLevel: 2,
  unlock: { by: 'start', at: 15 },
  tags: ['damage reduction', 'trade-off'],
  text: {
    name: 'Grav Anchor',
    summary:
      'Cut the thrust and a field generator pins the ship: hits land softer while it holds.',
    lore: 'Warden docking clamps still answer to a Ring signal. You found the signal.',
    levels: [
      {
        title: 'Soft Clamp',
        description: 'While you are not thrusting, hits deal 20% less damage.',
        highlights: [
          'Thrust or dash and the clamp lets go; turning and strafing keep it.',
        ],
      },
      {
        title: 'Hard Clamp',
        description: 'While you are not thrusting, hits deal 35% less damage.',
        highlights: ['Hold a spot while the Field moves around you.'],
      },
      {
        title: 'Dead Stop',
        description: 'While you are not thrusting, hits deal 50% less damage.',
        highlights: ['Half of every hit, until you thrust.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-idle-guard',
          to: 'player',
          lands: { idleDamageReduction: 'damageReduction' },
          payload: { damageReduction: 0.2 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-idle-guard',
          to: 'player',
          lands: { idleDamageReduction: 'damageReduction' },
          payload: { damageReduction: 0.35 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-idle-guard',
          to: 'player',
          lands: { idleDamageReduction: 'damageReduction' },
          payload: { damageReduction: 0.5 }, // proposta 20/10
        },
      ],
    },
  ],
};
