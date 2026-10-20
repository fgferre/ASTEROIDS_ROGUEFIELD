// src/modules/combat/Weapons.js
//
// The ship's guns: the weapon it carries (a content file in
// src/content/weapons/), the fire patterns that weapon lists (the lance's
// stream here; beam and fan in beamAndFan.js; chain, orbit, aura and seeker
// in firePatterns.js), when it may fire, and the evolutions and Apexes that
// change the lance or switch a weapon to its own form; how a volley spreads
// over its lanes is volleyLanes.js. CombatSystem owns it, ticks it after
// targeting and before the shots fly; the card tuning lives in CardEffects
// and the hit path in HitResolution.

import { TRAIL_LENGTH } from '../../core/GameConstants.js';
import {
  COMBAT_SHOOT_COOLDOWN,
  BULLET_SPEED,
  COMBAT_BULLET_LIFETIME,
  COMBAT_SPREAD_MODE_DEFAULT,
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
import { fireBeam, fireFan } from './beamAndFan.js';
import { fireAura, fireChain, fireOrbit, fireSeeker } from './firePatterns.js';
import {
  applyConcentratedFire,
  applyMultishotSpread,
  computeParallelOffset,
} from './volleyLanes.js';

// Plan 01.07: validate spread mode mutations to prevent T-07-02 tampering.
const VALID_SPREAD_MODES = new Set(['concentrated', 'fan']);
// Trail alpha ramp, tail → head (precomputed: one string per step).
const lanceTrailStyles = (color) =>
  Array.from({ length: 8 }, (_, i) => withAlpha(color, (0.65 * i) / 7));

/** The fire patterns a weapon's `fire` list can name, and what runs each. */
export const FIRE_PATTERNS = Object.freeze({
  stream: (weapons, ...shot) => weapons.fireStream(...shot),
  beam: fireBeam,
  fan: fireFan,
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
          const offset = computeParallelOffset(
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
              this._concentratedLanes = applyConcentratedFire(
                this,
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
            aimPoint = applyMultishotSpread(
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
        ? applyConcentratedFire(
            this,
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
          aimPoint = applyMultishotSpread(
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

  refreshShootCooldown() {
    const { aimCooldownMultiplier, cooldownTuning } = this.tuning();
    this.setShootCooldown(
      this.baseShootCooldown * aimCooldownMultiplier * cooldownTuning
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
