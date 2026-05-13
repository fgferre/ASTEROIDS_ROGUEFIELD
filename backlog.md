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

## v2.x candidates (post-launch)

(Will be reviewed at v2 milestone close)

## Out of scope (won't fix / wrong direction)

(Items explicitly rejected; kept for memory)

---

*Created: 2026-05-12 (during /gsd:new-project Milestone 2 init)*
*PROC-09 discipline: anything that emerges mid-phase as "we should also do X" goes here.*
*Reviewed at: milestone close via `/gsd:audit-milestone` or `/gsd:complete-milestone`*
