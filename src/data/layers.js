// src/data/layers.js

import { deepFreeze } from '../utils/deepFreeze.js';
import {
  ASTEROIDS_PER_WAVE_BASE,
  ASTEROIDS_PER_WAVE_MULTIPLIER,
  MAX_ASTEROIDS_ON_SCREEN,
} from './constants/gameplay.js';

// What spawns on each layer of the run (docs/NORTE.md section 4). Every
// number here is a proposta 17/10 — the owner's play decides.
//
// rocks: asteroids the legacy spawner feeds in over the layer.
// roster: support enemies trickling in; the first at `from` seconds into the
//   layer, then one every `every` seconds until `count` have spawned; each
//   rolls Elite with chance `elite`.
// surges: a burst of `count` enemies (kinds taken in turn; asteroids are
//   small rocks) at `at` seconds, from the field edge away from the player,
//   announced by a "SURGE" banner with `label`.
// warden: the layer's boss; it brings its own minions.
// A layer ends once everything listed has spawned and died; when the field
// empties early, the next scheduled spawn comes at once.

/** Today's rock curve, floor(6 × 1.26^(layer − 1)) capped at 40. */
function rockCurve(layer) {
  return Math.min(
    MAX_ASTEROIDS_ON_SCREEN,
    Math.floor(
      ASTEROIDS_PER_WAVE_BASE *
        Math.pow(ASTEROIDS_PER_WAVE_MULTIPLIER, layer - 1)
    )
  );
}

const ROCKFALL = { at: 40, kinds: ['asteroid'], count: 6, label: 'Rockfall' };

