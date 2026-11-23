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

// Kinetic ×3 (approved 23/11): Grapeshot, the fan entry's `ricochet`. A
// bolt that hits bursts as ever, then glances off once into the enemy
// nearest ahead of it (within `reach` px, at most `cone` off its flight, the
// cosine), aimed where that one will be, and bursts again there; it flies on
// `linger` s past it, then bursts where it is. An enemy another bolt of the volley already took counts
// `taken` px further. A glance keeps `keep` of the bolt's and its burst's
// damage (card bench, 23/11: at full strength it doubled the Lance's gain).
const ricochet = {
  times: 1,
  reach: 170,
  cone: 0.15,
  linger: 0.08,
  taken: 110,
  keep: 0.5,
};
// Kinetic ×5: Hailstorm, it glances twice, keeping more at each glance (and
// its bolts hit 25% harder: the Coilgun's lance damage, Weapons.js).
const hailstorm = { ...ricochet, times: 2, keep: 0.8 };

export default {
  id: 'scatter',
  order: 3,
  name: 'Scatter Coil',
  chip: 'SCATTER',
  description: 'A fan of short flak bolts that burst into shrapnel.',
  fire: [fan],
  projectile: bolt,
  colors,
  // Its own family is Kinetic (its `evolution` and `apex`); the fan runs the
  // other four families' forms itself (fanForms.js, approved 23/11 from the
  // mock-ups): a flak or shrapnel hit runs none of their lance forms, but
  // the Prospector's orbs stay. `[at 3, at 5]` pairs.
  familyForms: {
    carries: [],
    fan: ['thermal', 'arc', 'field', 'salvage'],
    // Kindling: a rock struck `hits` times by one volley (bolts and its
    // shrapnel) catches fire inside and burns (`burn`, of the third hit's
    // damage); when it dies its pieces fly out burning at `fling.speed` px/s,
    // settling with time constant `fling.settle` s, a flame behind them for
    // `fling.trail` s. At 5 a machine catches too, and each one set alight
    // passes it to its nearest neighbour within `spread` px (rim to rim).
    // (Card bench, 23/11: 0.4 a tick matched the Lance's Thermal at 3.)
    thermal: {
      hits: 3,
      burn: { duration: 4, ticks: 8, damageFraction: 0.4 },
      spread: 80,
      fling: { speed: 150, settle: 0.45, trail: 1.8 },
    },
    // Discharge: each burst arcs to the `arcs` nearest enemies outside it
    // (within `range` px of its centre), each taking `damageFraction` × the
    // burst's damage; at 5 each bolt jumps on `jumps` more to the nearest
    // not yet struck. A volley strikes an enemy once and throws at most `cap`
    // bolts (the mock-up's stacked strikes blew out to white).
    arc: {
      range: 150,
      arcs: [2, 3],
      jumps: [0, 1],
      damageFraction: [0.36, 0.95],
      cap: [4, 4],
      life: 0.24,
    },
    // Implosion: a burst first drags what lies within `reach` px (rim) into
    // its centre for `hold` s (the gap closing with time constant `tau` s),
    // then bursts on the clump. No boss.
    field: { reach: [60, 90], hold: [0.3, 0.5], tau: 0.09 },
    // Scrap Rounds: a flak kill throws `shards` pieces of scrap on along the
    // hit at `toss` px/s; `delay` s later each fires itself at the nearest
    // enemy within `range` px, a bolt of the volley's own (a scrap kill
    // throws none).
    salvage: { shards: [1, 2], delay: 0.15, toss: 70, range: 190 },
    // The form's name on the cards and the HUD, at 3 and 5 cards, in place
    // of the lance form's.
    names: {
      thermal: ['Kindling', 'Kindling'],
      arc: ['Discharge', 'Discharge'],
      field: ['Implosion', 'Implosion'],
      salvage: ['Scrap Rounds', 'Scrap Rounds'],
    },
    lines: {
      thermal: [
        'a rock hit 3 times by one volley catches fire and dies into burning pieces',
        'machines catch fire too, and each one set alight passes it to a neighbour',
      ],
      arc: [
        'each burst discharges into the 2 nearest enemies outside it, up to 4 bolts a volley',
        'each burst discharges into 3 and each bolt jumps on once, hitting much harder',
      ],
      field: [
        'bursts pull enemies within 60 px into their centre, then explode on the clump',
        'bursts pull from 90 px and hold them 0.5 s before they explode',
      ],
      salvage: [
        'kills drop 25% more orbs; a flak kill throws a scrap shard that fires itself at the nearest enemy',
        'kills drop twice the orbs; a flak kill throws two scrap shards',
      ],
    },
  },
  evolution: {
    id: 'grapeshot',
    name: 'Grapeshot',
    chip: 'GRAPESHOT',
    description:
      'Bolts glance off what they hit into the next enemy ahead and burst again.',
    fire: [{ ...fan, ricochet }],
  },
  apex: {
    id: 'hailstorm',
    name: 'Hailstorm',
    chip: 'HAILSTORM',
    description:
      'Bolts glance twice, 25% harder, bursting on each enemy they find.',
    fire: [{ ...fan, ricochet: hailstorm }],
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
            'Kinetic ×3: Grapeshot. Kinetic ×5: Hailstorm.',
          ],
        },
      ],
    },
  },
};
