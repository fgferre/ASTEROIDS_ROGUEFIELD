// Every key listener on window or document hears the key whatever screen is
// open, so a new one can act under another open screen (Settings over the
// briefing, the credits or the Codex let Enter and the arrows through, 26/11).
// The list below is every such listener today, as file: count. A new one, or a
// new file, fails here: add it only after checking it cannot act under another
// open screen. src/public/ (other people's code) and the gitignored
// exported-assets/ (the owner's board) are not the game.

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

const found = {};
for (const f of files('src')
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => !f.startsWith('src/public/'))
  .filter((f) => !f.startsWith('src/exported-assets/'))) {
  const count = readFileSync(f, 'utf8').match(KEY_LISTENER)?.length ?? 0;
  if (count) found[f] = count;
}

const ALLOWED = {
  'src/app.js': 2,
  'src/bootstrap/replaySession.js': 1,
  'src/bootstrap/ringScene.js': 1,
  'src/modules/AudioSystem.js': 1,
  'src/modules/InputSystem.js': 4,
  'src/modules/menu/loadingScreen.js': 5,
  'src/modules/menu/pilotSelect.js': 1,
  'src/modules/ui/CampaignMap.js': 1,
  'src/modules/ui/LevelUpScreen.js': 1,
  'src/modules/ui/RunEndScreens.js': 1,
  'src/modules/ui/hud/editor/HudEditor.js': 1,
  'src/modules/input/inputLayers.js': 1,
  'src/modules/ui/padPointer.js': 1,
  'src/modules/ui/skipHold.js': 2,
  'src/utils/PerformanceMonitor.js': 1,
};

describe('global key listeners', () => {
  it('are only the ones checked against an open screen above them', () => {
    expect(
      found,
      'A key listener on window or document is new or moved. Add it to the list only after checking it cannot act under another open screen (Settings, the cards, the chest, the briefing, the credits).'
    ).toEqual(ALLOWED);
  });
});
