// Maneuver cards (R12; numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'afterburner',
  order: 26,
  category: 'mobility',
  family: 'maneuver',
  rarity: 'common',
  icon: '💨',
  themeColor: PALETTE.boss,
  unlockLevel: 1,
  tags: ['dash', 'cooldown'],
  text: {
    name: 'Afterburner',
    summary:
      'Reroutes the reactor into the dash coils: the dash recharges sooner.',
    lore: 'Ring couriers ran their burners hot and short. Most of them made the delivery.',
    levels: [
      {
        title: 'Hot Coils',
        description: 'Dash cooldown -12%.',
        highlights: ['Dash a little more often.'],
      },
      {
        title: 'Bypass Valves',
        description: 'Dash cooldown -22% (cumulative).',
        highlights: ['The dash is back before the next wave of fire.'],
      },
      {
        title: 'Open Burner',
        description: 'Dash cooldown -30% (cumulative).',
        highlights: ['Dash your way through the Field.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-dash-cooldown',
          payload: { multiplier: 0.88 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-dash-cooldown',
          payload: { multiplier: 0.886 }, // Total: 0.78
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-dash-cooldown',
          payload: { multiplier: 0.897 }, // Total: 0.70
        },
      ],
    },
  ],
};
