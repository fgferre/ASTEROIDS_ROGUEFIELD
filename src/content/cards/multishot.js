import arcCaster from '../weapons/arc-caster.js';
import furnaceCorona from '../weapons/furnace-corona.js';
import scatter from '../weapons/scatter.js';
import seekerSwarm from '../weapons/seeker-swarm.js';
import shardHalo from '../weapons/shard-halo.js';

// What a rank adds with a weapon that fires no lance stream: one more of
// what its first fire pattern counts (Weapons, firePatterns.js).
const ranks = (describe, highlights) => ({
  levels: [1, 2, 3].map((extra) => ({
    description: describe(extra),
    highlights,
  })),
});
const another = (extra) => (extra === 1 ? 'One more' : 'Another');
const [fan] = scatter.fire;
const [corona] = furnaceCorona.fire;
const [halo] = shardHalo.fire;
const [cast] = arcCaster.fire;
const [salvo] = seekerSwarm.fire;

export default {
  id: 'multishot',
  order: 2,
  category: 'offense',
  family: 'kinetic',
  rarity: 'epic',
  icon: '💥',
  themeColor: '#A56DFF',
  unlockLevel: 1,
  tags: ['projectiles', 'weaponry'],
  text: {
    name: 'Multishot',
    summary:
      'Couples secondary emitters to the main cannon to unleash more of whatever it fires.',
    lore: 'Reusable modules salvaged from deactivated military satellites.',
    levels: [
      {
        title: 'Dual Outlet',
        description: 'Fires one additional projectile per sequence.',
        highlights: ['Increases instant fire volume.'],
      },
      {
        title: 'Triangular Grid',
        description: 'Adds a third projectile per sequence.',
        highlights: ['More shots land on the same target.'],
      },
      {
        title: 'Synchronized Barrage',
        description: 'Includes a fourth projectile per sequence.',
        highlights: ['Maximizes saturation at close range.'],
      },
    ],
  },
  // The Harmonic's beam stays one; the other weapons grow their own way.
  weaponText: {
    harmonic: {
      levels: [
        {
          description:
            'Fires one additional lance per sequence; the beam stays single.',
        },
        {
          description:
            'Adds a third lance per sequence; the beam stays single.',
        },
        {
          description:
            'Includes a fourth lance per sequence; the beam stays single.',
        },
      ],
    },
    scatter: ranks(
      (extra) =>
        `${another(extra)} flak bolt per volley: ${fan.bolts + extra} in the fan.`,
      ['A denser wall of flak.']
    ),
    'furnace-corona': ranks(
      (extra) =>
        `The ring reaches ${corona.growth} px further: ${corona.radius + corona.growth * extra} px.`,
      ['No extra pulses: the ring only grows.']
    ),
    'shard-halo': ranks(
      (extra) =>
        `${another(extra)} blade: ${halo.blades + extra} circle the ship.`,
      ['Each blade cuts on its own.']
    ),
    'arc-caster': ranks(
      (extra) => `Each cast jumps once more: ${cast.jumps + extra} jumps.`,
      [
        `Each jump hits for ${Math.round(cast.falloff * 100)}% of the one before.`,
      ]
    ),
    'seeker-swarm': ranks(
      (extra) =>
        `${another(extra)} missile per salvo: ${salvo.missiles + extra}.`,
      ['Each missile takes a target of its own while there are enough.']
    ),
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-multishot',
          payload: { bonus: 1 },
        },
      ],
    },
    {
      rank: 2,
      effects: [
        {
          type: 'event',
          event: 'upgrade-multishot',
          payload: { bonus: 1 },
        },
      ],
    },
    {
      rank: 3,
      effects: [
        {
          type: 'event',
          event: 'upgrade-multishot',
          payload: { bonus: 1 },
        },
      ],
    },
  ],
};
