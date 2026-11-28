// One way to find a service: resolveService(name, dependencies) from
// src/core/serviceUtils.js (item 8 of the audits, 26/11). The ways it replaced
// must not come back: a getService method that only wrapped it, the run
// session's resolveServiceInstance with its own list of nicknames, and reading
// a service straight off a dependencies object by its name in brackets.
// serviceUtils.js is where the one way lives, so it may read them; the
// gitignored exported-assets/ (the owner's board) is not the game, and
// public/libs/ holds other people's minified code.

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

const sources = files('src')
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => f !== 'src/core/serviceUtils.js')
  .filter((f) => !f.startsWith('src/exported-assets/'))
  .filter((f) => !f.startsWith('src/public/libs/'));

// Every line that matches, as "file:line: text".
const offenders = (pattern) =>
  sources.flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .flatMap((text, i) =>
        pattern.test(text) ? [`${f}:${i + 1}: ${text.trim()}`] : []
      )
  );

describe('one way to find a service', () => {
  it('has no getService method or call', () => {
    expect(offenders(/\bgetService\s*\(/)).toEqual([]);
  });

  it('has no resolveServiceInstance', () => {
    expect(offenders(/\bresolveServiceInstance\b/)).toEqual([]);
  });

  it("reads no service off a dependencies object as dependencies['name']", () => {
    expect(
      offenders(/dependencies\??\.?\[\s*['"`][^'"`]+['"`]\s*\](?!\s*=[^=])/)
    ).toEqual([]);
  });
});
