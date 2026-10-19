// src/modules/combat/targeting/LockPlanner.js
//
// How many shots a lock is worth and who gets which slots: the damage-aware
// allocation per enemy, the rank-3 multi-lock assignments (one slot per shot,
// piled on the most urgent targets) and the per-enemy overkill cap. Targeting
// owns it and asks it to rebuild the lock set from the priority list.

export class LockPlanner {
  /**
   * `playerStats()`: the player stats CombatSystem read this tick ({ multishot, damage }), or null.
   * `spreadMode()`: 'concentrated' or 'fan' (the shots a lock is worth).
   * `isValidTarget(enemy)`: true while the enemy is alive, solid and in range.
   * `dangerWeights()`: the live danger weights (the stack multiplier).
   * `targetingPriorityList()`: the enemies in range, best first.
   * `targetThreatCache()`: the threat of each enemy in range, by id.
   */
  constructor({
    playerStats,
    spreadMode,
    isValidTarget,
    dangerWeights,
    targetingPriorityList,
    targetThreatCache,
  }) {
    this.playerStats = playerStats;
    this.spreadMode = spreadMode;
    this.isValidTarget = isValidTarget;
    this.dangerWeights = dangerWeights;
    this.targetingPriorityList = targetingPriorityList;
    this.targetThreatCache = targetThreatCache;
  }

  /**
   * Damage-aware shot allocation cap. Caps allocation at
   * `Math.ceil(targetHealth / volleyDamage)` so a high-damage build doesn't
   * waste locks on already-dead-by-volley targets.
   *
   * In concentrated mode all shots in a lane group hit (`EXPECTED_HIT_RATE = 1.0`).
   * In fan mode the rate is conservative (`0.6`) to avoid under-allocating.
   *
   * Plan 01.07 Task 3.
   *
   * @param {object} enemy - The enemy to allocate shots against.
   * @param {object} [playerStats] - Reads {damage, multishot}.
   * @returns {number} Number of shots to allocate, capped at multishot.
   */
  computeAllocatedShots(enemy, playerStats = {}) {
    const multishot = Number(playerStats?.multishot);
    const shotCount = Number.isFinite(multishot)
      ? Math.max(1, Math.floor(multishot))
      : 1;

    if (!enemy) {
      return shotCount;
    }

    const damageRaw = Number(playerStats?.damage);
    const damage = Number.isFinite(damageRaw) && damageRaw > 0 ? damageRaw : 0;
    if (damage <= 0) {
      // No damage configured → fall back to multishot cap to avoid divide-by-zero.
      return shotCount;
    }

    const hitRate = this.spreadMode() === 'fan' ? 0.6 : 1.0;
    // Fix-pass-2 C2 (REVERT first fix-pass F2): the cap is BULLET-COUNT, not
    // a single mega-volley damage value. The caller spawns N bullets each
    // dealing `damage` — so per-bullet damage = `damage * hitRate` (hitRate
    // accounts for fan-mode misses). Number of bullets needed to kill =
    // ceil(targetHP / (damage * hitRate)), and we cap that at multishot below.
    //
    // The first fix-pass mistakenly multiplied by shotCount, treating the
    // burst as one big volley that all hits OR all misses together. That
    // UNDER-FIRED mid-HP targets (e.g., HP=500/dmg=100/multi=4 capped at 2
    // bullets, delivering 200 dmg < 500 HP — wasted half the burst the
    // player paid multishot for). See the "C2:" tests in tests/integration/aim/.
    const volleyDamage = damage * hitRate;
    if (volleyDamage <= 0) {
      return shotCount;
    }

    const healthRaw = Number(enemy?.health);
    const maxHealthRaw = Number(enemy?.maxHealth);
    const targetHealth =
      Number.isFinite(healthRaw) && healthRaw > 0
        ? healthRaw
        : Number.isFinite(maxHealthRaw) && maxHealthRaw > 0
          ? maxHealthRaw
          : 1;

    const needed = Math.max(1, Math.ceil(targetHealth / volleyDamage));
    return Math.min(shotCount, needed);
  }

