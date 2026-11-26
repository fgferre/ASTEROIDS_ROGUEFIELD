// src/core/runMode.js
//
// The kind of run being played, settled once when the run starts
// (GameSessionService.startNewRun): the Descent, the Daily Field, the Boss
// Rush or a sector of the campaign. Whoever kept a copy of bossRush, sector
// or daily asks this object instead (item 8 of the audits, 26/11). Each
// answer is named after the question it settles; where the game answers two
// questions differently, they keep two names even where they agree.
//
// The Daily Field is the Descent with today's seed: it is built from the
// Descent's answers and changes only the ones listed where it is made.
//
// Not here: how a run was launched. The story only from the campaign map's
// launch button, the journey only from the map or the victory's Next
// Sector, New Mission keeping the last mode, an armed replay winning over
// the mode picked: those are rules of the launch (runCinematics.js,
// menuButtons.js, GameSessionService.startNewRun).

import { RUN_FINAL_LAYER } from '../data/constants/gameplay.js';
import { DAILY_DIFFICULTY } from '../data/difficulty.js';
import {
  BOSS_RUSH_LAYERS,
  bossRushDirectorFor,
  directorFor,
  nextBossRushLayer,
} from '../data/layers.js';
import { sectorById, sectorStage } from '../data/sectors.js';

const DESCENT = Object.freeze({
  kind: 'descent',
  /** The campaign sector played (src/data/sectors.js), or null. */
  sector: null,
  /** The run's first layer. */
  firstLayer: 1,
  /** Levels taken before the first layer (a late sector's head start). */
  headStart: 0,
  /** The layer whose Warden wins the run. */
  lastLayer: RUN_FINAL_LAYER,
  /** The layer that follows `layer` (0 before the first). */
  nextLayer: (layer) => Math.max(layer + 1, 1),
  /**
   * `layer`'s plan before the difficulty scales it: a sector's own stage, else
   * the table's (past it, endless modifiers rolled from `seed`).
   */
  layerPlan: (layer, seed) => directorFor(layer, seed),
  /** After `layer`, the Warden a breather leads to, or none. */
  breatherTo: () => null,
  /** A Warden before the last one gives a card pick. */
  wardensGivePicks: false,
  /** The run is scored by the Wardens it kills (record, Salvage). */
  scoredByWardens: false,
  /** Won, the run can go on past its last Warden (the Deep Field). */
  goesOnAfterVictory: true,
  /** Each layer start and the run's end write the deepest-layer record. */
  writesLayerRecord: true,
  /** Each layer start writes the Boss Rush stage, a clear its time. */
  writesRushRecord: false,
  /** A clear writes the sector won and its time. */
  writesSectorRecord: false,
  /** The run flies today's seed. */
  usesTodaysSeed: false,
  /** The preset every run of this kind flies, whatever was chosen, or null. */
  forcedDifficulty: null,
  /** Its layers count for the layer medals (First Light, Deep Field). */
  layersCountForMedals: true,
  /** A win counts as the First Victory (the medal opens the Pressure ladder). */
  winCountsAsFirstVictory: true,
  /** A win counts for the challenge medals (Null and Void, Cursed Run, Iron Escort). */
  winCountsForChallengeMedals: true,
  /** A won run counts on the Hangar's Pressure ladder. */
  winClimbsPressure: true,
  /** The run's end writes today's Daily Field record. */
  writesTodaysRecord: false,
  /** The mode a recording of the run keeps (src/core/replay.js). */
  replayMode: 'normal',
});

const DAILY = Object.freeze({
  ...DESCENT,
  kind: 'daily',
  usesTodaysSeed: true,
  forcedDifficulty: DAILY_DIFFICULTY,
  writesTodaysRecord: true,
  replayMode: 'daily',
});

const BOSS_RUSH = Object.freeze({
  ...DESCENT,
  kind: 'bossRush',
  firstLayer: BOSS_RUSH_LAYERS[0],
  nextLayer: (layer) => nextBossRushLayer(layer),
  layerPlan: (layer) => bossRushDirectorFor(layer),
  breatherTo: (layer) => nextBossRushLayer(layer),
  wardensGivePicks: true,
  scoredByWardens: true,
  goesOnAfterVictory: false,
  writesLayerRecord: false,
  writesRushRecord: true,
  layersCountForMedals: false,
  winCountsAsFirstVictory: false,
  winClimbsPressure: false,
  replayMode: 'bossRush',
});

function sectorMode(sector) {
  return Object.freeze({
    ...DESCENT,
    kind: 'sector',
    sector,
    firstLayer: sector.layers[0],
    headStart: sector.headStart ?? 0,
    lastLayer: sector.layers[1],
    nextLayer: (layer) => Math.max(layer + 1, sector.layers[0]),
    layerPlan: (layer, seed) =>
      sectorStage(sector, layer) ?? directorFor(layer, seed),
    goesOnAfterVictory: false,
    writesLayerRecord: false,
    writesSectorRecord: true,
    winCountsForChallengeMedals: false,
  });
}

/**
 * The mode a run starts in. `sector` (an id) starts that sector, never daily
 * nor Boss Rush; `bossRush` and `daily` true pick those. Left undefined, each
 * keeps what `previous` had (New Mission), except that a sector is dropped
 * once `daily` or `bossRush` is given (a mode picked without a sector).
 */
export function runModeFor(
  { daily, bossRush, sector } = {},
  previous = DESCENT
) {
  const picked =
    sector !== undefined || daily !== undefined || bossRush !== undefined;
  const place = picked ? sectorById(sector ?? null) : previous.sector;
  if (place) return sectorMode(place);
  if (bossRush ?? previous.kind === 'bossRush') return BOSS_RUSH;
  if (daily ?? previous.kind === 'daily') return DAILY;
  return DESCENT;
}

/** The options that start the run a recording kept (its `replayMode`). */
export function replayModeOptions(replayMode) {
  return { daily: replayMode === 'daily', bossRush: replayMode === 'bossRush' };
}

/** The mode before any run is played. */
export const FIRST_RUN_MODE = DESCENT;
