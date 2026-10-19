// src/data/codex.js

import { deepFreeze } from '../utils/deepFreeze.js';
import { listContent } from '../content/registry.js';
import { BOSS_BY_LAYER, WARDEN_KINDS } from './enemies/boss.js';
import { HERALD_KINDS } from './enemies/herald.js';
import { LAYERS } from './layers.js';

// The Codex (docs/NORTE.md §7 pillar 5): every enemy the pilot can meet, in
// the order the descent brings them. Names come from the enemy data; the
// first layer from src/data/layers.js, so the table cannot drift from the run.
// glyph: SVG body in a -16..16 box; `eye` marks the lit part (the silhouette
// of an undiscovered entry draws it dark).
// A roster enemy's lore, hint and glyph come from its content file (`codex`);
// one without them shows its name and DEFAULT_GLYPH, with no lore or hint.

const DEFAULT_GLYPH = '<circle r="9"/><circle class="eye" r="3"/>';

const GLYPHS = {
  asteroid:
    '<polygon points="-11,-4 -6,-11 4,-12 11,-5 12,5 5,11 -5,12 -12,4"/>',
  'warden-prime':
    '<circle r="11" fill="none" stroke-width="5" stroke-dasharray="9.5 2"/><circle class="eye" r="4.5"/>',
  'warden-choir':
    '<circle cy="-8" r="4.5"/><circle cx="7" cy="5" r="4.5"/><circle cx="-7" cy="5" r="4.5"/><circle class="eye" cy="-8" r="2"/>',
  'warden-null':
    '<circle r="13" fill="none" stroke-width="2"/><circle r="7"/><circle class="eye" r="3"/>',
  'herald-dust':
    '<rect x="-14" y="-6" width="28" height="12" rx="1.5"/><rect class="eye" x="-9.5" y="-1" width="4" height="2"/><rect class="eye" x="-2" y="-1" width="4" height="2"/><rect class="eye" x="5.5" y="-1" width="4" height="2"/>',
  'herald-heat':
    '<circle r="12"/><path class="eye" fill-rule="evenodd" d="M-10.5 0a10.5 10.5 0 1 0 21 0a10.5 10.5 0 1 0 -21 0Z M-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0Z"/>',
  'herald-silence':
    '<polygon points="0,-15 5,-5 5,9 0,15 -5,9 -5,-5"/><circle class="eye" cy="-3" r="2"/>',
};

/** Codex id of an enemy or a damage-source snapshot: its type, or the Warden's or Herald's kind. */
export function codexIdOf(entity) {
  if (!entity?.type) return null;
  if (entity.type === 'boss') return `warden-${entity.bossKind || 'prime'}`;
  if (entity.type === 'herald') return `herald-${entity.heraldKind || 'dust'}`;
  return entity.type;
}

function firstLayerOf(kind) {
  const index = LAYERS.findIndex(
    (layer) =>
      (kind === 'asteroid' && layer.rocks > 0) ||
      layer.roster.some((entry) => entry.kind === kind) ||
      layer.surges.some((surge) => surge.kinds.includes(kind))
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

const herald = (kind, lore, hint) => ({
  id: `herald-${kind}`,
  name: HERALD_KINDS[kind].displayName,
  lore,
  hint,
  glyph: GLYPHS[`herald-${kind}`],
  fromLayer: LAYERS.findIndex((layer) => layer.herald === kind) + 1,
  warden: false,
  herald: true,
});

const warden = (kind, lore, hint) => ({
  id: `warden-${kind}`,
  name: WARDEN_KINDS[kind].displayName,
  lore,
  hint,
  glyph: GLYPHS[`warden-${kind}`],
  fromLayer: wardenLayerOf(kind),
  warden: true,
  herald: false,
});

export const CODEX_ENTRIES = deepFreeze(
  [
    {
      id: 'asteroid',
      name: 'Ring Fragment',
      lore: 'Stone and metal from the broken Ring. The light inside is the machine it was.',
      hint: 'Splits when broken. Volatile ones burst; Parasites hunt you.',
      glyph: GLYPHS.asteroid,
      fromLayer: firstLayerOf('asteroid'),
      warden: false,
      herald: false,
    },
    // Before the Heralds: a machine met on a Herald's layer is listed first.
    ...listContent('enemies').map(support),
    herald(
      'dust',
      'We sent the Dust ahead to speak for us. It speaks in walls. It counts every stone in the Outer Ring and lays them where a pilot must not pass; what it cannot count, it buries.',
      'Every few seconds it raises a wall of rock. The slits light first.'
    ),
    warden(
      'prime',
      'The first gate of the Ring, six plates around a violet core. It keeps the count of everything that enters: stone, light, pilot. Breaking it does not close the ledger; it turns the page.',
      'Each phase breaks a plate. The red band warns of its charge.'
    ),
    herald(
      'heat',
      'The Core still burns where we told it to. The Heat carries the flame from rock to rock and knows each one by its temperature. A pilot is one more reading, and the reading is rising.',
      'Its seam brightens, then the rocks nearest it turn Volatile.'
    ),
    warden(
      'choir',
      'Three cores that once sang the Ring closed. They were nine; the rest went quiet in the breaking. The hymn was never finished, and what is left still sings it to whoever comes.',
      'Only the singing core can be hurt. The voice moves on.'
    ),
    herald(
      'silence',
      'Past this point we do not answer. The Silence makes sure of it. It eats every signal in the Reach, yours first, and moves where nothing can hear it go.',
      'Blinds your radar while it lives. A ring marks where it blinks.'
    ),
    warden(
      'null',
      'The stillness the Ring kept for its ending. It opens the Ring itself. Everything that falls through the Field falls toward it, and for a thousand years nothing has arrived still burning.',
      'Pulls the sparks back. Its plates burn when the shell is open.'
    ),
  ].sort((a, b) => a.fromLayer - b.fromLayer)
);
