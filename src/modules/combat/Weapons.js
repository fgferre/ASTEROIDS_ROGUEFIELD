// src/modules/combat/Weapons.js
//
// The ship's guns: the weapon it carries (a content file in
// src/content/weapons/), the fire patterns that weapon lists (chain, orbit,
// aura and seeker in firePatterns.js), when it may fire, how a volley
// spreads over its lanes, and the evolutions and Apexes that change the lance
// or switch a weapon to its own form. CombatSystem owns it, ticks it after
// targeting and before the shots fly; the card tuning lives in CardEffects
// and the hit path in HitResolution.

import { TRAIL_LENGTH } from '../../core/GameConstants.js';
import {
  COMBAT_SHOOT_COOLDOWN,
  BULLET_SPEED,
  COMBAT_BULLET_LIFETIME,
  COMBAT_AIMING_UPGRADE_CONFIG,
  COMBAT_MULTISHOT_SPREAD_STEP,
  COMBAT_SPREAD_MODE_DEFAULT,
  COMBAT_BULLET_RADIUS,
} from '../../data/constants/gameplay.js';
import { withAlpha } from '../../data/constants/palette.js';
import {
  DEFAULT_WEAPON_ID,
  LANCE_BASE_LOOK,
  WEAPON_APEX,
  WEAPON_EVOLUTIONS,
  WEAPON_FORMS,
  firePattern,
} from '../../data/weapons.js';
import { fireAura, fireChain, fireOrbit, fireSeeker } from './firePatterns.js';

// Plan 01.07: validate spread mode mutations to prevent T-07-02 tampering.
const VALID_SPREAD_MODES = new Set(['concentrated', 'fan']);
const AIMING_CONFIG = COMBAT_AIMING_UPGRADE_CONFIG || {};
// Trail alpha ramp, tail → head (precomputed: one string per step).
const lanceTrailStyles = (color) =>
  Array.from({ length: 8 }, (_, i) => withAlpha(color, (0.65 * i) / 7));

/** The fire patterns a weapon's `fire` list can name, and what runs each. */
export const FIRE_PATTERNS = Object.freeze({
  stream: (weapons, ...shot) => weapons.fireStream(...shot),
  beam: (weapons, ...shot) => weapons.fireBeam(...shot),
  fan: (weapons, ...shot) => weapons.fireFan(...shot),
  chain: fireChain,
  orbit: fireOrbit,
  aura: fireAura,
  seeker: fireSeeker,
});

export class Weapons {
  /**
   * `player()`: the player service (position, muzzle point, turret angle).
   * `enemies()`: the enemy service (forEachActiveEnemy).
   * `targeting()`: the Targeting instance (locks, lead points, aim mode, right stick).
   * `createBullet(fromPos, toPos, damage, volley)`: launches the weapon's projectile (Projectiles).
   * `hitEnemy(hit, enemy)`: lands a beam or shrapnel hit (HitResolution, through CombatSystem).
   * `emit(name, payload)`: sends weapon-fired, weapon-beam-fired, flak-burst and weapon-evolved.
   * `cardEffects()`: the cards in play (the beam reads the Thermal Lens).
   * `cards()`: the CardEffects instance (the chain's arcs, the aura's burns).
   * `tuning()`: the cards' fire-rate tuning, a fresh plain object: { aimCooldownMultiplier, cooldownTuning }.
   */
  constructor({
    player,
    enemies,
    targeting,
    createBullet,
    hitEnemy,
    emit,
    cardEffects,
    cards,
    tuning,
  }) {
    this.player = player;
    this.enemies = enemies;
    this.targeting = targeting;
    this.createBullet = createBullet;
    this.hitEnemy = hitEnemy;
    this.emit = emit;
    this.cardEffects = cardEffects;
    this.cards = cards;
    this.tuning = tuning;

    this.lastShotTime = 0;
    this.shootCooldown = Number.isFinite(COMBAT_SHOOT_COOLDOWN)
      ? Math.max(0, COMBAT_SHOOT_COOLDOWN)
      : 0.3;
    this.baseShootCooldown = this.shootCooldown;

    // Plan 01.07 FIX-05 — spread mode state (the aim mode lives in Targeting).
    // Default = concentrated + auto so the centerline fix lands silently for
    // existing M1 players.
    this.resetSpreadMode();

    this.bulletSpeed = BULLET_SPEED;
    this.bulletLifetime = Number.isFinite(COMBAT_BULLET_LIFETIME)
      ? Math.max(0, COMBAT_BULLET_LIFETIME)
      : 1.8;
    this.trailLength = TRAIL_LENGTH;
    this.resetWeaponState();
  }

  // === SISTEMA DE TIRO ===
  handleShooting(deltaTime, playerStats) {
    this.lastShotTime += deltaTime;

    if (!this.canShoot()) return;

    const playerPos = this.player().getPosition();
    if (!playerPos) return;

    // The first pattern due fires: one with `every: n` on every nth shot.
    this.shots += 1;
    const pattern = this.weapon.fire.find(
      (entry) => !entry.every || this.shots % entry.every === 0
    );
    FIRE_PATTERNS[pattern.pattern](this, pattern, playerPos, playerStats);
  }

