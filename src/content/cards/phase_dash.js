// Maneuver cards (R12; numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'phase_dash',
  order: 31,
  category: 'mobility',
  family: 'maneuver',
  rarity: 'rare',
  icon: '🌫️',
  themeColor: PALETTE.boss,
  unlockLevel: 3,
  tags: ['dash', 'invulnerability'],
  text: {
    name: 'Ghost Drive',
    summary:
      'The dash drive runs a beat out of phase: longer untouchable, longer afterimages.',
    lore: 'Pilots swear the afterimages keep flying a moment after they leave.',
    levels: [
      {
        title: 'Ghost Drive',
        description: 'The dash stays invulnerable 0.15 s longer.',
        highlights: ['Its afterimages linger twice as long.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-phase-dash',
          payload: { invulnerability: 0.15, ghostLinger: 2 },
        },
      ],
    },
  ],
};
