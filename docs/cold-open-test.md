# Cold-Open Self-Test — First 30s (Phase 1, 2026-05-13)

Phase 1 PROC-20 first-30-seconds developer self-test on a fresh `npm run dev` session. Self-administered. NOT a user test (that's Phase 3.5 internal-loop test + Phase 8 closed beta).

## Method

1. `npm run dev` from PROJECT_ROOT.
2. Hard refresh the browser (Ctrl-Shift-R or Cmd-Shift-R).
3. Start a fresh run (click through any title-screen prompts).
4. Stopwatch the first 30 seconds; record observations at 0s, 5s, 10s, 15s, 30s.
5. Capture friction points: any >2s confusion or "what should I do?" moment.

**Self-administered — NOT a user test** per CONTEXT D-37. Phase 3.5 (trusted-circle internal-loop) and Phase 8 (closed beta) produce user-test evidence. Phase 1's cold-open test surfaces *blockers a trusted-circle test would surface but more cheaply* — loading hangs, missing input cues, illegible first-frame UI.

## Evidence

**PerformanceMonitor capture (INFRA-01 cross-link, CONTEXT D-36):** `.planning/research/profile-cold-open-<date>.json` from the `?profile=cold-open` scenario produced by Plan 01.02's harness (`src/bootstrap/profileHarness.js`). The same 30-second window the developer stopwatches IS the same 30-second window the harness captures FPS / frame-time / phase timings for. Run the harness via `http://localhost:5500/?profile=cold-open`; the JSON downloads to the developer's Downloads folder, which Task 3 moves to `.planning/research/` (gitignored — local working memory).

**Screenshots (optional):** the developer may attach `.planning/research/cold-open-screenshot-<t>.png` files if a visual reference helps the verdict table. `.planning/research/` is gitignored per CLAUDE.md GSD Local Practices.

## Per-timestamp log

| t   | What loaded                       | What player sees                  | Friction (>2s confusion?)         |
| --- | --------------------------------- | --------------------------------- | --------------------------------- |
| 0s  | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      |
| 5s  | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      |
| 10s | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      |
| 15s | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      |
| 30s | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      | {run-by-developer-at-Task-3}      |

If a row has nothing notable to add (e.g., the 15s state is unchanged from 10s), replace that row's contents with `(no notable change since previous row)` rather than leave the placeholder.

## Verdict

For each friction point observed in the per-timestamp log, assign a disposition:

- `keep` — intentional behavior, do nothing (e.g., the title-screen "press any key" delay is part of the design).
- `fix-now` — file a same-phase commit before Phase 1 closes (rare; only for trivial UX gates that contradict an existing locked decision).
- `fix-Phase-6` — defer to Phase 6a/6b polish work (when visual direction lock + post-FX land). Most cold-open visual friction defers here.
- `fix-Phase-7` — defer to Phase 7 meta-progression + UX consolidation. First-run onboarding flow, save-slot UI, etc.
- `accept` — known limitation; document in `backlog.md`, do NOT escalate.

Per the "polish-perfect not content-complete" philosophy (CONTEXT specifics + Phase 0 lessons), `fix-now` should be rare. Most friction items defer to Phase 6/7 polish work.

| Friction point                                                | Disposition                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| {run-by-developer-at-Task-3}                                  | {run-by-developer-at-Task-3} `keep / fix-now / fix-Phase-6 / fix-Phase-7 / accept` |

Additional rows are added by the developer at Task 3 (one row per friction point observed in the per-timestamp log). If no friction points are observed, replace the single placeholder row with `| (no friction points observed in 30s window) | accept |`.

---

*Self-test, not user test. See PROC-20 in .planning/REQUIREMENTS.md.*
