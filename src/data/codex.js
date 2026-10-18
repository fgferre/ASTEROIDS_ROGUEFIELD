// src/data/codex.js

import { deepFreeze } from '../utils/deepFreeze.js';
import { ENEMY_TYPES } from './constants/visual.js';
import { BOSS_BY_LAYER, WARDEN_KINDS } from './enemies/boss.js';
import { HERALD_KINDS } from './enemies/herald.js';
import { LAYERS } from './layers.js';

// The Codex (docs/NORTE.md §7 pillar 5): every enemy the pilot can meet, in
// the order the descent brings them. Names come from the enemy data; the
// first layer from src/data/layers.js, so the table cannot drift from the run.
// glyph: SVG body in a -16..16 box; `eye` marks the lit part (the silhouette
// of an undiscovered entry draws it dark).

const GLYPHS = {
  asteroid:
    '<polygon points="-11,-4 -6,-11 4,-12 11,-5 12,5 5,11 -5,12 -12,4"/>',
  drone: '<circle r="9"/><circle class="eye" r="3"/>',
  husk: '<polygon points="-13,-2 -8,-11 3,-13 12,-6 13,6 4,13 -8,11"/><circle class="eye" cx="-2" cy="1" r="2"/><circle class="eye" cx="5" cy="-4" r="1.5"/>',
  mine: '<path fill="none" stroke-width="2.5" d="M0 -5 L0 -14 M4.3 2.5 L12 7 M-4.3 2.5 L-12 7"/><circle r="6"/><circle class="eye" r="2"/>',
  ram: '<polygon points="14,0 -9,-11 -4,0 -9,11"/><circle class="eye" cx="7" r="2"/>',
  hunter:
    '<polygon points="15,0 0,-7 -13,0 0,7"/><circle class="eye" cx="8" r="2.2"/>',
  bulwark:
    '<path d="M5 -13 A13 13 0 0 1 5 13 L1 9 A9 9 0 0 0 1 -9 Z"/><circle cx="-5" r="7"/><circle class="eye" cx="-5" r="2"/>',
  weaver:
    '<circle r="12" fill="none" stroke-dasharray="3 3"/><circle r="5"/><circle class="eye" r="2"/>',
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

const support = (type, lore, hint) => ({
  id: type,
  name: ENEMY_TYPES[type].displayName,
  lore,
  hint,
  glyph: GLYPHS[type],
  fromLayer: firstLayerOf(type),
  warden: false,
});

const herald = (kind, lore, hint) => ({
  id: `herald-${kind}`,
  name: HERALD_KINDS[kind].displayName,
  lore,
  hint,
  glyph: GLYPHS[`herald-${kind}`],
  fromLayer: LAYERS.findIndex((layer) => layer.herald === kind) + 1,
  warden: false,
});

const warden = (kind, lore, hint) => ({
  id: `warden-${kind}`,
  name: WARDEN_KINDS[kind].displayName,
  lore,
  hint,
  glyph: GLYPHS[`warden-${kind}`],
  fromLayer: wardenLayerOf(kind),
  warden: true,
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
    },
    herald(
      'dust',
      'We sent the Dust ahead to speak for us. It speaks in walls.',
      'Every few seconds it raises a wall of rock. The slits light first.'
    ),
    support(
      'drone',
      'The smallest of the Ring’s keepers. It wakes in swarms and never alone.',
      'Fast and fragile. Fires short bursts; keep moving.'
    ),
    warden(
      'prime',
      'The first gate of the Ring, six plates around a violet core.',
      'Each phase breaks a plate. The red band warns of its charge.'
    ),
    support(
      'husk',
      'A dead keeper still drifting its route, full of sleeping Motes.',
      'Slow and heavy. Splits into drones when destroyed.'
    ),
    support(
      'mine',
      'A Ring seal that arms when anything warm comes near.',
      'Detonates on approach. Shoot it from range.'
    ),
    support(
      'ram',
      'Built to clear debris from the Ring’s lanes. It still does.',
      'Stops, winds up, then charges straight. Step aside.'
    ),
    herald(
      'heat',
      'The Core still burns where we told it to. The Heat carries the flame.',
      'Its seam brightens, then the rocks nearest it turn Volatile.'
    ),
    warden(
      'choir',
      'Three cores that once sang the Ring closed. Only three voices remain.',
      'Only the singing core can be hurt. The voice moves on.'
    ),
    support(
      'hunter',
      'A long-range keeper. Its lens lights the moment it has you.',
      'The lens glows before each shot. Break line of sight.'
    ),
    support(
      'bulwark',
      'A wall that walks. The Ring made it to hold the line.',
      'Its front plate blocks shots. Flank it, or break the plate.'
    ),
    support(
      'weaver',
      'It does not attack. It closes the Field around you.',
      'Orbits you and lays Tethers behind it. Kill it first.'
    ),
    herald(
      'silence',
      'Past this point we do not answer. The Silence makes sure of it.',
      'Blinds your radar while it lives. A ring marks where it blinks.'
    ),
    warden(
      'null',
      'The stillness the Ring kept for its ending. It opens the Ring itself.',
      'Pulls the sparks back. Its plates burn when the shell is open.'
    ),
  ].sort((a, b) => a.fromLayer - b.fromLayer)
);
