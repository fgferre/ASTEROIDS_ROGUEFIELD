// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'phase_skin',
  order: 25,
  category: 'mobility',
  family: 'field',
  rarity: 'rare',
  icon: '👻',
  themeColor: PALETTE.text,
  unlockLevel: 3,
  tags: ['dash', 'invulnerability'],
  text: {
    name: 'Phase Skin',
    summary: 'The hull stays out of phase for a moment after every dash.',
    lore: 'A Ring field coil tuned too fine. You are not quite there when you land.',
    levels: [
      {
        title: 'Out of Phase',
        description: 'For 0.4 s after a dash ends, nothing can hurt you.',
        highlights: ["Adds to the dash's own invulnerability."],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-phase-skin',
          payload: { duration: 0.4 },
        },
      ],
    },
  ],
};
