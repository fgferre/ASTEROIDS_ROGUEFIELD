// src/data/upgrades/offense.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { PALETTE } from '../constants/palette.js';

// === OFFENSIVE UPGRADES ===

export const OFFENSE_UPGRADES = deepFreeze([
  {
    id: 'plasma',
    category: 'offense',
    family: 'thermal',
    rarity: 'rare',
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
    family: 'kinetic',
    rarity: 'epic',
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
  },
  {
    id: 'heat_sink',
    category: 'offense',
    family: 'thermal',
    rarity: 'common',
    icon: '♨️',
    themeColor: PALETTE.shot,
    unlockLevel: 1,
    tags: ['fire-rate', 'weaponry'],
    text: {
      name: 'Heat Sink',
      summary: 'Bleeds cannon heat into the hull so the breech cycles faster.',
      lore: 'Radiator fins cut from a Ring heat exchanger. Still warm after a thousand years.',
      levels: [
        {
          title: 'Copper Fins',
          description: 'Fire rate +11%.',
          highlights: ['Shot cooldown x0.90.'],
        },
        {
          title: 'Coolant Loop',
          description: 'Fire rate +23% (cumulative).',
          highlights: ['Shot cooldown x0.81 total.'],
        },
        {
          title: 'Ring Exchanger',
          description: 'Fire rate +37% (cumulative).',
          highlights: ['Shot cooldown x0.73 total.'],
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
            payload: { cooldownMultiplier: 0.9 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-weapon-tuning',
            payload: { cooldownMultiplier: 0.9 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-weapon-tuning',
            payload: { cooldownMultiplier: 0.9 },
          },
        ],
      },
    ],
  },
  {
    id: 'afterburn_lance',
    category: 'offense',
    family: 'thermal',
    rarity: 'rare',
    icon: '🔥',
    themeColor: PALETTE.shot,
    unlockLevel: 2,
    tags: ['range', 'weaponry'],
    text: {
      name: 'Afterburn Lance',
      summary:
        'Rounds keep burning after the muzzle, so the cannon locks and hits from further out.',
      lore: 'Slow-burning propellant packed behind each round. The trail glows long after the shot.',
      levels: [
        {
          title: 'Slow Burn',
          description: 'Lock-on range and round lifetime +15%.',
          highlights: ['Auto-aim picks targets earlier.'],
        },
        {
          title: 'Long Flame',
          description: 'Lock-on range and round lifetime +32% (cumulative).',
          highlights: ['Reaches across most of the screen.'],
        },
        {
          title: 'White Lance',
          description: 'Lock-on range and round lifetime +52% (cumulative).',
          highlights: ['Hits the edge of the Field before it reaches you.'],
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
            payload: {
              targetingRangeMultiplier: 1.15,
              bulletLifetimeMultiplier: 1.15,
            },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-weapon-tuning',
            payload: {
              targetingRangeMultiplier: 1.15,
              bulletLifetimeMultiplier: 1.15,
            },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-weapon-tuning',
            payload: {
              targetingRangeMultiplier: 1.15,
              bulletLifetimeMultiplier: 1.15,
            },
          },
        ],
      },
    ],
  },
  {
    id: 'reactor_bleed',
    category: 'offense',
    family: 'thermal',
    rarity: 'rare',
    icon: '☢️',
    themeColor: PALETTE.shot,
    unlockLevel: 3,
    tags: ['damage', 'trade-off'],
    text: {
      name: 'Reactor Bleed',
      summary: 'Diverts reactor output from the engines into the cannon.',
      lore: 'Every salvager knows the trick and every salvager regrets it at least once.',
      levels: [
        {
          title: 'Open Valve',
          description: 'Damage +15%, top speed -4%.',
          highlights: ['A trade: harder hits, heavier ship.'],
        },
        {
          title: 'Bypass Line',
          description: 'Damage +32%, top speed -8% (cumulative).',
          highlights: ['Applies another +15% damage and -4% speed.'],
        },
        {
          title: 'Core Tap',
          description: 'Damage +52%, top speed -12% (cumulative).',
          highlights: ['The engines run on what the cannon leaves.'],
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
            payload: { multiplier: 1.15 },
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 0.96 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-damage-boost',
            payload: { multiplier: 1.15 },
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 0.96 },
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
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 0.96 },
          },
        ],
      },
    ],
  },
  {
    id: 'overcharge_coil',
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
  },
]);
