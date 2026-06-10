# M1 Fun-Check — Formal Write-Up (Phase 1, 2026-05-13)

Phase 1 PROC-19 formal documentation of the informal M1 fun-check + post-Phase-0 verification. Built on the post-Phase-0 main commit (`ce47a17` = FIX-04 close).

## Method

Single self-administered pass per FIX-*. For each of the four bugs surfaced by the informal M1 fun-check (FIX-01..04), the developer:

1. Reads the Phase 0 evidence file for that fix (linked below).
2. Reproduces the original M1 issue against the post-Phase-0 `main` build (`ce47a17` or later — the FIX-04 close commit).
3. Records a one-line live observation under **Evidence**.
4. Selects a Verdict from `GONE` (no longer reproducible), `PARTIAL` (mostly fixed, edge case remains), or `FAILED` (still reproducible).

Per CONTEXT D-33: verdicts come from the developer's live reproduction runs against `ce47a17`, NOT from re-running the Phase 0 evidence tests. The Phase 0 evidence files describe what was fixed; this doc records whether the fix held under fresh play.

If any verdict turns out below `GONE`, a follow-up `FIX-*` entry is filed in `backlog.md` per PROC-09 — Phase 0 is NOT reopened unless the regression is blocking.

## Bugs found in the informal M1 fun-check

The informal Phase 0 fun-check surfaced four bugs that became the M1 Stabilization phase's FIX-01..04 work items:

