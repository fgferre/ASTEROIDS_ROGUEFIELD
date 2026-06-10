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

**PerformanceMonitor capture (optional — deferred per 2026-05-14 scope decision):** the INFRA-01 harness exposes `?profile=cold-open` to capture FPS / frame-time / phase timings into `.planning/research/profile-cold-open-<date>.json`, but the formal Phase 1 baseline-run was descoped (see `backlog.md` "Deferred from Phase 1"). Capture is still available ad-hoc via `http://localhost:5500/?profile=cold-open` if perf evidence helps the verdict table; otherwise this section can be skipped and the cold-open test stands as a pure UX self-test.

**Screenshots (optional):** the developer may attach `.planning/research/cold-open-screenshot-<t>.png` files if a visual reference helps the verdict table. `.planning/research/` is gitignored per CLAUDE.md GSD Local Practices.

## Per-timestamp log

> **Note (2026-05-20):** abbreviated developer sign-off. Detailed stopwatch observation was declined this session; rows below are reconstructed from the live debug + playtest sessions of 2026-05-16→20. The headline finding (0% loading hang) was reproduced and diagnosed in-session with full evidence.

| t   | What loaded                       | What player sees                  | Friction (>2s confusion?)         |
| --- | --------------------------------- | --------------------------------- | --------------------------------- |
| 0s  | **WITHOUT `?desktop=force`: boot halts — loading screen stuck at 0% indefinitely** (mobileGuard false positive, see Verdict). With the flag: Vite + module graph loads normally | "ASTEROID ROGUEFIELD" title + 0% progress bar | **YES — fatal on affected machines** (see Verdict row 1) |
| 5s  | (with flag) menu + Three.js background loaded | Hull selection (Default Interceptor / Solar Slicer) + START/OPTIONS/CREDITS | none reported |
| 10s | (with flag) run started | Ship + first asteroids, combat readable | none reported |
| 15s | (no notable change since previous row) | (no notable change since previous row) | none reported |
| 30s | (with flag) combat underway | XP orbs dropping/collected, wave progressing | none reported |

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
| Loading hangs at 0% on Windows desktops where `navigator.maxTouchPoints > 0` (most modern Win10/11 machines — Touch APIs enabled without a physical touch screen). Root cause: `mobileGuard.isTouchDevice()` single-signal `maxTouchPoints` probe trips A11Y-08 block; the "Desktop only" canvas notice is then hidden UNDER the DOM loading overlay, so the player sees a silent 0% hang with no explanation. Diagnosed live 2026-05-16→20 (preview browser + developer's Chrome both reproduced; `?desktop=force` confirmed as workaround). | `accept` for Phase 1 close (dev workaround exists; documented in `backlog.md`) — **BUT must be fixed before Phase 3.5 internal-loop test**: trusted-circle testers on touch-capable Windows laptops would hit a silent fatal hang. Backlog entry carries the fix sketch (multi-signal detection + DOM-level notice). |

Additional rows are added by the developer at Task 3 (one row per friction point observed in the per-timestamp log). If no friction points are observed, replace the single placeholder row with `| (no friction points observed in 30s window) | accept |`.

---

*Self-test, not user test. See PROC-20 in .planning/REQUIREMENTS.md.*
