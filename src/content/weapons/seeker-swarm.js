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
      rack,
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