1. **Aim system audit — see [docs/aim-audit-2026-05-12.md](aim-audit-2026-05-12.md)** — FIX-01. Some aim-related upgrades (`multishot`, `targeting_suite`, `plasma`) did not demonstrably affect projectile trajectory, spread, or aim point at certain upgrade levels. Per-rank audit confirmed the production handlers correctly read the UpgradeSystem-injected `level` field; the audit closed as `audit-clean` with a regression suite locking the current correct behavior.
2. **Mobility brake bug — see [docs/balance-retune-2026-05-12.md §FIX-02](balance-retune-2026-05-12.md#fix-02--mobility-brake-bug)** — FIX-02. The `braking_system` upgrade caused linear damping to fight active thrust, so picking the upgrade silently sapped peak velocity on held-thrust frames. Fix split damping into `baseLinearDamping` (always applied) + `brakingDamping` (only when neither main nor aux thrust is held).
3. **Progression rate retune — see [docs/balance-retune-2026-05-12.md §FIX-03](balance-retune-2026-05-12.md#fix-03--progression-rate-retune)** — FIX-03. Upgrades dropped too frequently; the original informal run reached Wave 5 with 15+ distinct upgrades. Target band per ROADMAP SC3 = **6–8 distinct upgrades by end of Wave 5**. Locked via `PROGRESSION_LEVEL_SCALING = 1.40` + `PROGRESSION_INITIAL_XP_REQUIREMENT = 150` after a post-playtest correction confirmed the harness-to-live ratio is ~3×.
4. **Boss-curve calibration — see [docs/balance-retune-2026-05-12.md §FIX-04](balance-retune-2026-05-12.md#fix-04--boss-curve)** — FIX-04. Boss difficulty was binary (impossible for low-upgrade builds, trivial for high-upgrade builds). Fix introduced `UPGRADE_BOSS_HEALTH_SCALAR = 0.18` and `UPGRADE_BOSS_DAMAGE_SCALAR = 0.00` (damage scalar dropped to 0 after live playtest revealed it lethaled 6-upgrade builds). Target per FIX-04 = 6-upgrade kill in 60–90s; 15-upgrade survives ≥45s with ≥1 phase transition.

## Post-fix verification

Each issue was reproduced against the post-Phase-0 `main` build. The four subsections below carry the live observations + verdict.

### Issue 1 verification — FIX-01 (Aim system audit)

- **Method:** Fresh `npm run dev` run. Pick `multishot` to rank 2 + `targeting_suite` to rank 2 (or similar aim-affecting upgrades from `src/data/upgrades/offense.js`). Observe (a) whether the projectile fan widens visibly at rank 2 vs rank 1, AND (b) whether the dynamic-prediction marker tracks moving asteroids (targeting_suite rank 2 enables `dynamicPredictionEnabled`).
- **Evidence:** Developer live runs (2026-05-16→20, build @ `b7a31cc`, via `?desktop=force` — see backlog mobileGuard entry): projectile fan visibly widens at rank 2 vs rank 1, AND the dynamic-prediction marker tracks moving asteroids. Both signals confirmed.
- **Verdict:** `GONE`

### Issue 2 verification — FIX-02 (Mobility brake bug)

- **Method:** Fresh run. Pick `braking_system` rank 1, 2, 3 progressively across waves. On rank 3, hold the main thrust key for 5 seconds. Observe (a) whether peak velocity stays responsive under continuous thrust (no "brake on active thrust" feel vs baseline), AND (b) whether stops feel snappier than baseline once the thrust key is released.
- **Evidence:** Developer live runs (2026-05-16→20): no "brake fighting thrust" feel under 5s of held main thrust at braking_system rank 3 — peak velocity stays responsive; stops feel snappier once the thrust key is released. Both signals confirmed.
- **Verdict:** `GONE`

### Issue 3 verification — FIX-03 (Progression rate retune)

- **Method:** Fresh run. Reach Wave 5 naturally. Count distinct upgrade cards selected by end of Wave 5 (NOT total level-ups — picking `Propulsores Principais` three times is ONE distinct upgrade). Target band per FIX-03 = **6–8 distinct upgrades at Wave 5**. Plan 0.03 Task 3 already validated this as a BLOCKING gate live; this verification re-confirms after subsequent commits.
- **Evidence:** Developer live run (2026-05-16→20): **6 distinct upgrades** selected by end of Wave 5 — inside the 6–8 target band (low edge).
- **Verdict:** `GONE`

### Issue 4 verification — FIX-04 (Boss-curve calibration)

- **Method:** Continue the run from Issue 3 into the Wave-5 boss fight (or restart fresh and reach the boss with 6 upgrades collected). Stopwatch the kill time. Target band per FIX-04 = **60–90s with a 6-upgrade build**. Then continue (or fresh run accumulating ~15 upgrades by Wave 8–9) and fight the Wave-8-or-9 boss; record kill time AND distinct phase transitions observed. Target per FIX-04 = **≥45s with ≥1 phase transition**. Phase 0 Plan 04 Task 4 BLOCKING gate already validated the 6-upgrade case live; this verification re-confirms.
- **Evidence:** Developer live run (2026-05-16→20): Wave-5 boss killed in **~120s** with a 6-upgrade build — "difícil, mas dá" (hard but doable). Above the 60–90s target band by ~30s. The Wave-8/9 high-upgrade case (≥45s + ≥1 phase transition with ~15 upgrades) was NOT reached this session — unvalidated in this pass.
- **Verdict:** `PARTIAL` — the original binary-difficulty bug is gone (boss is killable with a low-upgrade build and the fight has texture), but kill time sits ~30s above the calibration band and the high-upgrade case lacks evidence. Follow-up filed in `backlog.md` per PROC-09 (boss-curve calibration recheck + Wave-8/9 validation); Phase 0 NOT reopened — regression is non-blocking.

## Scope note (D-34)

This doc is **"bugs are gone"**, NOT **"loop is addictive."** Loop-addictiveness is the Phase 3.5 internal-loop-test territory — the trusted-circle members run that test (PROC-16), not the developer alone. Phase 1's m1-fun-check answers: *"did Phase 0 close the four bugs surfaced by the informal fun-check?"* It does NOT answer: *"is the M1-equivalent build addictive?"*

Per CONTEXT D-34, this doc resists scope creep toward addictiveness verdicts. If the verification surface during Task 3 reveals a non-bug observation that affects loop feel (pacing, satisfaction, etc.), that observation goes into `backlog.md` per PROC-09 — NOT into this doc's verdict column.

---

*See PROC-19 in .planning/REQUIREMENTS.md.*
