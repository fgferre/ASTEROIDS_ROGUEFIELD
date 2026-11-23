// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'thermal_lens',
  order: 12,
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
  // What the lens reaches with each weapon (Projectiles, beamAndFan.js).
  weaponText: {
    // proposta 17/11
    'arc-caster': {
      levels: [
        {
          description: 'Cast damage +15%.',
          highlights: ['Every jump takes it.'],
        },
      ],
    },
    'shard-halo': {
      levels: [
        {
          description: 'Cut damage +15%.',
          highlights: ['Every blade takes it.'],
        },
      ],
    },
    'furnace-corona': {
      levels: [
        {
          description: 'Pulse damage +15%.',
          highlights: ['Every enemy in the ring takes it.'],
        },
      ],
    },
    harmonic: {
      levels: [
        {
          description:
            'Beam length +40%. The lances between beams gain nothing.',
          highlights: ['The beam reaches further; its damage stays the same.'],
        },
      ],
    },
    // proposta 22/11 (the fan's `lensSpread`, the salvo's `lensAcquire`,
    // the missile's `lensHit` and `lensBurst`)
    scatter: {
      levels: [
        {
          description:
            'Focuses the fan: the bolts fly 20% closer together and deal +15% damage.',
          highlights: ['Every bolt and its burst hit harder.'],
        },
      ],
    },
    'seeker-swarm': {
      levels: [
        {
          description:
            'Missiles find targets 40% further away; a direct hit deals +25%.',
          highlights: ['Missiles bred from a wreck too.'],
        },
      ],
    },
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
};
