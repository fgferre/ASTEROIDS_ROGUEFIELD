// A weapon (see lance.js): lances, and every 4th shot a beam instead.
// Thermal is its own family: its forms change the beam, not the lances.
import { PALETTE } from '../../data/constants/palette.js';
import lance from './lance.js';

const beam = {
  pattern: 'beam',
  every: 4, // shots; the 4th is the beam
  coilEvery: 3, // with the Overcharge Coil (the cards' own version, proposta 22/11)
  capacitorTwice: 0.2, // the Chain Capacitor's chance a beam fires twice
  length: 220, // logical px from the nose
  width: 10, // logical px
  duration: 0.18, // seconds on screen (damage lands on the first frame)
  damageMultiplier: 2.2, // × lance damage, to everything in the segment
  extraFragments: 1, // large/medium rocks killed by the beam
  cooldownPenalty: 0.25, // seconds added to the next shot's cooldown
  kick: 0.2, // 3D impact pass
  flashRadius: 90, // 3D light flash, as a shockwave of this radius
};

// Thermal ×3 (approved 22/11): the beam leaves its line burning, a scar that
// sets alight whatever crosses it every `tick` s; at most `max` at once.
const scar = {
  life: 1, // seconds the line burns
  width: 4, // logical px
  tick: 0.2, // seconds between touches
  max: 3,
  burn: { duration: 1.2, ticks: 3, damageFraction: 0.15 }, // × beam damage
};
const searing = { ...beam, scar };

// Thermal ×5: a longer beam that stays, its scar thicker and longer-lived.
const sunspear = {
  ...beam,
  length: beam.length * 1.5,
  duration: 0.5,
  scar: {
    ...scar,
    life: 2,
    width: 7,
    burn: { ...scar.burn, damageFraction: 0.2 },
  },
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
  // The families whose form the beam runs itself (beamForms.js, approved
  // 22/11): a beam hit drops their lance forms, the lances between beams keep
  // every lance form, Thermal's too. `arc` and `salvage` read [at 3, at 5].
  familyForms: {
    carries: [],
    beam: ['thermal', 'arc', 'salvage'],
    // At 3, `arcs` bolts from the farthest enemy the beam crossed; at 5, a
    // chain of up to `jumps` bolts off the beam from each enemy it crossed,
    // at most `cap` (damage tuned on the card bench, 22/11: not below the
    // Lance forms the beam ran before).
    arc: {
      range: 140,
      damageFraction: [0.7, 1.1],
      arcs: 2,
      cap: 4,
      jumps: 3,
      life: 0.24,
    },
    // Orbs of beam kills fly to the ship (px/s, gaining px/s each second); at
    // 5 the beam also sends every orb within `drag` px of it.
    salvage: { speed: 260, acceleration: 1400, drag: 14 },
    lines: {
      arc: [
        'lances arc to the nearest enemy; the beam arcs to 2 near its far end',
        'lances arc 3 times; every enemy the beam crosses arcs on 3 times',
      ],
      salvage: [
        'kills drop 25% more orbs; orbs from beam kills fly to the ship',
        'kills drop twice the orbs; the beam sends every orb it crosses to the ship',
      ],
    },
  },
  evolution: {
    id: 'searing-beam',
    name: 'Searing Beam',
    chip: 'SEARING',
    description: `The beam leaves its line burning ${scar.life} s: anything crossing it catches fire.`,
    fire: [searing, { pattern: 'stream' }],
  },
  apex: {
    id: 'sunspear',
    name: 'Sunspear',
    chip: 'SUNSPEAR',
    description: `The beam reaches 50% further; it stays ${sunspear.duration} s and its line burns ${sunspear.scar.life} s.`,
    fire: [sunspear, { pattern: 'stream' }],
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
            'Thermal ×3: Searing Beam. Thermal ×5: Sunspear.',
          ],
        },
      ],
    },
  },
};
