// A pilot key (SLOT_KEYS) written with saveJSON skips saveProgress's hold, so a
// demo or profiling run would reach the real pilot's save. Outside storage.js
// only the settings (not a pilot key) may call saveJSON.

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

describe('pilot key writers', () => {
  it('only the settings call saveJSON outside storage.js', () => {
    const callers = files('src')
      .map((f) => f.replaceAll('\\', '/'))
      .filter((f) => f !== 'src/core/storage.js')
      .filter((f) => /\bsaveJSON\(/.test(readFileSync(f, 'utf8')));
    expect(callers).toEqual(['src/modules/SettingsSystem.js']);
  });
});
