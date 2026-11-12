// Sentinel views (the bosses that end a sector), one per kind: a body of
// chamfered slabs and drums merged into one mesh (mergeStatic) under the
// panelled hull material, its moving pieces as their own meshes on pivots,
// and what lights up. The Wardens' views are in wardens.js. What the views
// share (hull material, modelling helpers, tones, core heat) is in
// sentinels/kit.js; each Sentinel has its own file in sentinels/. A new
// Sentinel adds one file there and one line to VIEWS below; its view kind is
// `boss-<id>` (enemyMirror.kindOf).

import { SENTINEL_KINDS } from '../../../data/enemies/boss.js';
import { createFoundryMother } from './sentinels/foundryMother.js';
import { createGatekeeper } from './sentinels/gatekeeper.js';
import { createInterdictor } from './sentinels/interdictor.js';
import { createKilnEngine } from './sentinels/kilnEngine.js';
import { createSentinelKit } from './sentinels/kit.js';
import { createPrismCrown } from './sentinels/prismCrown.js';
import { createQuarryMaw } from './sentinels/quarryMaw.js';

/** View kinds the Sentinels draw: `boss-<kind>`. */
export const SENTINEL_VIEW_KINDS = Object.keys(SENTINEL_KINDS).map(
  (kind) => `boss-${kind}`
);

/**
 * Sentinel views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit).
 * @param {object} recipeViews - the recipe looks (recipes.js), which build
 *   each Sentinel's lights.
 */
export function createSentinelViews(kit, recipeViews) {
  const sentinelKit = createSentinelKit(kit, recipeViews);
  const VIEWS = Object.fromEntries(
    [
      createQuarryMaw,
      createGatekeeper,
      createKilnEngine,
      createPrismCrown,
      createFoundryMother,
      createInterdictor,
    ].map((make) => {
      const view = make(sentinelKit);
      return [view.kind, view];
    })
  );

  return {
    has: (kind) => Boolean(VIEWS[kind]),
    create: (kind) => VIEWS[kind].create(kind),
    update: (view, boss, time) => VIEWS[view.kind].update(view, boss, time),
  };
}
