// A fallback card (`fallback`, the new flight only): offered when the card slots are full
// and the offer can't be filled, while the hull is hurt. Never held, never
// drawn by the regular or trail slots; each pick repairs again.
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'hull_patch',
  newFlight: true,
  fallback: true,
  order: 60,
  category: 'defense',
  family: null,
  rarity: 'common',
  icon: '🩹',
  themeColor: PALETTE.xp,
  unlockLevel: 1,
  tags: ['repair', 'fallback'],
  text: {
    name: 'Hull Patch',
    summary: 'Slots full: patch the hull instead.',
    lore: 'Plates welded over the scars of the last wave.',
    levels: [
      {
        title: 'Quick Weld',
        description: 'Repairs 25% of your max hull.',
        highlights: ['Takes no card slot.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-hull-repair',
          to: 'player',
          payload: { fraction: 0.25 },
        },
      ],
    },
  ],
};