  buildLockAssignments(desiredCount) {
    const count = Math.max(0, Math.floor(desiredCount));
    if (count <= 0) {
      return [];
    }

    const validEntries = this.targetingPriorityList().filter(
      (entry) =>
        entry &&
        entry.enemy &&
        !entry.enemy.destroyed &&
        this.isValidTarget(entry.enemy)
    );

    if (!validEntries.length) {
      return [];
    }

    const stats = validEntries.map((entry, index) => {
      const enemy = entry.enemy;
      const threat = this.targetThreatCache().get(enemy.id) || {};
      const breakdown =
        threat.breakdown?.impact ||
        (threat.breakdown ? threat.breakdown.impact : null) ||
        entry.breakdown?.impact ||
        null;
      const recommended = Math.max(
        1,
        Math.min(
          count,
          Math.round(
            breakdown && Number.isFinite(breakdown.recommendedShots)
              ? breakdown.recommendedShots
              : threat.breakdown?.impact?.recommendedShots || 1
          )
        )
      );
      const urgency = Number.isFinite(breakdown?.urgency)
        ? breakdown.urgency
        : Number.isFinite(threat.breakdown?.impact?.urgency)
          ? threat.breakdown.impact.urgency
          : entry.score ?? 0;
      return {
        enemy,
        index,
        threat,
        breakdown: threat.breakdown || entry.breakdown || null,
        recommended,
        urgency,
        score: entry.score ?? 0,
        id: enemy.id,
        assigned: 0,
        remaining: recommended,
      };
    });

    const counts = new Map();
    let remaining = count;

    // Baseline assignment - ensure each top priority target receives at least one slot
    for (let i = 0; i < stats.length && remaining > 0; i += 1) {
      const stat = stats[i];
      counts.set(stat.id, 1);
      stat.assigned = 1;
      stat.remaining = Math.max(0, stat.recommended - 1);
      remaining -= 1;
    }

    const computePriority = (stat) => {
      if (!stat) {
        return -Infinity;
      }
      const urgency = Number.isFinite(stat.urgency) ? stat.urgency : 0;
      const stackMultiplier = Math.max(
        0,
        this.dangerWeights()?.impact?.stackMultiplier || 0
      );
      const remainingBias = Math.max(0, stat.remaining || 0);
      const scoreBias = Number.isFinite(stat.score) ? stat.score : 0;
      return (
        urgency * (1 + stackMultiplier * 0.5 + remainingBias) + scoreBias * 0.01
      );
    };

    while (remaining > 0 && stats.length) {
      let bestStat = null;
      let bestValue = -Infinity;
      for (const stat of stats) {
        const value = computePriority(stat);
        if (value > bestValue) {
          bestValue = value;
          bestStat = stat;
        }
      }

      if (!bestStat) {
        break;
      }

      counts.set(bestStat.id, (counts.get(bestStat.id) || 0) + 1);
      bestStat.assigned += 1;
      bestStat.remaining = Math.max(
        0,
        bestStat.recommended - bestStat.assigned
      );
      remaining -= 1;
    }

    const topStat = stats[0];
    while (remaining > 0 && topStat) {
      counts.set(topStat.id, (counts.get(topStat.id) || 0) + 1);
      topStat.assigned += 1;
      topStat.remaining = Math.max(0, topStat.recommended - topStat.assigned);
      remaining -= 1;
    }

    const assignments = [];
    stats.forEach((stat) => {
      const totalForTarget = counts.get(stat.id) || 0;
      for (let i = 0; i < totalForTarget; i += 1) {
        assignments.push({
          enemy: stat.enemy,
          priorityIndex: stat.index,
          threat: stat.threat,
          breakdown: stat.breakdown,
          urgency: stat.urgency,
        });
      }
    });

    if (assignments.length > count) {
      assignments.length = count;
    }

    while (assignments.length < count && topStat) {
      assignments.push({
        enemy: topStat.enemy,
        priorityIndex: topStat.index,
        threat: topStat.threat,
        breakdown: topStat.breakdown,
        urgency: topStat.urgency,
      });
    }

    assignments.sort((a, b) => {
      if (a.priorityIndex !== b.priorityIndex) {
        return a.priorityIndex - b.priorityIndex;
      }
      return 0;
    });

    // Fix-pass-3 Finding 1: apply the per-enemy overkill cap UPSTREAM inside
    // buildLockAssignments so the returned assignments already reflect the
    // damage-aware shot allocation. Downstream consumers (render lock-ring
    // count, predicted-aim markers, multi-lock indicators, weapon-fired
    // event payload, handleShooting fire loop) all read
    // `currentLockAssignments` — if the cap only ran in handleShooting,
    // those surfaces would see a stale 4-lock layout for a 1-shot enemy.
    // Cap uses this.playerStats() (the same source computeLockCount
    // reads in updateTargeting → rebuildLockSet → buildLockAssignments).
    const cappedAssignments = this.applyPerEnemyOverkillCap(assignments);

    const totals = new Map();
    cappedAssignments.forEach((assignment) => {
      const id = assignment.enemy?.id ?? assignment.priorityIndex;
      totals.set(id, (totals.get(id) || 0) + 1);
    });

    const running = new Map();
    cappedAssignments.forEach((assignment, index) => {
      const id = assignment.enemy?.id ?? assignment.priorityIndex;
      const duplicateIndex = running.get(id) || 0;
      assignment.index = index;
      assignment.duplicateIndex = duplicateIndex;
      assignment.duplicateCount = totals.get(id) || 1;
      running.set(id, duplicateIndex + 1);
    });

    return cappedAssignments;
  }

  /**
   * Fix-pass-3 Finding 1 helper. Apply the per-enemy overkill cap to a list
   * of lock assignments. For each unique enemy, allocate at most
   * `computeAllocatedShots(enemy, playerStats)` slots. Preserves the
   * original priority order (assignments earlier in the list survive when
   * the cap reduces count). Skip enemies with null id (defensive — those
   * are kept as-is so other invariants don't break).
   *
   * Callers must NOT re-key duplicateIndex/duplicateCount before this
   * runs — that re-keying must happen on the filtered list (see
   * buildLockAssignments). Returns a NEW array; does not mutate the input.
   */
  applyPerEnemyOverkillCap(assignments) {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return assignments || [];
    }
    const playerStats = this.playerStats() || {};
    const perEnemyCap = new Map();
    const kept = new Map();
    const filtered = [];
    assignments.forEach((assignment) => {
      const enemy = assignment?.enemy;
      const id = enemy?.id ?? null;
      if (id == null) {
        filtered.push(assignment);
        return;
      }
      if (!perEnemyCap.has(id)) {
        const allocated = this.computeAllocatedShots(enemy, playerStats);
        const cap =
          Number.isFinite(allocated) && allocated > 0 ? allocated : Infinity;
        perEnemyCap.set(id, cap);
      }
      const cap = perEnemyCap.get(id);
      const soFar = kept.get(id) || 0;
      if (soFar < cap) {
        filtered.push(assignment);
        kept.set(id, soFar + 1);
      }
    });
    return filtered;
  }
}
