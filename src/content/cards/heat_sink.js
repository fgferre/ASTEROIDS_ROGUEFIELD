import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'heat_sink',
  order: 4,
  category: 'offense',
  family: 'thermal',
  rarity: 'common',
  icon: '♨️',
  themeColor: PALETTE.shot,
  unlockLevel: 1,
  unlock: { by: 'start', at: 2 },
  tags: ['fire-rate', 'weaponry'],
  text: {
    name: 'Heat Sink',
    summary: 'Bleeds cannon heat into the hull so the breech cycles faster.',
    lore: 'Radiator fins cut from a Ring heat exchanger. Still warm after a thousand years.',
    levels: [
      {
        title: 'Copper Fins',
        description: 'Fire rate +11%.',
        highlights: ['Shot cooldown x0.90.'],
      },
      {
        title: 'Coolant Loop',
        description: 'Fire rate +23% (cumulative).',
        highlights: ['Shot cooldown x0.81 total.'],
      },
      {
        title: 'Ring Exchanger',
        description: 'Fire rate +37% (cumulative).',
        highlights: ['Shot cooldown x0.73 total.'],
      },
    ],
  },
  // The Halo fires nothing: its "fire rate" is how soon a blade may cut the
  // same enemy again, and a blade cuts only while it touches (measured
  // 25/11: +3% to +23% more cuts by the enemy's size, not +11% to +37%).
  weaponText: {
    'shard-halo': {
      levels: [11, 23, 37].map((gain) => ({
        description: `The blades may cut the same enemy again ${gain}% sooner: big, slow enemies feel it most.`,
      })),
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
          payload: { cooldownMultiplier: 0.9 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          to: 'combat',
          payload: { cooldownMultiplier: 0.9 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          to: 'combat',
          payload: { cooldownMultiplier: 0.9 },
        },
      ],
    },
  ],
};
