// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'recoil_dampers',
  order: 11,
  category: 'offense',
  family: 'kinetic',
  rarity: 'rare',
  icon: '🔩',
  themeColor: PALETTE.player,
  unlockLevel: 3,
  tags: ['pierce', 'weaponry'],
  text: {
    name: 'Recoil Dampers',
    summary: 'Steadies the barrel so each lance keeps its line through a rock.',
    lore: 'Warden mounting dampers. The cannon stops kicking and starts punching.',
    levels: [
      {
        title: 'Locked Barrel',
        description: 'Every lance pierces one more target.',
        highlights: ['Stacks with the Railshot evolution.'],
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
          payload: { pierceBonus: 1 },
        },
      ],
    },
  ],
};
