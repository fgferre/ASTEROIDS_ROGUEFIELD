// The line cap's exception list only shrinks: ESLint flags any file over the
// cap that is not listed, and this test flags a listed file that is back under
// it, so the list always names exactly the files still over the cap.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_LINES, OVER_THE_CAP } from '../../eslint.config.js';

// Counted like ESLint's max-lines: every line, a final newline adds none.
function countLines(path) {
  const text = readFileSync(path, 'utf8');
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

describe('line cap exceptions', () => {
  it.each(OVER_THE_CAP)('%s is still over the cap', (path) => {
    expect(
      countLines(path),
      `${path} is under ${MAX_LINES} lines now: remove it from OVER_THE_CAP in eslint.config.js`
    ).toBeGreaterThan(MAX_LINES);
  });
});
