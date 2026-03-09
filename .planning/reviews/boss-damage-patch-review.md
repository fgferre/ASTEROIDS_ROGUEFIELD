# Boss Damage Patch Review

**Date:** 2026-03-09 (updated after cross-review with Gemini 3.1 analysis)
**Bug:** Boss stops taking bullet damage after phase 2 transition
**Patch scope:** `src/modules/PhysicsSystem.js`
**Status:** Defensive fix accepted for the bullet/boss collision path; proposed root cause remains unproven

---

## What the patch does

One behavioral change in `PhysicsSystem.js`:

1. **Candidate collection** (lines 1431-1437): Replaces direct `this.spatialHash.query()` with `this.getNearbyEnemies()`, which has a built-in fallback that iterates `activeBosses` directly (lines 1357-1387) when the spatial hash doesn't return the boss.

### Patch hypothesis

The boss disappears from `spatialHash.query()` results inside `forEachBulletCollision`, so bullets can't find it. The fix uses `getNearbyEnemies()` which has a fallback that scans `activeBosses` by Euclidean distance, bypassing the spatial hash failure.

---

## Findings, by severity

### 1. HIGH — The review's proposed `SpatialHash.cleanup()` root cause is not established by code evidence

The previous version of this review stated as fact that `SpatialHash.cleanup()` was orphaning the boss from `this.objects`. That conclusion is too strong.

`SpatialHash.update()` rewrites `objectData.cells` to the new cell set before `cleanup()` runs. `cleanup()` then removes empty cells from `dirtyCells` and only deletes object metadata if **none** of the cells in `data.cells` still contains the object. The specific scenario proposed in the earlier review ("boss metadata still references deleted dirty cells after update") is not supported by the current implementation.

Manual stress checks with repeated `update()` + `cleanup()` calls and aggressive cell-boundary crossings did not reproduce orphaning. That does not prove the bug is impossible, but it means this root-cause claim should remain a hypothesis until a deterministic repro exists.

What is established: the patch hardens the bullet collision path by reusing the boss-aware nearby-enemy helper that already existed elsewhere in `PhysicsSystem`.

### 2. MEDIUM — The filter in spatial hash query inside `getNearbyEnemies` requires `activeEnemies.has(boss)`

In `PhysicsSystem.js:1340-1342`:
```js
filter: (obj) => this.activeEnemies.has(obj) && !obj.destroyed
```

And the boss fallback (line 1358):
```js
if (!boss || boss.destroyed || !this.activeEnemies.has(boss)) { return; }
```

**Both paths require the boss to be in `activeEnemies`**. During phase transition, the boss **never leaves `activeEnemies`** — `advancePhase()` doesn't touch that Set, and `EnemySystem.handleBossPhaseChange()` doesn't either. So this is safe in the current scenario. But if any future code removed the boss from `activeEnemies` during a phase without removing it from `activeBosses`, the fallback would become useless.

### 3. LOW — `SpatialHash.cleanup()` remains worth watching, but the specific orphaning theory is speculative

`cleanup()` (`SpatialHash.js:370-384`):
```js
for (const [object, data] of this.objects.entries()) {
  let found = false;
  for (const cellKey of data.cells) {
    const cell = this.grid.get(cellKey);
    if (cell && cell.has(object)) { found = true; break; }
  }
  if (!found) {
    this.objects.delete(object);  // silently drops the boss
  }
}
```

This code can still hide inconsistencies if they occur elsewhere, because the orphan cleanup is silent. But the earlier theory tying it directly to `dirtyCells` deletion during normal boss movement is not demonstrated by the code path above and was not reproduced in quick stress validation.

### 4. LOW — Performance: `getNearbyEnemies` does more work than direct `query`

The old code did a single `spatialHash.query()` with an inline filter. The new code does `spatialHash.query()` **+** iteration over `activeBosses` with distance calculation + `enriched` array allocation + `Set` deduplication, **for every bullet every frame**. In scenes with many bullets and few enemies, the overhead is marginal. In scenes with hundreds of bullets, the extra per-bullet cost (temporary Set/Array allocation, activeBosses iteration) may be measurable but unlikely to be a bottleneck given that `activeBosses` is typically size 1.

