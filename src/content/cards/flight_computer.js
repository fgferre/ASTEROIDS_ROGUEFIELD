// The new flight only (`newFlight`, the default; `?direcao=antiga` is the old one): the last piloting card.
// The run starts in classic glide flight; this card brings today's modern
// flight, after a briefing that pauses the run and waits for Enter
// (ui/FlightBriefing.js). What it asks for is a balance number (proposta
// 16/11: Braking System 3 and RCS System 3, with the Auto Turret), the
// owner's to judge by playing.
export default {
  id: 'flight_computer',
  newFlight: true,
  order: 47,
  category: 'mobility',
  family: 'kinetic',
  rarity: 'epic',
  icon: '🧭',
  themeColor: '#5DADE2',
  unlockLevel: 1,
  tags: ['control', 'maneuvers'],
  prerequisites: [
    {
      type: 'upgrade',
      id: 'braking_system',
      level: 3,
      text: 'Requires Braking System at Lv. 3.',
    },
    {
      type: 'upgrade',
      id: 'rcs_system',
      level: 3,
      text: 'Requires RCS System at Lv. 3.',
    },
    // Modern flight faces the motion: without the turret it would fire only
    // where the ship goes.
    {
      type: 'upgrade',
      id: 'auto_aim',
      level: 1,
      text: 'Requires Auto Turret.',
    },
  ],
  text: {
    name: 'Flight Computer',
    summary:
      'Takes the helm: fly in any direction with the keys, the hull holds still when you let go.',
    lore: 'The last piece of the salvaged cockpit. Every thruster answers one hand at last.',
    levels: [
      {
        title: 'Vector Flight',
        description:
          'W A S D move the ship up, left, down and right, wherever the nose points. No more drifting: letting go stops the ship.',
        highlights: ['A briefing shows the new keys before the fight goes on.'],
      },
    ],
  },
  levels: [
    {
      rank: 1,
      effects: [{ type: 'event', event: 'upgrade-modern-flight', payload: {} }],
    },
  ],
};
