// src/data/upgrades/defense.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { PALETTE } from '../constants/palette.js';

// === DEFENSIVE UPGRADES ===

export const DEFENSE_UPGRADES = deepFreeze([
  {
    id: 'shield',
    category: 'defense',
    family: 'field',
    rarity: 'common',
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
    family: 'field',
    rarity: 'epic',
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
            'Ideal for withstanding medium barrages without immediate recharge.',
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
  {
    id: 'ablative_plating',
    category: 'defense',
    family: 'field',
    rarity: 'common',
    icon: '🧱',
    themeColor: PALETTE.text,
    unlockLevel: 1,
    tags: ['health', 'hull', 'trade-off'],
    text: {
      name: 'Ablative Plating',
      summary: 'Bolts layers of Ring alloy onto the hull. Heavy, but it holds.',
      lore: 'Cut from the outer skin of the Ring, where the old field still clings to the metal.',
      levels: [
        {
          title: 'First Layer',
          description: 'Max hull +40, top speed -3%.',
          highlights: ['Repairs 40 hull at once.'],
        },
        {
          title: 'Second Layer',
          description: 'Max hull +80, top speed -6% (cumulative).',
          highlights: ['Repairs another 40 hull.'],
        },
        {
          title: 'Full Skin',
          description: 'Max hull +120, top speed -9% (cumulative).',
          highlights: ['A brick that can take a Warden volley.'],
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
            payload: { bonus: 40 },
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 0.97 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 40 },
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 0.97 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 40 },
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 0.97 },
          },
        ],
      },
    ],
  },
  {
    id: 'grav_anchor',
    category: 'defense',
    family: 'field',
    rarity: 'common',
    icon: '⚓',
    themeColor: PALETTE.text,
    unlockLevel: 2,
    tags: ['control', 'hull'],
    text: {
      name: 'Grav Anchor',
      summary:
        'A small field generator that pins the ship in place when you let go.',
      lore: 'Warden docking clamps still answer to a Ring signal. You found the signal.',
      levels: [
        {
          title: 'Soft Clamp',
          description: 'Stopping power +25% and max hull +15.',
          highlights: ['The ship settles faster when you release thrust.'],
        },
        {
          title: 'Hard Clamp',
          description: 'Stopping power +56% and max hull +30 (cumulative).',
          highlights: ['Hold a spot while the Field moves around you.'],
        },
        {
          title: 'Dead Stop',
          description: 'Stopping power +95% and max hull +45 (cumulative).',
          highlights: ['Near-instant stops.'],
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
            payload: { multiplier: 1.25 },
          },
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 15 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-linear-damping',
            payload: { multiplier: 1.25 },
          },
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 15 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-linear-damping',
            payload: { multiplier: 1.25 },
          },
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 15 },
          },
        ],
      },
    ],
  },
  // Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
  {
    id: 'static_shell',
    category: 'defense',
    family: 'arc',
    rarity: 'common',
    icon: '⚡',
    themeColor: PALETTE.status,
    unlockLevel: 1,
    tags: ['retaliation', 'hull'],
    text: {
      name: 'Static Shell',
      summary:
        'Charges the hull plating: whatever hits you gets the current back.',
      lore: 'A Warden trick. Their hulls bit back, and now yours does too.',
      levels: [
        {
          title: 'Live Plating',
          description:
            'Taking a hit discharges a 90 px arc: 20 damage to every enemy in reach.',
          highlights: ['Shield hits count too.'],
        },
        {
          title: 'Hot Plating',
          description: 'The arc deals 40 damage.',
          highlights: ['Another +20 per discharge.'],
        },
        {
          title: 'Storm Plating',
          description: 'The arc deals 60 damage.',
          highlights: ['Getting hit becomes an attack.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-static-shell',
            payload: { radius: 90, damage: 20 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-static-shell',
            payload: { radius: 90, damage: 40 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-static-shell',
            payload: { radius: 90, damage: 60 },
          },
        ],
      },
    ],
  },
  {
    id: 'gravity_brake',
    category: 'defense',
    family: 'field',
    rarity: 'common',
    icon: '🌑',
    themeColor: PALETTE.text,
    unlockLevel: 2,
    tags: ['control', 'slow'],
    text: {
      name: 'Gravity Brake',
      summary:
        'A short-range field that drags at anything flying close to the ship.',
      lore: 'The Ring held its rocks in place with fields like this. A small one still works.',
      levels: [
        {
          title: 'Drag Field',
          description: 'Enemies within 120 px move 8% slower.',
          highlights: ['Bosses are not slowed.'],
        },
        {
          title: 'Deep Drag',
          description: 'Enemies within 120 px move 16% slower.',
          highlights: ['Another -8% speed in the field.'],
        },
        {
          title: 'Still Point',
          description: 'Enemies within 120 px move 24% slower.',
          highlights: ['Close rocks crawl.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-gravity-brake',
            payload: { radius: 120, slowFraction: 0.08 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-gravity-brake',
            payload: { radius: 120, slowFraction: 0.16 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-gravity-brake',
            payload: { radius: 120, slowFraction: 0.24 },
          },
        ],
      },
    ],
  },
]);
