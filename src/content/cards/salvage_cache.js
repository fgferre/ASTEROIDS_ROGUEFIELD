// A fallback card (`fallback`, the new flight only): offered when the card slots are full
// and the offer can't be filled, while the hull is whole. Never held; the
// hangar will pay tokens for the 'card-salvage' event (nothing listens yet).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'salvage_cache',
  newFlight: true,
  fallback: true,
  order: 61,
  category: 'general',
  family: null,
  rarity: 'common',
  icon: '📦',
  themeColor: PALETTE.xp,
  unlockLevel: 1,
  tags: ['salvage', 'fallback'],
  text: {
    name: 'Salvage Cache',
    summary: 'Slots full: turn the pick into salvage.',
    lore: 'The hold is packed; what does not fit goes to the hangar.',
    levels: [
      {
        title: 'Crated Parts',
        description: 'Turns this pick into salvage for the hangar.',
        highlights: ['Takes no card slot.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        { type: 'event', event: 'card-salvage', to: 'hangar', payload: {} },
      ],
    },
  ],
};
