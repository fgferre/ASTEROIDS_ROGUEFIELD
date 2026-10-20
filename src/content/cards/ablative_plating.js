import { PALETTE } from '../../data/constants/palette.js';

// Armor (numbers: proposta 20/10): every hit that reaches the hull loses
// `armor` damage, never below 1. Strong against many small hits.
export default {
  id: 'ablative_plating',
  order: 17,
  category: 'defense',
  family: 'field',
  rarity: 'common',
  icon: '🧱',
  themeColor: PALETTE.text,
  unlockLevel: 1,
  tags: ['armor', 'hull'],
  text: {
    name: 'Ablative Plating',
    summary:
      'Bolts layers of Ring alloy onto the hull: every hit loses a fixed bite before it reaches you.',
    lore: 'Cut from the outer skin of the Ring, where the old field still clings to the metal.',
    levels: [
      {
        title: 'First Layer',
        description:
          'Every hit on the hull deals 3 less damage (never below 1).',
        highlights: ['Enemy shots deal 10 to 24: a big cut on small hits.'],
      },
      {
        title: 'Second Layer',
        description: 'Every hit on the hull deals 6 less damage.',
        highlights: ['Grazing rocks barely scratch.'],
      },
      {
        title: 'Full Skin',
        description: 'Every hit on the hull deals 9 less damage.',
        highlights: ['Swarms and bullet storms lose their teeth.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-hull-armor',
          payload: { armor: 3 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-hull-armor',
          payload: { armor: 6 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-hull-armor',
          payload: { armor: 9 }, // proposta 20/10
        },
      ],
    },
  ],
};
