// npm run done (scripts/ci-node.mjs): the suite runs again on GitHub's oldest
// Node when this machine's is newer, read from the workflows themselves.

import { describe, it, expect } from 'vitest';
import { oldestCiNode } from '../../scripts/ci-node.mjs';

describe('the Node GitHub tests on', () => {
  it('is the oldest version any workflow names, comments aside', () => {
    const ci = `
        node-version: [22.x, 20.x] # Vite 7 needs Node 18.19+
        node-version: \${{ matrix.node-version }}`;
    const deploy = 'node-version: 22.x';
    expect(oldestCiNode([ci, deploy])).toBe(20);
  });

  it('is none when no workflow names one', () => {
    expect(oldestCiNode(['runs-on: ubuntu-latest'])).toBe(null);
  });
});
