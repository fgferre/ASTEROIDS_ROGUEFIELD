// The new flight only (`newFlight`, the default; `?direcao=antiga` is the old one): the run starts with the
// cannon fixed on the nose, aimed by turning the hull; this card frees the
// turret onto today's auto aim. Family, rarity and level: proposta 16/11, the
// cards' own conversation settles where it sits in a run.
export default {
  id: 'auto_aim',
  newFlight: true,
  order: 46,
  category: 'offense',
  family: 'maneuver',
  rarity: 'common',
  icon: '🎯',
  themeColor: '#FFD166',
  unlockLevel: 2,
  tags: ['aim', 'turret'],
  text: {
    name: 'Auto Turret',
    summary:
      'Frees the cannon from the nose: the turret turns on its own onto the nearest threat.',
    lore: 'A salvaged fire-control servo. The hull goes where you steer; the gun goes where the danger is.',
    levels: [
      {
        title: 'Free Turret',
        description:
          'The cannon no longer fires only where the nose points: it locks and tracks targets on its own.',
        highlights: ['Fly one way, shoot the other.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [{ type: 'event', event: 'upgrade-auto-aim', payload: {} }],
    },
  ],
};
