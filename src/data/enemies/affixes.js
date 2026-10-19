// src/data/enemies/affixes.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { PALETTE } from '../constants/palette.js';
import { BULWARK_SHIELD_HALF_ARC } from '../../content/enemies/bulwark.js';
import { listContent } from '../../content/registry.js';

// The support enemies that may roll an affix: those whose content file lists
// it in `affixes`.
const kindsFor = (affixId) =>
  listContent('enemies')
    .filter(({ affixes }) => affixes.includes(affixId))
    .map(({ id }) => id);

// Elite affixes (PLAN.md R6.2): an Elite past layer 5 also rolls one or two of
// these, shown as glyph badges over it and named in the kill feed
// ("Elite Swift Volatile Ram"). `kinds` are the support enemies that may roll
// it (kindsFor). Numbers: proposta 18/10 — the owner's play decides.
export const ELITE_AFFIXES = deepFreeze({
  shielded: {
    id: 'shielded',
    label: 'Shielded',
    glyph: 'shield',
    color: PALETTE.text,
    shieldHealth: 60, // proposta 18/10: frontal plate, like the Bulwark's
    halfArc: BULWARK_SHIELD_HALF_ARC,
    kinds: kindsFor('shielded'),
  },
  swift: {
    id: 'swift',
    label: 'Swift',
    glyph: 'chevrons',
    color: PALETTE.status,
    speed: 1.45, // proposta 18/10: × top speed and acceleration
    kinds: kindsFor('swift'),
  },
  volatile: {
    id: 'volatile',
    label: 'Volatile',
    glyph: 'burst',
    color: PALETTE.shot,
    fuse: 0.6, // proposta 18/10: seconds from the lethal hit to the blast
    radius: 90, // proposta 18/10
    damage: 25, // proposta 18/10
    kinds: kindsFor('volatile'),
  },
  splitter: {
    id: 'splitter',
    label: 'Splitter',
    glyph: 'fork',
    color: PALETTE.threat,
    count: 2, // proposta 18/10: Motes released on death
    speed: 120, // proposta 18/10: outward px/s of each Mote
    kinds: kindsFor('splitter'),
  },
  warded: {
    id: 'warded',
    label: 'Warded',
    glyph: 'ward',
    color: PALETTE.boss,
    immuneSeconds: 1.5, // proposta 18/10: no damage after each hit
    kinds: kindsFor('warded'),
  },
});

export const AFFIX_IDS = deepFreeze(Object.keys(ELITE_AFFIXES));

// proposta 18/10: +50 % of the Elite's XP per affix.
export const AFFIX_XP_BONUS = 0.5;

// Affixes per Elite by layer (the last row whose `from` is reached): none
// before layer 6, one on 6–10, one or two on 11–14, two from 15 on.
export const AFFIX_COUNT_BY_LAYER = deepFreeze([
  { from: 1, min: 0, max: 0 },
  { from: 6, min: 1, max: 1 },
  { from: 11, min: 1, max: 2 },
  { from: 15, min: 2, max: 2 },
]);

export function affixCountFor(layer, random) {
  let row = AFFIX_COUNT_BY_LAYER[0];
  for (const entry of AFFIX_COUNT_BY_LAYER) {
    if (layer >= entry.from) row = entry;
  }
  return row.min === row.max ? row.min : random.int(row.min, row.max);
}

/** Seeded pick, without repeats, of the affixes an Elite `kind` rolls. */
export function rollAffixes(kind, layer, random) {
  const pool = AFFIX_IDS.filter((id) => ELITE_AFFIXES[id].kinds.includes(kind));
  const count = Math.min(pool.length, affixCountFor(layer, random));
  const picked = [];
  while (picked.length < count) {
    picked.push(pool.splice(random.int(0, pool.length - 1), 1)[0]);
  }
  return picked;
}
