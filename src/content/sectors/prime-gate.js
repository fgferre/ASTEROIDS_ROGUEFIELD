// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// won at its Warden (no `boss`: Warden Prime ends it). Its stages are the
// gate's garrison, not drifting scrap: each one drills a piece of what Prime
// does (aimed shots, bursts, the charge, being circled), in ordered ranks.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'prime-gate',
  order: 3,
  chapter: 1,
  code: 'C',
  name: 'PRIME GATE',
  biome: 'outer-ring',
  layers: [1, 5],
  headStart: 5, // proposta 12/11: entered from the map, a ship that came through the two sectors before has about this
  look: { backdrop: 'prime-gate' },
  // proposta 12/11: every number below
  stages: [
    // The picket: Drones in a rank, then on patrol (Prime's aimed shots).
    {
      rocks: rockCurve(1),
      roster: [{ role: 'skirmisher', count: 1, from: 20, every: 14, elite: 0 }],
      surges: [],
      formations: [
        formation('sweep', {
          role: 'skirmisher',
          count: 3,
          at: 10,
          spacing: 180,
          speed: 120,
        }),
      ],
      events: [],
      warden: false,
    },
    // The watch: a Hunter circles and fires bursts (Prime's volleys).
    {
      rocks: rockCurve(2),
      roster: [{ role: 'sniper', count: 1, from: 12, every: 24, elite: 0 }],
      surges: [],
      formations: [formation('swarm', { role: 'swarmer', count: 5, at: 26 })],
      events: [fieldEvent('sensor-jam', 30)],
      warden: false,
    },
    // The drill: Rams charge down marked lines (Prime's charge) while a ring
    // of Drones closes in (Prime circling the ship).
    {
      rocks: rockCurve(3),
      roster: [{ role: 'charger', count: 1, from: 10, every: 16, elite: 0 }],
      surges: [{ at: 40, roles: ['charger'], count: 3, label: 'Ram charge' }],
      formations: [
        formation('ring', {
          role: 'skirmisher',
          count: 6,
          at: 24,
          radius: 260,
        }),
      ],
      events: [],
      warden: false,
    },
    // The garrison turns out: all of it at once, in a closing wall.
    {
      rocks: rockCurve(4),
      roster: [
        { role: 'skirmisher', count: 2, from: 8, every: 10, elite: 0 },
        { role: 'sniper', count: 1, from: 16, every: 22, elite: 0.1 },
      ],
      surges: [{ at: 38, roles: ['charger'], count: 3, label: 'Ram charge' }],
      formations: [formation('wall', { role: 'skirmisher', count: 5, at: 22 })],
      events: [fieldEvent('gravity-well', 30)],
      warden: false,
    },
    {
      rocks: rockCurve(5),
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: true,
    },
  ],
};
