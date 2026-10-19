export default {
  id: 'targeting_suite',
  order: 3,
  category: 'offense',
  family: 'arc',
  rarity: 'rare',
  icon: '🎯',
  themeColor: '#FFD166',
  unlockLevel: 3,
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
        description:
          'Activates a battery of four independent cannons prioritizing critical threats in parallel.',
        highlights: [
          'Available only with Multishot installed (Lvl 1+).',
          'Coordinates up to four locks and can concentrate fire on a single imminent target.',
        ],
      },
    ],
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
            cooldownMultiplier: 0.92,
          },
        },
      ],
    },
  ],
};
