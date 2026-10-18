// src/data/upgrades/mobility.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { PALETTE } from '../constants/palette.js';

// === MOBILITY UPGRADES ===

export const MOBILITY_UPGRADES = deepFreeze([
  {
    id: 'propulsors',
    category: 'mobility',
    family: 'kinetic',
    rarity: 'common',
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
          highlights: [
            'Thrust leaves a 0.5 s ion trail: 8 damage every 0.2 s to machines that touch it.',
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
            // proposta 18/10: machines only (rocks pass), bosses take half.
            payload: {
              damage: 8,
              life: 0.5,
              tickInterval: 0.2,
              radius: 10,
              bossFactor: 0.5,
            },
          },
        ],
      },
    ],
  },
  {
    id: 'rcs_system',
    category: 'mobility',
    family: 'kinetic',
    rarity: 'rare',
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
    rarity: 'common',
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
          description: 'Linear damping +100%. Unlocks the emergency brake.',
          highlights: [
            'Hold the reverse key (S) against your motion for 0.25 s: full stop and a shockwave that shoves enemies back.',
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
            // proposta 18/10: hold S against the motion `hold` s → stop over
            // `stopTime` s with a shove-only shockwave of `radius` px.
            payload: {
              hold: 0.25,
              minSpeed: 40,
              stopTime: 0.1,
              radius: 110,
              knockback: 160,
              cooldown: 1.2,
            },
          },
        ],
      },
    ],
  },
  // Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
  {
    id: 'cinder_trail',
    category: 'mobility',
    family: 'thermal',
    rarity: 'common',
    icon: '🔥',
    themeColor: PALETTE.shot,
    unlockLevel: 2,
    tags: ['thrusters', 'burn'],
    text: {
      name: 'Cinder Trail',
      summary:
        'Mixes crystal dust into the exhaust: the main thruster leaves a burning trail.',
      lore: 'Salvagers used it to mark their path. Rocks that cross it come out scorched.',
      levels: [
        {
          title: 'Ember Wake',
          description:
            'Thrust leaves a 0.6 s trail that burns touching enemies for 6 damage per tick.',
          highlights: ['Ticks 5 times a second.'],
        },
        {
          title: 'Flame Wake',
          description: 'The trail burns for 12 damage per tick.',
          highlights: ['Another +6 per tick.'],
        },
        {
          title: 'Inferno Wake',
          description: 'The trail burns for 18 damage per tick.',
          highlights: ['Fly circles around them.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-cinder-trail',
            payload: { damage: 6, life: 0.6, tickInterval: 0.2, radius: 10 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-cinder-trail',
            payload: { damage: 12, life: 0.6, tickInterval: 0.2, radius: 10 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-cinder-trail',
            payload: { damage: 18, life: 0.6, tickInterval: 0.2, radius: 10 },
          },
        ],
      },
    ],
  },
  {
    id: 'phase_skin',
    category: 'mobility',
    family: 'field',
    rarity: 'rare',
    icon: '👻',
    themeColor: PALETTE.text,
    unlockLevel: 3,
    tags: ['dash', 'invulnerability'],
    text: {
      name: 'Phase Skin',
      summary: 'The hull stays out of phase for a moment after every dash.',
      lore: 'A Ring field coil tuned too fine. You are not quite there when you land.',
      levels: [
        {
          title: 'Out of Phase',
          description: 'For 0.4 s after a dash ends, nothing can hurt you.',
          highlights: ["Adds to the dash's own invulnerability."],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-phase-skin',
            payload: { duration: 0.4 },
          },
        ],
      },
    ],
  },
  // Maneuver cards (R12; numbers: proposta 18/10, for the owner to judge by playing).
  {
    id: 'afterburner',
    category: 'mobility',
    family: 'maneuver',
    rarity: 'common',
    icon: '💨',
    themeColor: PALETTE.boss,
    unlockLevel: 1,
    tags: ['dash', 'cooldown'],
    text: {
      name: 'Afterburner',
      summary:
        'Reroutes the reactor into the dash coils: the dash recharges sooner.',
      lore: 'Ring couriers ran their burners hot and short. Most of them made the delivery.',
      levels: [
        {
          title: 'Hot Coils',
          description: 'Dash cooldown -12%.',
          highlights: ['Dash a little more often.'],
        },
        {
          title: 'Bypass Valves',
          description: 'Dash cooldown -22% (cumulative).',
          highlights: ['The dash is back before the next wave of fire.'],
        },
        {
          title: 'Open Burner',
          description: 'Dash cooldown -30% (cumulative).',
          highlights: ['Dash your way through the Field.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-dash-cooldown',
            payload: { multiplier: 0.88 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-dash-cooldown',
            payload: { multiplier: 0.886 }, // Total: 0.78
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-dash-cooldown',
            payload: { multiplier: 0.897 }, // Total: 0.70
          },
        ],
      },
    ],
  },
  {
    id: 'ram_plating',
    category: 'mobility',
    family: 'maneuver',
    rarity: 'rare',
    icon: '🐏',
    themeColor: PALETTE.boss,
    unlockLevel: 2,
    tags: ['dash', 'contact damage'],
    text: {
      name: 'Ram Plating',
      summary:
        'Armors the bow: the dash slams into whatever it passes through.',
      lore: 'Ore haulers bolted these on to clear drift. Machines break the same way.',
      levels: [
        {
          title: 'Bow Plate',
          description: 'The dash deals 20 damage to each enemy it hits.',
          highlights: ['Once per enemy per dash.'],
        },
        {
          title: 'Reinforced Prow',
          description: 'The dash deals 35 damage to each enemy it hits.',
          highlights: ['Another +15 per hit.'],
        },
        {
          title: 'Battering Ram',
          description: 'The dash deals 50 damage to each enemy it hits.',
          highlights: ['Dash first, shoot after.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-ram-plating',
            payload: { damage: 20 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-ram-plating',
            payload: { damage: 35 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-ram-plating',
            payload: { damage: 50 },
          },
        ],
      },
    ],
  },
  {
    id: 'gyro_servos',
    category: 'mobility',
    family: 'maneuver',
    rarity: 'common',
    icon: '🔄',
    themeColor: PALETTE.boss,
    unlockLevel: 1,
    tags: ['turret', 'aim'],
    text: {
      name: 'Gyro Servos',
      summary: 'Faster turret motors: the gun swings onto a new target sooner.',
      lore: 'Lifted from a Warden gun mount. It still twitches toward movement.',
      levels: [
        {
          title: 'Fast Servos',
          description: 'Turret turn speed +25%.',
          highlights: ['Quicker swings onto targets behind you.'],
        },
        {
          title: 'Gyro Lock',
          description: 'Turret turn speed +50% (cumulative).',
          highlights: ['The gun is where you look.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-turret-turn',
            payload: { multiplier: 1.25 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-turret-turn',
            payload: { multiplier: 1.2 }, // Total: 1.50
          },
        ],
      },
    ],
  },
  {
    id: 'reactive_brake',
    category: 'mobility',
    family: 'maneuver',
    rarity: 'rare',
    icon: '💢',
    themeColor: PALETTE.boss,
    unlockLevel: 3,
    tags: ['braking', 'shockwave', 'area damage'],
    prerequisites: [
      {
        type: 'upgrade',
        id: 'braking_system',
        level: 3,
        text: 'Requires the Emergency Brake (Braking System Lv. 3).',
      },
    ],
    text: {
      name: 'Reactive Brake',
      summary: 'The emergency brake dumps its charge into the shockwave.',
      lore: 'All that speed has to go somewhere. Now it goes into them.',
      levels: [
        {
          title: 'Charged Ring',
          description:
            'The brake shockwave shoves 40% harder and deals up to 12 damage.',
          highlights: ['Full damage next to the ship, fading toward the edge.'],
        },
        {
          title: 'Detonating Ring',
          description:
            'The brake shockwave shoves 80% harder and deals up to 24 damage.',
          highlights: ['Stop dead in a crowd.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-reactive-brake',
            payload: { knockbackMultiplier: 1.4, damage: 12 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-reactive-brake',
            payload: { knockbackMultiplier: 1.8, damage: 24 },
          },
        ],
      },
    ],
  },
  {
    id: 'inertial_dampers',
    category: 'mobility',
    family: 'maneuver',
    rarity: 'common',
    icon: '🧭',
    themeColor: PALETTE.boss,
    unlockLevel: 2,
    tags: ['braking', 'dash', 'control'],
    text: {
      name: 'Inertial Dampers',
      summary: 'Bleeds off drift when you let go, and stretches the dash.',
      lore: 'Field-grade dampers from a survey skiff. Built to hold still over a crack in a rock.',
      levels: [
        {
          title: 'Drift Bleed',
          description: 'Braking damping +25%: faster stops when you let go.',
          highlights: ['Less drift between moves.'],
        },
        {
          title: 'Long Stride',
          description:
            'Braking damping +50% (cumulative) and the dash goes 15% further.',
          highlights: ['Cross the gap, then stop on the spot.'],
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
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-linear-damping',
            payload: { multiplier: 1.2 }, // Total: 1.50
          },
          {
            type: 'event',
            event: 'upgrade-dash-distance',
            payload: { multiplier: 1.15 },
          },
        ],
      },
    ],
  },
  {
    id: 'phase_dash',
    category: 'mobility',
    family: 'maneuver',
    rarity: 'rare',
    icon: '🌫️',
    themeColor: PALETTE.boss,
    unlockLevel: 3,
    tags: ['dash', 'invulnerability'],
    text: {
      name: 'Ghost Drive',
      summary:
        'The dash drive runs a beat out of phase: longer untouchable, longer afterimages.',
      lore: 'Pilots swear the afterimages keep flying a moment after they leave.',
      levels: [
        {
          title: 'Ghost Drive',
          description: 'The dash stays invulnerable 0.15 s longer.',
          highlights: ['Its afterimages linger twice as long.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-phase-dash',
            payload: { invulnerability: 0.15, ghostLinger: 2 },
          },
        ],
      },
    ],
  },
]);
