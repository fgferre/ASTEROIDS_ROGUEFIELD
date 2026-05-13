# Balance Retune — 2026-05-12

Phase 0 (M1 Stabilization) retune log. Each FIX-* contributes its own section.

## FIX-02 — Mobility Brake Bug

**Root cause (confirmed):** `src/modules/PlayerSystem.js` previously stored a single
`this.linearDamping` field that was multiplied by `upgrade-linear-damping` events
(ranks 1.30, 1.60, 2.00 cumulative) and applied every tick in
`Math.exp(-this.linearDamping * deltaTime)` — including frames where the player
held main or reverse thrust. Result: the `braking_system` upgrade silently sapped
active-flight peak velocity in addition to its advertised stopping-power effect.

**Fix:** Split linear damping into `baseLinearDamping` (immutable, seeded from
`SHIP_LINEAR_DAMPING = 3.1`) and `brakingDamping` (mutated by upgrade events,
additive). The tick-time conditional applies `baseLinearDamping + brakingDamping`
only when `!isMainManual && !isAuxManual`; during active thrust only
`baseLinearDamping` applies. This preserves the upgrade's stated intent
("Paradas mais rápidas") without degrading flight.

**Numerical values after max-rank braking_system (ranks 1.30 → 1.231 → 1.25,
cumulative):**

| Field                  | Value         | Notes                                                                      |
| ---------------------- | ------------- | -------------------------------------------------------------------------- |
| `baseLinearDamping`    | 3.1           | Invariant; equals `SHIP_LINEAR_DAMPING`                                    |
| `brakingDamping` (r1)  | 0.93          | Additive component after rank 1 (1.30x multiplier)                         |
| `brakingDamping` (r2)  | 1.86093       | Additive component after rank 2 cumulative (1.30 × 1.231)                  |
| `brakingDamping` (r3)  | 3.1011625     | Additive component after rank 3 cumulative (1.30 × 1.231 × 1.25)           |
| Effective during burn  | 3.1           | Only `baseLinearDamping` applies during thrust                             |
| Effective during coast | 6.2011625 (r3) | `baseLinearDamping + brakingDamping`; matches catalog "Total 2.00x"        |

**Regression lock:** `tests/modules/PlayerSystem.brake.test.js` asserts:

- Peak velocity under continuous main-thrust within ±2% of baseline (no upgrade).
- Post-release decay strictly faster than baseline.
- Per-rank monotonic increase in `brakingDamping`.

All three cases pass on first run; full Vitest suite (45 files, 317 tests) green.

### Other mobility upgrades audited (per D-11)

| Upgrade        | Event(s)                                                                                          | PlayerSystem handler              | Fights thrust?                                                                                                                                                                                                                                                                                                                                                                              | Action                                              |
| -------------- | ------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| propulsors     | upgrade-acceleration-boost, upgrade-speed-boost, upgrade-thruster-visual, upgrade-ion-trail        | lines 342-352, 337-340            | **No** — multiplies `this.acceleration` (consumed inside the per-tick thrust block as `accelStep = this.acceleration * deltaTime`) and `this.maxSpeed` (a velocity ceiling clamp, not a per-tick drag). Neither field is added to the damping term.                                                                                                                                          | None                                                |
| rcs_system     | upgrade-rotation-boost, upgrade-angular-damping, upgrade-rcs-visual, upgrade-strafe-movement       | lines 347-352, 355-361            | **No** — angular axis is gated separately at line 781 (`Math.exp(-this.angularDamping * deltaTime)`); rotation input always overrides because `this.angularVelocity += angularAccel` is applied **before** the damping term (line 778). Strafe-movement (rank 5) is not yet wired into PlayerSystem — pre-existing TODO, NOT a Phase 0 bug.                                                  | None for Phase 0. Strafe wiring → `backlog.md`     |
| braking_system | upgrade-linear-damping, upgrade-braking-visual, upgrade-emergency-brake                            | lines 363-376 (fixed), 384-389    | **YES** (the FIX-02 bug). Emergency-brake (rank 3) wiring TBD; not exercised by current tests.                                                                                                                                                                                                                                                                                              | Fixed above. Emergency-brake → `backlog.md` if not already wired |

**Conclusion:** The other mobility upgrades do NOT exhibit the same thrust-fighting
pathology. FIX-02 is scoped to the `braking_system` / `upgrade-linear-damping`
axis only.

### Concern 7 (REVIEWS.md) note

The reviewer-suggested defensive `set linearDamping(v) -> console.warn` was
**declined** as out-of-scope per CONTEXT D-26 (logging frozen for Phase 0:
"keep the existing console.log calls in PlayerSystem event handlers; do not add
or remove them"). The Task-1b repo-wide grep is the hard gate guaranteeing no
external writer exists; the setter would have been a soft trip-wire during the
manual fun-check. Decision recorded in the FIX-02 commit message body under
`### Concern 7 grep`.

Specifically: Concern 7 (REVIEWS.md): defensive `set linearDamping(v) -> console.warn`
declined as out-of-scope per CONTEXT D-26 (logging frozen for Phase 0). The
grep-based gate in Task 1b step 1 is the hard guarantee; the setter would have
been a soft trip-wire.

### Manual fun-check

To be performed by the developer after FIX-02 commit lands. Procedure: in dev
build (`npm run dev`), pick up `braking_system` rank 1, then rank 2, then rank 3
in sequence; confirm:

1. Ship still accelerates forward at the expected rate during continuous thrust
   (no perceptible "wall" or sluggishness during active flight).
2. Ship stops faster on key release as rank increases (the upgrade's positive
   effect).

This is the Success Criterion 2 ground truth — append timestamp + observed result
under this heading when the fun-check is performed. Manual fun-check is the
runtime confirmation of the automated test gate above.
