import { PALETTE } from '../../data/constants/palette.js';
import harmonic from '../weapons/harmonic.js';

export default {
  id: 'harmonic_resonator',
  order: 8,
  category: 'offense',
  family: 'thermal',
  rarity: 'epic',
  icon: '〰️',
  themeColor: PALETTE.shot,
  unlockLevel: 3,
  tags: ['weapon', 'weaponry'],
  excludes: ['scatter_coil'],
  text: {
    name: 'Harmonic Resonator',
    summary:
      'Swaps the cannon for the Harmonic Plasma Lance: every 4th shot is a short beam.',
    lore: 'A Warden tuning fork, still ringing. Rocks it touches come apart along their seams.',
    levels: [
      {
        title: 'Harmonic Plasma Lance',
        description: `Every ${harmonic.beam.every}th shot is a ${harmonic.beam.length} px beam dealing ${harmonic.beam.damageMultiplier}x damage to everything it crosses.`,
        highlights: [
          'Large and medium rocks it kills split into one extra fragment.',
          `The shot after a beam waits +${harmonic.beam.cooldownPenalty}s.`,
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
          payload: { weaponId: harmonic.id },
        },
      ],
    },
  ],
};
