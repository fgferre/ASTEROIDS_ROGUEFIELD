// PROC-10 v1 scope drift detector (soft warning).
//
// Reads .planning/REQUIREMENTS.md and parses the canonical audit-trail line
// "Final v1 count: <N> reqs across <M> phases." (see line ~240 of that file)
// then compares <N> against BASELINE_V1_REQ_COUNT.
//
// Per CONTEXT D-40 (revised 2026-05-13), this is a SOFT WARNING — the test
// ALWAYS passes (exit 0). When the count drifts from baseline, a single
// console.warn surfaces the drift in Vitest output so the change is visible
// in `npm test` runs without blocking development. The developer reading the
// warn line decides whether the drift was intentional and updates the
// BASELINE_V1_REQ_COUNT constant below to silence future warnings at the
// new count.
//
// When .planning/REQUIREMENTS.md is absent (the directory is gitignored per
// repo policy, so non-developer checkouts and CI from a fork won't have it),
// the test emits a separate console.warn skip reason at file-load time and
// the test case skips. The suite still exits 0.
//
// Baseline note: as of plan authoring the prescribed baseline was 91 reqs.
// On 2026-05-13 the audit-trail line was bumped to 92 reqs (FIX-05 added per
// the PROC-10 soft-warning surface — intentional scope expansion surfaced by
// the Phase 1 fun-check). The current observed value is the baseline now;
// when a future intentional bump happens, update this constant in the same
// commit that updates the REQUIREMENTS.md audit-trail line.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REQUIREMENTS_PATH = resolve(__dirname, '../../.planning/REQUIREMENTS.md');
const BASELINE_V1_REQ_COUNT = 92; // current observed value per 2026-05-14 audit-trail line; update when an intentional scope change ships

const REQUIREMENTS_MISSING = !existsSync(REQUIREMENTS_PATH);
if (REQUIREMENTS_MISSING) {
  // eslint-disable-next-line no-console
  console.warn(
    '[scope-freeze] .planning/REQUIREMENTS.md not found — skipping. ' +
      'This is expected in non-developer checkouts (.planning/ is gitignored). ' +
      'In a developer checkout, run from repo root and ensure the file exists.'
  );
}

describe('PROC-10 v1 scope drift detector (soft warning)', () => {
  (REQUIREMENTS_MISSING ? it.skip : it)(
    `emits a console.warn if v1 req count differs from baseline ${BASELINE_V1_REQ_COUNT}`,
    () => {
      const content = readFileSync(REQUIREMENTS_PATH, 'utf8');
      // Anchor on the developer-authored audit-trail line, NOT per-req-ID grep counts
      // (those are fragile under reorg). The audit-trail line is the single canonical
      // source per CONTEXT D-40 and 01-PATTERNS.md.
      const m = content.match(/Final v1 count:\s*(\d+)\s+reqs/i);
      if (!m) {
        // eslint-disable-next-line no-console
        console.warn(
          '[scope-freeze] REQUIREMENTS.md is missing the "Final v1 count: N reqs" audit-trail line. ' +
            'Add it (or restore it) so drift detection can work.'
        );
        return; // soft-pass — do not fail
      }
      const count = Number.parseInt(m[1], 10);
      if (count !== BASELINE_V1_REQ_COUNT) {
        // eslint-disable-next-line no-console
        console.warn(
          `[scope-freeze] v1 req count drifted: baseline=${BASELINE_V1_REQ_COUNT}, observed=${count}. ` +
            `Confirm intentional scope change in PROJECT.md / REQUIREMENTS.md.`
        );
        // soft-pass — the warn IS the signal; we do not fail the test
        return;
      }
      // count matches baseline — silent pass; emit a single sanity assertion so
      // vitest doesn't flag an empty test:
      expect(count).toBe(BASELINE_V1_REQ_COUNT);
    }
  );
});
