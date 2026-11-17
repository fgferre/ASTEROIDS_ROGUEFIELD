import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'overcharge_coil',
  // Weapons it does nothing for (the draw leaves it out).
  deadFor: ['arc-caster'],
  order: 7,
  category: 'offense',
  family: 'arc',
  rarity: 'common',
  icon: '🌀',
  themeColor: PALETTE.status,
  unlockLevel: 1,
  tags: ['projectile-speed', 'weaponry'],
  text: {
    name: 'Overcharge Coil',
    summary: 'Wraps the barrel in an arc coil that throws rounds faster.',
    lore: 'A Warden rail segment, rewound by hand. It hums when the cannon is cold.',
    levels: [
      {
        title: 'First Winding',
        description: 'Projectile speed +15%.',
        highlights: ['Fewer misses on fast targets.'],
      },
      {
        title: 'Double Winding',
        description: 'Projectile speed +32% (cumulative).',
        highlights: ['Aim prediction uses the new speed.'],
      },
      {
        title: 'Rail Winding',
        description: 'Projectile speed +52% (cumulative).',
        highlights: ['Rounds land almost where you point.'],
      },
    ],
  },
  // The Furnace's pulses come sooner (firePatterns.js).
  weaponText: {
    'shard-halo': {
      levels: [
        { description: 'The blades spin 5% faster.' },
        { description: 'The blades spin 10% faster (cumulative).' },
        { description: 'The blades spin 15% faster (cumulative).' },
      ],
    },
    'furnace-corona': {
      levels: [
        { description: 'Pulses come 5% sooner.' },
        { description: 'Pulses come 10% sooner (cumulative).' },
        { description: 'Pulses come 15% sooner (cumulative).' },
      ],
    },
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          payload: { bulletSpeedMultiplier: 1.15 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          payload: { bulletSpeedMultiplier: 1.15 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-tuning',
          payload: { bulletSpeedMultiplier: 1.15 },
        },
      ],
    },
  ],
};
