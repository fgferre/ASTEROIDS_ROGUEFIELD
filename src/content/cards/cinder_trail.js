// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'cinder_trail',
  order: 24,
  category: 'mobility',
  family: 'thermal',
  rarity: 'common',
  icon: '🔥',
  themeColor: PALETTE.shot,
  unlockLevel: 2,
  tags: ['thrusters', 'burn'],
  text: {
    name: 'Cinder Trail',
    summary:
      'Mixes crystal dust into the exhaust: the main thruster leaves a burning trail.',
    lore: 'Salvagers used it to mark their path. Rocks that cross it come out scorched.',
    levels: [
      {
        title: 'Ember Wake',
        description:
          'Thrust leaves a 0.6 s trail that burns touching enemies for 6 damage per tick.',
        highlights: ['Ticks 5 times a second.'],
      },
      {
        title: 'Flame Wake',
        description: 'The trail burns for 12 damage per tick.',
        highlights: ['Another +6 per tick.'],
      },
      {
        title: 'Inferno Wake',
        description: 'The trail burns for 18 damage per tick.',
        highlights: ['Fly circles around them.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-cinder-trail',
          payload: { damage: 6, life: 0.6, tickInterval: 0.2, radius: 10 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-cinder-trail',
          payload: { damage: 12, life: 0.6, tickInterval: 0.2, radius: 10 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-cinder-trail',
          payload: { damage: 18, life: 0.6, tickInterval: 0.2, radius: 10 },
        },
      ],
    },
  ],
};
