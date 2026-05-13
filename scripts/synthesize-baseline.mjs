#!/usr/bin/env node
/**
 * INFRA-01 — Profile Baseline Synthesizer (Phase 1, Plan 01.02).
 *
 * Reads the four `profile-<scenario>-<ISO>.json` captures the developer
 * dropped into `.planning/research/` after running the in-browser
 * profileHarness (see `src/bootstrap/profileHarness.js`) and emits a single
 * synthesized markdown document at
 * `.planning/research/profile-baseline-<YYYY-MM-DD>.md` containing:
 *
 *   - Hardware fingerprint header (CONTEXT D-14): userAgent, screen resolution,
 *     devicePixelRatio, initial heap. Falls back gracefully when a capture
 *     does not include the metadata fields.
 *   - Per-scenario aggregate table: avg / min / p1 / p99 FPS, avg frame ms,
 *     memory delta (CONTEXT D-11).
 *   - Per-scenario top-5 hot paths read from `phases.*.avg` averages
 *     (CONTEXT D-12).
 *   - Cross-scenario "Top-5 hot paths across all scenarios" rollup
 *     (CONTEXT D-11).
 *   - Frame-budget verdict per scenario: PASS (avg FPS >= 55) / FLAG
 *     (45 <= avg FPS < 55) / FAIL (avg FPS < 45). Labels are explicitly
 *     ADVISORY — Phase 6b promotes these into AdaptiveQualityController
 *     gates per CLAUDE.md "calibration plans need HITL" lineage.
 *   - Re-run cadence note (CONTEXT D-15): Phase 4.5 close, Phase 6a Week 2,
 *     Phase 6b mid-phase.
 *
 * Per CONTEXT D-13/D-48 the output lives under `.planning/research/` which
 * is gitignored — local working memory consumed by future phases.
 *
 * Per CONTEXT D-46: zero new npm deps; only Node built-ins (fs, path, url).
 *
 * Not registered in package.json scripts — invoked on-demand by the
 * developer once the four captures exist:
 *
 *   node scripts/synthesize-baseline.mjs
 *
 * Runs cleanly against zero-capture state too, emitting a stub document
 * with all four scenarios marked "no capture found" — useful for verifying
 * the pipeline before the developer has run the harness.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const RESEARCH_DIR = path.join(PROJECT_ROOT, '.planning', 'research');
const SCENARIOS = ['cold-open', 'mid-game', 'boss-arena', 'late-stress'];
const ISO_DATE = new Date().toISOString().slice(0, 10);
const OUTPUT_MD = path.join(
  RESEARCH_DIR,
  `profile-baseline-${ISO_DATE}.md`
);

// Frame-budget verdict bands per CONTEXT D-11.
// IMPORTANT: these are ADVISORY baselines for Phase 1, NOT gate values.
// Phase 6b's AdaptiveQualityController promotes them into runtime gates.
const VERDICT_PASS_MIN = 55;
const VERDICT_FLAG_MIN = 45;

/**
 * Reads the lexicographically-latest `profile-<scenario>-*.json` file in
 * RESEARCH_DIR for each scenario. Captures that do not exist yield
 * `{ missing: true }` rather than aborting — pipeline must run cleanly
 * against a zero-capture state per Task 2 behavior spec.
 */
async function loadScenarioCaptures() {
  const reports = {};
  let dirEntries = [];
  try {
    dirEntries = await fs.readdir(RESEARCH_DIR);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      console.log(
        `[synthesize-baseline] ${RESEARCH_DIR} did not exist — creating empty.`
      );
    } else {
      console.warn(
        `[synthesize-baseline] Could not read ${RESEARCH_DIR}:`,
        error.message
      );
    }
  }

  for (const scenario of SCENARIOS) {
    const matches = dirEntries
      .filter(
        (name) =>
          name.startsWith(`profile-${scenario}-`) && name.endsWith('.json')
      )
      .sort()
      .reverse();

    if (matches.length === 0) {
      reports[scenario] = { missing: true };
      continue;
    }

    const captureFile = matches[0];
    try {
      const raw = await fs.readFile(
        path.join(RESEARCH_DIR, captureFile),
        'utf8'
      );
      const parsed = JSON.parse(raw);
      const sessionLogs = Array.isArray(parsed) ? parsed : [];
      reports[scenario] = {
        missing: sessionLogs.length === 0,
        captureFile,
        sessionLogs,
      };
    } catch (error) {
      console.warn(
        `[synthesize-baseline] Failed to parse ${captureFile}:`,
        error.message
      );
      reports[scenario] = { missing: true, captureFile, parseError: true };
    }
  }
  return reports;
}

