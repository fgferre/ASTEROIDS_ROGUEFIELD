// The kind of run lives in one object, src/core/runMode.js (item 8 of the
// audits, 26/11): everyone asks it a named question. The ways it replaced
// must not come back in src: a bossRush flag, isDaily() or a daily flag, a
// copy of the run's sector kept by its holder (this.sector) or read off
// another holder (session.sector, waveManager.sector), and comparing a
// mode's kind outside the object. Comment lines are not read.
//
// Allowed for good: runMode.js itself, the recording's file format
// (core/replay.js), the menu's launch options (menuButtons.js, the object's
// inputs) and the story's Boss Rush line (content).
//
// Allowed until the 3D files are this work's to change (the 3D engine's sweep
// holds them, 26/11): the files listed in PENDING and the lines in
// PENDING_LINES, emptied then; a pending entry that no longer matches
// anything fails here.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : entry.name.endsWith('.js')
        ? [join(dir, entry.name)]
        : []
  );

const ALLOWED = [
  'src/core/runMode.js',
  'src/core/replay.js',
  'src/services/session/menuButtons.js',
];
const ALLOWED_LINES = [
  ['src/data/story.js', 'bossRush:'],
  ['src/modules/ui/transmissions.js', 'text: STORY.bossRush,'],
];
const PENDING = ['src/modules/render3d/Renderer3D.js'];
const PENDING_LINES = [];

const CHECKS = [
  ['a bossRush flag', /\bbossRush\b/],
  ['isDaily() or a daily flag', /\bisDaily\b|\.daily\b/],
  ["a holder's own copy of the run's sector", /\bthis\.sector\b/],
  [
    "another holder's copy of the run's sector",
    /\b(session|waveManager)\??\.sector\b/,
  ],
  [
    "a mode's kind compared outside the object",
    /\bkind\s*[!=]==?\s*'(descent|daily|bossRush|sector)'/,
  ],
];

const sources = files('src')
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => !f.startsWith('src/exported-assets/'))
  .filter((f) => !f.startsWith('src/public/libs/'))
  .filter((f) => !ALLOWED.includes(f) && !PENDING.includes(f));

const codeLines = (f) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .map((text, i) => ({ f, line: i + 1, text: text.trim() }))
    .filter(({ text }) => !/^(\/\/|\/\*|\*)/.test(text));

const excused = ({ f, text }) =>
  [...ALLOWED_LINES, ...PENDING_LINES].some(
    ([file, line]) => file === f && text === line
  );

describe('one kind of run, asked of one object', () => {
  it.each(CHECKS)('no %s outside runMode.js', (_, pattern) => {
    const offenders = sources
      .flatMap(codeLines)
      .filter(({ text }) => pattern.test(text))
      .filter((line) => !excused(line))
      .map(({ f, line, text }) => `${f}:${line}: ${text}`);
    expect(offenders).toEqual([]);
  });

  it('every pending exception still has something to excuse', () => {
    const stale = [
      ...PENDING.filter(
        (f) => !CHECKS.some(([, p]) => p.test(readFileSync(f, 'utf8')))
      ),
      ...PENDING_LINES.filter(
        ([f, line]) => !codeLines(f).some(({ text }) => text === line)
      ).map(([f, line]) => `${f}: ${line}`),
    ];
    expect(stale).toEqual([]);
  });
});
