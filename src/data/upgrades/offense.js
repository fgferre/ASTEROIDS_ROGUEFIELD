// src/data/upgrades/offense.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === OFFENSIVE UPGRADES ===

export const OFFENSE_UPGRADES = deepFreeze([
  {
    id: 'plasma',
    category: 'offense',
    icon: '⚡',
    themeColor: '#F6C945',
    unlockLevel: 1,
    tags: ['damage', 'weaponry'],
    text: {
      name: 'Plasma Gun',
      summary:
        'Condenses the main cannon into superheated plasma to multiply offensive potential.',
      lore: 'Technology salvaged from the devastated hulls of the Perseus fleet. Requires constant temperature monitoring.',
      levels: [
        {
          title: 'Fusion Coil',
          description: 'Standard projectiles deal immediately +25% damage.',
          highlights: ['Multiplier applied directly to base damage.'],
        },
        {
          title: 'Twinned Capacitors',
          description: 'Enhances system to reach +50% accumulated damage.',
          highlights: ['Applies additional 20% over current damage.'],
        },
        {
          title: 'Harmonic Matrix',
          description: 'Stabilizes plasma for +70% total damage.',
          highlights: ['Provides extra 15% multiplier on current value.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-damage-boost',
            payload: { multiplier: 1.25 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-damage-boost',
            payload: { multiplier: 1.2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-damage-boost',
            payload: { multiplier: 1.15 },
          },
        ],
      },
    ],
  },
  {
    id: 'multishot',
    category: 'offense',
    icon: '💥',
    themeColor: '#A56DFF',
    unlockLevel: 1,
    tags: ['projectiles', 'weaponry'],
    text: {
      name: 'Multishot',
      summary:
        'Couples secondary emitters to main cannon to unleash more projectiles.',
      lore: 'Reusable modules salvaged from deactivated military satellites.',
      levels: [
        {
          title: 'Dual Outlet',
          description: 'Fires one additional projectile per sequence.',
          highlights: ['Increases instant fire volume.'],
        },
        {
          title: 'Triangular Grid',
          description: 'Adds a third shot, forming a fan pattern.',
          highlights: ['Covers larger area in front of ship.'],
        },
        {
          title: 'Synchronized Barrage',
          description: 'Includes a fourth projectile per sequence.',
          highlights: ['Maximizes saturation at close range.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-multishot',
            payload: { bonus: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-multishot',
            payload: { bonus: 1 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-multishot',
            payload: { bonus: 1 },
          },
        ],
      },
    ],
  },
  {
    id: 'targeting_suite',
    category: 'offense',
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
  },
]);
