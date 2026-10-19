// src/data/layers.js

import RandomService from '../core/RandomService.js';
import { listContent } from '../content/registry.js';
import { deepFreeze } from '../utils/deepFreeze.js';
import { bossKindForLayer } from './enemies/boss.js';
import { MAX_ASTEROIDS_ON_SCREEN } from './constants/gameplay.js';
import { FIELD_EVENTS, fieldEvent, rockCurve } from './layerParts.js';

export { FIELD_EVENTS };

// What spawns on each layer of the run (docs/NORTE.md section 4). Every
// number here is a proposta 17/10 — the owner's play decides.
//
// rocks: asteroids the legacy spawner feeds in over the layer.
// roster: support enemies trickling in, each entry asking for a `role`
//   (enemiesFor); the first at `from` seconds into the layer, then one every
//   `every` seconds until `count` have spawned; each rolls Elite with chance
//   `elite`.
// surges: a burst of `count` enemies (roles taken in turn; 'asteroid' is
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

/**
 * Layer modifiers (proposta 18/10): from layer MODIFIER_FROM on, every layer
 * rolls one, announced by a "MODIFIER" banner in its `color`. Dense Fog: the
 * radar reaches `radarRange` of its usual range. Magnetic Storm: every XP
 * spark drifts at `driftSpeed` px/s, turning up to `driftTurn` rad/s at
 * random, and the ship's pull is ×`pullScale`. Hunters' Moon: the roster is
 * only `roles` (Seekers' and Rams'), each count ×`countScale`; surges keep
 * their size with those roles. Glass Field: every rock spawns Volatile.
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
    roles: ['sniper', 'charger'],
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

// One file per layer in src/content/stages/, listed by `order` (index = layer
// − 1). The registry's `id` and `order` stay out of the entries: the Director
// reads, and `beyond` copies, only the fields described above.
export const LAYERS = deepFreeze(
  listContent('stages').map(({ id: _id, order: _order, ...layer }) => layer)
);

/**
 * The enemies that fill a `role` on `layer`: every src/content/enemies item
 * whose `roles` name it and whose `fromLayer` (default 1) has come, in
 * registry order. When there are several, the director draws one by `weight`
 * (default 1) for each spawn (LayerSchedule).
 */
export function enemiesFor(role, layer) {
  return listContent('enemies').filter(
    ({ roles, fromLayer = 1 }) => roles.includes(role) && fromLayer <= layer
  );
}

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

// Boss Rush: the three Wardens back to back, each on its own layer (biome,
// music, Warden kind and HP scaling follow the layer) with only its escort
// and BOSS_RUSH_ROCKS rocks; GameSessionService.bossRush turns it on.
export const BOSS_RUSH_LAYERS = deepFreeze([5, 10, 15]);
const BOSS_RUSH_ROCKS = 3; // proposta 18/10
// The calm after each Warden but the last (one card pick, the next title).
export const BOSS_RUSH_BREATHER_SECONDS = 8; // proposta 18/10

/** The Boss Rush stage (1-based) whose Warden holds `layer`, else 0. */
export function bossRushStage(layer) {
  return BOSS_RUSH_LAYERS.indexOf(layer) + 1;
}

/** The Warden layer Boss Rush plays after `layer` (0: the first). */
export function nextBossRushLayer(layer) {
  return BOSS_RUSH_LAYERS.find((n) => n > layer);
}

/** A layer's entry on Boss Rush: no surges or events, BOSS_RUSH_ROCKS rocks. */
export function bossRushDirectorFor(layer) {
  return deepFreeze({
    ...directorFor(layer),
    rocks: BOSS_RUSH_ROCKS,
    surges: [],
    events: [],
  });
}

/** 'WARDEN 2 OF 3 — CHOIR' for stage 2. */
export function bossRushStageTitle(stage) {
  const kind = bossKindForLayer(BOSS_RUSH_LAYERS[stage - 1]);
  return `WARDEN ${stage} OF ${BOSS_RUSH_LAYERS.length} — ${kind.toUpperCase()}`;
}
