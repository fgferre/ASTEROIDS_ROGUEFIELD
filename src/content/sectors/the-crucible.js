// A sector: the campaign's last chapter, one sector long, in its own place
// (the `crucible` biome, past the run's layers), won at Sovereign. Its
// stages call back the three chapters in turn (the Outer Ring's drones and
// swarms, the Core's casters, the Reach's Shades and Seekers),
// then all of them at once before the centre.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'the-crucible',
  order: 10,
  chapter: 4,
  code: 'A',
  name: 'THE CRUCIBLE',
  biome: 'crucible',
  layers: [16, 20],
  // proposta 12/11: the level the good bot reaches by the end of the Null
  // Boundary (26 at Warden Null, 27 after it).
  headStart: 26,
  boss: 'sovereign',
  // proposta 12/11: every number below
  stages: [
    {
      rocks: rockCurve(16),
      roster: [
        { role: 'skirmisher', count: 3, from: 6, every: 9, elite: 0.1 },
        { role: 'charger', count: 2, from: 14, every: 16, elite: 0 },
      ],
      surges: [],
      formations: [formation('swarm', { role: 'swarmer', count: 8, at: 20 })],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(17),
      roster: [
        { role: 'artillery', count: 1, from: 10, every: 16, elite: 0 },
        { role: 'skirmisher', count: 3, from: 8, every: 10, elite: 0.1 },
        { role: 'carrier', count: 1, from: 20, every: 20, elite: 0 },
      ],
      surges: [],
      formations: [],
      events: [fieldEvent('solar-flare', 35)],
      warden: false,
    },
    {
      rocks: rockCurve(18),
      roster: [
        { role: 'marksman', count: 1, from: 10, every: 16, elite: 0 },
        { role: 'flanker', count: 2, from: 14, every: 18, elite: 0 },
      ],
      surges: [],
      formations: [
        formation('sweep', {
          role: 'minelayer',
          count: 3,
          at: 18,
          spacing: 200,
          speed: 110,
        }),
      ],
      events: [],
      warden: false,
      herald: 'heat',
    },
    {
      rocks: rockCurve(19),
      roster: [
        { role: 'support', count: 1, from: 10, every: 30, elite: 0 },
        { role: 'sniper', count: 2, from: 8, every: 14, elite: 0.2 },
        { role: 'tank', count: 2, from: 12, every: 20, elite: 0.2 },
        { role: 'artillery', count: 1, from: 20, every: 20, elite: 0 },
      ],
      surges: [
        {
          at: 40,
          roles: ['flanker', 'charger'],
          count: 4,
          label: 'Ring guard',
        },
      ],
      formations: [formation('ring', { role: 'swarmer', count: 10, at: 28 })],
      events: [fieldEvent('gravity-well', 35)],
      warden: false,
    },
    {
      rocks: rockCurve(20),
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: true,
    },
  ],
};
