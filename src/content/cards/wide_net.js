import { PALETTE } from '../../data/constants/palette.js';

// Tow pulse (numbers: proposta 20/10): every `interval` s every orb on the
// Field flies to the ship, the same pull as a Magnet pickup.
export default {
  id: 'wide_net',
  order: 36,
  category: 'utility',
  family: 'salvage',
  rarity: 'common',
  icon: '📡',
  themeColor: PALETTE.xp,
  unlockLevel: 2,
  tags: ['collection', 'magnetism'],
  text: {
    name: 'Wide Net',
    summary:
      'A salvage-barge tow field that, every few seconds, hauls in every orb on the Field.',
    lore: 'Tow emitters from a salvage barge. They were built for whole hulls.',
    levels: [
      {
        title: 'Tow Field',
        description: 'Every 20 s, every orb on the Field flies to you.',
        highlights: ['The same haul as a Magnet pickup.'],
      },
      {
        title: 'Barge Field',
        description: 'A haul every 15 s.',
        highlights: ['No more flying back for stragglers.'],
      },
      {
        title: 'Hull Tow',
        description: 'A haul every 10 s.',
        highlights: ['Fight anywhere: the XP comes to you.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-tow-pulse',
          payload: { interval: 20 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-tow-pulse',
          payload: { interval: 15 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-tow-pulse',
          payload: { interval: 10 }, // proposta 20/10
        },
      ],
    },
  ],
};
