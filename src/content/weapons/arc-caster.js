// A weapon (see lance.js): lightning that jumps from enemy to enemy.
import { PALETTE } from '../../data/constants/palette.js';

// proposta 20/10: the cast, for the owner to judge by playing.
const cast = {
  pattern: 'chain',
  range: 230, // px from the muzzle to the first enemy's rim
  cone: 70, // degrees round the aim the first enemy may be in
  bolts: 1, // first enemies struck at once
  jumps: 3, // hops after the first; each Multishot shot past the first adds one
  maxJumps: 6,
  pierceJumps: 1, // jumps for each Recoil Dampers rank, past the cap (proposta 17/11)
  jumpRange: 120, // px from a struck enemy's centre to the next one's rim
  falloff: 0.8, // × the hop before
  fork: 1, // branches a hop
  targets: 8, // the most enemies one cast strikes
  damageMultiplier: 1, // × lance damage, the first hit
  cooldownMultiplier: 1.6, // × the lance's cooldown between casts
};

// Arc ×3: every hop forks in two.
const forked = { ...cast, fork: 2, jumpRange: 130, targets: 10 };

// Arc ×5: every 3rd cast, a crown of bolts into everything round the ship.
const crown = {
  ...cast,
  every: 3,
  range: 210,
  cone: 360,
  bolts: 8,
  jumps: 1,
  maxJumps: 3,
  falloff: 0.7,
  targets: 16,
  damageMultiplier: 0.9,
};

export default {
  id: 'arc-caster',
  order: 4,
  name: 'Arc Caster',
  chip: 'ARC',
  description: 'Lightning that jumps between nearby enemies.',
  fire: [cast],
  projectile: {
    look: 'lance', // casts launch no projectile
    speedMultiplier: 1,
    damageMultiplier: 1,
    range: null,
    pierce: false,
    trailPoints: null,
    burst: null,
  },
  // The families whose lance forms a hop carries (HitResolution), the budget
  // one cast shares, and what each form does (proposta 17/11); `kinetic` and
  // `lines` read [form at 3, Apex at 5]. Arc is its own.
  familyForms: {
    carries: ['thermal', 'field', 'salvage', 'kinetic'],
    perShot: { chains: 0, pulls: 1 },
    pullEvery: 2, // a well every 2nd cast, at the cast's first enemy
    kinetic: { falloff: [0.9, 1], damage: [1, 1.25] },
    lines: {
      thermal: ['every jump sets its target burning', 'burns spread'],
      field: [
        'every jump slows its target',
        'every 2nd cast drags the crowd to its first strike',
      ],
      salvage: [
        'arc kills drop 25% more orbs',
        'arc kills drop twice the orbs',
      ],
      kinetic: [
        'jumps keep 90% of their strength',
        'jumps keep full strength, casts hit 25% harder',
      ],
    },
  },
  colors: { arc: PALETTE.status },
  evolution: {
    id: 'forked-arc',
    name: 'Forked Arc',
    chip: 'FORK',
    description: `Every jump forks in two: up to ${forked.targets} enemies a cast.`,
    fire: [forked],
  },
  apex: {
    id: 'storm-crown',
    name: 'Storm Crown',
    chip: 'CROWN',
    description: `Forked arcs; every ${crown.every}rd cast a crown of lightning strikes up to ${crown.bolts} enemies round the ship.`,
    fire: [crown, { ...forked, targets: 12 }],
  },
  card: {
    id: 'arc_caster',
    order: 42,
    category: 'offense',
    family: 'arc',
    rarity: 'epic',
    icon: '⚡',
    themeColor: PALETTE.status,
    unlockLevel: 3,
    unlock: { by: 'start', at: 26 },
    tags: ['weapon', 'weaponry'],
    text: {
      name: 'Arc Caster',
      summary:
        'Swaps the cannon for the Arc Caster: lightning that jumps between enemies.',
      lore: 'A Warden relay coil torn from its mast. It still looks for something to discharge into.',
      levels: [
        {
          title: 'Arc Caster',
          description: `Lightning strikes the nearest enemy within ${cast.range} px and jumps ${cast.jumps} times, each jump at ${Math.round(cast.falloff * 100)}% of the last.`,
          highlights: [
            `Multishot adds jumps, up to ${cast.maxJumps}.`,
            'Arc ×3: Forked Arc. Arc ×5: Storm Crown.',
          ],
        },
      ],
    },
  },
};
