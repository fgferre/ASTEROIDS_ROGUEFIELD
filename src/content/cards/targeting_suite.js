// Rank 3's cooldown: every weapon fires this much faster.
const MULTI_LOCK_COOLDOWN = 0.92;
const FIRE_RATE = Math.round((1 / MULTI_LOCK_COOLDOWN - 1) * 100);

export default {
  id: 'targeting_suite',
  order: 3,
  category: 'offense',
  family: 'arc',
  rarity: 'rare',
  icon: '🎯',
  themeColor: '#FFD166',
  unlockLevel: 3,
  // The nose cannon has no lock, so the suite needs the turret first.
  newFlightPrerequisites: [
    {
      type: 'upgrade',
      id: 'auto_aim',
      level: 1,
      text: 'Requires Auto Turret installed.',
    },
  ],
  tags: ['aim', 'tactical', 'weaponry'],
  text: {
    name: 'Targeting Matrix',
    summary:
      'Implants combat heuristics that prioritize critical threats and refine shot prediction.',
    lore: 'Experimental firmware extracted from escort drones, calibrated for instant hazard reading in chaotic scenarios.',
    levels: [
      {
        title: 'Adaptive Acquisition',
        description:
          'Activates a danger matrix privileging chaser and explosive variants before any other threat.',
        highlights: [
          'Classifies enemies by behavior, reward from relative player direction.',
          'Aim line pulses when locking a new priority target.',
        ],
      },
      {
        title: 'Dynamic Prediction',
        description:
          'Calculates intercepts based on actual projectile velocity, reducing errors on fast targets.',
        highlights: [
          'Visually marks predicted impact point.',
          'Slightly modulates shot pitch to indicate advanced prediction.',
        ],
      },
      {
        title: 'Coordinated Locks',
        description: `Locks one threat per shot of the volley, up to four, and fires at all of them. Fire rate +${FIRE_RATE}%.`,
        highlights: [
          'Available only with Multishot installed (Lvl 1+).',
          'Coordinates up to four locks and can concentrate fire on a single imminent target.',
        ],
      },
    ],
  },
  // What the locks and the lead do for each weapon (Weapons, beamAndFan.js,
  // firePatterns.js; the lead is reckoned at lance speed).
  weaponText: {
    harmonic: {
      levels: [
        {},
        {},
        {
          description: `Locks one threat per shot of the volley, up to four: the lances split among them and each lock gets its own beam. Fire rate +${FIRE_RATE}%.`,
        },
      ],
    },
    scatter: {
      levels: [
        {},
        {
          description: 'Aims the fan ahead of fast targets, reducing misses.',
        },
        {
          description: `Locks one threat per shot of the volley, up to four, and splits the fan's bolts among them. Fire rate +${FIRE_RATE}%.`,
        },
      ],
    },
    'seeker-swarm': {
      levels: [
        {},
        {
          description:
            'Salvos leave toward where fast targets will be; the missiles steer themselves anyway.',
        },
        {
          description: `Locks one threat per shot of the volley, up to four; the missiles go for the locks first. Fire rate +${FIRE_RATE}%.`,
        },
      ],
    },
    'arc-caster': {
      levels: [
        {},
        {
          description:
            'Leads fast targets, but lightning strikes at once: the Arc Caster gains nothing.',
          highlights: [`Only rank 3 changes it: fire rate +${FIRE_RATE}%.`],
        },
        {
          description: `Fire rate +${FIRE_RATE}%. The extra locks add nothing: the Arc Caster casts at one.`,
        },
      ],
    },
    'furnace-corona': {
      levels: [
        {
          description:
            'Pulses deal +10% damage to elites, heralds and bosses. The Furnace never aims: the locks add nothing.',
        },
        {
          description:
            'Pulses deal +20% damage to elites, heralds and bosses. The Furnace never aims: the lead adds nothing.',
        },
        {
          description: `Fire rate +${FIRE_RATE}%. The pulses keep their +20% on elites, heralds and bosses.`,
        },
      ],
    },
    'shard-halo': {
      levels: [
        {
          description:
            'Cuts deal +10% damage to elites, heralds and bosses. The Halo never aims: the locks add nothing.',
        },
        {
          description:
            'Cuts deal +20% damage to elites, heralds and bosses. The Halo never aims: the lead adds nothing.',
        },
        {
          description: `Fire rate +${FIRE_RATE}%. The cuts keep their +20% on elites, heralds and bosses.`,
        },
      ],
    },
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-aiming-suite',
          payload: {
            resetWeights: true,
          },
        },
        {
          type: 'event',
          event: 'upgrade-threat-focus',
          payload: { damageMultiplier: 1.1 }, // proposta 16/11, Furnace only
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-aiming-suite',
          payload: {
            dynamicPrediction: {
              minLeadTime: 0.05,
              maxLeadTime: 1,
              fallbackLeadTime: 0.32,
            },
          },
        },
        {
          type: 'event',
          event: 'upgrade-threat-focus',
          payload: { damageMultiplier: 1.2 }, // proposta 16/11, Furnace only
        },
      ],
    },
    {
      rank: 3,
      prerequisites: [
        {
          type: 'upgrade',
          id: 'multishot',
          level: 1,
          text: 'Requires Multishot installed (Lvl 1).',
        },
      ],
      effects: [
        {
          type: 'event',
          event: 'upgrade-aiming-suite',
          payload: {
            multiLockTargets: 4,
            cooldownMultiplier: MULTI_LOCK_COOLDOWN,
          },
        },
      ],
    },
  ],
};
