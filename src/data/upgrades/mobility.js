// src/data/upgrades/mobility.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === MOBILITY UPGRADES ===

export const MOBILITY_UPGRADES = deepFreeze([
  {
    id: 'propulsors',
    category: 'mobility',
    family: 'kinetic',
    icon: '🚀',
    themeColor: '#5DADE2',
    unlockLevel: 1,
    tags: ['speed', 'mobility', 'acceleration'],
    text: {
      name: 'Main Thrusters',
      summary:
        'Upgrades the main engines for better acceleration and top speed.',
      lore: 'Modular propulsion system that evolves from tuned nozzles to vectored plasma overload.',
      levels: [
        {
          title: 'Tuned Nozzles',
          description: 'Acceleration +12% and top speed +10%.',
          highlights: ['Slightly faster response to controls.'],
        },
        {
          title: 'Stable Burn',
          description: 'Acceleration +25% and speed +22% (cumulative).',
          highlights: ['Visibly improved thrust.'],
        },
        {
          title: 'Dual Injection',
          description: 'Acceleration +45% and speed +38% (cumulative).',
          highlights: ['Combat fighter performance.'],
        },
        {
          title: 'Superheated Plasma',
          description: 'Acceleration +75% and speed +60% (cumulative).',
          highlights: ['Thrusters overloaded. White flames visible.'],
        },
        {
          title: 'Vector Overload',
          description: 'Acceleration +110% and speed +85% (cumulative).',
          highlights: ['Extreme performance. Ion trail damages enemies.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.12 },
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.1 },
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.116 }, // Total: 1.25
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.109 }, // Total: 1.22
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.16 }, // Total: 1.45
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.131 }, // Total: 1.38
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 3 },
          },
        ],
      },
      {
        rank: 4,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.207 }, // Total: 1.75
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.159 }, // Total: 1.60
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 4 },
          },
        ],
      },
      {
        rank: 5,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.2 }, // Total: 2.10
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.156 }, // Total: 1.85
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 5 },
          },
          {
            type: 'event',
            event: 'upgrade-ion-trail',
            payload: { enabled: true },
          },
        ],
      },
    ],
  },
  {
    id: 'rcs_system',
    category: 'mobility',
    family: 'kinetic',
    icon: '🛰️',
    themeColor: '#5DADE2',
    unlockLevel: 2,
    tags: ['rotation', 'agility', 'maneuvers'],
    prerequisites: [
      {
        type: 'upgrade',
        id: 'propulsors',
        level: 1,
        text: 'Requires Main Thrusters installed (Lv. 1).',
      },
    ],
    text: {
      name: 'RCS System',
      summary:
        'Enables maneuvering thrusters for precise rotation and agility control.',
      lore: 'Reaction Control System salvaged from abandoned space stations. Allows maneuvers impossible for conventional ships.',
      levels: [
        {
          title: 'Basic RCS',
          description: 'Enables auxiliary thrusters for +15% rotation.',
          highlights: ['Noticeable response in tight turns.'],
        },
        {
          title: 'Active RCS',
          description: 'Rotation +32% and angular damping -12%.',
          highlights: ['Noticeably faster, more precise turns.'],
        },
        {
          title: 'Enhanced RCS',
          description: 'Rotation +55% and angular damping -25%.',
          highlights: ['Space fighter control. Instant turns.'],
        },
        {
          title: 'Vector RCS',
          description: 'Rotation +90% and angular damping -40%.',
          highlights: ['Superhuman control. Instant reversals.'],
        },
        {
          title: 'Omni-directional RCS',
          description: 'Rotation +130% and strafe thrust +15%.',
          highlights: ['Sharper sidesteps around incoming fire.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.15 },
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.148 }, // Total: 1.32
          },
          {
            type: 'event',
            event: 'upgrade-angular-damping',
            payload: { multiplier: 0.88 }, // -12%
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.174 }, // Total: 1.55
          },
          {
            type: 'event',
            event: 'upgrade-angular-damping',
            payload: { multiplier: 0.852 }, // Total: 0.75
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 3 },
          },
        ],
      },
      {
        rank: 4,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.226 }, // Total: 1.90
          },
          {
            type: 'event',
            event: 'upgrade-angular-damping',
            payload: { multiplier: 0.8 }, // Total: 0.60
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 4 },
          },
        ],
      },
      {
        rank: 5,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.211 }, // Total: 2.30
          },
          {
            type: 'event',
            event: 'upgrade-angular-damping',
            payload: { multiplier: 1.0 }, // Total: 0.60 (no change)
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 5 },
          },
          {
            type: 'event',
            event: 'upgrade-strafe-movement',
            payload: { multiplier: 1.15 },
          },
        ],
      },
    ],
  },
  {
    id: 'braking_system',
    category: 'mobility',
    family: 'kinetic',
    icon: '⚙️',
    themeColor: '#5DADE2',
    unlockLevel: 3,
    tags: ['control', 'braking', 'precision'],
    prerequisites: [
      {
        type: 'upgrade',
        id: 'rcs_system',
        level: 2,
        text: 'Requires RCS System active (Lv. 2).',
      },
    ],
    text: {
      name: 'Braking System',
      summary: 'Installs inertial brakes for quick stops and precise control.',
      lore: 'Mining technology adapted for combat. Allows impossible stops and sharp direction changes.',
      levels: [
        {
          title: 'Inertial Brakes',
          description: 'Linear damping +30%. Faster stops.',
          highlights: [
            'Reduces inertia when releasing movement keys. Improved control.',
          ],
        },
        {
          title: 'Retro Thrusters',
          description: 'Linear damping +60%. Near-instant reversals.',
          highlights: ['Very fast stops. Ideal for close-quarters combat.'],
        },
        {
          title: 'Emergency Brake',
          description: 'Linear damping +100%. Unlocks special ability.',
          highlights: [
            'Dedicated key (Shift) for an instant stop with a shockwave.',
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
            event: 'upgrade-linear-damping',
            payload: { multiplier: 1.3 },
          },
          {
            type: 'event',
            event: 'upgrade-braking-visual',
            payload: { level: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-linear-damping',
            payload: { multiplier: 1.231 }, // Total: 1.60
          },
          {
            type: 'event',
            event: 'upgrade-braking-visual',
            payload: { level: 2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-linear-damping',
            payload: { multiplier: 1.25 }, // Total: 2.00
          },
          {
            type: 'event',
            event: 'upgrade-braking-visual',
            payload: { level: 3 },
          },
          {
            type: 'event',
            event: 'upgrade-emergency-brake',
            payload: { enabled: true },
          },
        ],
      },
    ],
  },
]);
