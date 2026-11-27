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
  // Damage in 30 s measured 26/11 (cumulative): Harmonic x1.08/1.17/1.26 (the
  // beam's 0.25 s wait does not shrink); Halo x1.04/1.08/1.13 (it fires
  // nothing: its "fire rate" is how soon a blade may cut the same enemy
  // again, and a blade cuts only while it touches).
  weaponText: {
    harmonic: {
      levels: [
        [11, 8],
        [23, 17],
        [37, 26],
      ].map(([rate, gain]) => ({
        description: `Fire rate +${rate}%, but the beam's own wait does not shrink: damage +${gain}%.`,
      })),
    },
    'shard-halo': {
      levels: [
        [11, 4],
        [23, 8],
        [37, 13],
      ].map(([sooner, gain]) => ({
        description: `The blades may cut the same enemy again ${sooner}% sooner, but a blade cuts only while it touches: damage +${gain}%.`,
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
