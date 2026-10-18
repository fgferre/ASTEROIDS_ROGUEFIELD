// src/data/upgrades/utility.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { PALETTE } from '../constants/palette.js';

// === UTILITY UPGRADES ===

export const UTILITY_UPGRADES = deepFreeze([
  {
    id: 'magfield',
    category: 'utility',
    family: 'salvage',
    rarity: 'common',
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
  {
    id: 'capacitor_bank',
    category: 'utility',
    family: 'arc',
    rarity: 'rare',
    icon: '🔋',
    themeColor: PALETTE.status,
    unlockLevel: 2,
    tags: ['combo'],
    text: {
      name: 'Capacitor Bank',
      summary: 'Stores charge between kills so a chain survives the gaps.',
      lore: 'Ring capacitors never fully drain. Neither does a good streak.',
      levels: [
        {
          title: 'Spare Cells',
          description: 'Combo window +0.5 s.',
          highlights: ['3.0 s becomes 3.5 s between kills.'],
        },
        {
          title: 'Stacked Cells',
          description: 'Combo window +1.0 s (cumulative).',
          highlights: ['4.0 s between kills.'],
        },
        {
          title: 'Ring Cells',
          description: 'Combo window +1.5 s (cumulative).',
          highlights: ['4.5 s between kills.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'progression',
            property: 'comboTimeout',
            operation: 'add',
            value: 0.5,
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'progression',
            property: 'comboTimeout',
            operation: 'add',
            value: 0.5,
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'progression',
            property: 'comboTimeout',
            operation: 'add',
            value: 0.5,
          },
        ],
      },
    ],
  },
  {
    id: 'arc_lattice',
    category: 'utility',
    family: 'arc',
    rarity: 'epic',
    icon: '🕸️',
    themeColor: PALETTE.status,
    unlockLevel: 3,
    tags: ['combo'],
    text: {
      name: 'Arc Lattice',
      summary: 'Every kill in a chain charges the next one a little more.',
      lore: 'Lattice wire from a Tether, still trying to connect things.',
      levels: [
        {
          title: 'Thin Wire',
          description: 'Each combo kill adds +12% XP multiplier (was +10%).',
          highlights: ['The streak climbs faster.'],
        },
        {
          title: 'Mesh',
          description: 'Each combo kill adds +14% XP multiplier.',
          highlights: ['Reaches the cap sooner.'],
        },
        {
          title: 'Full Lattice',
          description: 'Each combo kill adds +16% XP multiplier.',
          highlights: ['Short chains already pay.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'progression',
            property: 'comboMultiplierStep',
            operation: 'add',
            value: 0.02,
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'progression',
            property: 'comboMultiplierStep',
            operation: 'add',
            value: 0.02,
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'progression',
            property: 'comboMultiplierStep',
            operation: 'add',
            value: 0.02,
          },
        ],
      },
    ],
  },
  {
    id: 'core_extractor',
    category: 'utility',
    family: 'salvage',
    rarity: 'common',
    icon: '💎',
    themeColor: PALETTE.xp,
    unlockLevel: 1,
    tags: ['xp', 'collection'],
    text: {
      name: 'Core Extractor',
      summary: 'Pulls more of the Ring light out of every orb you collect.',
      lore: 'Standard salvage kit. The non-standard part is how hard you run it.',
      levels: [
        {
          title: 'Field Kit',
          description: 'XP from orbs +8%.',
          highlights: ['Applies before the combo multiplier.'],
        },
        {
          title: 'Refinery',
          description: 'XP from orbs +17% (cumulative).',
          highlights: ['Another +8%.'],
        },
        {
          title: 'Core Press',
          description: 'XP from orbs +26% (cumulative).',
          highlights: ['Another +8%.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'progression',
            property: 'xpGainMultiplier',
            operation: 'multiply',
            value: 1.08,
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'progression',
            property: 'xpGainMultiplier',
            operation: 'multiply',
            value: 1.08,
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'progression',
            property: 'xpGainMultiplier',
            operation: 'multiply',
            value: 1.08,
          },
        ],
      },
    ],
  },
  {
    id: 'wide_net',
    category: 'utility',
    family: 'salvage',
    rarity: 'common',
    icon: '📡',
    themeColor: PALETTE.xp,
    unlockLevel: 2,
    tags: ['collection', 'magnetism'],
    text: {
      name: 'Wide Net',
      summary: 'Throws a wider, stronger tow field so orbs come to you faster.',
      lore: 'Tow emitters from a salvage barge. They were built for whole hulls.',
      levels: [
        {
          title: 'Tow Field',
          description: 'Orb pull +30% and collection range +10%.',
          highlights: ['Orbs reach you faster.'],
        },
        {
          title: 'Barge Field',
          description: 'Orb pull +69% and range +21% (cumulative).',
          highlights: ['Less flying back for stragglers.'],
        },
        {
          title: 'Hull Tow',
          description: 'Orb pull +120% and range +33% (cumulative).',
          highlights: ['Orbs snap to you.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'progression',
            property: 'magnetismForce',
            operation: 'multiply',
            value: 1.3,
          },
          {
            type: 'progression',
            property: 'orbMagnetismRadius',
            operation: 'multiply',
            value: 1.1,
          },
          {
            type: 'event',
            event: 'upgrade-magnetism',
            payload: { multiplier: 1.1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'progression',
            property: 'magnetismForce',
            operation: 'multiply',
            value: 1.3,
          },
          {
            type: 'progression',
            property: 'orbMagnetismRadius',
            operation: 'multiply',
            value: 1.1,
          },
          {
            type: 'event',
            event: 'upgrade-magnetism',
            payload: { multiplier: 1.1 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'progression',
            property: 'magnetismForce',
            operation: 'multiply',
            value: 1.3,
          },
          {
            type: 'progression',
            property: 'orbMagnetismRadius',
            operation: 'multiply',
            value: 1.1,
          },
          {
            type: 'event',
            event: 'upgrade-magnetism',
            payload: { multiplier: 1.1 },
          },
        ],
      },
    ],
  },
  {
    id: 'bounty_ledger',
    category: 'utility',
    family: 'salvage',
    rarity: 'rare',
    icon: '📜',
    themeColor: PALETTE.xp,
    unlockLevel: 3,
    tags: ['combo', 'xp'],
    text: {
      name: 'Bounty Ledger',
      summary: 'Raises the ceiling on what a long streak can earn.',
      lore: 'Salvage claims are paid by the streak. Someone kept very good books.',
      levels: [
        {
          title: 'Open Account',
          description: 'Combo XP multiplier cap +0.25 (x2.0 to x2.25).',
          highlights: ['Pays off on long streaks only.'],
        },
        {
          title: 'Senior Claim',
          description: 'Combo cap x2.5.',
          highlights: ['Another +0.25.'],
        },
        {
          title: 'Prime Claim',
          description: 'Combo cap x2.75.',
          highlights: ['Another +0.25.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'progression',
            property: 'comboMultiplierCap',
            operation: 'add',
            value: 0.25,
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'progression',
            property: 'comboMultiplierCap',
            operation: 'add',
            value: 0.25,
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'progression',
            property: 'comboMultiplierCap',
            operation: 'add',
            value: 0.25,
          },
        ],
      },
    ],
  },
]);
