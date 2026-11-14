// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// with its own stages and its own end boss.
import {
  ROCKFALL,
  fieldEvent,
  formation,
  rockCurve,
} from '../../data/layerParts.js';

export default {
  id: 'salvage-lanes',
  order: 2,
  chapter: 1,
  code: 'B',
  name: 'SALVAGE LANES',
  biome: 'outer-ring',
  layers: [1, 5],
  headStart: 2, // proposta 12/11: entered from the map, a ship that came through the sector before has about this
  // proposta 12/11: a shipping lane picked clean, under teal work lights.
  look: {
    backdrop: 'salvage-lanes',
    sky: ['#05100e', '#010504'],
    hazeColor: '#2f8a7e',
    hazeDensity: 1.15,
    veinColor: '#7ce0c0',
    veinDensity: 0.12,
    dustColor: '#bfe8dc',
    keyColor: '#f0fff8',
    fillColor: '#3f7a70',
    debris: 0.5,
    structures: 0.7,
    tint: 'rgba(60, 170, 150, 0.06)',
  },
  boss: 'gatekeeper',
  // proposta 12/11: every number below
  stages: [
    {
      rocks: rockCurve(1),
      roster: [{ role: 'skirmisher', count: 1, from: 12, every: 14, elite: 0 }],
      surges: [ROCKFALL],
      // The schedule still runs: a convoy of Drones crosses on its lane.
      formations: [
        formation('sweep', {
          role: 'skirmisher',
          count: 3,
          at: 24,
          spacing: 180,
          speed: 120,
        }),
      ],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(2),
      roster: [{ role: 'charger', count: 1, from: 20, every: 20, elite: 0 }],
      surges: [],
      formations: [
        formation('sweep', {
          role: 'minelayer',
          count: 2,
          at: 12,
          spacing: 200,
          speed: 110,
        }),
      ],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(3),
      roster: [],
      surges: [{ at: 35, roles: ['charger'], count: 3, label: 'Ram charge' }],
      formations: [formation('wall', { role: 'skirmisher', count: 5, at: 15 })],
      events: [fieldEvent('sensor-jam', 25)],
      warden: false,
    },
    {
      rocks: rockCurve(4),
      roster: [{ role: 'charger', count: 2, from: 8, every: 12, elite: 0.1 }],
      surges: [],
      formations: [
        formation('sweep', {
          role: 'minelayer',
          count: 3,
          at: 20,
          spacing: 200,
          speed: 110,
        }),
      ],
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
