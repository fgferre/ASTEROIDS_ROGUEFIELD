import { PALETTE } from '../../data/constants/palette.js';

// Kill sparks (numbers: proposta 20/10): a kill arcs into the nearest enemy
// within `range` px for `damageFraction` of the killing hit; a spark that
// kills sparks again, up to `links` sparks in a row.
const RANGE = 140;

export default {
  id: 'capacitor_bank',
  order: 33,
  category: 'offense',
  family: 'arc',
  rarity: 'rare',
  icon: '🔋',
  themeColor: PALETTE.status,
  unlockLevel: 2,
  tags: ['chain', 'crowd'],
  text: {
    name: 'Capacitor Bank',
    summary:
      'Every kill dumps its charge into the nearest enemy: in a crowd, one kill sets off the next.',
    lore: 'Ring capacitors never fully drain. Neither does a good streak.',
    levels: [
      {
        title: 'Spare Cells',
        description: `A kill arcs into the nearest enemy within ${RANGE} px for 60% of the killing hit.`,
        highlights: ['Any kill by a hit sparks: shots, beams, bolts, arcs.'],
      },
      {
        title: 'Stacked Cells',
        description:
          'The spark deals 80%, and a spark that kills sparks again (2 in a row).',
        highlights: ['Packed rocks go off like a fuse.'],
      },
      {
        title: 'Ring Cells',
        description: 'The spark deals 100%, up to 4 sparks in a row.',
        highlights: ['A swarm can clear itself.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-kill-spark',
          payload: { range: RANGE, damageFraction: 0.6, links: 1 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-kill-spark',
          payload: { range: RANGE, damageFraction: 0.8, links: 2 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-kill-spark',
          payload: { range: RANGE, damageFraction: 1, links: 4 }, // proposta 20/10
        },
      ],
    },
  ],
};
