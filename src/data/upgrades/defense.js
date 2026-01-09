// src/data/upgrades/defense.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === DEFENSIVE UPGRADES ===

export const DEFENSE_UPGRADES = deepFreeze([
  {
    id: 'shield',
    category: 'defense',
    icon: '🛡️',
    themeColor: '#4ECDC4',
    unlockLevel: 1,
    tags: ['health', 'hull'],
    text: {
      name: 'Energy Shield',
      summary:
        'Installs regenerative coils that increase hull structural capacity.',
      lore: 'System adapted from Typhon freighters. Operates in parallel with the activateable deflector shield.',
      levels: [
        {
          title: 'Auxiliary Reserves',
          description: 'Increases max health by +50 points.',
          highlights: [
            'Applies direct bonus of +50 HP and equivalent immediate heal.',
          ],
        },
        {
          title: 'Graphene Layer',
          description: 'Adds another +50 max health points.',
          highlights: ['Cumulative bonus, totaling +100 additional HP.'],
        },
        {
          title: 'Self-Repair Matrix',
          description: 'Expands total reserve by +75 extra points.',
          highlights: ['Total of +175 extra HP after the third level.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 50 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 50 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 75 },
          },
        ],
      },
    ],
  },
  {
    id: 'deflector_shield',
    category: 'defense',
    icon: '💠',
    themeColor: '#5EC8FF',
    unlockLevel: 2,
    tags: ['escudo', 'defesa ativa'],
    prerequisites: [
      {
        type: 'upgrade',
        id: 'shield',
        level: 1,
        text: 'Requires Energy Shield installed (Lvl 1).',
      },
    ],
    text: {
      name: 'Deflection Matrix',
      summary:
        'Implements an activateable shield capable of absorbing direct impacts.',
      lore: 'Experimental system that redistributes reactor energy to a fast directional field.',
      levels: [
        {
          title: 'Initial Field',
          description:
            'Activateable shield absorbs up to 3 impacts before recharging.',
          highlights: ['Unlocks ability on configured key (default: E).'],
        },
        {
          title: 'Reinforced Plating',
          description: 'Capacity increased to 4 impacts per activation.',
          highlights: [
            'Ideal for withstanding medium waves without immediate recharge.',
          ],
        },
        {
          title: 'Optimized Cooling',
          description: 'Reduces shield recharge time by 5 seconds.',
          highlights: [
            'Allows more frequent reactivations in prolonged fights.',
          ],
        },
        {
          title: 'Advanced Matrix',
          description: 'Final capacity of 5 impacts per activation.',
          highlights: ['Sustains confrontations against aggressive swarms.'],
        },
        {
          title: 'Deflector Overload',
          description: 'Further reduces total shield cooldown.',
          highlights: [
            'Unlocks rapid recharge for successive counter-attacks.',
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
            event: 'upgrade-deflector-shield',
            payload: { level: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-deflector-shield',
            payload: { level: 2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-deflector-shield',
            payload: { level: 3 },
          },
        ],
      },
      {
        rank: 4,
        effects: [
          {
            type: 'event',
            event: 'upgrade-deflector-shield',
            payload: { level: 4 },
          },
        ],
      },
      {
        rank: 5,
        effects: [
          {
            type: 'event',
            event: 'upgrade-deflector-shield',
            payload: { level: 5 },
          },
        ],
      },
    ],
  },
]);