export const LAYERS = deepFreeze([
  // 1–3: rock only.
  { rocks: rockCurve(1), roster: [], surges: [ROCKFALL], warden: false },
  { rocks: rockCurve(2), roster: [], surges: [ROCKFALL], warden: false },
  { rocks: rockCurve(3), roster: [], surges: [ROCKFALL], warden: false },
  // 4: the first Motes, in small swarms.
  {
    rocks: rockCurve(4),
    roster: [{ kind: 'drone', count: 2, from: 8, every: 8, elite: 0 }],
    surges: [
      { at: 20, kinds: ['drone'], count: 4, label: 'Mote swarm' },
      { at: 40, kinds: ['drone'], count: 5, label: 'Mote swarm' },
    ],
    warden: false,
  },
  // 5: first Warden.
  { rocks: rockCurve(5), roster: [], surges: [], warden: true },
  // 6–7: Motes and Husks; Tethers from 7.
  {
    rocks: rockCurve(6),
    roster: [
      { kind: 'drone', count: 4, from: 5, every: 6, elite: 0.05 },
      { kind: 'husk', count: 2, from: 15, every: 12, elite: 0.05 },
    ],
    surges: [{ at: 35, kinds: ['drone'], count: 6, label: 'Mote swarm' }],
    warden: false,
  },
  {
    rocks: rockCurve(7),
    roster: [
      { kind: 'drone', count: 4, from: 5, every: 6, elite: 0.05 },
      { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.05 },
      { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.05 },
    ],
    surges: [{ at: 35, kinds: ['drone'], count: 6, label: 'Mote swarm' }],
    warden: false,
  },
  // 8–9: Rams join.
  {
    rocks: rockCurve(8),
    roster: [
      { kind: 'drone', count: 5, from: 5, every: 5, elite: 0.08 },
      { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.08 },
      { kind: 'ram', count: 2, from: 12, every: 10, elite: 0.08 },
      { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.08 },
    ],
    surges: [{ at: 30, kinds: ['ram'], count: 3, label: 'Ram pack' }],
    warden: false,
  },
  {
    rocks: rockCurve(9),
    roster: [
      { kind: 'drone', count: 5, from: 5, every: 5, elite: 0.08 },
      { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.08 },
      { kind: 'ram', count: 3, from: 12, every: 9, elite: 0.08 },
      { kind: 'mine', count: 3, from: 15, every: 10, elite: 0.08 },
    ],
    surges: [{ at: 30, kinds: ['ram'], count: 4, label: 'Ram pack' }],
    warden: false,
  },
  // 10: Warden, Motes trickling in.
  {
    rocks: rockCurve(10),
    roster: [{ kind: 'drone', count: 4, from: 10, every: 8, elite: 0.1 }],
    surges: [],
    warden: true,
  },
  // 11–12: Seekers and Bulwarks.
  {
    rocks: rockCurve(11),
    roster: [
      { kind: 'drone', count: 4, from: 5, every: 6, elite: 0.1 },
      { kind: 'husk', count: 2, from: 10, every: 12, elite: 0.1 },
      { kind: 'ram', count: 2, from: 12, every: 10, elite: 0.1 },
      { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.1 },
      { kind: 'hunter', count: 2, from: 10, every: 12, elite: 0.1 },
      { kind: 'bulwark', count: 1, from: 20, every: 1, elite: 0.1 },
    ],
    surges: [{ at: 30, kinds: ['drone'], count: 8, label: 'Mote swarm' }],
    warden: false,
  },
  {
    rocks: rockCurve(12),
    roster: [
      { kind: 'drone', count: 4, from: 5, every: 6, elite: 0.15 },
      { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.15 },
      { kind: 'ram', count: 2, from: 12, every: 10, elite: 0.15 },
      { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.15 },
      { kind: 'hunter', count: 3, from: 8, every: 10, elite: 0.15 },
      { kind: 'bulwark', count: 2, from: 15, every: 15, elite: 0.15 },
    ],
    surges: [{ at: 30, kinds: ['ram'], count: 5, label: 'Ram pack' }],
    warden: false,
  },
  // 13–14: everything, Weavers included.
  {
    rocks: rockCurve(13),
    roster: [
      { kind: 'drone', count: 5, from: 5, every: 5, elite: 0.2 },
      { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.2 },
      { kind: 'ram', count: 3, from: 12, every: 9, elite: 0.2 },
      { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.2 },
      { kind: 'hunter', count: 3, from: 8, every: 10, elite: 0.2 },
      { kind: 'bulwark', count: 2, from: 15, every: 15, elite: 0.2 },
      { kind: 'weaver', count: 2, from: 15, every: 12, elite: 0.2 },
    ],
    surges: [
      {
        at: 30,
        kinds: ['drone', 'ram', 'hunter', 'husk'],
        count: 8,
        label: 'Full field',
      },
    ],
    warden: false,
  },
  {
    rocks: rockCurve(14),
    roster: [
      { kind: 'drone', count: 6, from: 5, every: 5, elite: 0.3 },
      { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.3 },
      { kind: 'ram', count: 3, from: 12, every: 9, elite: 0.3 },
      { kind: 'mine', count: 3, from: 15, every: 10, elite: 0.3 },
      { kind: 'hunter', count: 4, from: 8, every: 8, elite: 0.3 },
      { kind: 'bulwark', count: 2, from: 15, every: 15, elite: 0.3 },
      { kind: 'weaver', count: 3, from: 15, every: 10, elite: 0.3 },
    ],
    surges: [
      {
        at: 30,
        kinds: ['drone', 'ram', 'hunter', 'husk'],
        count: 10,
        label: 'Full field',
      },
    ],
    warden: false,
  },
  // 15: the final Warden with a Seeker escort.
  {
    rocks: rockCurve(15),
    roster: [{ kind: 'hunter', count: 2, from: 3, every: 2, elite: 0.3 }],
    surges: [],
    warden: true,
  },
]);

/**
 * Past the last layer (only if the run turns endless): Wardens every 5th
 * layer as on 15, the rest as on 14 with one more of each roster kind every
 * 2 layers and +1 % elite chance per layer, capped at 40 %.
 */
function beyond(layer) {
  if (layer % 5 === 0) {
    return LAYERS[14];
  }
  const base = LAYERS[13];
  const extra = Math.floor((layer - 14) / 2);
  const elite = Math.min(0.4, 0.3 + 0.01 * (layer - 14));
  return deepFreeze({
    ...base,
    rocks: rockCurve(layer),
    roster: base.roster.map((entry) => ({
      ...entry,
      count: entry.count + extra,
      elite,
    })),
  });
}

/** The table entry for a layer (1-based); layers past the table use `beyond`. */
export function directorFor(layer) {
  const n = Math.max(1, Math.floor(Number(layer) || 1));
  return n <= LAYERS.length ? LAYERS[n - 1] : beyond(n);
}
