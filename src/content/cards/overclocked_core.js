// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'overclocked_core',
  order: 14,
  category: 'offense',
  family: null,
  cursed: true,
  rarity: 'rare',
  icon: '⏱️',
  themeColor: PALETTE.boss,
  unlockLevel: 4,
  unlock: { by: 'license', at: 10, cost: 250 },
  tags: ['fire-rate', 'cursed'],
  text: {
    name: 'Overclocked Core',
    summary:
      'Runs the reactor past its rating. The cannon loves it; the hull does not.',
    lore: 'Every salvager has a story about a core that ran hot. The short ones end here.',
    levels: [
      {
        title: 'Red Line',
        description:
          'Fire rate +35%. The hull loses 1 HP every 4 s, down to 20% of max.',
        highlights: ['Cursed: the drain never stops, but it never kills.'],
      },
    ],
  },
  // The Halo fires nothing: what it speeds is how soon a blade may cut the
  // same enemy again (see heat_sink.js).
  weaponText: {
    'shard-halo': {
      levels: [
        {
          description:
            'The blades may cut the same enemy again 35% sooner: big, slow enemies feel it most. The hull loses 1 HP every 4 s, down to 20% of max.',
        },
      ],
    },
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          to: 'combat',
          payload: { cooldownMultiplier: 0.74 },
        },
        {
          type: 'event',
          event: 'upgrade-hull-drain',
          to: 'player',
          lands: 'hullDrain',
          payload: { amount: 1, interval: 4, floorFraction: 0.2 },
        },
      ],
    },
  ],
};
