// A weapon (see lance.js): a fan of short flak bolts that burst.
import { PALETTE } from '../../data/constants/palette.js';

// proposta 18/10: the flak volley, for the owner to judge by playing.
const fan = {
  pattern: 'fan',
  bolts: 5, // per volley; each Multishot shot past the first adds one
  maxBolts: 9,
  fan: 26, // degrees, edge bolt to edge bolt
  cooldownMultiplier: 1.6, // × the lance's cooldown between volleys
  // The cards' own version (proposta 22/11). At the Overcharge Coil's third
  // rank the bolts fly 50% faster and 80 px further (the ranks before, a
  // share).
  coilSpeed: 0.5,
  coilRange: 80,
  lensSpread: 0.8, // × the fan with the Thermal Lens
  capacitorTwice: 0.1, // the Chain Capacitor's chance a volley fires twice
};

const bolt = {
  look: 'flak',
  speedMultiplier: 0.9, // × lance speed
  damageMultiplier: 0.45, // × lance damage, a bolt's direct hit
  range: 180, // logical px from the muzzle, where a bolt that hit nothing bursts
  pierce: false,
  trailPoints: 4, // a short tracer, not a lance trail
  burst: {
    radius: 40, // logical px, to the enemy's rim
    burstReach: 25, // px more per Recoil Dampers pierce (proposta 22/11)
    damageMultiplier: 0.6, // × lance damage, once per enemy per volley
    duration: 0.22, // seconds on screen
  },
};

// Core and burst are warmer than PALETTE.text, so they read as the amber
// family: the white-hot core of a flak tracer and the flash of its burst.
const colors = {
  tracer: PALETTE.shot,
  core: '#fff3dc',
  burst: '#ffd28f',
};

export default {
  id: 'scatter',
  order: 3,
  name: 'Scatter Coil',
  chip: 'SCATTER',
  description: 'A fan of short flak bolts that burst into shrapnel.',
  fire: [fan],
  projectile: bolt,
  colors,
  // Its own family is kinetic and the bolts don't pierce: Railshot and the
  // Coilgun widen the bursts instead (proposta 17/11).
  familyForms: {
    carries: [],
    kinetic: { burstScale: [1.6, 1.9] }, // proposta 22/11
    lines: {
      kinetic: [
        'flak bursts 60% wider',
        'flak bursts 90% wider, bolts 25% harder',
      ],
    },
  },
  card: {
    id: 'scatter_coil',
    order: 9,
    category: 'offense',
    family: 'kinetic',
    rarity: 'epic',
    icon: '🎆',
    themeColor: colors.burst,
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
          description: `Fires ${fan.bolts} bolts in a ${fan.fan}° fan; each bursts on its first hit or at ${bolt.range} px, hitting everything within ${bolt.burst.radius} px.`,
          highlights: [
            `Multishot adds bolts to the fan, up to ${fan.maxBolts}.`,
            'Slower volleys than the lance: get close.',
          ],
        },
      ],
    },
  },
};
