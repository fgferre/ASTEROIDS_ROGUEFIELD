# Backlog

Ideas and follow-ups surfaced during development that are explicitly NOT part of
the current scope. Per PROC-09 / PROC-10 (scope freeze), these stay here until a
later milestone picks them up.

## Mobility audit follow-ups (Phase 0 FIX-02, 2026-05-12)

- [Mobility audit, 2026-05-12] rcs_system rank 5 (`upgrade-strafe-movement`): event is emitted by the upgrade catalog (`src/data/upgrades/mobility.js:303`) but no `PlayerSystem` handler consumes it — strafe movement is therefore inert. Pre-existing wiring gap, not a Phase 0 regression. Investigate post-Phase-0 (likely Phase 1 polish or a dedicated mobility-completeness pass).
- [Mobility audit, 2026-05-12] braking_system rank 3 (`upgrade-emergency-brake`): event is emitted (`src/data/upgrades/mobility.js:402`) but no handler consumes it — emergency-brake is inert and the player gets no Shift-key shockwave despite the upgrade card saying so. Pre-existing wiring gap, not a Phase 0 regression. Investigate post-Phase-0.
