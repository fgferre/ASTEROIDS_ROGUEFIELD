// A weapon (see lance.js): blades circling the ship that cut what they touch.
import { PALETTE } from '../../data/constants/palette.js';

// proposta 20/10: the halo, for the owner to judge by playing.
const halo = {
  pattern: 'orbit',
  blades: 3, // each Multishot shot past the first adds one
  maxBlades: 6,
  radius: 44, // px from the ship's centre: close enough to cut what rams the hull
  spin: 4, // rad/s
  sweep: null, // { reach, period }: the ring breathes out to reach px and back
  bladeRadius: 10, // px a blade cuts round itself
  damageMultiplier: 1.4, // × lance damage, a cut
  cooldownMultiplier: 1.2, // × the lance's cooldown: one cut per enemy per blade
};

// Field ×3: the halo breathes out and back.
const tide = { ...halo, spin: 4.4, sweep: { reach: 120, period: 1.8 } };

// Field ×5: a second, counter-turning halo breathes out farther.
const outer = {
  ...halo,
  blades: 4,
  maxBlades: 8,
  radius: 96,
  spin: -3,
  sweep: { reach: 150, period: 2.4 },
  bladeRadius: 10,
};

// Light violet like the Gravitic Lance's (the palette has no such tone),
// over a white-hot core.
const colors = { edge: '#b38cff', core: PALETTE.text };

export default {
  id: 'shard-halo',
  order: 5,
  name: 'Shard Halo',
  chip: 'HALO',
  description: 'Blades circle the ship and cut what they touch.',
  fire: [halo],
  projectile: {
    look: 'lance', // the halo launches no projectile
    speedMultiplier: 1,
    damageMultiplier: 1,
    range: null,
    pierce: false,
    trailPoints: null,
    burst: null,
  },
  colors,
  evolution: {
    id: 'razor-tide',
    name: 'Razor Tide',
    chip: 'TIDE',
    description: `The halo breathes out to ${tide.sweep.reach} px and back every ${tide.sweep.period} s.`,
    fire: [tide],
  },
  apex: {
    id: 'twin-halo',
    name: 'Twin Halo',
    chip: 'TWIN',
    description: `A second halo of ${outer.blades} blades turns the other way, out to ${outer.sweep.reach} px.`,
    fire: [outer, tide],
  },
  card: {
    id: 'shard_halo',
    order: 43,
    category: 'offense',
    family: 'field',
    rarity: 'epic',
    icon: '💠',
    themeColor: colors.edge,
    unlockLevel: 3,
    tags: ['weapon', 'weaponry'],
    text: {
      name: 'Shard Halo',
      summary:
        'Swaps the cannon for the Shard Halo: blades circle the ship and cut what they touch.',
      lore: 'Hull plates of the Ring, still held in orbit by the field that once bound them.',
      levels: [
        {
          title: 'Shard Halo',
          description: `${halo.blades} blades circle the ship at ${halo.radius} px, each cutting for ${halo.damageMultiplier}x damage. No gun: fly through them.`,
          highlights: [
            `Multishot adds blades, up to ${halo.maxBlades}.`,
            'Field ×3: Razor Tide. Field ×5: Twin Halo.',
          ],
        },
      ],
    },
  },
};
