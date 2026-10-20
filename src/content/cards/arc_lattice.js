import { PALETTE } from '../../data/constants/palette.js';

// A lattice around the hull that strikes on its own (numbers: proposta
// 20/10): every `interval` s an arc to each of the `targets` nearest enemies
// whose rim is within `radius` px of the ship, for `damageMultiplier` × the
// shot's damage; a charge with no one in reach waits for the first who comes.
export default {
  id: 'arc_lattice',
  order: 34,
  category: 'offense',
  family: 'arc',
  rarity: 'epic',
  icon: '🕸️',
  themeColor: PALETTE.status,
  unlockLevel: 3,
  tags: ['chain', 'auto-attack'],
  text: {
    name: 'Arc Lattice',
    summary:
      'A lattice of current around the hull lashes out at whatever comes close, on its own.',
    lore: 'Lattice wire from a Tether, still trying to connect things.',
    levels: [
      {
        title: 'Thin Wire',
        description:
          'Every 1.2 s an arc strikes the nearest enemy within 160 px for a full shot of damage.',
        highlights: ['It fires whatever the cannon is aiming at.'],
      },
      {
        title: 'Mesh',
        description: 'Every 1.0 s, the 2 nearest enemies within 180 px.',
        highlights: ['Nothing sits on your hull for long.'],
      },
      {
        title: 'Full Lattice',
        description: 'Every 0.8 s, the 3 nearest enemies within 200 px.',
        highlights: ['A second weapon that never needs a lock.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-arc-lattice',
          // proposta 20/10
          payload: {
            interval: 1.2,
            targets: 1,
            radius: 160,
            damageMultiplier: 1,
          },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-arc-lattice',
          // proposta 20/10
          payload: {
            interval: 1,
            targets: 2,
            radius: 180,
            damageMultiplier: 1,
          },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-arc-lattice',
          // proposta 20/10
          payload: {
            interval: 0.8,
            targets: 3,
            radius: 200,
            damageMultiplier: 1,
          },
        },
      ],
    },
  ],
};
