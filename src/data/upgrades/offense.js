// src/data/upgrades/offense.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { PALETTE } from '../constants/palette.js';
import { WEAPONS } from '../weapons.js';

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
  {
    id: 'harmonic_resonator',
    category: 'offense',
    family: 'thermal',
    rarity: 'epic',
    icon: '〰️',
    themeColor: PALETTE.shot,
    unlockLevel: 3,
    tags: ['weapon', 'weaponry'],
    text: {
      name: 'Harmonic Resonator',
      summary:
        'Swaps the cannon for the Harmonic Plasma Lance: every 4th shot is a short beam.',
      lore: 'A Warden tuning fork, still ringing. Rocks it touches come apart along their seams.',
      levels: [
        {
          title: 'Harmonic Plasma Lance',
          description: `Every ${WEAPONS.harmonic.beam.every}th shot is a ${WEAPONS.harmonic.beam.length} px beam dealing ${WEAPONS.harmonic.beam.damageMultiplier}x damage to everything it crosses.`,
          highlights: [
            'Large and medium rocks it kills split into one extra fragment.',
            `The shot after a beam waits +${WEAPONS.harmonic.beam.cooldownPenalty}s.`,
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
            event: 'upgrade-weapon-harmonic',
            payload: { weaponId: WEAPONS.harmonic.id },
          },
        ],
      },
    ],
  },
  {
    id: 'scatter_coil',
    category: 'offense',
    family: 'kinetic',
    rarity: 'epic',
    icon: '🎆',
    themeColor: WEAPONS.scatter.colors.burst,
    unlockLevel: 3,
    tags: ['weapon', 'weaponry'],
    text: {
      name: 'Scatter Coil',
      summary:
        'Swaps the cannon for the Scatter Coil: a fan of short flak bolts that burst into shrapnel.',
      lore: "A Ring miner's blasting coil, rewound to throw its charges at anything that moves.",
      levels: [
        {
          title: 'Scatter Coil',
          description: `Fires ${WEAPONS.scatter.flak.bolts} bolts in a ${WEAPONS.scatter.flak.fan}° fan; each bursts on its first hit or at ${WEAPONS.scatter.flak.range} px, hitting everything within ${WEAPONS.scatter.flak.burstRadius} px.`,
          highlights: [
            `Multishot adds bolts to the fan, up to ${WEAPONS.scatter.flak.maxBolts}.`,
            'Slower volleys than the lance: get close.',
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
            event: 'upgrade-weapon-scatter',
            payload: { weaponId: WEAPONS.scatter.id },
          },
        ],
      },
    ],
  },
  // Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
  {
    id: 'ballast_rounds',
    category: 'offense',
    family: 'kinetic',
    rarity: 'common',
    icon: '🪨',
    themeColor: PALETTE.player,
    unlockLevel: 1,
    tags: ['damage', 'trade-off'],
    text: {
      name: 'Ballast Rounds',
      summary: 'Packs every lance with dense slag: harder hits, slower breech.',
      lore: 'Ring hull scrap pressed into slugs. Heavier than it looks.',
      levels: [
        {
          title: 'Lead Core',
          description: 'Lance damage +8%, fire rate -4%.',
          highlights: ['Harmonic beams keep their damage.'],
        },
        {
          title: 'Slag Core',
          description: 'Lance damage +17%, fire rate -8% (cumulative).',
          highlights: ['Another +8% damage and -4% fire rate.'],
        },
        {
          title: 'Dead Weight',
          description: 'Lance damage +26%, fire rate -11% (cumulative).',
          highlights: ['Fewer shots, each one counts.'],
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
            payload: { lanceDamageMultiplier: 1.08, cooldownMultiplier: 1.04 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-weapon-tuning',
            payload: { lanceDamageMultiplier: 1.08, cooldownMultiplier: 1.04 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-weapon-tuning',
            payload: { lanceDamageMultiplier: 1.08, cooldownMultiplier: 1.04 },
          },
        ],
      },
    ],
  },
  {
    id: 'recoil_dampers',
    category: 'offense',
    family: 'kinetic',
    rarity: 'rare',
    icon: '🔩',
    themeColor: PALETTE.player,
    unlockLevel: 3,
    tags: ['pierce', 'weaponry'],
    text: {
      name: 'Recoil Dampers',
      summary:
        'Steadies the barrel so each lance keeps its line through a rock.',
      lore: 'Warden mounting dampers. The cannon stops kicking and starts punching.',
      levels: [
        {
          title: 'Locked Barrel',
          description: 'Every lance pierces one more target.',
          highlights: ['Stacks with the Railshot evolution.'],
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
            payload: { pierceBonus: 1 },
          },
        ],
      },
    ],
  },
  {
    id: 'thermal_lens',
    category: 'offense',
    family: 'thermal',
    rarity: 'rare',
    icon: '🔍',
    themeColor: PALETTE.shot,
    unlockLevel: 3,
    tags: ['damage', 'weapon'],
    text: {
      name: 'Thermal Lens',
      summary:
        'A crystal lens on the muzzle that focuses whatever the cannon throws.',
      lore: 'Cut from exposed Ring crystal. It bends heat the way glass bends light.',
      levels: [
        {
          title: 'Focused Burn',
          description:
            'With the Harmonic Plasma Lance: beam length +40%. Otherwise: lance damage +15%.',
          highlights: [
            'Switches to the beam bonus when you take the Harmonic Resonator.',
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
            event: 'upgrade-thermal-lens',
            payload: { beamLengthMultiplier: 1.4, lanceDamageMultiplier: 1.15 },
          },
        ],
      },
    ],
  },
  {
    id: 'glass_cannon',
    category: 'offense',
    family: null,
    cursed: true,
    rarity: 'rare',
    icon: '🔺',
    themeColor: PALETTE.boss,
    unlockLevel: 4,
    tags: ['damage', 'cursed'],
    text: {
      name: 'Glass Cannon',
      summary: 'Strips the armour off the hull and feeds it to the cannon.',
      lore: 'The Ring builders called it a test rig. Nobody who flew it called it anything.',
      levels: [
        {
          title: 'Bare Frame',
          description: 'Damage +60%, max hull -30%.',
          highlights: ['Cursed: the hull loss lasts the whole run.'],
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
            payload: { multiplier: 1.6 },
          },
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { multiplier: 0.7 },
          },
        ],
      },
    ],
  },
  {
    id: 'overclocked_core',
    category: 'offense',
    family: null,
    cursed: true,
    rarity: 'rare',
    icon: '⏱️',
    themeColor: PALETTE.boss,
    unlockLevel: 4,
    tags: ['fire-rate', 'cursed'],
    text: {
      name: 'Overclocked Core',
      summary:
        'Runs the reactor past its rating. The cannon loves it; the hull does not.',
      lore: 'Every salvager has a story about a core that ran hot. The short ones end here.',
      levels: [
        {
          title: 'Red Line',
          description:
            'Fire rate +35%. The hull loses 1 HP every 4 s, down to 20% of max.',
          highlights: ['Cursed: the drain never stops, but it never kills.'],
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
            payload: { cooldownMultiplier: 0.74 },
          },
          {
            type: 'event',
            event: 'upgrade-hull-drain',
            payload: { amount: 1, interval: 4, floorFraction: 0.2 },
          },
        ],
      },
    ],
  },
]);