  // `stream`: the weapon's projectile down the lock lanes, or straight ahead
  // without a lock; Multishot adds lanes.
  fireStream(pattern, playerPos, playerStats) {
    const player = this.player();
    const targeting = this.targeting();

    // Every shot leaves the turret's muzzle (R5.11). Without a lock the
    // turret has turned back onto the nose.
    const muzzle = player.getMuzzlePoint();

    if (targeting.stickAim) {
      this.fireForward(
        playerPos,
        Math.atan2(targeting.stickAim.y, targeting.stickAim.x),
        playerStats,
        { originOverride: muzzle }
      );
      return;
    }

    // Plan 01.07 Task 6: manual-aim mode bypasses target acquisition entirely
    // and fires from the muzzle along the turret.
    if (targeting.aimMode === 'manual') {
      // Fix-pass (F5): `getTurretAngle()` is PlayerSystem's canonical weapon
      // heading; a player without it is a wiring bug and throws.
      this.fireForward(playerPos, player.getTurretAngle(), playerStats, {
        originOverride: muzzle,
      });
      return;
    }

    // [SMART AUTO-FIRE] If no targets locked, fire forward!
    const lockTargets =
      targeting.currentTargetLocks && targeting.currentTargetLocks.length
        ? targeting.currentTargetLocks
        : targeting.currentTarget
          ? [targeting.currentTarget]
          : [];

    // [SMART AUTO-FIRE] Fallback to forward fire if no lock
    if (!lockTargets.length) {
      this.fireForward(playerPos, player.getTurretAngle(), playerStats, {
        originOverride: muzzle,
      });
      return;
    }

    const requestedShots = Math.max(1, Math.floor(playerStats?.multishot ?? 1));
    const usingAdvancedBattery = targeting.targetingUpgradeLevel >= 3;

    // Fix-pass (F1): wire the damage-aware overkill cap into the real fire
    // path. In Mode 2 (non-rank-3, single-target multishot) every shot in the
    // volley hits the SAME enemy, so the burst cap = ceil(targetHP /
    // volleyDamage). Rank-3 advanced battery is capped PER-ENEMY further
    // down (C1) once we know how the lock slots distributed.
    let totalShots = requestedShots;
    if (!usingAdvancedBattery && requestedShots > 1) {
      const capTarget = lockTargets[0] || null;
      if (capTarget) {
        const allocated = targeting.computeAllocatedShots(
          capTarget,
          playerStats
        );
        if (Number.isFinite(allocated) && allocated > 0) {
          totalShots = Math.min(requestedShots, allocated);
        }
      }
    }

    let assignments = usingAdvancedBattery
      ? Array.isArray(targeting.currentLockAssignments) &&
        targeting.currentLockAssignments.length
        ? targeting.currentLockAssignments
        : lockTargets.map((enemy, index) => ({
            enemy,
            predictedAim: targeting.predictedAimPointsMap.get(enemy.id) ||
              targeting.getPredictedTargetPosition(enemy, playerPos) || {
                x: enemy.x,
                y: enemy.y,
              },
            fireOrigin: { ...playerPos },
            fireOffset: { x: 0, y: 0 },
            duplicateIndex: index,
            duplicateCount: lockTargets.length,
            index,
          }))
      : lockTargets.map((enemy, index) => ({
          enemy,
          predictedAim: targeting.predictedAimPointsMap.get(enemy.id) ||
            targeting.getPredictedTargetPosition(enemy, playerPos) || {
              x: enemy.x,
              y: enemy.y,
            },
          fireOrigin: { ...playerPos },
          fireOffset: { x: 0, y: 0 },
          duplicateIndex: index,
          duplicateCount: lockTargets.length,
          index,
        }));

    if (!assignments.length) {
      // Should not happen due to check above, but safely fire forward just in case
      this.fireForward(playerPos, player.getTurretAngle(), playerStats, {
        originOverride: muzzle,
      });
      return;
    }

    // Fix-pass-3 Finding 1+2: the per-enemy overkill cap moved UPSTREAM into
    // buildLockAssignments (via applyPerEnemyOverkillCap), so
    // `currentLockAssignments` is already correctly sized — render,
    // multi-lock indicators, predictedAimPoints, and weapon-fired all see
    // the post-cap layout. Finding 2 (stale per-lane geometry on filtered
    // assignments) also dissolves: the cap now runs BEFORE the duplicate-
    // index/duplicateCount re-key inside buildLockAssignments, so the
    // surviving lanes get their N-lane offsets computed correctly the first
    // time. handleShooting now only adjusts `totalShots` to assignments.length
    // — no need to filter/re-key here.
    if (usingAdvancedBattery && assignments.length < totalShots) {
      totalShots = Math.min(requestedShots, assignments.length);
    }

    const multiLockActive = usingAdvancedBattery && lockTargets.length > 1;

    const firedTargets = [];

    for (let shotIndex = 0; shotIndex < totalShots; shotIndex += 1) {
      const assignment = usingAdvancedBattery
        ? assignments[Math.min(assignments.length - 1, shotIndex)] ||
          assignments[assignments.length - 1]
        : assignments[Math.min(assignments.length - 1, 0)];

      if (!assignment || !assignment.enemy) {
        continue;
      }

      const duplicateCount = Math.max(1, assignment.duplicateCount || 1);
      const duplicateIndex = assignment.duplicateIndex || 0;

      let fireOrigin = assignment.fireOrigin
        ? { ...assignment.fireOrigin }
        : { ...playerPos };
      let aimPoint = assignment.predictedAim
        ? { ...assignment.predictedAim }
        : null;

      if (!aimPoint) {
        const predicted = targeting.getPredictedTargetPosition(
          assignment.enemy,
          playerPos
        ) || { x: assignment.enemy.x, y: assignment.enemy.y };
        if (usingAdvancedBattery) {
          const offset = this.computeParallelOffset(
            playerPos,
            predicted,
            duplicateIndex,
            duplicateCount,
            assignment.enemy
          );
          fireOrigin = {
            x: playerPos.x + offset.x,
            y: playerPos.y + offset.y,
          };
          aimPoint = {
            x: predicted.x + offset.x,
            y: predicted.y + offset.y,
          };
        } else {
          aimPoint = predicted;
          fireOrigin = { ...playerPos };
        }
      }

      if (usingAdvancedBattery && assignment.fireOffset) {
        fireOrigin = {
          x: playerPos.x + assignment.fireOffset.x,
          y: playerPos.y + assignment.fireOffset.y,
        };
        aimPoint = {
          x: assignment.predictedAim?.x ?? aimPoint.x,
          y: assignment.predictedAim?.y ?? aimPoint.y,
        };
      }

      if (!usingAdvancedBattery && totalShots > 1) {
        const shouldApplySpread =
          totalShots > assignments.length || assignments.length <= 1;
        if (shouldApplySpread) {
          if (this.spreadMode === 'concentrated') {
            // Plan 01.07 Task 4: route Mode 2 multishot through the
            // concentrated-fire helper. Compute the full lane set ONCE on
            // shotIndex 0, cache it on the loop closure, and read per-shot
            // from the cache. The cache is populated when shotIndex === 0
            // and the same lane group is used for all subsequent shots in
            // the volley.
            if (shotIndex === 0) {
              const enemy = assignment.enemy;
              this._concentratedLanes = this.applyConcentratedFire(
                {
                  kind: 'target',
                  enemy,
                  predictedAim: aimPoint,
                  fireOrigin: playerPos,
                },
                totalShots,
                playerStats
              );
            }
            const lane = this._concentratedLanes?.[shotIndex];
            if (lane) {
              fireOrigin = { ...lane.fireOrigin };
              aimPoint = { ...lane.aimPoint };
            }
          } else {
            aimPoint = this.applyMultishotSpread(
              playerPos,
              aimPoint,
              shotIndex,
              totalShots
            );
          }
        }
      }

      // Lanes are laid out around the hull centre; shift them to the muzzle.
      // With multi-lock each shot leaves the barrel of the turret layer
      // aimed at its lock.
      this.createBullet(
        multiLockActive
          ? player.getMuzzlePoint(aimPoint)
          : {
              x: fireOrigin.x + muzzle.x - playerPos.x,
              y: fireOrigin.y + muzzle.y - playerPos.y,
            },
        aimPoint,
        playerStats.damage
      );
      firedTargets.push({
        enemyId: assignment.enemy?.id ?? null,
        position: { ...aimPoint },
      });
    }
    this._concentratedLanes = null;

    this.lastShotTime = 0;

    if (firedTargets.length) {
      const firstTarget = firedTargets[0]?.position || null;
      // Plan 01.07 Task 2: emit the centerline (logical aim point of the
      // primary locked target) so recoil listeners can react to the centerline
      // direction rather than the first projectile's lane-offset aim.
      let centerlineTarget = null;
      const primaryTarget = targeting.currentTarget;
      if (primaryTarget) {
        const predicted = targeting.predictedAimPointsMap?.get(
          primaryTarget.id
        );
        if (predicted) {
          centerlineTarget = { x: predicted.x, y: predicted.y };
        } else {
          const fallbackPredicted = targeting.getPredictedTargetPosition(
            primaryTarget,
            playerPos
          );
          centerlineTarget = fallbackPredicted
            ? { x: fallbackPredicted.x, y: fallbackPredicted.y }
            : { x: primaryTarget.x, y: primaryTarget.y };
        }
      }
      this.emit('weapon-fired', {
        position: playerPos,
        target: firstTarget,
        centerlineTarget,
        pattern: 'stream',
        primaryTargetId: targeting.currentTarget
          ? targeting.currentTarget.id
          : null,
        targeting: {
          dynamicPrediction: targeting.usingDynamicPrediction(),
          lockCount: lockTargets.length,
          multiLockActive,
          predictedPoints: firedTargets.map((entry) => ({
            enemyId: entry.enemyId,
            position: entry.position,
          })),
        },
      });
    }
  }

