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

## FIX-03 — Pre-flight: live XP economy validation (Concern 1 mitigation (a))

Per REVIEWS Concern 1 (HIGH), before authoring the headless harness, the
`XP_PER_WAVE` schedule was validated against live RewardManager drop tables
and WaveManager composition for Waves 1-5.

### XP drop values per enemy type (from RewardManager grep)

Asteroids use an **orb-based** system: `XP_per_kill = orbCount × ORB_VALUE` where
`ORB_VALUE = 5` (from `src/data/enemies/asteroid-configs.js:648`) and `orbCount`
derives from `baseOrbs × sizeFactor × variantMultiplier + waveBonus`. Non-asteroid
enemies use a fixed `totalXP` per kill.

| Enemy / variant | baseOrbs | sizeFactor / multiplier | XP per kill (wave 1, no bonus) | Source |
|---|---|---|---|---|
| asteroid_small_common | 1 | 1.0 × 1.0 | 5 (1 orb × 5 XP) | `src/data/enemies/asteroid-configs.js:651-668` + `RewardManager.js:164-183` |
| asteroid_medium_common | 1 | 2.0 × 1.0 | 10 (2 orbs × 5 XP) | same |
| asteroid_large_common | 1 | 3.0 × 1.0 | 15 (3 orbs × 5 XP) | same |
| asteroid_small_iron | 1 | 1.0 × 2.53 ≈ 2.53 → round 3 | 15 (3 orbs × 5 XP) | `ASTEROID_VARIANTS.iron.orbMultiplier=2.53` |
| asteroid_small_volatile | 1 | 1.0 × 5.46 → round 5 | 25 (5 orbs × 5 XP) | `ASTEROID_VARIANTS.volatile.orbMultiplier=5.46` |
| asteroid_small_parasite | 1 | 1.0 × 8.1 → round 8 | 40 (8 orbs × 5 XP) | `ASTEROID_VARIANTS.parasite.orbMultiplier=8.1` |
| drone | 2 | totalXP=30 | 30 | `src/data/enemies/drone.js DRONE_REWARDS` (RewardManager.js:188) |
| mine | 1-2 | totalXP=25 | 25 | `src/data/enemies/mine.js MINE_REWARDS` (RewardManager.js:197) |
| hunter | 3 | totalXP=50 | 50 | `src/data/enemies/hunter.js HUNTER_REWARDS` (RewardManager.js:214) |
| boss | 10 | totalXP=500 | 500 | `src/data/enemies/boss.js BOSS_REWARDS` (RewardManager.js:223) |

**Wave bonus per kill:** `RewardManager.js:271` — `wave ≤ 10 ? Math.floor(wave / 5) : ...`. Waves 1-4 add 0 extra orbs; Wave 5 adds +1 orb (= +5 XP per asteroid kill).

**Wave-completion bonus:** `RewardManager.js:573` — `baseBonus = 50 + waveNumber * 10`. Perfect-wave and quick-time bonuses are conditional and excluded from the deterministic estimate.

### Wave composition (from WaveManager.loadWaveConfigurations)

Source: `src/modules/enemies/managers/WaveManager.js:160-196` (waves 1-6 are static-config; waves 7+ are procedural). Waves 1-5 baseline configuration:

| Wave | Composition | Per-enemy XP (common, no wave bonus) | Wave kill XP | Wave-complete bonus | Total expected XP |
|---|---|---|---|---|---|
| 1 | 4× small common asteroids | 5 | 20 | 60 | **80** |
| 2 | 5× small common asteroids | 5 | 25 | 70 | **95** |
| 3 | 6× small common asteroids | 5 | 30 | 80 | **110** |
| 4 | 6× medium + 2× small common asteroids | 10 / 5 | 70 | 90 | **160** |
| 5 | 7× medium + 2× small common asteroids | 15 / 10 (Wave-5 +1 orb bonus) | 125 | 100 | **225** |

Wave-5 medium asteroid XP = (2 base + 1 wave bonus) × 5 = 15 XP. Wave-5 small asteroid XP = (1 base + 1 wave bonus) × 5 = 10 XP. Totals: 7×15 + 2×10 = 125 enemy-kill XP, + 100 wave bonus = 225 XP.

**Variant procs add upside:** with the spawn distribution from `ASTEROID_VARIANT_CHANCES.small` (15% base variant chance × distribution proportions), expected XP per small asteroid is ≈ 1.6 orbs × 5 ≈ 8 XP (not 5). This pushes Wave-1 expected XP up toward ~92 and Wave-5 toward ~244. The **common-only** baseline (table above) is the deterministic lower bound; the variant-procced expectation is the upper bound. The harness uses a seeded RNG, so it will land at a specific deterministic point in this range.

### Schedule comparison (proposed vs live-derived, common-only baseline)

| Wave | Proposed | Live-derived (common baseline) | Variance |
|---|---|---|---|
| 1 | 60 | 80 | 33.3% |
| 2 | 90 | 95 | 5.6% |
| 3 | 130 | 110 | 15.4% |
| 4 | 180 | 160 | 11.1% |
| 5 | 240 | 225 | 6.3% |
| **total** | **700** | **670** | **4.3%** |

If variant procs are included (15% chance × expected orb-bonus), the live total rises toward ~720, total variance ≈ 2.9%. Either way the total is within ±15% of proposed.

**Verdict:** `LOW_VARIANCE` — total schedule variance is 4.3% (common-only) and ~3% (with variant-proc upside), both well below the 30% LOW threshold.

**Decision:** Task 1's harness will use `XP_PER_WAVE = [80, 95, 110, 160, 225]` (the live-derived common-only baseline). This is more faithful to the deterministic seeded run than the original proposed `[60, 90, 130, 180, 240]`. Variant-proc upside is not baked in (the seeded RNG in the harness will deterministically pick variants per the live RewardManager flow — but since the harness scripts XP grants directly rather than spawning enemies, we use the common-only baseline as the contract).

**RewardManager / WaveManager pristine:** No source files in `src/` were modified by this spike. Read-only grep + arithmetic only. Concern 1 mitigation (a) closed.

