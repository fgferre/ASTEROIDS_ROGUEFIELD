// src/data/codex.js

import { deepFreeze } from '../utils/deepFreeze.js';
import { listContent } from '../content/registry.js';
import { BOSS_BY_LAYER, bossFilesOf, bossTier } from './enemies/boss.js';
import { LAYERS, enemiesFor } from './layers.js';

// The Codex (docs/NORTE.md §7 pillar 5): every enemy the pilot can meet, in
// the order the descent brings them. Names come from the enemy data; the
// first layer from src/data/layers.js, so the table cannot drift from the run.
// glyph: SVG body in a -16..16 box; `eye` marks the lit part (the silhouette
// of an undiscovered entry draws it dark).
// A roster enemy's lore, hint and glyph come from its content file (`codex`);
// one without them shows its name and DEFAULT_GLYPH, with no lore or hint.

const DEFAULT_GLYPH = '<circle r="9"/><circle class="eye" r="3"/>';

const ASTEROID_GLYPH =
  '<polygon points="-11,-4 -6,-11 4,-12 11,-5 12,5 5,11 -5,12 -12,4"/>';

/** Codex id of an enemy or a damage-source snapshot: its type, or the Warden's, Sentinel's or Herald's kind. */
export function codexIdOf(entity) {
  if (!entity?.type) return null;
  if (entity.type === 'boss') {
    const kind = entity.bossKind || 'prime';
    return `${bossTier(kind)}-${kind}`;
  }
  if (entity.type === 'herald') return `herald-${entity.heraldKind || 'dust'}`;
  return entity.type;
}

// The first layer that asks for one of the enemy's roles once it can come.
function firstLayerOf(kind) {
  const index = LAYERS.findIndex(
    (layer, i) =>
      (kind === 'asteroid' && layer.rocks > 0) ||
      [
        ...layer.roster.map(({ role }) => role),
        ...layer.surges.flatMap(({ roles }) => roles),
      ].some((role) => enemiesFor(role, i + 1).some(({ id }) => id === kind))
  );
  return index + 1;
}

function wardenLayerOf(kind) {
  return Number(
    Object.keys(BOSS_BY_LAYER).find((layer) => BOSS_BY_LAYER[layer] === kind)
  );
}

const support = ({ id, config, codex = {} }) => ({
  id,
  name: config.displayName,
  lore: codex.lore ?? '',
  hint: codex.hint ?? '',
  glyph: codex.glyph ?? DEFAULT_GLYPH,
  fromLayer: firstLayerOf(id),
  warden: false,
  herald: false,
});

// A Herald, Sentinel, Sovereign or Warden: its file's `tier`, name and `codex`
// (src/content/bosses/), on the layer it comes to. A Sentinel (or Sovereign)
// sits with the Wardens (`warden: true`), on the layer it ends.
const FIRST_LAYER = {
  herald: ({ id }) => LAYERS.findIndex((layer) => layer.herald === id) + 1,
  sentinel: ({ layer }) => layer,
  sovereign: ({ layer }) => layer,
  warden: ({ id }) => wardenLayerOf(id),
};

const boss = (file) => ({
  id: `${file.tier}-${file.id}`,
  name: file.displayName,
  lore: file.codex.lore,
  hint: file.codex.hint,
  glyph: file.codex.glyph,
  fromLayer: FIRST_LAYER[file.tier](file),
  warden: file.tier !== 'herald',
  herald: file.tier === 'herald',
});

export const CODEX_ENTRIES = deepFreeze(
  [
    {
      id: 'asteroid',
      name: 'Ring Fragment',
      lore: 'Stone and metal from the broken Ring. The light inside is the machine it was.',
      hint: 'Splits when broken. Volatile ones burst; Parasites hunt you.',
      glyph: ASTEROID_GLYPH,
      fromLayer: firstLayerOf('asteroid'),
      warden: false,
      herald: false,
    },
    // Before the Heralds: a machine met on a Herald's layer is listed first.
    ...listContent('enemies').map(support),
    // On a layer, after its machines: the Herald, the Sentinels by `order`,
    // then the Warden, which ends the chapter.
    ...[
      ...bossFilesOf('herald'),
      ...bossFilesOf('sentinel', 'sovereign'),
      ...bossFilesOf('warden'),
    ].map(boss),
  ].sort((a, b) => a.fromLayer - b.fromLayer)
);