  canShoot() {
    // [SMART AUTO-FIRE] Allow firing if cooldown is ready.
    // We no longer require a forced target lock.
    return this.lastShotTime >= this.shootCooldown;
  }

  // [SMART AUTO-FIRE] Helper: Fire forward relative to ship rotation
  fireForward(playerPos, rotation, playerStats, options = {}) {
    const totalShots = Math.max(1, Math.floor(playerStats?.multishot ?? 1));
    const angle = Number.isFinite(rotation) ? rotation : 0;

    // Plan 01.07 Task 6: manual-aim path passes originOverride = ship-nose
    // position; the centerline math still uses ship rotation but lanes
    // spawn from the nose rather than the ship center.
    const originPos = options?.originOverride
      ? { ...options.originOverride }
      : { ...playerPos };

    // Calculate a point far in front of the firing origin
    const range = 1000;
    const baseAim = {
      x: originPos.x + Math.cos(angle) * range,
      y: originPos.y + Math.sin(angle) * range,
    };

    const firedTargets = [];

    // Plan 01.07 Task 4: precompute concentrated lanes when totalShots > 1.
    // Fix-pass (F6): in manual aim mode we keep every shot's fireOrigin at
    // the ship nose (the originPos passed in via options.originOverride);
    // perpendicular offset applies only to the aim point. This realizes the
    // plan must_have "shots leave from the SHIP NOSE in the ship's CURRENT
    // rotation direction" for the manual + concentrated + N>1 combo.
    const sharedOrigin = this.targeting().aimMode === 'manual';
    const concentratedLanes =
      totalShots > 1 && this.spreadMode === 'concentrated'
        ? this.applyConcentratedFire(
            { kind: 'direction', angle, originPos, sharedOrigin },
            totalShots,
            playerStats
          )
        : null;

    for (let shotIndex = 0; shotIndex < totalShots; shotIndex++) {
      let aimPoint = { ...baseAim };
      let shotOrigin = { ...originPos };

      if (totalShots > 1) {
        if (concentratedLanes && concentratedLanes[shotIndex]) {
          const lane = concentratedLanes[shotIndex];
          shotOrigin = { ...lane.fireOrigin };
          aimPoint = { ...lane.aimPoint };
        } else {
          aimPoint = this.applyMultishotSpread(
            originPos,
            aimPoint,
            shotIndex,
            totalShots
          );
        }
      }

      this.createBullet(shotOrigin, aimPoint, playerStats.damage);
      firedTargets.push({
        enemyId: null,
        position: { ...aimPoint },
      });
    }

    this.lastShotTime = 0;

    if (firedTargets.length) {
      // Plan 01.07 Task 2: centerline = the on-axis aim point at fixed range
      // along ship rotation (range = 1000 matching the baseline above).
      const centerlineTarget = { ...baseAim };
      this.emit('weapon-fired', {
        position: originPos,
        target: firedTargets[0].position,
        centerlineTarget,
        pattern: 'stream',
        primaryTargetId: null,
        targeting: {
          dynamicPrediction: false,
          lockCount: 0,
          multiLockActive: false,
          predictedPoints: firedTargets.map((entry) => ({
            enemyId: null,
            position: entry.position,
          })),
        },
      });
    }
  }

