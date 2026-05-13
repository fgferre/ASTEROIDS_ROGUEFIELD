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

## v2.x candidates (post-launch)

(Will be reviewed at v2 milestone close)

## Out of scope (won't fix / wrong direction)

(Items explicitly rejected; kept for memory)

---

*Created: 2026-05-12 (during /gsd:new-project Milestone 2 init)*
*PROC-09 discipline: anything that emerges mid-phase as "we should also do X" goes here.*
*Reviewed at: milestone close via `/gsd:audit-milestone` or `/gsd:complete-milestone`*
