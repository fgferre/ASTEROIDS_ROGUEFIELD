// A weapon (see lance.js): slow missiles that curve onto their targets.
import { PALETTE } from '../../data/constants/palette.js';

// proposta 20/10: the salvo, for the owner to judge by playing.
const salvo = {
  pattern: 'seeker',
  missiles: 2, // each Multishot shot past the first adds one
  maxMissiles: 5,
  spread: 70, // degrees the salvo leaves the muzzle across
  turn: 3.2, // rad/s a missile turns at most
  acquire: 340, // px within which a missile finds a target
  breed: 0, // missiles a kill releases from the wreck
  damageMultiplier: 1, // × the missile's damage
  cooldownMultiplier: 2.4, // × the lance's cooldown between salvos
  // The cards' own version (proposta 22/11). At the Overcharge Coil's third
  // rank the missiles fly 30% faster and turn 60% tighter (the ranks before,
  // a share).
  coilSpeed: 0.3,
  coilTurn: 0.6,
  lensAcquire: 1.4, // × acquire with the Thermal Lens
  lensHit: 1.25, // × a direct hit with the Thermal Lens; the burst gains nothing
  lensBurst: 1,
  capacitorSplit: 0.1, // the Chain Capacitor's chance a missile splits as it locks on
};

// Salvage ×3: every 3rd salvo is a ring of micro-missiles all round.
const rack = {
  ...salvo,
  every: 3,
  missiles: 6,
  maxMissiles: 8,
  spread: 360,
  turn: 4,
  damageMultiplier: 0.6,
};

const missile = {
  look: 'seeker',
  speedMultiplier: 0.5, // × lance speed
  damageMultiplier: 1.2, // × lance damage, a direct hit
  range: 620, // px of flight, then it bursts
  pierce: false,
  trailPoints: 12,
  burst: {
    radius: 28, // px, to the enemy's rim
    burstReach: 25, // px more per Recoil Dampers pierce (proposta 22/11)
    damageMultiplier: 0.4, // × lance damage, to what is round the hit
    duration: 0.25, // seconds on screen
  },
};

// Scrap silver exhaust over a warm white-hot core and burst.
const colors = { tracer: PALETTE.salvage, core: '#fff6dc', burst: '#ffe6a8' };

export default {
  id: 'seeker-swarm',
  order: 7,
  name: 'Seeker Swarm',
  chip: 'SEEKER',
  description: 'Slow missiles that curve onto their targets and burst.',
  fire: [salvo],
  projectile: missile,
  colors,
  // Its missiles are lance hits and run the Kinetic and Salvage lance forms,
  // the Kinetic one with its own wording and a wider burst at Railshot [3] or
  // the Coilgun [5] (proposta 17/11). Thermal, Arc and Field are the
  // missile's own (missileForms.js, picked 23/11 from the mock-ups): a
  // missile or its burst runs none of those families' lance forms. `[at 3,
  // at 5]` pairs.
  familyForms: {
    carries: [],
    kinetic: { burstScale: [1.8, 2.2] }, // proposta 22/11
    missile: ['thermal', 'arc', 'field'],
    // Thermite: a missile that hits and does not kill lodges in its target
    // (never a boss) and burns inside it `hold` s (`burn` every `every` s, of
    // the hit's damage), spitting sparks, then bursts `burstScale` × wider,
    // the shrapnel at `burstDamage` × its own, the target too. At 5 that
    // burst throws `pieces` of thermite at the nearest enemies within `range`
    // px (rim) at `speed` px/s; each sticks and burns (`burn` every `every`
    // s) for `stick` s. (Card bench, 23/11: the mock-up's full-strength
    // burst and burn gave several times the Lance's gain.)
    thermal: {
      hold: 1,
      every: 0.25,
      burn: { duration: 0.5, ticks: 2, damageFraction: 0.04 },
      burstScale: 1.6,
      burstDamage: 0.5,
      pieces: [0, 3],
      range: 110,
      speed: 260,
      stick: 1.2,
    },
    // Storm Warhead: each burst throws one heavy bolt that leaps to the
    // nearest enemy outside it within `range` px (rim), then on from there,
    // `leaps` times `gap` s apart, each strike `damageFraction` × the
    // missile's hit, shown `life` s. (Card bench, 23/11: half the hit at 3
    // gave nearly twice the Lance's gain.)
    arc: {
      range: 150,
      leaps: [3, 5],
      gap: 0.06,
      damageFraction: [0.3, 0.6],
      life: 0.22,
    },
    // Gravity Warhead: after each burst a well holds `hold` s and pulls what
    // lies within `reach` px (rim) into its centre (the gap closing with time
    // constant `tau` s); no boss. At 5 the salvo's missiles still flying home
    // on it while it holds.
    field: { reach: [70, 100], hold: [0.6, 0.6], tau: 0.16 },
    // The form's name on the cards and the HUD, at 3 and 5 cards, in place
    // of the lance form's.
    names: {
      thermal: ['Thermite', 'Thermite'],
      arc: ['Storm Warhead', 'Storm Warhead'],
      field: ['Gravity Warhead', 'Gravity Warhead'],
    },
    lines: {
      kinetic: [
        'missile bursts 80% wider',
        'missile bursts 120% wider, missiles 25% harder',
      ],
      thermal: [
        'a missile lodges in what it hits and burns inside it for 1 s, then bursts 60% bigger',
        'the bigger burst throws thermite at 3 neighbours; it sticks and burns',
      ],
      arc: [
        'each burst throws a heavy bolt that leaps across 3 enemies',
        'the bolt leaps across 5 enemies',
      ],
      field: [
        'each burst leaves a gravity well for 0.6 s that pulls enemies within 70 px into it',
        'a bigger well (100 px), and the salvo’s other missiles home on it',
      ],
    },
  },
  evolution: {
    id: 'swarm-rack',
    name: 'Swarm Rack',
    chip: 'RACK',
    description: `Every ${rack.every}rd salvo is a ring of ${rack.missiles} micro-missiles, each to its own target.`,
    fire: [rack, salvo],
  },
  apex: {
    id: 'locust-hive',
    name: 'Locust Hive',
    chip: 'HIVE',
    description:
      'Salvos of 3; a missile that kills releases 2 more from the wreck.',
    fire: [
      { ...rack, breed: 2 },
      { ...salvo, missiles: 3, maxMissiles: 6, turn: 3.6, breed: 2 },
    ],
  },
  card: {
    id: 'seeker_swarm',
    order: 45,
    category: 'offense',
    family: 'salvage',
    rarity: 'epic',
    icon: '🚀',
    themeColor: PALETTE.xp,
    unlockLevel: 3,
    tags: ['weapon', 'weaponry'],
    text: {
      name: 'Seeker Swarm',
      summary:
        'Swaps the cannon for the Seeker Swarm: slow missiles that find their own targets.',
      lore: 'Guidance cores pulled from Warden wrecks, packed into scrap casings. They find their own way.',
      levels: [
        {
          title: 'Seeker Swarm',
          description: `Launches ${salvo.missiles} missiles that turn onto the nearest enemies and burst on impact, hitting everything within ${missile.burst.radius} px.`,
          highlights: [
            `Multishot adds missiles, up to ${salvo.maxMissiles}.`,
            'Salvage ×3: Swarm Rack. Salvage ×5: Locust Hive.',
          ],
        },
      ],
    },
  },
};
