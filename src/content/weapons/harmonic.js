// A weapon (see lance.js): lances, and every 4th shot a beam instead.
import { PALETTE } from '../../data/constants/palette.js';
import lance from './lance.js';

const beam = {
  pattern: 'beam',
  every: 4, // shots; the 4th is the beam
  length: 220, // logical px from the nose
  width: 10, // logical px
  duration: 0.18, // seconds on screen (damage lands on the first frame)
  damageMultiplier: 2.2, // × lance damage, to everything in the segment
  extraFragments: 1, // large/medium rocks killed by the beam
  cooldownPenalty: 0.25, // seconds added to the next shot's cooldown
  kick: 0.2, // 3D impact pass
  flashRadius: 90, // 3D light flash, as a shockwave of this radius
};

export default {
  id: 'harmonic',
  order: 2,
  name: 'Harmonic Plasma Lance',
  chip: 'HARMONIC',
  description: 'Every 4th shot is a short plasma beam that splits rocks.',
  fire: [beam, { pattern: 'stream' }],
  projectile: lance.projectile,
  colors: {
    glow: PALETTE.shot,
    mid: '#ffe2b0', // the palette has no such tone
    core: PALETTE.text,
  },
  card: {
    id: 'harmonic_resonator',
    order: 8,
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
          description: `Every ${beam.every}th shot is a ${beam.length} px beam dealing ${beam.damageMultiplier}x damage to everything it crosses.`,
          highlights: [
            'Large and medium rocks it kills split into one extra fragment.',
            `The shot after a beam waits +${beam.cooldownPenalty}s.`,
          ],
        },
      ],
    },
  },
};