  applyMultishotSpread(playerPos, targetPos, shotIndex, totalShots) {
    const spreadStep = Number.isFinite(COMBAT_MULTISHOT_SPREAD_STEP)
      ? COMBAT_MULTISHOT_SPREAD_STEP
      : 0.3;
    const spreadAngle = (shotIndex - (totalShots - 1) / 2) * spreadStep;

    const dx = targetPos.x - playerPos.x;
    const dy = targetPos.y - playerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return targetPos;

    const baseAngle = Math.atan2(dy, dx);
    const finalAngle = baseAngle + spreadAngle;

    return {
      x: playerPos.x + Math.cos(finalAngle) * distance,
      y: playerPos.y + Math.sin(finalAngle) * distance,
    };
  }

  refreshShootCooldown() {
    const { aimCooldownMultiplier, cooldownTuning } = this.tuning();
    this.setShootCooldown(
      this.baseShootCooldown * aimCooldownMultiplier * cooldownTuning
    );
  }

  computeParallelOffset(
    playerPos,
    aimPoint,
    duplicateIndex,
    duplicateCount,
    enemy
  ) {
    if (!Number.isFinite(duplicateCount) || duplicateCount <= 1) {
      return { x: 0, y: 0 };
    }

    const dx = aimPoint.x - playerPos.x;
    const dy = aimPoint.y - playerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) {
      return { x: 0, y: 0 };
    }

    const slotCenter = (duplicateCount - 1) / 2;
    const offsetIndex = duplicateIndex - slotCenter;
    if (Math.abs(offsetIndex) < 0.0001) {
      return { x: 0, y: 0 };
    }

    const spacing = AIMING_CONFIG.multiLock?.parallelSpacing ?? 10;

    let magnitude = offsetIndex * spacing;
    const targetRadius = enemy?.radius || 16;
    // Lane clamp per FIX-05 (plan 01.07 Task 3): keep lanes inside the target's
    // effective hit radius (radius + bullet radius). Tighter than the legacy
    // `Math.max(spacing, targetRadius * radiusMultiplier)`. Fix-pass-2 (C7b):
    // use the gameplay-domain alias COMBAT_BULLET_RADIUS (mirrors BULLET_SIZE
    // numerically; pinned by the F10 test). The artifact contract in
    // 01.07-aim-centerline-toggles-PLAN.md promises this name as the source
    // of truth for combat clamp math.
    const clampLimit = Math.min(spacing, targetRadius + COMBAT_BULLET_RADIUS);
    magnitude = Math.max(-clampLimit, Math.min(clampLimit, magnitude));

    const perpX = (-dy / distance) * magnitude;
    const perpY = (dx / distance) * magnitude;

