// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'chain_capacitor',
  order: 38,
  category: 'utility',
  family: 'arc',
  rarity: 'rare',
  icon: '🔗',
  themeColor: PALETTE.status,
  unlockLevel: 3,
  unlock: { by: 'license', at: 5, cost: 250 },
  tags: ['chain', 'weaponry'],
  text: {
    name: 'Chain Capacitor',
    summary: 'Stores a spare charge on every round and spends it on contact.',
    lore: 'A capacitor bank from a Warden relay. It always has a little left over.',
    levels: [
      {
        title: 'Spare Charge',
        description:
          'With the Chain Lance: each chain jumps once more. Otherwise: lances have a 10% chance to hit twice.',
        highlights: [
          'Switches to the extra jump when the Arc bonus evolves the lance.',
        ],
      },
    ],
  },
  // Who hits twice with each weapon (HitResolution), the Arc Caster's extra
  // jump (firePatterns.js), or the weapon's own version: the Scatter's volley
  // and the Harmonic's beam fire twice, a Seeker missile splits (proposta
  // 22/11, `capacitorTwice` and `capacitorSplit` in the weapon files).
  weaponText: {
    'shard-halo': {
      levels: [
        {
          description:
            'With the Chain Lance: each chain jumps once more. Otherwise: 10% of cuts land twice.',
        },
      ],
    },
    'furnace-corona': {
      levels: [
        {
          description:
            'With the Chain Lance: each chain jumps once more. Otherwise: 10% of pulse hits land twice.',
        },
      ],
    },
    scatter: {
      levels: [
        {
          description:
            'With the Chain Lance: each chain jumps once more. Otherwise: 1 volley in 10 fires twice.',
        },
      ],
    },
    harmonic: {
      levels: [
        {
          description:
            'With the Chain Lance: each chain jumps once more. Otherwise: 1 beam in 5 fires twice along the same line.',
        },
      ],
    },
    'seeker-swarm': {
      levels: [
        {
          description:
            'With the Chain Lance: each chain jumps once more. Otherwise: 1 missile in 10 splits in two when it locks on.',
        },
      ],
    },
    'arc-caster': {
      levels: [
        {
          description: 'Every cast jumps once more.',
          highlights: ['On top of the jumps Multishot adds.'],
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
          event: 'upgrade-chain-capacitor',
          to: 'combat',
          lands: 'cards.cardEffects.chainCapacitor',
          payload: { extraJumps: 1, doubleHitChance: 0.1 },
        },
      ],
    },
  ],
};
