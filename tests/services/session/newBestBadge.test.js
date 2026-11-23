/**
 * A victory's "New best", in a Boss Rush and in a sector: a clear faster
 * than the record before it; tying the record is not one.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RunEnd } from '../../../src/services/session/runEnd.js';
import { updateRecords } from '../../../src/services/runRecords.js';
import { installDomStubs } from '../../__helpers__/domStubs.js';

function clearIn(seconds) {
  const runEnd = new RunEnd({});
  runEnd.bossRush = true;
  runEnd.bossRushWardens = 3;
  return runEnd.recordRunReached({}, { won: true, clearTime: seconds }).bossRush
    .newBest;
}

describe('Boss Rush "New best"', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('shows on the first clear and a faster one, not on a tie or a slower one', () => {
    expect(clearIn(120)).toBe(true);
    expect(clearIn(120)).toBe(false);
    expect(clearIn(130)).toBe(false);
    expect(clearIn(110)).toBe(true);
    updateRecords({ bossRushTime: 100 });
    expect(clearIn(100.5)).toBe(false); // 1:40 again, by the second
  });

  it('a sector follows the same rule', () => {
    const clearSector = (seconds) => {
      const runEnd = new RunEnd({});
      runEnd.sector = { id: 'dense-core' };
      return runEnd.recordRunReached({}, { won: true, clearTime: seconds })
        .sector.newBest;
    };
    expect(clearSector(300)).toBe(true);
    expect(clearSector(300)).toBe(false);
    expect(clearSector(310)).toBe(false);
    expect(clearSector(290)).toBe(true);
  });
});
