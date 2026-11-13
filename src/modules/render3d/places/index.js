// The places' backdrop sets (docs/ROTEIRO.md "Os lugares"), by the name a
// sector's look gives as `backdrop` (src/content/sectors/). `build` makes the
// set (placeSets.js), `hazeDepth` how deep its surfaces sink into the haze
// (kit.js), `under` its contrast seen through the arena (kit.js, default
// 1), `seed` its scatter; `ring: true` keeps the broken Ring in view
// (a set stands instead of it and of the intact arcs otherwise). `wakes:
// true` where the Ring itself wakes at the win (Null's place, the Crucible);
// elsewhere it sleeps through it and only the set answers.
// `offRing` (proposta 12/11) is how far from the Ring the place is as the
// journey to it ends (travelScene.js; docs/ROTEIRO.md "Os lugares"):
// [side, height] in world units, inward of the laid Ring's centre line
// (negative: outside its outer wall) and over its deck.

import { buildAssemblyGraveyard } from './assemblyGraveyard.js';
import { buildCrystalChoir } from './crystalChoir.js';
import { buildDebrisWake } from './debrisWake.js';
import { buildDenseCore } from './denseCore.js';
import { buildFurnaceDrift } from './furnaceDrift.js';
import { buildPrimeGate } from './primeGate.js';
import { buildQuarantineGrid } from './quarantineGrid.js';
import { buildSalvageLanes } from './salvageLanes.js';
import { buildTheCrucible } from './theCrucible.js';
import { buildWardensReach } from './wardensReach.js';

export const PLACE_SETS = Object.freeze({
  'debris-wake': {
    build: buildDebrisWake,
    hazeDepth: 7000,
    seed: 11,
    offRing: [6000, 2600],
  },
  'salvage-lanes': {
    build: buildSalvageLanes,
    hazeDepth: 2600,
    seed: 12,
    offRing: [2600, 1100],
  },
  'prime-gate': {
    build: buildPrimeGate,
    hazeDepth: 1400,
    seed: 13,
    offRing: [-380, -10],
  },
  'furnace-drift': {
    build: buildFurnaceDrift,
    hazeDepth: 2600,
    under: 0.7,
    seed: 14,
    offRing: [1500, 500],
  },
  'crystal-choir': {
    build: buildCrystalChoir,
    hazeDepth: 1800,
    under: 0.7,
    seed: 15,
    offRing: [300, 120],
  },
  'dense-core': {
    build: buildDenseCore,
    hazeDepth: 1500,
    seed: 16,
    offRing: [220, 90],
  },
  'assembly-graveyard': {
    build: buildAssemblyGraveyard,
    hazeDepth: 3200,
    under: 0.6, // the pale steel competed with the ship under the arena
    seed: 17,
    offRing: [1800, 700],
  },
  'quarantine-grid': {
    build: buildQuarantineGrid,
    hazeDepth: 5000,
    seed: 18,
    offRing: [2600, 1200],
  },
  'wardens-reach': {
    build: buildWardensReach,
    hazeDepth: 1300,
    seed: 19,
    offRing: [600, 240],
    ring: true,
    wakes: true,
  },
  'the-crucible': {
    build: buildTheCrucible,
    hazeDepth: 4000,
    under: 0.55,
    seed: 20,
    offRing: [500, 160],
    wakes: true,
  },
});