    return { x: perpX, y: perpY };
  }

  /**
   * Concentrated-fire helper extracted from the rank-3 parallel offset code path.
   *
   * Two discriminator shapes:
   *   - `{ kind: 'target', enemy, predictedAim?, fireOrigin? }` — concentrated fire on a specific enemy.
   *   - `{ kind: 'direction', angle, originPos }` — concentrated fire in a direction from an origin.
   *
   * Returns: `Array<{ fireOrigin: {x,y}, aimPoint: {x,y} }>` of length `shotCount`.
   * For shotCount=1, returns a single entry with zero perpendicular offset.
   *
   * For `kind:'target'`, both `fireOrigin` and `aimPoint` are shifted by the same
   * perpendicular vector (parallel lanes). Lane magnitude is clamped to
   * `Math.min(spacing, targetRadius + COMBAT_BULLET_RADIUS)` so outer lanes never
   * exceed the target's effective hit radius.
   *
   * For `kind:'direction'`, the helper does NOT consult a target — perpendicular
   * offsets use the fixed `spacing` only; aim points sit at +1000 along the angle
   * from each fireOrigin (matching the fixed-range baseline used by `fireForward`).
   *
   * Caller spawns the bullets — this helper returns positions only.
   *
   * @param {{kind: 'target', enemy: object, predictedAim?: {x,y}, fireOrigin?: {x,y}} | {kind: 'direction', angle: number, originPos: {x,y}}} input
   * @param {number} shotCount
   * @param {object} [playerStats] — reserved for future damage-aware behavior; not consumed here.
   * @returns {Array<{ fireOrigin: {x,y}, aimPoint: {x,y} }>}
   */
  applyConcentratedFire(input, shotCount) {
    if (!input || typeof input !== 'object') {
      throw new Error(
        '[CombatSystem] applyConcentratedFire requires an input object with a discriminator kind'
      );
    }

    const count = Math.max(0, Math.floor(Number(shotCount) || 0));
    if (count <= 0) {
      return [];
    }

    const spacing = AIMING_CONFIG.multiLock?.parallelSpacing ?? 10;

    if (input.kind === 'target') {
      const enemy = input.enemy;
      if (!enemy) {
        return [];
      }

      const predicted = input.predictedAim || { x: enemy.x, y: enemy.y };
      const playerPos = input.fireOrigin || this.player().getPosition();

      const baseAimX = predicted.x;
      const baseAimY = predicted.y;
      const baseOriginX = playerPos.x;
      const baseOriginY = playerPos.y;

      const dx = baseAimX - baseOriginX;
      const dy = baseAimY - baseOriginY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance === 0 || count === 1) {
        const results = [];
        for (let i = 0; i < count; i += 1) {
          results.push({
            fireOrigin: { x: baseOriginX, y: baseOriginY },
            aimPoint: { x: baseAimX, y: baseAimY },
          });
        }
        return results;
      }

      const perpX = -dy / distance;
      const perpY = dx / distance;

      const targetRadius = enemy.radius || 16;
      // Fix-pass-2 (C7b): use the gameplay-domain alias COMBAT_BULLET_RADIUS
      // here too (mirrors the computeParallelOffset clamp). Mirrors BULLET_SIZE
      // numerically; pinned by the F10 test.
      const clampLimit = Math.min(spacing, targetRadius + COMBAT_BULLET_RADIUS);

      const slotCenter = (count - 1) / 2;
      const results = [];
      for (let shotIndex = 0; shotIndex < count; shotIndex += 1) {
        const offsetIndex = shotIndex - slotCenter;
        const rawMagnitude = offsetIndex * spacing;
        const magnitude = Math.max(
          -clampLimit,
          Math.min(clampLimit, rawMagnitude)
        );

        const shotPerpX = perpX * magnitude;
        const shotPerpY = perpY * magnitude;

        results.push({
          fireOrigin: {
            x: baseOriginX + shotPerpX,
            y: baseOriginY + shotPerpY,
          },
          aimPoint: { x: baseAimX + shotPerpX, y: baseAimY + shotPerpY },
        });
      }
      return results;
    }

    if (input.kind === 'direction') {
      const angle = Number.isFinite(input.angle) ? input.angle : 0;
      const originPos = input.originPos || { x: 0, y: 0 };
      const baseOriginX = originPos.x;
      const baseOriginY = originPos.y;
      // Fix-pass (F6): `sharedOrigin` mode keeps every shot's fireOrigin
      // anchored at `originPos` and applies the perpendicular offset only to
      // the aimPoint. Used by manual aim so all multishot lanes leave from
      // the SHIP NOSE (plan must_have), fanning out to slightly offset aim
      // points rather than sliding the spawn position laterally.
      const sharedOrigin = input.sharedOrigin === true;

      const dxUnit = Math.cos(angle);
      const dyUnit = Math.sin(angle);

      // Perpendicular unit vector (no targetRadius reference — clamp is not used).
      const perpX = -dyUnit;
      const perpY = dxUnit;

      const range = 1000;
      const slotCenter = (count - 1) / 2;
      const results = [];

      for (let shotIndex = 0; shotIndex < count; shotIndex += 1) {
        const offsetIndex = shotIndex - slotCenter;
        const magnitude = offsetIndex * spacing;
        const shotPerpX = perpX * magnitude;
        const shotPerpY = perpY * magnitude;

        const fireOrigin = sharedOrigin
          ? { x: baseOriginX, y: baseOriginY }
          : { x: baseOriginX + shotPerpX, y: baseOriginY + shotPerpY };
        const aimAnchorX = sharedOrigin ? baseOriginX : fireOrigin.x;
        const aimAnchorY = sharedOrigin ? baseOriginY : fireOrigin.y;
        const aimPoint = sharedOrigin
          ? {
              // Aim point fans perpendicular from the on-axis projection so
              // bullets share the origin but fly toward different lateral
              // targets. Keeping the same `range` projection as the legacy
              // path preserves muzzle-velocity magnitude per shot.
              x: aimAnchorX + dxUnit * range + shotPerpX,
              y: aimAnchorY + dyUnit * range + shotPerpY,
            }
          : {
              x: aimAnchorX + dxUnit * range,
              y: aimAnchorY + dyUnit * range,
            };
        results.push({ fireOrigin, aimPoint });
      }
      return results;
    }

    throw new Error(
      `[CombatSystem] applyConcentratedFire: invalid kind discriminator "${input.kind}"`
    );
  }

  // === WEAPONS AND EVOLUTIONS (docs/NORTE.md §7 pillar 4) ===
  // The card effects reset in CardEffects; CombatSystem orders the two.
  resetWeaponState() {
    this.weaponId = DEFAULT_WEAPON_ID;
    this.shots = 0; // since the weapon was taken: when `every` patterns fire
    this.evolutions = [];
    this.apexes = [];
    this.beams = [];
    this.flakBursts = [];
    // firePatterns.js: blades and cuts, aura ring and pulses, bred missiles.
    this.blades = [];
    this.bladeCuts = new Map();
    this.orbitClock = 0;
    this.orbitSounded = false;
    this.aura = null;
    this.pulses = [];
    this.broods = [];
    this.refreshLanceLook();
  }

  /** The weapon the ship carries, in its own form once its family evolved. */
  get weapon() {
    const forms = WEAPON_FORMS[this.weaponId];
    const family = forms.base.card?.family;
    if (forms.apex && this.apexes.includes(family)) return forms.apex;
    if (forms.evolution && this.evolutions.includes(family)) {
      return forms.evolution;
    }
    return forms.base;
  }

  /** The family the held weapon evolves on itself (its `evolution`), or null. */
  get ownFamily() {
    const forms = WEAPON_FORMS[this.weaponId];
    return forms.evolution ? forms.base.card.family : null;
  }

  /** The family's lance evolution is on (not the held weapon's own family). */
  hasEvolution(family) {
    return family !== this.ownFamily && this.evolutions.includes(family);
  }

  hasApex(family) {
    return family !== this.ownFamily && this.apexes.includes(family);
  }

  /** A weapon card swaps the cannon for its weapon; an unknown id is ignored. */
  takeWeapon(weaponId) {
    if (!WEAPON_FORMS[weaponId] || weaponId === this.weaponId) return;
    this.weaponId = weaponId;
    this.shots = 0;
  }

  /**
   * A family's "3 of a kind" synergy evolves the lance for the rest of the
   * run, or the held weapon into its own form when it is the weapon's family.
   */
  evolveWeapon(family) {
    if (!WEAPON_EVOLUTIONS[family] || this.evolutions.includes(family)) {
      return;
    }
    this.evolutions.push(family);
    this.refreshLanceLook();
    const { id, name, description } = this.evolutionOf(family);
    this.emit('weapon-evolved', {
      family,
      id,
      name,
      description,
      weaponId: this.weaponId,
    });
  }

  // What the family's evolution is now: the held weapon's own form on its
  // family, else the lance's evolution or Apex. `short` is the HUD chip.
  evolutionOf(family) {
    const apex = this.apexes.includes(family);
    if (family === this.ownFamily) {
      const { form, name, chip, description } = this.weapon;
      return { id: form.id, name, description, apex, short: chip };
    }
    const { id, name, description, short } = apex
      ? WEAPON_APEX[family]
      : WEAPON_EVOLUTIONS[family];
    return { id, name, description, apex, short: short ?? id.toUpperCase() };
  }

  /** Five cards of a family raise its evolution to the Apex for the run. */
  apexWeapon(family) {
    if (!WEAPON_APEX[family] || this.apexes.includes(family)) {
      return;
    }
    this.evolveWeapon(family);
    this.apexes.push(family);
    this.refreshLanceLook();
  }

  // Colours override in unlock order (the last one wins); sizes multiply.
  // Apex looks go on top of every evolution: `outer` is a second, wider
  // ribbon, `sparkle` a glint trail, and any Apex adds a white core.
  refreshLanceLook() {
    const look = {
      ...LANCE_BASE_LOOK,
      arc: null,
      outer: null,
      sparkle: null,
      apex: this.apexes.length > 0,
    };
    const deltas = [
      ...this.evolutions.map((family) => WEAPON_EVOLUTIONS[family].look),
      ...this.apexes.map((family) => WEAPON_APEX[family].look),
    ];
    deltas.forEach((delta) => {
      ['body', 'trail', 'head', 'arc', 'outer', 'sparkle'].forEach((key) => {
        if (delta[key]) look[key] = delta[key];
      });
      ['trailLength', 'width', 'headLength'].forEach((key) => {
        if (delta[key]) look[key] *= delta[key];
      });
    });
    look.trailStyles = lanceTrailStyles(look.trail);
    this.lanceLook = look;
    this.trailLength = Math.round(TRAIL_LENGTH * look.trailLength);
    const coilgun = this.apexes.includes('kinetic');
    this.lancePierce = coilgun
      ? WEAPON_APEX.kinetic.pierce
      : this.evolutions.includes('kinetic')
        ? WEAPON_EVOLUTIONS.kinetic.pierce
        : 0;
    this.lanceApexDamage = coilgun ? WEAPON_APEX.kinetic.damageMultiplier : 1;
  }

  /** What the HUD shows: the weapon and its evolutions, in unlock order. */
  getWeaponState() {
    const { name, chip } = this.weapon;
    const beam = firePattern(this.weapon, 'beam');
    return {
      weaponId: this.weaponId,
      name,
      chip,
      shotsToBeam: beam?.every ? beam.every - (this.shots % beam.every) : null,
      evolutions: this.evolutions.map((family) => ({
        family,
        ...this.evolutionOf(family),
      })),
    };
  }

  // Every enemy a weapon effect can reach: a phased Shade (`intangible`) is
  // out of the Field for beams, arcs, burns, pulls and shoves, as for the lock.
  forEachSolidEnemy(callback) {
    this.enemies().forEachActiveEnemy((enemy) => {
      if (enemy && !enemy.destroyed && !enemy.intangible) callback(enemy);
    });
  }

  // Where a beam or a fan goes from `origin` (the muzzle): along the
  // right stick, onto the primary lock's lead point in auto, along the turret
  // otherwise.
  getWeaponAngle(origin) {
    const targeting = this.targeting();
    const aim =
      targeting.aimMode === 'manual' ? null : targeting.getPrimaryAimPoint();
    const stick = targeting.stickAim;
    if (stick) return Math.atan2(stick.y, stick.x);
    return aim
      ? Math.atan2(aim.y - origin.y, aim.x - origin.x)
      : this.player().getTurretAngle();
  }

  // Multi-lock (Targeting Matrix rank 3, several locks, auto aim, as the
  // stream reads it): one entry per lock in order, with its lead point, the
  // barrel tip of the turret layer aimed at it (PlayerSystem.getMuzzlePoint:
  // every pattern's shots at that lock leave there) and the angle from that
  // tip to the lead point; null otherwise.
  getLockAims() {
    const targeting = this.targeting();
    if (
      targeting.stickAim ||
      targeting.aimMode === 'manual' ||
      targeting.targetingUpgradeLevel < 3 ||
      targeting.currentTargetLocks.length < 2
    ) {
      return null;
    }
    const player = this.player();
    return targeting.currentLockAssignments.map(({ enemy, predictedAim }) => {
      const origin = player.getMuzzlePoint(predictedAim);
      return {
        enemyId: enemy.id,
        point: predictedAim,
        origin,
        angle: Math.atan2(predictedAim.y - origin.y, predictedAim.x - origin.x),
      };
    });
  }

  // `beam`: damage lands on everything in the segment on the firing frame;
  // the beam stays on screen for `beam.duration`. Aimed like the lances: from
  // the muzzle onto the primary lock's lead point in auto, along the turret
  // otherwise. With multi-lock, one beam per lock from its turret layer's
  // barrel; the cooldown penalty comes once per volley.
  fireBeam(beam, playerPos, playerStats) {
    const muzzle = this.player().getMuzzlePoint();
    const lockAims = this.getLockAims();
    const shots = lockAims || [
      { origin: muzzle, angle: this.getWeaponAngle(muzzle) },
    ];
    // The primary lock's beam stands for the volley in the event.
    const [end] = shots.map(({ origin, angle }) =>
      this.fireBeamAlong(beam, origin, angle, playerStats, Boolean(lockAims))
    );
    this.lastShotTime = -beam.cooldownPenalty;
    const targeting = this.targeting();

    this.emit('weapon-fired', {
      position: playerPos,
      target: end,
      centerlineTarget: end,
      pattern: beam.pattern,
      primaryTargetId: targeting.currentTarget
        ? targeting.currentTarget.id
        : null,
      targeting: {
        dynamicPrediction: targeting.usingDynamicPrediction(),
        lockCount: targeting.currentTargetLocks.length,
        multiLockActive: Boolean(lockAims),
        predictedPoints: lockAims
          ? lockAims.map(({ enemyId, point }) => ({
              enemyId,
              position: { ...point },
            }))
          : [],
      },
    });
  }

  // One beam of the volley: the hit test, the beam on screen and its event;
  // `layered`: a multi-lock beam, from its turret layer's barrel. Returns
  // where it ends.
  fireBeamAlong(beam, origin, angle, playerStats, layered) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const { width, duration, extraFragments } = beam;
    const length =
      beam.length * (this.cardEffects().thermalLens?.beamLengthMultiplier ?? 1);
    const end = { x: origin.x + dirX * length, y: origin.y + dirY * length };
    const damage = (Number(playerStats?.damage) || 0) * beam.damageMultiplier;

    const struck = [];
    this.forEachSolidEnemy((enemy) => {
      const along = Math.max(
        0,
        Math.min(
          length,
          (enemy.x - origin.x) * dirX + (enemy.y - origin.y) * dirY
        )
      );
      const offX = origin.x + dirX * along - enemy.x;
      const offY = origin.y + dirY * along - enemy.y;
      const radius = enemy.radius || 0;
      const reach = radius + width / 2;
      if (offX * offX + offY * offY > reach * reach) return;
      // Hit point on the rim facing the beam (sparks need a normal).
      const off = Math.hypot(offX, offY);
      struck.push({
        enemy,
        x:
          off > 0.5 ? enemy.x + (offX / off) * radius : enemy.x - dirX * radius,
        y:
          off > 0.5 ? enemy.y + (offY / off) * radius : enemy.y - dirY * radius,
      });
    });

    const vx = dirX * this.bulletSpeed;
    const vy = dirY * this.bulletSpeed;
    struck.forEach(({ enemy, x, y }) => {
      if (enemy.destroyed) return;
      this.hitEnemy(
        { kind: 'beam', x, y, vx, vy, damage, extraFragments, hit: false },
        enemy
      );
    });

    this.beams.push({
      x: origin.x,
      y: origin.y,
      ex: end.x,
      ey: end.y,
      angle,
      width,
      life: duration,
      maxLife: duration,
      maxRadius: beam.flashRadius,
      colors: this.weapon.colors,
      layered,
    });

    this.emit('weapon-beam-fired', {
      position: origin,
      end,
      angle,
      damage,
      hits: struck.length,
      kick: beam.kick,
    });
    return end;
  }

  // `fan`: a fan of the weapon's projectile from the muzzle, aimed like the
  // beam. Multishot adds bolts to the fan; the volley waits
  // `fan.cooldownMultiplier` × the lance's cooldown. With multi-lock the same
  // bolts are split over the locks, earlier locks first, each lock getting a
  // small fan of its own (same bolt spacing) centred on its lead point, from
  // its turret layer's barrel.
  fireFan(fan, playerPos, playerStats) {
    const origin = this.player().getMuzzlePoint();
    const angle = this.getWeaponAngle(origin);
    const extra = Math.max(0, Math.floor(playerStats?.multishot ?? 1) - 1);
    const bolts = Math.min(fan.maxBolts, fan.bolts + extra);
    const spread = (fan.fan * Math.PI) / 180;
    // Where the bolts are aimed: the end of their range, else of a lance's.
    const reach =
      this.weapon.projectile.range ?? this.bulletSpeed * this.bulletLifetime;
    // Shared by the volley's bolts: who its shrapnel already hit, and how
    // many bursts it has had (only the first lights the 3D scene).
    const volley = { struck: [], bursts: 0 };
    const lockAims = this.getLockAims();
    const predictedPoints = [];
    const launch = (a, from = origin) => {
      const end = {
        x: from.x + Math.cos(a) * reach,
        y: from.y + Math.sin(a) * reach,
      };
      this.createBullet(from, end, playerStats.damage, volley);
      return end;
    };
    if (lockAims) {
      const step = spread / (fan.bolts - 1);
      const share = Math.floor(bolts / lockAims.length);
      const longer = bolts % lockAims.length;
      lockAims.forEach((lock, index) => {
        const count = share + (index < longer ? 1 : 0);
        for (let i = 0; i < count; i += 1) {
          launch(lock.angle + step * (i - (count - 1) / 2), lock.origin);
        }
        predictedPoints.push({
          enemyId: lock.enemyId,
          position: { ...lock.point },
        });
      });
    } else {
      for (let i = 0; i < bolts; i += 1) {
        const a =
          bolts === 1 ? angle : angle + spread * (i / (bolts - 1) - 0.5);
        predictedPoints.push({ enemyId: null, position: launch(a) });
      }
    }
    this.lastShotTime = -this.shootCooldown * (fan.cooldownMultiplier - 1);
    const targeting = this.targeting();

    const centre = {
      x: origin.x + Math.cos(angle) * reach,
      y: origin.y + Math.sin(angle) * reach,
    };
    this.emit('weapon-fired', {
      position: playerPos,
      target: centre,
      centerlineTarget: centre,
      pattern: fan.pattern,
      primaryTargetId: targeting.currentTarget
        ? targeting.currentTarget.id
        : null,
      targeting: {
        dynamicPrediction: targeting.usingDynamicPrediction(),
        lockCount: targeting.currentTargetLocks.length,
        multiLockActive: Boolean(lockAims),
        predictedPoints,
      },
    });
  }

  // A projectile's `burst`: shrapnel hits every solid enemy whose rim is
  // within `burst.radius`, at most once per volley, through the same hit path
  // as the bolts (so the evolutions apply).
  burstFlak(bolt) {
    const { x, y, volley } = bolt;
    const { radius, duration } = bolt.projectile.burst;
    const struck = [];
    this.forEachSolidEnemy((enemy) => {
      if (volley.struck.includes(enemy)) return;
      const reach = radius + (enemy.radius || 0);
      if ((enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= reach * reach) {
        struck.push(enemy);
      }
    });
    volley.struck.push(...struck);
    struck.forEach((enemy) => {
      if (enemy.destroyed) return;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const distance = Math.hypot(dx, dy) || 1;
      const radius = Math.min(enemy.radius || 0, distance);
      this.hitEnemy(
        {
          kind: 'shrapnel',
          x: enemy.x - (dx / distance) * radius,
          y: enemy.y - (dy / distance) * radius,
          vx: (dx / distance) * this.bulletSpeed,
          vy: (dy / distance) * this.bulletSpeed,
          damage: bolt.shrapnel,
          hit: false,
        },
        enemy
      );
    });

    const angle = Math.atan2(bolt.vy || 0, bolt.vx || 1);
    this.flakBursts.push({
      x,
      y,
      angle,
      life: duration,
      maxLife: duration,
      maxRadius: radius,
      colors: bolt.colors,
      lit: volley.bursts === 0,
    });
    volley.bursts += 1;
    this.emit('flak-burst', {
      position: { x, y },
      radius,
      angle,
      hits: struck.length,
    });
  }

  // === MODE STATE (plan 01.07 FIX-05) ===
  getSpreadMode() {
    return this.spreadMode;
  }

  setSpreadMode(value) {
    if (!VALID_SPREAD_MODES.has(value)) {
      // Defensive: ignore invalid value (T-07-02 tampering surface).
      console.warn(`[CombatSystem] Ignoring invalid spreadMode "${value}"`);
      return;
    }
    this.spreadMode = value;
  }

  setShootCooldown(cooldown) {
    this.shootCooldown = Math.max(0.1, cooldown);
  }

  // The spread half of CombatSystem.resetModeState: back to the default,
  // validated like the setter so a constant mis-edit can't corrupt state.
  resetSpreadMode() {
    this.spreadMode = VALID_SPREAD_MODES.has(COMBAT_SPREAD_MODE_DEFAULT)
      ? COMBAT_SPREAD_MODE_DEFAULT
      : 'concentrated';
  }
}
