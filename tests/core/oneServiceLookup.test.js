// One way to find a service: resolveService(name, dependencies) from
// src/core/serviceUtils.js (item 8 of the audits, 26/11). The ways it replaced
// must not come back: a getService method that only wrapped it, and reading a
// service straight off a dependencies object by its name in brackets.
// serviceUtils.js is where the one way lives, so it may read them.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const sources = readdirSync(SRC, { recursive: true })
  .filter((path) => path.endsWith('.js') && !path.startsWith('public/libs'))
  .filter((path) => path !== join('core', 'serviceUtils.js'))
  .map((path) => ({ path, text: readFileSync(join(SRC, path), 'utf8') }));

const offenders = (pattern) =>
  sources
    .filter(({ text }) => pattern.test(text))
    .map(({ path }) => path)
    .sort();

describe('one way to find a service', () => {
  it('has no getService method or call', () => {
    expect(offenders(/\bgetService\s*\(/)).toEqual([]);
  });

  it("reads no service off a dependencies object as dependencies['name']", () => {
    expect(offenders(/dependencies\??\.?\[\s*['"`]/)).toEqual([]);
  });
});
