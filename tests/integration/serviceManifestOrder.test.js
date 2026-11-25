/**
 * The eager (lazy: false) services are created in manifest order, once all are
 * registered. A dependency registered below its eager service would still
 * work, but it would be created early, out of that order; and the order of
 * creation decides the order listeners attach and random streams fork, so the
 * simulation. Every dependency above keeps creation order equal to the
 * manifest's.
 */

import { describe, expect, it } from 'vitest';
import { createServiceManifest } from '../../src/bootstrap/serviceManifest.js';

describe('service manifest order', () => {
  it('registers every eager service after all its dependencies', () => {
    const manifest = createServiceManifest({});
    const seen = new Set();
    const late = [];
    for (const { name, dependencies = [], lazy = true } of manifest) {
      if (!lazy) {
        dependencies
          .filter((dep) => !seen.has(dep))
          .forEach((dep) => late.push(`${dep} for ${name}`));
      }
      seen.add(name);
    }
    expect(late).toEqual([]);
  });
});
