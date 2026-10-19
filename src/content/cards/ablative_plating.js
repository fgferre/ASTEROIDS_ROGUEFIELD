import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'ablative_plating',
  order: 17,
  category: 'defense',
  family: 'field',
  rarity: 'common',
  icon: '🧱',
  themeColor: PALETTE.text,
  unlockLevel: 1,
  tags: ['health', 'hull', 'trade-off'],
  text: {
    name: 'Ablative Plating',
    summary: 'Bolts layers of Ring alloy onto the hull. Heavy, but it holds.',
    lore: 'Cut from the outer skin of the Ring, where the old field still clings to the metal.',
    levels: [
      {
        title: 'First Layer',
        description: 'Max hull +40, top speed -3%.',
        highlights: ['Repairs 40 hull at once.'],
      },
      {
        title: 'Second Layer',
        description: 'Max hull +80, top speed -6% (cumulative).',
        highlights: ['Repairs another 40 hull.'],
      },
      {
        title: 'Full Skin',
        description: 'Max hull +120, top speed -9% (cumulative).',
        highlights: ['A brick that can take a Warden volley.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: 40 },
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 0.97 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: 40 },
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 0.97 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-health-boost',
          payload: { bonus: 40 },
        },
        {
          type: 'event',
          event: 'upgrade-speed-boost',
          payload: { multiplier: 0.97 },
        },
      ],
    },
  ],
};
