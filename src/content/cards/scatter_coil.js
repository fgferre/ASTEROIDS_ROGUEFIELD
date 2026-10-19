import scatter from '../weapons/scatter.js';

export default {
  id: 'scatter_coil',
  order: 9,
  category: 'offense',
  family: 'kinetic',
  rarity: 'epic',
  icon: '🎆',
  themeColor: scatter.colors.burst,
  unlockLevel: 3,
  tags: ['weapon', 'weaponry'],
  excludes: ['harmonic_resonator'],
  text: {
    name: 'Scatter Coil',
    summary:
      'Swaps the cannon for the Scatter Coil: a fan of short flak bolts that burst into shrapnel.',
    lore: "A Ring miner's blasting coil, rewound to throw its charges at anything that moves.",
    levels: [
      {
        title: 'Scatter Coil',
        description: `Fires ${scatter.flak.bolts} bolts in a ${scatter.flak.fan}° fan; each bursts on its first hit or at ${scatter.flak.range} px, hitting everything within ${scatter.flak.burstRadius} px.`,
        highlights: [
          `Multishot adds bolts to the fan, up to ${scatter.flak.maxBolts}.`,
          'Slower volleys than the lance: get close.',
        ],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [
        {
          type: 'event',
          event: 'upgrade-weapon-scatter',
          payload: { weaponId: scatter.id },
        },
      ],
    },
  ],
};