### 5. MEDIUM — The test validates the fallback, not the full long-run gameplay scenario

The new test (`BossDamageFeedback.test.js:219-248`) stubs `spatialHash.query` to return `[]` and confirms the collision is still detected. This validates the fallback, but **doesn't test the real scenario** (boss naturally disappearing from spatial hash after prolonged gameplay). There is no integration test that simulates:
- Full phase transition with invulnerability timer
- Spatial hash cleanup running during the cycle
- Boss receiving damage after invulnerability expires

### 6. INFO — Post-phase invulnerability is NOT the bug

Confirmed that `invulnerabilityTimer` is decremented correctly in `updateInvulnerability()` (`BossEnemy.js:561-594`) and the timer is set to `invulnerabilityDuration` (2s). The boss **becomes vulnerable again** after 2 seconds. The reported bug ("boss permanently stops taking damage") is not caused by stuck invulnerability — it's truly a collision detection problem, which confirms the patch's direction.

### 7. INFO — The earlier note about the redundant early-return guard is now moot

That redundant guard was removed. The patch now changes only the candidate-collection path that materially affects bullet/boss collisions.

---

## Cross-review: Gemini 3.1 analysis evaluation

Gemini proposed an alternative root cause: `maxEnemyRadius` gets stuck at 60 (the boss's visual `radius`) instead of 84 (60 + 24 spatialPadding), because `updateMaxEnemyRadiusFromPayload()` finds `radius=60` in the payload keys and never reaches the boss-specific fallback that would use `resolveEnemySpatialRadius()`.

**Verdict: This claim is INCORRECT.** `registerEnemy()` has two sequential checks:
1. Line 314: `updateMaxEnemyRadiusFromPayload(enemy)` — finds `radius=60`, sets candidates to `[60]`, skips boss fallback. Would set `maxEnemyRadius = 60`.
2. Lines 315-318: `resolveEnemySpatialRadius(enemy)` returns `84` (60 base + 24 spatialPadding). Since `84 > 60`, `maxEnemyRadius` is updated to `84`.

The second check explicitly compensates for what the first misses. `maxEnemyRadius` is correctly 84 after boss registration.

Gemini also claimed that the game loop's sequential nature (enemies → physics → combat) makes it impossible for the spatial hash to be stale when bullet collisions are checked. **This is directionally correct** for ordinary position updates: positions are synchronized before combat checks run. That does not, by itself, explain the original intermittent miss, but it does weaken any theory that depends on simple per-frame positional staleness.

**Valid Gemini observations incorporated:**
- The earlier early-return guard change was redundant
- The performance concern about bypassing the spatial hash pattern is noted (already covered in Finding #4)

**Rejected Gemini observations:**
- `maxEnemyRadius` stuck at 60: disproven by reading the full `registerEnemy()` flow
- "The spatial hash always has up-to-date bounds" as a complete explanation: insufficient to explain the intermittent miss by itself
- "Query geometry / subdimensioned bounds" as root cause: not supported by code evidence; `maxEnemyRadius` is correctly 84

---

## Conclusion

**The patch resolves the observed failure mode in the bullet/boss collision path** by introducing a robust fallback ensuring the boss is still considered as a collision candidate when the direct spatial-hash lookup misses it. The change is **correct and defensive**.

However, the review does **not currently prove** why the direct spatial-hash lookup misses the boss in the first place. The earlier conclusion that `cleanup()` is the root cause was overstated.

**Residual risks:**
- There is still no deterministic reproduction of the original long-session failure
- Any future bullet-like path that bypasses `getNearbyEnemies()` could reintroduce the symptom
- The new regression test covers the fallback itself, not a full gameplay timeline with phase transition + cleanup cadence

**Recommendation:** Accept the patch. If deeper investigation is needed later, instrument direct boss misses at the `spatialHash.query()` call site before changing `SpatialHash.cleanup()`. At the moment, hardening the collision path is justified; rewriting hash cleanup based on the current evidence is not.
