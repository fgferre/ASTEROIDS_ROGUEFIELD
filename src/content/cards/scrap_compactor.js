import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'scrap_compactor',
  order: 39,
  category: 'defense',
  family: 'salvage',
  rarity: 'common',
  icon: '🗜️',
  themeColor: PALETTE.xp,
  unlockLevel: 1,
  tags: ['repair', 'level-up'],
  text: {
    name: 'Scrap Compactor',
    summary:
      'Presses the slag out of every orb into hull patches: each level-up repairs the ship.',
    lore: 'Bolted to the hold by a salvager who hated wasted space.',
    levels: [
      {
        title: 'Hand Press',
        description: 'Every level-up repairs 8 hull.',
        highlights: ['The more you level, the more you mend.'],
      },
      {
        title: 'Hydraulic Press',
        description: 'Every level-up repairs 14 hull.',
        highlights: ['Every XP bonus now heals too.'],
      },
      {
        title: 'Mass Press',
        description: 'Every level-up repairs 20 hull.',
        highlights: ["Close to a heart's worth on every level-up."],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-level-up-repair',
          payload: { repair: 8 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-level-up-repair',
          payload: { repair: 14 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-level-up-repair',
          payload: { repair: 20 }, // proposta 20/10
        },
      ],
    },
  ],
};
