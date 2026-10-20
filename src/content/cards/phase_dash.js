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
  tags: ['dash', 'charges'],
  text: {
    name: 'Ghost Drive',
    summary:
      'The dash drive keeps a ghost charge a beat out of phase: two dashes back to back.',
    lore: 'Pilots swear the afterimages keep flying a moment after they leave.',
    levels: [
      {
        title: 'Ghost Drive',
        description:
          'Holds a second dash charge: dash twice in a row. The spare refills one cooldown after the first.',
        highlights: ['Afterimages linger twice as long.'],
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
          payload: { extraCharges: 1, ghostLinger: 2 }, // proposta 20/10
        },
      ],
    },
  ],
};