/**
 * Standard percentile on a sorted (ascending) array. Returns 0 for empty
 * input. Uses nearest-rank for stability — fine for FPS bucket reporting.
 */
function percentile(sortedValues, p) {
  if (!sortedValues || sortedValues.length === 0) return 0;
  const rank = Math.max(
    0,
    Math.min(
      sortedValues.length - 1,
      Math.ceil((p / 100) * sortedValues.length) - 1
    )
  );
  return sortedValues[rank];
}

/**
 * Returns numeric value of a PerformanceMonitor field. PerformanceMonitor
 * stringifies most numerics in getReport() (e.g. fps.average is a String),
 * so Number() coerces back safely.
 */
function toNumber(value) {
  if (value === null || value === undefined) return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Aggregates a sessionLogs array (PerformanceMonitor.exportLogs output) into
 * the metrics emitted in the per-scenario table.
 */
function aggregateScenario(sessionLogs) {
  const fpsAverages = [];
  const fpsMins = [];
  const frameTimeAverages = [];
  const memoryUsed = [];
  const phaseAggregates = new Map();

  for (const entry of sessionLogs) {
    if (!entry || typeof entry !== 'object') continue;

    const fpsAvg = toNumber(entry?.fps?.average);
    if (!Number.isNaN(fpsAvg)) fpsAverages.push(fpsAvg);

    const fpsMin = toNumber(entry?.fps?.min);
    if (!Number.isNaN(fpsMin)) fpsMins.push(fpsMin);

    const ftAvg = toNumber(entry?.frameTime?.average);
    if (!Number.isNaN(ftAvg)) frameTimeAverages.push(ftAvg);

    const mem = toNumber(entry?.memory?.used);
    if (!Number.isNaN(mem)) memoryUsed.push(mem);

    const phases = entry?.phases || {};
    for (const [name, value] of Object.entries(phases)) {
      const avg = toNumber(value?.avg);
      if (Number.isNaN(avg)) continue;
      const accum = phaseAggregates.get(name) || { sum: 0, n: 0 };
      accum.sum += avg;
      accum.n += 1;
      phaseAggregates.set(name, accum);
    }
  }

  const sortedFps = [...fpsAverages].sort((a, b) => a - b);
  const avgFps =
    fpsAverages.reduce((a, b) => a + b, 0) / (fpsAverages.length || 1);
  const minFps = fpsMins.length > 0 ? Math.min(...fpsMins) : 0;
  const p1Fps = percentile(sortedFps, 1);
  const p99Fps = percentile(sortedFps, 99);
  const avgFrameMs =
    frameTimeAverages.reduce((a, b) => a + b, 0) /
    (frameTimeAverages.length || 1);
  const memoryDeltaMB =
    memoryUsed.length >= 2
      ? memoryUsed[memoryUsed.length - 1] - memoryUsed[0]
      : 0;

  const phaseAverages = new Map();
  for (const [name, { sum, n }] of phaseAggregates) {
    phaseAverages.set(name, sum / (n || 1));
  }

  return {
    samples: sessionLogs.length,
    avgFps,
    minFps,
    p1Fps,
    p99Fps,
    avgFrameMs,
    memoryDeltaMB,
    phaseAverages,
  };
}

/**
 * Returns the top-5 (or fewer) `[name, avg]` tuples from a phaseAverages
 * Map, sorted descending by `avg`. CONTEXT D-12: the metric source is
 * PerformanceMonitor.getPhaseReport().
 */
function top5Phases(phaseAverages) {
  return Array.from(phaseAverages.entries())
    .map(([name, avg]) => ({ name, avg }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);
}

/**
 * Verdict per CONTEXT D-11. Returns the band label only — the markdown
 * emission wraps it in the "ADVISORY" framing.
 */
function verdict(avgFps) {
  if (avgFps >= VERDICT_PASS_MIN) return 'PASS';
  if (avgFps >= VERDICT_FLAG_MIN) return 'FLAG';
  return 'FAIL';
}

/**
 * Extracts hardware fingerprint fields from the first sessionLogs entry
 * when present. PerformanceMonitor does not currently emit these (see
 * src/utils/PerformanceMonitor.js getReport()), so this function reads
 * any top-level `hardware` or `userAgent`-shaped property the developer
 * may have manually augmented the JSON with — and returns a "fields not
 * present" sentinel otherwise (CONTEXT D-14).
 */
function extractFingerprint(sessionLogs) {
  const first = Array.isArray(sessionLogs) && sessionLogs[0] ? sessionLogs[0] : null;
  if (!first || typeof first !== 'object') return null;
  const hardware = first.hardware || first.fingerprint || null;
  const userAgent = first.userAgent || (hardware && hardware.userAgent) || null;
  const screen = first.screen || (hardware && hardware.screen) || null;
  const devicePixelRatio =
    first.devicePixelRatio || (hardware && hardware.devicePixelRatio) || null;
  const initialHeap = first.initialHeap || (hardware && hardware.initialHeap) || null;

  if (!userAgent && !screen && !devicePixelRatio && !initialHeap) {
    return null;
  }
  return { userAgent, screen, devicePixelRatio, initialHeap };
}

/**
 * Computes the cross-scenario rollup: take each phase's average across all
 * scenarios that captured it, sort descending, slice top-5.
 */
function crossScenarioTop5(reports) {
  const accum = new Map();
  for (const report of Object.values(reports)) {
    if (!report.aggregates) continue;
    for (const [name, avg] of report.aggregates.phaseAverages) {
      const e = accum.get(name) || { sum: 0, n: 0 };
      e.sum += avg;
      e.n += 1;
      accum.set(name, e);
    }
  }
  return Array.from(accum.entries())
    .map(([name, { sum, n }]) => ({ name, avg: sum / (n || 1) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);
}

/**
 * Builds the synthesized markdown document.
 */
function emitMarkdown(reports) {
  const lines = [];
  lines.push(`# Performance Baseline — ${ISO_DATE}`);
  lines.push('');
  lines.push('**Phase:** 1 (INFRA-01) — Profiling Baseline');
  lines.push('**Seed:** `0xB45E` (constant across scenarios per CONTEXT D-09)');
  lines.push(
    '**PerformanceMonitor source:** `src/utils/PerformanceMonitor.js` `getReport()` + `getPhaseReport()` (CONTEXT D-12)'
  );
  lines.push(
    '**Capture surface:** `src/bootstrap/profileHarness.js` (in-browser, real `requestAnimationFrame`)'
  );
  lines.push('');
  lines.push(
    '> **Verdicts below are ADVISORY baselines, NOT gate values.** Phase 6b promotes these into `AdaptiveQualityController` gates. Phase 1 INFRA-01 only MEASURES — it does not CALIBRATE. See CLAUDE.md "calibration plans need HITL" lineage + Phase 1 CONTEXT D-11.'
  );
  lines.push('');

  // Hardware fingerprint header (CONTEXT D-14)
  lines.push('## Hardware fingerprint');
  lines.push('');
  let anyFingerprint = false;
  for (const scenario of SCENARIOS) {
    const report = reports[scenario];
    if (report.missing || !report.aggregates) continue;
    const fp = extractFingerprint(report.sessionLogs);
    if (fp) {
      anyFingerprint = true;
      lines.push(`### From ${scenario} capture`);
      lines.push('');
      if (fp.userAgent) lines.push(`- **userAgent:** ${fp.userAgent}`);
      if (fp.screen) lines.push(`- **screen:** ${JSON.stringify(fp.screen)}`);
      if (fp.devicePixelRatio !== null)
        lines.push(`- **devicePixelRatio:** ${fp.devicePixelRatio}`);
      if (fp.initialHeap !== null)
        lines.push(`- **initialHeap:** ${fp.initialHeap}`);
      lines.push('');
      break; // First scenario with fingerprint is canonical.
    }
  }
  if (!anyFingerprint) {
    lines.push(
      '_Hardware fingerprint fields not present in any capture. Re-run with an updated PerformanceMonitor export that includes `userAgent`, `screen`, `devicePixelRatio`, and `initialHeap` to populate this section (CONTEXT D-14)._'
    );
    lines.push('');
  }

  // Per-scenario sections
  for (const scenario of SCENARIOS) {
    const report = reports[scenario];
    lines.push(`## Scenario: ${scenario}`);
    lines.push('');
    if (report.missing) {
      lines.push(
        `_(no capture found — run \`?profile=${scenario}\` in dev and drop the downloaded JSON into \`.planning/research/\`, then re-run \`node scripts/synthesize-baseline.mjs\`)_`
      );
      lines.push('');
      continue;
    }

    const agg = report.aggregates;
    lines.push(
      `Source capture: \`${report.captureFile}\` (${agg.samples} log entries)`
    );
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| --- | --- |');
    lines.push(`| avg FPS | ${agg.avgFps.toFixed(1)} |`);
    lines.push(`| min FPS | ${agg.minFps.toFixed(1)} |`);
    lines.push(`| p1 FPS | ${agg.p1Fps.toFixed(1)} |`);
    lines.push(`| p99 FPS | ${agg.p99Fps.toFixed(1)} |`);
    lines.push(`| avg frame ms | ${agg.avgFrameMs.toFixed(2)} |`);
    lines.push(`| memory delta MB | ${agg.memoryDeltaMB.toFixed(2)} |`);
    lines.push(
      `| **frame-budget verdict** | **${verdict(agg.avgFps)} (ADVISORY)** |`
    );
    lines.push('');

    lines.push('### Top-5 hot paths');
    lines.push('');
    const top5 = top5Phases(agg.phaseAverages);
    if (top5.length === 0) {
      lines.push('_(no phase-timing data in this capture)_');
      lines.push('');
    } else {
      lines.push('| Phase | avg ms |');
      lines.push('| --- | --- |');
      for (const { name, avg } of top5) {
        lines.push(`| ${name} | ${avg.toFixed(2)} |`);
      }
      lines.push('');
    }
  }

  // Cross-scenario rollup
  lines.push('## Top-5 hot paths across all scenarios');
  lines.push('');
  lines.push(
    'Aggregate of each phase\'s avg across every scenario that captured it. Per CONTEXT D-11 this is the overall hot-path inventory Phase 4.5 / 6a / 6b read.'
  );
  lines.push('');
  const overall = crossScenarioTop5(reports);
  if (overall.length === 0) {
    lines.push('_(no captures present — cross-scenario rollup unavailable)_');
    lines.push('');
  } else {
    lines.push('| Phase | avg ms |');
    lines.push('| --- | --- |');
    for (const { name, avg } of overall) {
      lines.push(`| ${name} | ${avg.toFixed(2)} |`);
    }
    lines.push('');
  }

  // Re-run cadence note (CONTEXT D-15)
  lines.push('## Re-run cadence');
  lines.push('');
  lines.push(
    'Per CONTEXT D-15, re-capture and re-synthesize this baseline at three downstream gates:'
  );
  lines.push('');
  lines.push(
    '1. **Phase 4.5 close** — post-fixed-timestep accumulator. Compare phase mix against this Phase 1 baseline to confirm migration did not regress hot paths.'
  );
  lines.push(
    '2. **Phase 6a Week 2** — post-IRenderer extraction. Verify Canvas2D fallback path matches this baseline within noise.'
  );
  lines.push(
    '3. **Phase 6b mid-phase** — post-WebGL2 batcher. Compare against this baseline AND the Phase 6a Week 2 capture to size AdaptiveQualityController gates.'
  );
  lines.push('');
  lines.push(
    'Each re-run produces its own dated file (`profile-baseline-YYYY-MM-DD.md`); the original Phase 1 capture is the immutable reference.'
  );
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(
    `_Generated by \`scripts/synthesize-baseline.mjs\` on ${ISO_DATE}. Per CONTEXT D-13/D-48 this file lives under \`.planning/research/\` which is gitignored — local working memory consumed by Phase 4.5 / 6a / 6b._`
  );
  lines.push('');

  return lines.join('\n');
}

async function main() {
  // Ensure RESEARCH_DIR exists; mkdir is recursive so this is idempotent.
  await fs.mkdir(RESEARCH_DIR, { recursive: true });

  const captures = await loadScenarioCaptures();

  // Annotate each report with aggregates (or leave bare when missing).
  for (const scenario of SCENARIOS) {
    const r = captures[scenario];
    if (!r.missing) {
      r.aggregates = aggregateScenario(r.sessionLogs);
    }
  }

  const body = emitMarkdown(captures);
  await fs.writeFile(OUTPUT_MD, body, 'utf8');
  console.log(`[synthesize-baseline] Wrote ${OUTPUT_MD}`);
}

main().catch((error) => {
  console.error('[synthesize-baseline] Failed:', error);
  process.exit(1);
});
