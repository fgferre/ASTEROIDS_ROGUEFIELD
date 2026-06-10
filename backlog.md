# Backlog

Ideas, features, and "we should also do X" thoughts that arise mid-development.
**Per PROC-09/10 scope discipline: items here NEVER go to v1.** Reviewed at milestone close.

## Format

```
- [YYYY-MM-DD] [category] Description — context: why it came up
```

Categories: `feature`, `enhancement`, `bug` (non-v1), `idea`, `tech-debt`, `research`

## Mobility audit follow-ups (Phase 0 FIX-02, 2026-05-12)

- [Mobility audit, 2026-05-12] rcs_system rank 5 (`upgrade-strafe-movement`): event is emitted by the upgrade catalog (`src/data/upgrades/mobility.js:303`) but no `PlayerSystem` handler consumes it — strafe movement is therefore inert. Pre-existing wiring gap, not a Phase 0 regression. Investigate post-Phase-0 (likely Phase 1 polish or a dedicated mobility-completeness pass).
- [Mobility audit, 2026-05-12] braking_system rank 3 (`upgrade-emergency-brake`): event is emitted (`src/data/upgrades/mobility.js:402`) but no handler consumes it — emergency-brake is inert and the player gets no Shift-key shockwave despite the upgrade card saying so. Pre-existing wiring gap, not a Phase 0 regression. Investigate post-Phase-0.

## Phase 7 META-04 candidates (in-scope v1, deferred direction)

- [2026-05-13] [feature] **Harmonic Plasma Lance — alternate weapon as META-04 unlock.** Design direction explored during Phase 1 fun-check (PROC-19): a second weapon with its own identity (split fragments / chain / charged burst mode) sketched as a way to expand weapon variety post-launch. Decision was NOT to fold this into the current single-weapon refactor (Plan 01.07 / FIX-05) — that plan keeps the existing plasma cannon + multishot + targeting_suite intact and just fixes the centerline bug + adds toggles. Lança Harmônica is preserved as a Phase 7 META-04 unlock variant: one slot of meta-progression catalog, modest scope (≤30% of total meta-power catalog per PROJECT.md cap). Concept sketch: base = single beam-like projectile; Plasma Resonance rank 1-3 = damage scalar + on-impact fragment splits with chain capability; Targeting Lattice rank 1-3 = aim-line color coding + predicted-impact marker + in-flight homing; Resonance Cascade rank 1-3 = hold-fire burst modes culminating in a 1-second high-rate cascade with empowered shots. Tag mapping for Phase 3 5-tag taxonomy: kinetic + chain + tech. Validated through 4 rounds of Codex review.

## Deferred from Phase 1 (2026-05-14)

- [2026-05-14] [perf] Run INFRA-01 harness across 4 scenarios (`?profile=cold-open|mid-game|boss-arena|late-stress`) and execute `node scripts/synthesize-baseline.mjs` to produce `.planning/research/profile-baseline-*.md` with top-5 hot paths — context: Phase 1 SC1 deferred per developer decision; the measurement step is descoped until either (a) a perf complaint surfaces in playtesting, or (b) Phase 6b post-FX work lands and we need a baseline before chromatic/bloom/grain. The harness itself stays in `src/bootstrap/profileHarness.js` (zero-overhead — only activates when URL has `?profile=`).
- [2026-05-14] [polish] **HUD mode indicators — icons + color-coding (Phase 6b candidate).** Plan 01.07 shipped the FIX-05 mode toggles ([G] spread CONC/FAN, [T] aim AUTO/MANUAL) wired into the AAA tactical HUD at `src/modules/ui/AAAHudLayout.js:586` as plain-text labels (`AIM: AUTO   SPREAD: CONC`). Decision 2026-05-14: ship Phase 1 text-only; revisit visual treatment in Phase 6b when `docs/visual-direction.md` locks an icon set + the post-FX palette. Goal: subtle glyph + tier-appropriate color (must NOT collide with the threat palette `#00F2FF`/`#FFA800`/`#FF3131` already used by lock rings). Behavioral feedback (bullets visibly change pattern when modes flip) is the primary signal — HUD polish is enrichment, not correctness.

## Phase 1 close follow-ups (2026-05-20)

- [2026-05-20] [bug] **mobileGuard false positive blocks Windows desktops — MUST land before Phase 3.5 internal-loop test.** `isTouchDevice()` in `src/bootstrap/mobileGuard.js` returns true on any machine with `navigator.maxTouchPoints > 0` — which is most modern Win10/11 desktops/laptops (Windows enables Touch APIs without a physical touch screen; developer's own machine reports `maxTouchPoints: 10`). The A11Y-08 block then halts boot, and the "Desktop only" notice painted on `#game-canvas` is hidden UNDER the DOM loading overlay → player sees a silent 0% loading hang. Diagnosed live 2026-05-16→20; `?desktop=force` confirmed as workaround. Fix sketch: (1) require 2+ concurrent signals (e.g. `maxTouchPoints > 0` AND (`ontouchstart` OR `pointer: coarse`)) instead of single-signal OR; (2) on the blocked path, hide/remove the `#loading-screen` DOM overlay AND render the notice as DOM (not canvas) so it is always visible. Re-verify on real hardware at Phase 6a (A11Y-08 clause) — but the false-positive fix cannot wait that long: trusted-circle testers on Windows laptops would hit a fatal silent hang at Phase 3.5. — context: surfaced by PROC-20 cold-open test, Plan 01.04 Task 3.
- [2026-05-20] [tech-debt] **Boss-curve calibration recheck (follow-up to Phase 0 FIX-04, per PROC-09 from m1-fun-check PARTIAL verdict).** Live verification 2026-05-16→20: Wave-5 boss kill took ~120s with a 6-upgrade build — above the 60–90s target band by ~30s ("difícil, mas dá"). The binary-difficulty bug remains fixed (boss killable, fight has texture) so Phase 0 is NOT reopened, but the calibration sits high. Additionally the Wave-8/9 high-upgrade case (≥45s survival + ≥1 phase transition with ~15 upgrades) was not reached this session and remains unvalidated since the Plan 00.04 close. Next playtest that reaches a boss: stopwatch both cases; if 6-upgrade kill still >90s, retune `UPGRADE_BOSS_HEALTH_SCALAR` (currently 0.18). — context: docs/m1-fun-check.md Issue 4 verification.
- [2026-05-20] [process] **Resume full numeric PROC-12 ratings in Month 2 (June 2026).** Month 1 row in docs/self-check-log.md recorded as abbreviated sign-off ("tudo ok", no 1-10 numbers) — developer declined detailed ratings during Phase 1 close. The PROC-12 3-consecutive-months trigger needs numerics to function; one abbreviated month is acceptable (the loud-skip semantic flags it), two consecutive would degrade the burnout brake. — context: Plan 01.06 Task 3.

## v2.x candidates (post-launch)

(Will be reviewed at v2 milestone close)

## Out of scope (won't fix / wrong direction)

(Items explicitly rejected; kept for memory)

---

*Created: 2026-05-12 (during /gsd:new-project Milestone 2 init)*
*PROC-09 discipline: anything that emerges mid-phase as "we should also do X" goes here.*
*Reviewed at: milestone close via `/gsd:audit-milestone` or `/gsd:complete-milestone`*
