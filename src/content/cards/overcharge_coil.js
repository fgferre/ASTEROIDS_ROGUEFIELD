import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'overcharge_coil',
  order: 7,
  category: 'offense',
  family: 'arc',
  rarity: 'common',
  icon: '🌀',
  themeColor: PALETTE.status,
  unlockLevel: 1,
  unlock: { by: 'start', at: 9 },
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
  // The Furnace's pulses come sooner (firePatterns.js); the Scatter's bolts,
  // the Seeker's missiles and the Harmonic's beam as their `coil*` numbers
  // say (proposta 22/11, the rank-3 figures, a share before).
  weaponText: {
    scatter: {
      levels: [
        {
          description:
            'Flak bolts fly 17% faster and 27 px further before they burst.',
        },
        {
          description:
            'Flak bolts fly 33% faster and 53 px further before they burst (cumulative).',
        },
        {
          description:
            'Flak bolts fly 50% faster and 80 px further before they burst (cumulative).',
        },
      ],
    },
    'seeker-swarm': {
      levels: [
        { description: 'Missiles fly 10% faster and turn 20% tighter.' },
        {
          description:
            'Missiles fly 20% faster and turn 40% tighter (cumulative).',
        },
        {
          description:
            'Missiles fly 30% faster and turn 60% tighter (cumulative).',
        },
      ],
    },
    harmonic: {
      levels: [
        {
          description:
            'A beam every 3rd shot instead of every 4th. Lances fly 15% faster.',
        },
        {
          description:
            'A beam every 3rd shot. Lances fly 32% faster (cumulative).',
        },
        {
          description:
            'A beam every 3rd shot. Lances fly 52% faster (cumulative).',
        },
      ],
    },
    // proposta 17/11: the cube root of the lance's speed gain.
    'arc-caster': {
      levels: [
        { description: 'Casts come 5% sooner.' },
        { description: 'Casts come 10% sooner (cumulative).' },
        { description: 'Casts come 15% sooner (cumulative).' },
      ],
    },
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
          to: 'combat',
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
          to: 'combat',
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
          to: 'combat',
          payload: { bulletSpeedMultiplier: 1.15 },
        },
      ],
    },
  ],
};
