// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'chain_capacitor',
  // Weapons it does nothing for (the draw leaves it out).
  deadFor: ['furnace-corona', 'shard-halo'],
  order: 38,
  category: 'utility',
  family: 'arc',
  rarity: 'rare',
  icon: '🔗',
  themeColor: PALETTE.status,
  unlockLevel: 3,
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
  // Who hits twice with each weapon (HitResolution), or the Arc Caster's
  // extra jump (firePatterns.js).
  weaponText: {
    scatter: {
      levels: [
        {
          description:
            'With the Chain Lance: each chain jumps once more. Otherwise: flak bolts have a 10% chance to hit twice; their shrapnel never does.',
        },
      ],
    },
    harmonic: {
      levels: [
        {
          description:
            'With the Chain Lance: each chain jumps once more. Otherwise: lances have a 10% chance to hit twice; the beam never does.',
        },
      ],
    },
    'seeker-swarm': {
      levels: [
        {
          description:
            'With the Chain Lance: each chain jumps once more. Otherwise: missiles have a 10% chance to hit twice; their burst never does.',
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
          payload: { extraJumps: 1, doubleHitChance: 0.1 },
        },
      ],
    },
  ],
};
