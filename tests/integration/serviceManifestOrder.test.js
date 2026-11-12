/**
 * An eager (lazy: false) service is built the moment it is registered, so
 * every dependency it names must be registered above it in the manifest;
 * otherwise the container logs an error at load and builds it later.
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
