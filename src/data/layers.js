// src/data/layers.js

import RandomService from '../core/RandomService.js';
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
// events: field events at `at` seconds into the layer (never on a Warden
//   layer), announced by an amber "EVENT" banner with the event's label; what
//   each does and for how long is in FIELD_EVENTS.
// warden: the layer's boss; it brings its own minions.
// herald: (layers 3, 8, 13) the kind of Herald (src/data/enemies/herald.js)
//   that arrives HERALD_SPAWN_AT seconds into the layer; the layer holds
//   until it dies.
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

/**
 * Field events (proposta 18/10). Gravity Well: every XP spark drifts to a
 * point `minDistance`–`maxDistance` px from the ship (`pullSpeed` px/s, faster
 * by `pullAcceleration` each second). Solar Flare: every enemy stunned for the
 * duration. Sensor Jam: the radar shows noise.
 */
export const FIELD_EVENTS = deepFreeze({
  'gravity-well': {
    label: 'Gravity Well',
    duration: 8,
    pullSpeed: 40,
    pullAcceleration: 20,
    minDistance: 220,
    maxDistance: 320,
  },
  'solar-flare': { label: 'Solar Flare', duration: 1 },
  'sensor-jam': { label: 'Sensor Jam', duration: 10 },
});

const fieldEvent = (kind, at) => ({
  at,
  kind,
  label: FIELD_EVENTS[kind].label,
});

/**
 * Layer modifiers (proposta 18/10): from layer MODIFIER_FROM on, every layer
 * rolls one, announced by a "MODIFIER" banner in its `color`. Dense Fog: the
 * radar reaches `radarRange` of its usual range. Magnetic Storm: every XP
 * spark drifts at `driftSpeed` px/s, turning up to `driftTurn` rad/s at
 * random, and the ship's pull is ×`pullScale`. Hunters' Moon: the roster is
 * only `kinds` (Seekers and Rams), each count ×`countScale`; surges keep their
 * size with those kinds. Glass Field: every rock spawns Volatile.
 */
export const MODIFIER_FROM = 16;
export const LAYER_MODIFIERS = deepFreeze({
  'dense-fog': { label: 'Dense Fog', color: '#818cf8', radarRange: 0.5 },
  'magnetic-storm': {
    label: 'Magnetic Storm',
    color: '#2dd4bf',
    driftSpeed: 45,
    driftTurn: 6,
    pullScale: 0.6,
  },
  'hunters-moon': {
    label: "Hunters' Moon",
    color: '#a5b4fc',
    kinds: ['hunter', 'ram'],
    countScale: 1.3,
  },
  'glass-field': { label: 'Glass Field', color: '#5eead4' },
});

/**
 * The modifier id of a layer (null before MODIFIER_FROM), rolled from the run
 * seed and the layer; never the same as the layer before.
 */
export function modifierFor(layer, runSeed = 0) {
  let modifier = null;
  for (let n = MODIFIER_FROM; n <= layer; n += 1) {
    modifier = new RandomService(`layer-modifier:${runSeed}:${n}`).pick(
      Object.keys(LAYER_MODIFIERS).filter((id) => id !== modifier)
    );
  }
  return modifier;
}

const ROCKFALL = { at: 40, kinds: ['asteroid'], count: 6, label: 'Rockfall' };

