// src/data/achievements.js

import { deepFreeze } from '../utils/deepFreeze.js';

// Local achievements, listed in the Codex (PLAN.md R5.6). Thresholds are the
// "proposta 18/10"; AchievementService decides when each one unlocks.
// glyph: one text symbol (no emoji-presentation characters).
// target: present only on countable ones; the Codex shows "n / target".
// enemy: counts one per pilot kill of this enemy type.
// reward: what the medal pays once, in the Hangar (progression plan H1,
// "proposta 16/11"): `salvage`, a card `license` (read by the card draw once
// the cards side reads the Hangar's contract) and `opensPressure` (the first
// Pressure rung). HangarService pays it.

export const ACHIEVEMENTS = deepFreeze([
  {
    id: 'first-light',
    title: 'First Light',
    description: 'Clear the first layer. The Field has noticed you.',
    glyph: '✦',
    reward: { salvage: 25 },
  },
  {
    id: 'first-victory',
    title: 'First Victory',
    description: 'Win a run, a sector of the map or the descent.',
    glyph: '★',
    reward: { salvage: 100, opensPressure: true },
  },
  {
    id: 'ring-breaker',
    title: 'Ring Breaker',
    description: 'Break Warden Prime and walk out of its ring.',
    glyph: '◎',
    reward: { license: 'deflector_shield' },
  },
  {
    id: 'choir-silenced',
    title: 'Choir Silenced',
    description: 'Still every voice of the Warden Choir.',
    glyph: '♫',
    reward: { license: 'arc_lattice' },
  },
  {
    id: 'null-and-void',
    title: 'Null and Void',
    description: 'Unmake Warden Null at the bottom of the descent.',
    glyph: '⊘',
    reward: { license: 'reactor_bleed' },
  },
  {
    id: 'herald-hunter',
    title: 'Herald Hunter',
    description: 'Fell all three Heralds. Dust, Heat and Silence.',
    glyph: '✶',
    target: 3,
    reward: { license: 'bounty_ledger' },
  },
  {
    id: 'deep-field',
    title: 'Deep Field',
    description: 'Reach layer 20, past where the Wardens keep count.',
    glyph: '▼',
    reward: { salvage: 250 },
  },
  {
    id: 'untouchable',
    title: 'Untouchable',
    description: 'Clear a Warden layer without a scratch on the hull.',
    glyph: '◇',
    reward: { license: 'phase_dash' },
  },
  {
    id: 'full-set',
    title: 'Full Set',
    description: 'Complete an upgrade family and hear it resonate.',
    glyph: '❖',
    reward: { license: 'thermal_lens' },
  },
  {
    id: 'apex-predator',
    title: 'Apex Predator',
    description: 'Raise a weapon evolution to its Apex with five of a kind.',
    glyph: '✸',
    reward: { license: 'lucky_fragment' },
  },
  {
    id: 'harmonic',
    title: 'Harmonic',
    description: 'Fire 50 harmonic beams. The Field hums back.',
    glyph: '≋',
    target: 50,
    reward: { salvage: 75 },
  },
  {
    id: 'elite-hunter',
    title: 'Elite Hunter',
    description: 'Destroy 25 Elites. Crowned ones fall too.',
    glyph: '♛',
    target: 25,
    reward: { salvage: 100 },
  },
  {
    id: 'scrapper',
    title: 'Scrapper',
    description: 'Collect 10 field pickups from the wreckage.',
    glyph: '◈',
    target: 10,
    reward: { salvage: 50 },
  },
  {
    id: 'cursed-run',
    title: 'Cursed Run',
    description: 'Win the descent with a cursed card in your build.',
    glyph: '✠',
    reward: { salvage: 150 },
  },
  {
    id: 'survivor',
    title: 'Survivor',
    description: 'Launch into the Field ten times.',
    glyph: '↻',
    target: 10,
    reward: { salvage: 50 },
  },
  {
    id: 'counter-battery',
    title: 'Counter-Battery',
    description: 'Destroy 20 Casters, volley or no volley.',
    glyph: '⌖',
    target: 20,
    enemy: 'caster',
    reward: { salvage: 75 },
  },
  {
    id: 'unphased',
    title: 'Unphased',
    description: 'Destroy 15 Shades, however they slip out of phase.',
    glyph: '◌',
    target: 15,
    enemy: 'shade',
    reward: { salvage: 75 },
  },
  {
    id: 'iron-escort',
    title: 'Iron Escort',
    description: 'Win the descent piloting the Bastion hull.',
    glyph: '⬢',
    reward: { salvage: 250 },
  },
  {
    id: 'full-garage',
    title: 'Full Garage',
    description: 'Own every hull the Hangar sells.',
    glyph: '▣',
    reward: { salvage: 100 },
  },
]);
