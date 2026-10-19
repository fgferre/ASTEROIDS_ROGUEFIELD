import { PALETTE } from '../../data/constants/palette.js';

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
    summary: 'Throws a wider, stronger tow field so orbs come to you faster.',
    lore: 'Tow emitters from a salvage barge. They were built for whole hulls.',
    levels: [
      {
        title: 'Tow Field',
        description: 'Orb pull +30% and collection range +10%.',
        highlights: ['Orbs reach you faster.'],
      },
      {
        title: 'Barge Field',
        description: 'Orb pull +69% and range +21% (cumulative).',
        highlights: ['Less flying back for stragglers.'],
      },
      {
        title: 'Hull Tow',
        description: 'Orb pull +120% and range +33% (cumulative).',
        highlights: ['Orbs snap to you.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'progression',
          property: 'magnetismForce',
          operation: 'multiply',
          value: 1.3,
        },
        {
          type: 'progression',
          property: 'orbMagnetismRadius',
          operation: 'multiply',
          value: 1.1,
        },
        {
          type: 'event',
          event: 'upgrade-magnetism',
          payload: { multiplier: 1.1 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'progression',
          property: 'magnetismForce',
          operation: 'multiply',
          value: 1.3,
        },
        {
          type: 'progression',
          property: 'orbMagnetismRadius',
          operation: 'multiply',
          value: 1.1,
        },
        {
          type: 'event',
          event: 'upgrade-magnetism',
          payload: { multiplier: 1.1 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'progression',
          property: 'magnetismForce',
          operation: 'multiply',
          value: 1.3,
        },
        {
          type: 'progression',
          property: 'orbMagnetismRadius',
          operation: 'multiply',
          value: 1.1,
        },
        {
          type: 'event',
          event: 'upgrade-magnetism',
          payload: { multiplier: 1.1 },
        },
      ],
    },
  ],
};
