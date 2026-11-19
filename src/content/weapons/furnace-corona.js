// A weapon (see lance.js): a ring of heat round the ship that pulses and
// burns what is inside.
import { COMBAT_SHOOT_COOLDOWN } from '../../data/constants/gameplay.js';
import { PALETTE } from '../../data/constants/palette.js';

// proposta 20/10: the pulse, for the owner to judge by playing.
const corona = {
  pattern: 'aura',
  radius: 78, // px from the ship's centre to an enemy's rim
  growth: 10, // px wider for each Multishot shot past the first
  maxRadius: 118,
  damageMultiplier: 0.9, // × lance damage, to everything inside
  burn: null, // { duration, ticks, damageFraction }: sets what survives burning
  duration: 0.3, // seconds the pulse shows
  cooldownMultiplier: 2, // × the lance's cooldown between pulses
  pierceReach: 20, // px of reach for each Recoil Dampers rank, past the cap (proposta 16/11)
};

// Thermal ×3: every 3rd pulse is a nova that reaches twice as far.
const nova = {
  ...corona,
  every: 3,
  radius: 170,
  maxRadius: 210,
  damageMultiplier: 1.2,
  duration: 0.45,
};

// Thermal ×5: pulses set enemies burning; a nova every 2nd pulse.
const burn = { duration: 1.5, ticks: 3, damageFraction: 0.3 };

export default {
  id: 'furnace-corona',
  order: 6,
  name: 'Furnace Corona',
  chip: 'CORONA',
  description: 'A ring of heat round the ship that pulses and burns.',
  fire: [corona],
  projectile: {
    look: 'lance', // the corona launches no projectile
    speedMultiplier: 1,
    damageMultiplier: 1,
    range: null,
    pierce: false,
    trailPoints: null,
    burst: null,
  },
  // The families whose lance forms the pulse carries (HitResolution), the
  // budget one pulse shares, and what each form does (proposta 16/11);
  // `kinetic` and `lines` read [form at 3, Apex at 5]. Thermal is its own.
  familyForms: {
    carries: ['arc', 'field', 'salvage', 'kinetic'],
    perShot: { chains: 2, pulls: 1 }, // a pulse starts at most 2 chains and 1 well
    pullEvery: 2, // the well: every 2nd pulse (one each pulse doubled the Lance's gain)
    kinetic: { damage: [1.15, 1.3], push: [1.5, 2] },
    lines: {
      kinetic: [
        'pulses hit 15% harder and throw further',
        'pulses hit 30% harder and throw twice as far',
      ],
      arc: [
        'a pulse arcs on from 2 of its hits',
        'those arcs jump 3 times and fork',
      ],
      field: [
        'pulses slow what they burn',
        'every 2nd pulse drags the crowd into the ring',
      ],
      salvage: [
        'pulse kills drop 25% more orbs',
        'pulse kills drop twice the orbs',
      ],
    },
  },
  // The incendiary orange of a burning lance, over its white-hot core.
  colors: { heat: PALETTE.shot, core: '#ffc98a' },
  evolution: {
    id: 'nova-corona',
    name: 'Nova Corona',
    chip: 'NOVA',
    description: `Every ${nova.every}rd pulse is a nova that reaches ${nova.radius} px.`,
    fire: [nova, corona],
  },
  apex: {
    id: 'sunheart',
    name: 'Sunheart',
    chip: 'SUNHEART',
    description: `Pulses set enemies burning; every 2nd pulse is a nova of 190 px.`,
    fire: [
      { ...nova, every: 2, radius: 190, maxRadius: 230, burn },
      { ...corona, burn },
    ],
    // Whiter than the corona's: the palette has no such tones.
    colors: { heat: '#ffd27a', core: '#fff3dc' },
  },
  card: {
    id: 'furnace_corona',
    order: 44,
    category: 'offense',
    family: 'thermal',
    rarity: 'epic',
    icon: '🔥',
    themeColor: PALETTE.shot,
    unlockLevel: 3,
    tags: ['weapon', 'weaponry'],
    text: {
      name: 'Furnace Corona',
      summary:
        'Swaps the cannon for the Furnace Corona: a ring of heat that pulses round the ship.',
      lore: "A heat exchanger from the Ring's core, venting its warmth in slow breaths.",
      levels: [
        {
          title: 'Furnace Corona',
          description: `Every ${corona.cooldownMultiplier * COMBAT_SHOOT_COOLDOWN}s a pulse deals ${corona.damageMultiplier}x damage to everything within ${corona.radius} px and pushes it back. No gun: keep them close.`,
          highlights: [
            `Multishot widens the ring by ${corona.growth} px, up to ${corona.maxRadius}.`,
            'Thermal ×3: Nova Corona. Thermal ×5: Sunheart.',
          ],
        },
      ],
    },
  },
};
