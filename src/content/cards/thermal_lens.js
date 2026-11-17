// Cards from R5.4 (numbers: proposta 18/10, for the owner to judge by playing).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'thermal_lens',
  // Weapons it does nothing for (the draw leaves it out).
  deadFor: ['furnace-corona', 'shard-halo', 'arc-caster'],
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
    harmonic: {
      levels: [
        {
          description:
            'Beam length +40%. The lances between beams gain nothing.',
          highlights: ['The beam reaches further; its damage stays the same.'],
        },
      ],
    },
    scatter: {
      levels: [
        {
          description: 'Flak bolt and shrapnel damage +15%.',
          highlights: ['Every bolt and its burst hit harder.'],
        },
      ],
    },
    'seeker-swarm': {
      levels: [
        {
          description: 'Missile and burst damage +15%.',
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
