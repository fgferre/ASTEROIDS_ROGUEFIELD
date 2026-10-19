// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'ballast_rounds',
  order: 10,
  category: 'offense',
  family: 'kinetic',
  rarity: 'common',
  icon: '🪨',
  themeColor: PALETTE.player,
  unlockLevel: 1,
  tags: ['damage', 'trade-off'],
  text: {
    name: 'Ballast Rounds',
    summary: 'Packs every lance with dense slag: harder hits, slower breech.',
    lore: 'Ring hull scrap pressed into slugs. Heavier than it looks.',
    levels: [
      {
        title: 'Lead Core',
        description: 'Lance damage +8%, fire rate -4%.',
        highlights: ['Harmonic beams keep their damage.'],
      },
      {
        title: 'Slag Core',
        description: 'Lance damage +17%, fire rate -8% (cumulative).',
        highlights: ['Another +8% damage and -4% fire rate.'],
      },
      {
        title: 'Dead Weight',
        description: 'Lance damage +26%, fire rate -11% (cumulative).',
        highlights: ['Fewer shots, each one counts.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          payload: { lanceDamageMultiplier: 1.08, cooldownMultiplier: 1.04 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          payload: { lanceDamageMultiplier: 1.08, cooldownMultiplier: 1.04 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          payload: { lanceDamageMultiplier: 1.08, cooldownMultiplier: 1.04 },
        },
      ],
    },
  ],
};