export const LAYERS = deepFreeze([
  // 1–3: rock only.
  {
    rocks: rockCurve(1),
    roster: [],
    surges: [ROCKFALL],
    events: [],
    warden: false,
  },
  {
    rocks: rockCurve(2),
    roster: [],
    surges: [ROCKFALL],
    events: [fieldEvent('sensor-jam', 25)],
    warden: false,
  },
  {
    rocks: rockCurve(3),
    roster: [],
    surges: [ROCKFALL],
    events: [],
    warden: false,
    herald: 'dust',
  },
  // 4: the first Motes, in small swarms.
  {
    rocks: rockCurve(4),
    roster: [{ kind: 'drone', count: 2, from: 8, every: 8, elite: 0 }],
    surges: [
      { at: 20, kinds: ['drone'], count: 4, label: 'Mote swarm' },
      { at: 40, kinds: ['drone'], count: 5, label: 'Mote swarm' },
    ],
    events: [fieldEvent('gravity-well', 30)],
    warden: false,
  },
  // 5: first Warden.
  { rocks: rockCurve(5), roster: [], surges: [], events: [], warden: true },
  // 6–7: Motes and Husks; Tethers from 7.
  {
    rocks: rockCurve(6),
    roster: [
      { kind: 'drone', count: 4, from: 5, every: 6, elite: 0.05 },
      { kind: 'husk', count: 2, from: 15, every: 12, elite: 0.05 },
    ],
    surges: [{ at: 35, kinds: ['drone'], count: 6, label: 'Mote swarm' }],
    events: [],
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
    events: [fieldEvent('solar-flare', 35)],
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
    events: [],
    warden: false,
    herald: 'heat',
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
    events: [fieldEvent('sensor-jam', 20), fieldEvent('gravity-well', 45)],
    warden: false,
  },
  // 10: Warden, Motes trickling in.
  {
    rocks: rockCurve(10),
    roster: [{ kind: 'drone', count: 4, from: 10, every: 8, elite: 0.1 }],
    surges: [],
    events: [],
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
    events: [],
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
    events: [fieldEvent('solar-flare', 30)],
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
    events: [fieldEvent('gravity-well', 25)],
    warden: false,
    herald: 'silence',
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
    events: [fieldEvent('solar-flare', 20), fieldEvent('sensor-jam', 40)],
    warden: false,
  },
  // 15: the final Warden with a Seeker escort.
  {
    rocks: rockCurve(15),
    roster: [{ kind: 'hunter', count: 2, from: 3, every: 2, elite: 0.3 }],
    surges: [],
    events: [],
    warden: true,
  },
]);

/** Endless-run growth per layer past 14 (proposta 18/10). */
const BEYOND_ROCKS_PER_LAYER = 2;
const BEYOND_ROSTER_GROWTH = 1.08;
const BEYOND_ELITE_PER_LAYER = 0.03;
const BEYOND_ELITE_CAP = 0.5;
const BEYOND_EVENT_AT = 30;

/**
 * Past the last layer (the run turned endless): a Warden every 5th layer with
 * layer 15's escort, the rest built on layer 14. Counted from 14: rocks +2 per
 * layer (capped at the on-screen limit), roster counts ×1.08 per layer, elite
 * chance +0.03 per layer up to 0.5. Non-Warden layers get one field event at
 * 30 s, its kind rolled from a seed per layer. Every layer carries its
 * modifier id (modifierFor).
 */
function beyond(layer, runSeed) {
  const steps = layer - 14;
  const base = layer % 5 === 0 ? LAYERS[14] : LAYERS[13];
  const elite = Math.min(
    BEYOND_ELITE_CAP,
    LAYERS[13].roster[0].elite + BEYOND_ELITE_PER_LAYER * steps
  );
  return deepFreeze({
    ...base,
    rocks: Math.min(
      MAX_ASTEROIDS_ON_SCREEN,
      rockCurve(14) + BEYOND_ROCKS_PER_LAYER * steps
    ),
    roster: base.roster.map((entry) => ({
      ...entry,
      count: Math.round(entry.count * Math.pow(BEYOND_ROSTER_GROWTH, steps)),
      elite,
    })),
    events: base.warden
      ? []
      : [
          fieldEvent(
            new RandomService(`field-event:${layer}`).pick(
              Object.keys(FIELD_EVENTS)
            ),
            BEYOND_EVENT_AT
          ),
        ],
    modifier: modifierFor(layer, runSeed),
  });
}

/**
 * The table entry for a layer (1-based); layers past the table use `beyond`,
 * whose modifier rolls from `runSeed`.
 */
export function directorFor(layer, runSeed = 0) {
  const n = Math.max(1, Math.floor(Number(layer) || 1));
  return n <= LAYERS.length ? LAYERS[n - 1] : beyond(n, runSeed);
}
