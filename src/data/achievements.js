// src/data/achievements.js

import { deepFreeze } from '../utils/deepFreeze.js';

// Local achievements, listed in the Codex (PLAN.md R5.6). Thresholds are the
// "proposta 18/10"; AchievementService decides when each one unlocks.
// glyph: one text symbol (no emoji-presentation characters).
// target: present only on countable ones; the Codex shows "n / target".

export const ACHIEVEMENTS = deepFreeze([
  {
    id: 'first-light',
    title: 'First Light',
    description: 'Clear the first layer. The Field has noticed you.',
    glyph: '✦',
  },
  {
    id: 'ring-breaker',
    title: 'Ring Breaker',
    description: 'Break Warden Prime and walk out of its ring.',
    glyph: '◎',
  },
  {
    id: 'choir-silenced',
    title: 'Choir Silenced',
    description: 'Still every voice of the Warden Choir.',
    glyph: '♫',
  },
  {
    id: 'null-and-void',
    title: 'Null and Void',
    description: 'Unmake Warden Null at the bottom of the descent.',
    glyph: '⊘',
  },
  {
    id: 'herald-hunter',
    title: 'Herald Hunter',
    description: 'Fell all three Heralds. Dust, Heat and Silence.',
    glyph: '✶',
    target: 3,
  },
  {
    id: 'deep-field',
    title: 'Deep Field',
    description: 'Reach layer 20, past where the Wardens keep count.',
    glyph: '▼',
  },
  {
    id: 'untouchable',
    title: 'Untouchable',
    description: 'Clear a Warden layer without a scratch on the hull.',
    glyph: '◇',
  },
  {
    id: 'full-set',
    title: 'Full Set',
    description: 'Complete an upgrade family and hear it resonate.',
    glyph: '❖',
  },
  {
    id: 'apex-predator',
    title: 'Apex Predator',
    description: 'Raise a weapon evolution to its Apex with five of a kind.',
    glyph: '✸',
  },
  {
    id: 'harmonic',
    title: 'Harmonic',
    description: 'Fire 50 harmonic beams. The Field hums back.',
    glyph: '≋',
    target: 50,
  },
  {
    id: 'elite-hunter',
    title: 'Elite Hunter',
    description: 'Destroy 25 Elites. Crowned ones fall too.',
    glyph: '♛',
    target: 25,
  },
  {
    id: 'scrapper',
    title: 'Scrapper',
    description: 'Collect 10 field pickups from the wreckage.',
    glyph: '◈',
    target: 10,
  },
  {
    id: 'cursed-run',
    title: 'Cursed Run',
    description: 'Win the descent with a cursed card in your build.',
    glyph: '✠',
  },
  {
    id: 'survivor',
    title: 'Survivor',
    description: 'Launch into the Field ten times.',
    glyph: '↻',
    target: 10,
  },
  {
    id: 'counter-battery',
    title: 'Counter-Battery',
    description: 'Destroy 20 Casters before they finish the volley.',
    glyph: '⌖',
    target: 20,
  },
  {
    id: 'unphased',
    title: 'Unphased',
    description: 'Destroy 15 Shades, however they slip out of phase.',
    glyph: '◌',
    target: 15,
  },
  {
    id: 'iron-escort',
    title: 'Iron Escort',
    description: 'Win the descent piloting the Bastion hull.',
    glyph: '⬢',
  },
  {
    id: 'full-garage',
    title: 'Full Garage',
    description: 'Own every hull the Hangar sells.',
    glyph: '▣',
  },
]);
