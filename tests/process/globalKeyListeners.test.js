// A key listener on window or document hears every key whatever screen is
// open. The screens take theirs through the input layer stack
// (src/modules/input/inputLayers.js: only the screen on top hears a key), so
// a global key listener lives only in the files below, each with its reason;
// any other fails here with its file and line. src/public/ (other people's
// code) and the gitignored exported-assets/ (the owner's board) are not the
// game.

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

// The quoted event name may sit on a later line than the call.
const KEY_LISTENER =
  /\b(?:window|document)\s*\.\s*addEventListener\s*\(\s*['"`](?:keydown|keyup|keypress)['"`]/g;

// file: [how many, why it hears every key].
const ALLOWED = {
  'src/modules/input/inputLayers.js': [
    2,
    'the stack itself: one keydown and one keyup (window capture) that hand each key to the screen on top',
  ],
  'src/modules/InputSystem.js': [
    4,
    'the controls: every key and its release (acting on none a screen took), S and ArrowDown stopped early for password managers',
  ],
  'src/modules/AudioSystem.js': [
    1,
    "the audio unlock: the page's first key wakes the sound, whatever is on screen",
  ],
  'src/modules/ui/padPointer.js': [
    1,
    "the pad's pointer leaves when a real key is pressed",
  ],
  'src/utils/PerformanceMonitor.js': [
    1,
    'F3, the performance overlay: a tool, over any screen',
  ],
  'src/app.js': [
    2,
    'F8 and F9, the stats overlay and the replay download: tools, over any screen',
  ],
  'src/bootstrap/replaySession.js': [
    1,
    "a broken replay's notice leaves at the next key, once",
  ],
  'src/bootstrap/ringScene.js': [
    1,
    'the dev ring scene (?scene=): no game screen there',
  ],
};

// Every key listener, as file:line.
const found = {};
for (const f of files('src')
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => !f.startsWith('src/public/'))
  .filter((f) => !f.startsWith('src/exported-assets/'))) {
  const text = readFileSync(f, 'utf8');
  for (const match of text.matchAll(KEY_LISTENER)) {
    const line = text.slice(0, match.index).split('\n').length;
    (found[f] ??= []).push(`${f}:${line}`);
  }
}

describe('global key listeners', () => {
  it('live only in the files allowed, each with its reason', () => {
    const extra = Object.entries(found).flatMap(([file, lines]) =>
      lines.length > (ALLOWED[file]?.[0] ?? 0) ? lines : []
    );
    expect(
      extra,
      'A key listener on window or document outside the allowed list: a screen takes its keys as a layer of the input layer stack (onKey, src/modules/input/inputLayers.js). Only a listener that is not a screen goes in ALLOWED, with its reason.'
    ).toEqual([]);
  });

  it('every one allowed is still there (the list says what stays)', () => {
    const gone = Object.entries(ALLOWED)
      .filter(([file, [count]]) => (found[file]?.length ?? 0) !== count)
      .map(([file]) => file);
    expect(gone, 'Update ALLOWED to what the file has now.').toEqual([]);
  });
});
