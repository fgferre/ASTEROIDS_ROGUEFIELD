// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'lucky_fragment',
  order: 40,
  category: 'utility',
  family: 'salvage',
  rarity: 'rare',
  icon: '🍀',
  themeColor: PALETTE.xp,
  unlockLevel: 3,
  tags: ['pickups', 'collection'],
  text: {
    name: 'Lucky Fragment',
    summary:
      'A shard of Ring crystal that rattles when something worth taking is near.',
    lore: 'Every salvager carries one. Most will tell you it does nothing.',
    levels: [
      {
        title: 'Rattling Shard',
        description:
          'Every rock you destroy has a 10% chance to drop a field pickup.',
        highlights: ['Magnet, Pulse or Overcharge, like an Elite drop.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-lucky-fragment',
          payload: { chance: 0.1 },
        },
      ],
    },
  ],
};
