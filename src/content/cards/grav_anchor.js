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
  tags: ['damage reduction', 'trade-off'],
  text: {
    name: 'Grav Anchor',
    summary:
      'Let go of the controls and a field generator pins the ship: hits land softer while it holds.',
    lore: 'Warden docking clamps still answer to a Ring signal. You found the signal.',
    levels: [
      {
        title: 'Soft Clamp',
        description:
          'While no movement key is held, hits deal 20% less damage.',
        highlights: ['Move or dash and the clamp lets go.'],
      },
      {
        title: 'Hard Clamp',
        description:
          'While no movement key is held, hits deal 35% less damage.',
        highlights: ['Hold a spot while the Field moves around you.'],
      },
      {
        title: 'Dead Stop',
        description:
          'While no movement key is held, hits deal 50% less damage.',
        highlights: ['Half of every hit, as long as you stay put.'],
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
          payload: { damageReduction: 0.5 }, // proposta 20/10
        },
      ],
    },
  ],
};
