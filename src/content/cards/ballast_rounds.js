import { PALETTE } from '../../data/constants/palette.js';

// Dense slugs that finish what is already cracked (numbers: proposta 20/10).
const THRESHOLD = 0.5; // of the enemy's max health

export default {
  id: 'ballast_rounds',
  order: 10,
  category: 'offense',
  family: 'kinetic',
  rarity: 'common',
  icon: '🪨',
  themeColor: PALETTE.player,
  unlockLevel: 1,
  tags: ['damage', 'finisher'],
  text: {
    name: 'Ballast Rounds',
    summary:
      'Packs every shot with dense slag: what is already cracked comes apart.',
    lore: 'Ring hull scrap pressed into slugs. Heavier than it looks.',
    levels: [
      {
        title: 'Lead Core',
        description: 'Hits on enemies below half health deal +30% damage.',
        highlights: ['Every weapon, the Harmonic beam included.'],
      },
      {
        title: 'Slag Core',
        description: 'Hits on enemies below half health deal +60% damage.',
        highlights: ['The second half of every fight goes faster.'],
      },
      {
        title: 'Dead Weight',
        description: 'Hits on enemies below half health deal +100% damage.',
        highlights: ['Wardens too, once they are half down.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-execute-damage',
          payload: { threshold: THRESHOLD, damageMultiplier: 1.3 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-execute-damage',
          payload: { threshold: THRESHOLD, damageMultiplier: 1.6 }, // proposta 20/10
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-execute-damage',
          payload: { threshold: THRESHOLD, damageMultiplier: 2 }, // proposta 20/10
        },
      ],
    },
  ],
};
