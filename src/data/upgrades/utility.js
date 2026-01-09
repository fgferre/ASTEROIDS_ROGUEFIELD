// src/data/upgrades/utility.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === UTILITY UPGRADES ===

export const UTILITY_UPGRADES = deepFreeze([
  {
    id: 'magfield',
    category: 'utility',
    icon: '🧲',
    themeColor: '#C08BFF',
    unlockLevel: 1,
    tags: ['collection', 'magnetism'],
    text: {
      name: 'Magnetic Field',
      summary:
        'Amplifies ship collector field to attract experience orbs from further away.',
      lore: 'Coils recalibrated with light alloys allow stable magnetism even during sharp maneuvers.',
      levels: [
        {
          title: 'Flux Lenses',
          description: 'Increases collection range by +40%.',
          highlights: [
            'Multiplies current radius and intensifies attraction force.',
          ],
        },
        {
          title: 'Dual Catalyst',
          description: 'Expands accumulated bonus to +75% range.',
          highlights: ['Applies additional 25% increment over current radius.'],
        },
        {
          title: 'Harmonic Weave',
          description: 'Stabilizes field at +105% total range.',
          highlights: ['Adds 15% extra radius and reinforces magnetic force.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'progression',
            property: 'orbMagnetismRadius',
            operation: 'multiply',
            value: 1.4,
          },
          {
            type: 'progression',
            property: 'magnetismForce',
            operation: 'multiply',
            value: 1.35,
          },
          {
            type: 'event',
            event: 'upgrade-magnetism',
            payload: { multiplier: 1.4 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'progression',
            property: 'orbMagnetismRadius',
            operation: 'multiply',
            value: 1.25,
          },
          {
            type: 'progression',
            property: 'magnetismForce',
            operation: 'multiply',
            value: 1.25,
          },
          {
            type: 'event',
            event: 'upgrade-magnetism',
            payload: { multiplier: 1.25 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'progression',
            property: 'orbMagnetismRadius',
            operation: 'multiply',
            value: 1.15,
          },
          {
            type: 'progression',
            property: 'magnetismForce',
            operation: 'multiply',
            value: 1.15,
          },
          {
            type: 'event',
            event: 'upgrade-magnetism',
            payload: { multiplier: 1.15 },
          },
        ],
      },
    ],
  },
]);
