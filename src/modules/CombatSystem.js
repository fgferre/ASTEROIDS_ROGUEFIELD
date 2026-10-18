// src/modules/CombatSystem.js
import { BaseSystem } from '../core/BaseSystem.js';
import { requireService } from '../core/serviceUtils.js';
import { SHIP_SIZE, TRAIL_LENGTH } from '../core/GameConstants.js';
import { drawEnemyProjectile } from '../utils/drawEnemyProjectile.js';
import { GameDebugLogger } from '../utils/dev/GameDebugLogger.js';
import { Targeting } from './combat/Targeting.js';
import { Projectiles } from './combat/Projectiles.js';
import {
  COMBAT_SHOOT_COOLDOWN,
  COMBAT_TARGETING_RANGE,
  BULLET_SPEED,
  COMBAT_BULLET_LIFETIME,
  COMBAT_AIMING_UPGRADE_CONFIG,
  COMBAT_MULTISHOT_SPREAD_STEP,
  COMBAT_SPREAD_MODE_DEFAULT,
  COMBAT_BULLET_RADIUS,
  KNOCKBACK_BASE,
  KNOCKBACK_HEAVY_FACTOR,
  KNOCKBACK_MAX,
  KNOCKBACK_MIN,
  KNOCKBACK_REFERENCE_DAMAGE,
  ION_TRAIL_GAP,
} from '../data/constants/gameplay.js';

/** Knockback speed (px/s) for a hit of `damage`, before the heavy factor. */
export function knockbackSpeed(damage) {
  const speed = KNOCKBACK_BASE * (damage / KNOCKBACK_REFERENCE_DAMAGE);
  return Math.min(KNOCKBACK_MAX, Math.max(KNOCKBACK_MIN, speed));
}

// Plan 01.07: validate spread mode mutations to prevent T-07-02 tampering.
const VALID_SPREAD_MODES = new Set(['concentrated', 'fan']);
import { getRenderScale } from '../core/viewport.js';
import { getEmissive } from '../core/bloomLayer.js';
import { LINE, PALETTE, withAlpha } from '../data/constants/palette.js';
import { ORB_VALUE } from '../data/enemies/asteroid-configs.js';
import {
  LANCE_BASE_LOOK,
  WEAPONS,
  WEAPON_APEX,
  WEAPON_EVOLUTIONS,
} from '../data/weapons.js';

const LANCE_SPRITE = { width: 16, height: 8, originX: 12 };
// Trail alpha ramp, tail → head (precomputed: one string per step).
const lanceTrailStyles = (color) =>
  Array.from({ length: 8 }, (_, i) => withAlpha(color, (0.65 * i) / 7));
const HARMONIC_BEAM = WEAPONS.harmonic.beam;
const BEAM_COLORS = WEAPONS.harmonic.colors;
const FLAK = WEAPONS.scatter.flak;
const FLAK_COLORS = WEAPONS.scatter.colors;
const FLAK_SPARKS = 7; // proposta 18/10: 2D shrapnel streaks per burst
// Afterburn (Maneuver synergy) — proposta 18/10: a point every this many px
// of dash travel, at most this many alive; a jump wider than the gap (the
// screen wrap) starts a new, unjoined line.
const AFTERBURN_POINT_SPACING = 8;
const AFTERBURN_MAX_POINTS = 40;
const AFTERBURN_JOIN_GAP = 80;
// 2D look, proposta 18/10: an amber band (px wide when fresh) under a hot
// core that cools first, so old segments read as embers.
const AFTERBURN_LOOK = { band: 6, bandAlpha: 0.55, core: 2, coreAlpha: 0.85 };
const ARC_SEGMENTS = 6;
const ARC_JITTER = 7; // px, perpendicular

// Deterministic −1..1 from an integer (arc jaggedness; no game RNG used).
const hashUnit = (n) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
};

class CombatSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'CombatSystem',
      serviceName: 'combat',
      enableRandomManagement: false,
    });

    // === ESTADO DO SISTEMA DE COMBATE ===
    this.lastShotTime = 0;
    this.shootCooldown = Number.isFinite(COMBAT_SHOOT_COOLDOWN)
      ? Math.max(0, COMBAT_SHOOT_COOLDOWN)
      : 0.3;

    // Plan 01.07 FIX-05 — spread mode state (the aim mode lives in Targeting).
    // Default = concentrated + auto so the centerline fix lands silently for
    // existing M1 players.
    this.spreadMode = VALID_SPREAD_MODES.has(COMBAT_SPREAD_MODE_DEFAULT)
      ? COMBAT_SPREAD_MODE_DEFAULT
      : 'concentrated';

    // === CONFIGURAÇÕES ===
    this.bulletSpeed = BULLET_SPEED;
    this.bulletLifetime = Number.isFinite(COMBAT_BULLET_LIFETIME)
      ? Math.max(0, COMBAT_BULLET_LIFETIME)
      : 1.8;
    this.trailLength = TRAIL_LENGTH;
    this.baseShootCooldown = this.shootCooldown;

    // === CONFIGURAÇÕES DE MIRA AVANÇADA ===
    this.aimingConfig = COMBAT_AIMING_UPGRADE_CONFIG || {};
    this.lockLineAlpha = this.aimingConfig?.feedback?.lockLineAlpha ?? 0.35;
    this.lockHighlightAlpha =
      this.aimingConfig?.feedback?.lockHighlightAlpha ?? 0.75;
    this.predictedMarkerRadius =
      this.aimingConfig?.feedback?.predictedMarkerRadius ?? 12;

    this.lastKnownPlayerStats = null;
    this.targeting = new Targeting({
      player: () => this.cachedPlayer,
      enemies: () => this.cachedEnemies,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      playerStats: () => this.lastKnownPlayerStats,
      bulletSpeed: () => this.bulletSpeed,
      spreadMode: () => this.spreadMode,
      computeParallelOffset: (...args) => this.computeParallelOffset(...args),
    });
    this.projectiles = new Projectiles({
      physics: () => this.cachedPhysics,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      weapon: () => ({
        weaponId: this.weaponId,
        bulletSpeed: this.bulletSpeed,
        bulletLifetime: this.bulletLifetime,
        trailLength: this.trailLength,
        thermalLens: this.cardEffects.thermalLens,
        lanceDamageTuning: this.lanceDamageTuning,
        lanceApexDamage: this.lanceApexDamage,
        lancePierce: this.lancePierce,
        pierceBonus: this.pierceBonus,
      }),
      burstFlak: (bolt) => this.burstFlak(bolt),
    });
    this.resetWeaponTuning();

    // === CACHES DE SERVIÇOS ===
    this.cachedPlayer = requireService(
      'player',
      this.dependencies,
      'CombatSystem'
    );
    this.cachedEnemies = requireService(
      'enemies',
      this.dependencies,
      'CombatSystem'
    );
    this.cachedPhysics = requireService(
      'physics',
      this.dependencies,
      'CombatSystem'
    );
    this.lanceSprite = null;
    this.resetWeaponState();
  }

  setupEventListeners() {
    this.registerEventListener('player-reset', () => {
      this.targeting.onPlayerReset();
      this.lastKnownPlayerStats = null;
      this.projectiles.clearEnemyBullets();
      // Fix-pass-2 (C5): restore in-run toggle state to defaults so a player
      // ending a run in manual+fan doesn't start the next run in manual+fan.
      this.resetModeState();
    });

    this.registerEventListener('progression-reset', () => {
      this.targeting.resetAimingBranchState();
      this.resetWeaponTuning();
      this.resetWeaponState();
      this.targetThreatCache.clear();
      this.projectiles.clearEnemyBullets();
    });

    this.registerEventListener('physics-reset', () => {
      this.projectiles.clearEnemyBullets();
    });

    this.registerEventListener('player-died', () => {
      // Clear target when player dies (bullets keep flying)
      this.targeting.onPlayerDied();
      console.log('[CombatSystem] Player died - cleared target');
      this.projectiles.clearEnemyBullets();
    });

    this.registerEventListener('upgrade-aiming-suite', (data) => {
      this.applyAimingUpgrade(data || {});
    });

    this.registerEventListener('upgrade-weapon-tuning', (data) => {
      this.applyWeaponTuning(data);
    });

    // A weapon card names its weapon (data/weapons.js); an unknown id is ignored.
    const takeWeapon = (data = {}) => {
      if (WEAPONS[data.weaponId]) this.weaponId = data.weaponId;
    };
    this.registerEventListener('upgrade-weapon-harmonic', takeWeapon);
    this.registerEventListener('upgrade-weapon-scatter', takeWeapon);

    // Cards that add a weapon behaviour keep the payload of their latest rank.
    this.registerEventListener('upgrade-thermal-lens', (data) => {
      this.cardEffects.thermalLens = data;
    });
    this.registerEventListener('upgrade-chain-capacitor', (data) => {
      this.cardEffects.chainCapacitor = data;
    });
    this.registerEventListener('upgrade-static-shell', (data) => {
      this.cardEffects.staticShell = data;
    });
    this.registerEventListener('upgrade-gravity-brake', (data) => {
      this.cardEffects.gravityBrake = data;
    });
    this.registerEventListener('upgrade-cinder-trail', (data) => {
      this.cardEffects.cinderTrail = data;
    });
    this.registerEventListener('upgrade-ion-trail', (data) => {
      this.cardEffects.ionTrail = data;
    });
    this.registerEventListener('upgrade-afterburn', (data) => {
      this.cardEffects.afterburn = data;
    });

    this.registerEventListener('thruster-effect', (data = {}) => {
      if (data.type !== 'main' || !(data.intensity > 0)) return;
      const { cinderTrail, ionTrail } = this.cardEffects;
      if (cinderTrail) this.dropTrailPoint(this.cinders, cinderTrail, data);
      if (ionTrail) this.dropTrailPoint(this.ions, ionTrail, data);
    });

    // Emergency brake (Braking System 3): a shove, no damage.
    this.registerEventListener('player-braked', (data = {}) => {
      this.shoveFrom(data.position, data.radius, data.knockback);
    });

    // Discharged on the next update, outside the collision pass that hit us.
    this.registerEventListener('player-took-damage', () => {
      if (this.cardEffects.staticShell) this.staticShellPending = true;
    });

    this.registerEventListener('synergy-unlocked', (data = {}) => {
      this.evolveWeapon(data.family);
    });
    this.registerEventListener('apex-unlocked', (data = {}) => {
      this.apexWeapon(data.family);
    });

    // Plan 01.07 Task 5/6: spread + aim mode toggles routed through the
    // action-binding system. Listener is gated to screen === 'playing' to
    // T-07-06 (no toggling during pause/menu/level-up/game-over).
    //
    // Fix-pass (F9): strict equality gate. The previous form
    // `data?.screen && data.screen !== 'playing'` short-circuited when
    // `screen` was null/undefined and let the toggle fire. Use strict
    // `!== 'playing'` so any non-'playing' value (including null/undefined)
    // blocks the toggle. Plan must_have: "no-op unless screen === 'playing'."
    this.registerEventListener('toggle-spread-mode', (data = {}) => {
      const screen = data?.screen;
      if (screen !== 'playing') {
        return;
      }
      const next = this.spreadMode === 'concentrated' ? 'fan' : 'concentrated';
      this.setSpreadMode(next);
    });

    this.registerEventListener('toggle-aim-mode', (data = {}) => {
      const screen = data?.screen;
      if (screen !== 'playing') {
        return;
      }
      const next = this.aimMode === 'auto' ? 'manual' : 'auto';
      this.targeting.setAimMode(next);
    });

    // Enemy projectiles are forwarded to the combat system by EnemySystem.
    // Subscribing here would duplicate the handling and spawn two bullets.
  }

  getCachedPlayer() {
    return this.cachedPlayer;
  }

  // === TARGETING (combat/Targeting.js) ===
  // Targeting owns this state. The 3D renderer, the 2D draw, the fire paths
  // and the aim regression suite read it on the combat object; the setters
  // exist because that suite writes these fields.
  get currentTarget() {
    return this.targeting.currentTarget;
  }

  set currentTarget(value) {
    this.targeting.currentTarget = value;
  }

  get currentTargetLocks() {
    return this.targeting.currentTargetLocks;
  }

  set currentTargetLocks(value) {
    this.targeting.currentTargetLocks = value;
  }

  get currentLockAssignments() {
    return this.targeting.currentLockAssignments;
  }

  set currentLockAssignments(value) {
    this.targeting.currentLockAssignments = value;
  }

  get predictedAimPoints() {
    return this.targeting.predictedAimPoints;
  }

  get predictedAimPointsMap() {
    return this.targeting.predictedAimPointsMap;
  }

  get targetThreatCache() {
    return this.targeting.targetThreatCache;
  }

  get targetIndicatorPulse() {
    return this.targeting.targetIndicatorPulse;
  }

  get targetPulseDuration() {
    return this.targeting.targetPulseDuration;
  }

  get targetingUpgradeLevel() {
    return this.targeting.targetingUpgradeLevel;
  }

  get dangerScoreEnabled() {
    return this.targeting.dangerScoreEnabled;
  }

  get dynamicPredictionEnabled() {
    return this.targeting.dynamicPredictionEnabled;
  }

  get multiLockTargets() {
    return this.targeting.multiLockTargets;
  }

  get aimMode() {
    return this.targeting.aimMode;
  }

  get stickAim() {
    return this.targeting.stickAim;
  }

  get _aimModeFlagSnapshot() {
    return this.targeting._aimModeFlagSnapshot;
  }

  set _aimModeFlagSnapshot(value) {
    this.targeting._aimModeFlagSnapshot = value;
  }

  get needsRetarget() {
    return this.targeting.needsRetarget;
  }

  set needsRetarget(value) {
    this.targeting.needsRetarget = value;
  }

  get targetUpdateTimer() {
    return this.targeting.targetUpdateTimer;
  }

  set targetUpdateTimer(value) {
    this.targeting.targetUpdateTimer = value;
  }

  get targetUpdateInterval() {
    return this.targeting.targetUpdateInterval;
  }

  // Called on the combat object by the aim regression suite, the shooting
  // paths and (usingDynamicPrediction) both renderers.
  updateTargeting(deltaTime) {
    this.targeting.updateTargeting(deltaTime);
  }

  getPredictedTargetPosition(enemy, playerPos) {
    return this.targeting.getPredictedTargetPosition(enemy, playerPos);
  }

  computeAllocatedShots(enemy, playerStats) {
    return this.targeting.computeAllocatedShots(enemy, playerStats);
  }

  usingDynamicPrediction() {
    return this.targeting.usingDynamicPrediction();
  }

  // === PROJECTILES (combat/Projectiles.js) ===
  // Projectiles owns the shots in flight. Both renderers, the HUD metrics,
  // Herald and the test helpers read these arrays on the combat object; the
  // weapons suite assigns `bullets`. The 2D draw times itself into the perf.
  get bullets() {
    return this.projectiles.bullets;
  }

  set bullets(value) {
    this.projectiles.bullets = value;
  }

  get enemyBullets() {
    return this.projectiles.enemyBullets;
  }

  get projectilePerf() {
    return this.projectiles.projectilePerf;
  }

  // Called on the combat object: EnemySystem forwards enemy shots, app.js
  // reads the perf, the weapons and upgrade suites fire and tick bullets.
  handleEnemyProjectile(data = {}) {
    this.projectiles.createEnemyBullet(data);
  }

  getProjectilePerfSnapshot() {
    return this.projectiles.getProjectilePerfSnapshot();
  }

  createBullet(fromPos, toPos, damage, volley = null) {
    this.projectiles.createBullet(fromPos, toPos, damage, volley);
  }

  updateBullets(deltaTime) {
    this.projectiles.updateBullets(deltaTime);
  }

  // === UPDATE PRINCIPAL ===
  update(deltaTime) {
    const player = this.cachedPlayer;
    const playerStats = player.getStats();
    this.lastKnownPlayerStats = playerStats || null;

    // Only target and shoot when ship hull exists (visible and alive)
    if (!player.isDead && !player.isRetrying && !player._quitExplosionHidden) {
      this.targeting.updateStickAim(player.getAimStick());
      this.targeting.updateTargeting(deltaTime);
      player.setAimPoint(this.targeting.getPrimaryAimPoint());

      if (playerStats) {
        this.handleShooting(deltaTime, playerStats);
      }
    }

    // Always update bullets - they keep flying even without ship hull
    const projectileUpdateStart = performance.now();
    this.projectiles.updateBullets(deltaTime);
    this.projectiles.updateEnemyBullets(deltaTime, player);
    this.projectilePerf.projectileUpdateMs =
      performance.now() - projectileUpdateStart;
    this.projectilePerf.projectilePlayerCount = this.bullets.length;
    this.projectilePerf.projectileEnemyCount = this.enemyBullets.length;

    const enemies = this.cachedEnemies;
    this.cachedPhysics.forEachBulletCollision(
      this.bullets,
      (bullet, asteroid) => {
        if (!asteroid || bullet.hit) {
          return;
        }
        this.processBulletHit(bullet, asteroid, enemies);
      }
    );
    this.updateWeaponEffects(deltaTime);
  }

  // === SISTEMA DE TIRO ===
  handleShooting(deltaTime, playerStats) {
    this.lastShotTime += deltaTime;

    if (!this.canShoot()) return;

    const player = this.cachedPlayer;
    const playerPos = player.getPosition();
    if (!playerPos) return;

    if (this.weaponId === 'harmonic') {
      this.harmonicShots += 1;
      if (this.harmonicShots % HARMONIC_BEAM.every === 0) {
        this.fireBeam(playerPos, playerStats);
        return;
      }
    }
    if (this.weaponId === 'scatter') {
      this.fireFlak(playerPos, playerStats);
      return;
    }

    // Every shot leaves the turret's muzzle (R5.11). Without a lock the
    // turret has turned back onto the nose.
    const muzzle = player.getMuzzlePoint();

    if (this.stickAim) {
      this.fireForward(
        playerPos,
        Math.atan2(this.stickAim.y, this.stickAim.x),
        playerStats,
        { originOverride: muzzle }
      );
      return;
    }

    // Plan 01.07 Task 6: manual-aim mode bypasses target acquisition entirely
    // and fires from the muzzle along the turret.
    if (this.aimMode === 'manual') {
      // Fix-pass (F5): `getTurretAngle()` is PlayerSystem's canonical weapon
      // heading; a player without it is a wiring bug and throws.
      this.fireForward(playerPos, player.getTurretAngle(), playerStats, {
        originOverride: muzzle,
      });
      return;
    }

    // [SMART AUTO-FIRE] If no targets locked, fire forward!
    const lockTargets =
      this.currentTargetLocks && this.currentTargetLocks.length
        ? this.currentTargetLocks
        : this.currentTarget
          ? [this.currentTarget]
          : [];

    // [SMART AUTO-FIRE] Fallback to forward fire if no lock
    if (!lockTargets.length) {
      this.fireForward(playerPos, player.getTurretAngle(), playerStats, {
        originOverride: muzzle,
      });
      return;
    }

    const requestedShots = Math.max(1, Math.floor(playerStats?.multishot ?? 1));
    const usingAdvancedBattery = this.targetingUpgradeLevel >= 3;

    // Fix-pass (F1): wire the damage-aware overkill cap into the real fire
    // path. In Mode 2 (non-rank-3, single-target multishot) every shot in the
    // volley hits the SAME enemy, so the burst cap = ceil(targetHP /
    // volleyDamage). Rank-3 advanced battery is capped PER-ENEMY further
    // down (C1) once we know how the lock slots distributed.
    let totalShots = requestedShots;
    if (!usingAdvancedBattery && requestedShots > 1) {
      const capTarget = lockTargets[0] || null;
      if (capTarget) {
        const allocated = this.targeting.computeAllocatedShots(
          capTarget,
          playerStats
        );
        if (Number.isFinite(allocated) && allocated > 0) {
          totalShots = Math.min(requestedShots, allocated);
        }
      }
    }

    let assignments = usingAdvancedBattery
      ? Array.isArray(this.currentLockAssignments) &&
        this.currentLockAssignments.length
        ? this.currentLockAssignments
        : lockTargets.map((enemy, index) => ({
            enemy,
            predictedAim: this.predictedAimPointsMap.get(enemy.id) ||
              this.targeting.getPredictedTargetPosition(enemy, playerPos) || {
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
          predictedAim: this.predictedAimPointsMap.get(enemy.id) ||
            this.targeting.getPredictedTargetPosition(enemy, playerPos) || {
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
        const predicted = this.targeting.getPredictedTargetPosition(
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
      this.projectiles.createBullet(
        {
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
      const primaryTarget = this.currentTarget;
      if (primaryTarget) {
        const predicted = this.predictedAimPointsMap?.get(primaryTarget.id);
        if (predicted) {
          centerlineTarget = { x: predicted.x, y: predicted.y };
        } else {
          const fallbackPredicted = this.targeting.getPredictedTargetPosition(
            primaryTarget,
            playerPos
          );
          centerlineTarget = fallbackPredicted
            ? { x: fallbackPredicted.x, y: fallbackPredicted.y }
            : { x: primaryTarget.x, y: primaryTarget.y };
        }
      }
      this.eventBus?.emit?.('weapon-fired', {
        position: playerPos,
        target: firstTarget,
        centerlineTarget,
        weaponType: 'basic',
        primaryTargetId: this.currentTarget ? this.currentTarget.id : null,
        targeting: {
          dynamicPrediction: this.targeting.usingDynamicPrediction(),
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
    const sharedOrigin = this.aimMode === 'manual';
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

      this.projectiles.createBullet(shotOrigin, aimPoint, playerStats.damage);
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
      this.eventBus?.emit?.('weapon-fired', {
        position: originPos,
        target: firedTargets[0].position,
        centerlineTarget,
        weaponType: 'basic',
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

  // Fire rate, projectile speed/lifetime and lock range from upgrades. Keyed
  // by upgrade rank so re-applying a rank (Retry) does not compound it.
  applyWeaponTuning(data = {}) {
    this.weaponTuningSources.set(`${data.upgradeId}:${data.level}`, data);
    const product = (field) => {
      let value = 1;
      this.weaponTuningSources.forEach((entry) => {
        const factor = Number(entry[field]);
        if (factor > 0) {
          value *= factor;
        }
      });
      return value;
    };
    this.cooldownTuning = product('cooldownMultiplier');
    this.lanceDamageTuning = product('lanceDamageMultiplier');
    this.pierceBonus = 0;
    this.weaponTuningSources.forEach((entry) => {
      this.pierceBonus += Number(entry.pierceBonus) || 0;
    });
    this.bulletSpeed = BULLET_SPEED * product('bulletSpeedMultiplier');
    this.bulletLifetime =
      COMBAT_BULLET_LIFETIME * product('bulletLifetimeMultiplier');
    this.setTargetingRange(
      COMBAT_TARGETING_RANGE * product('targetingRangeMultiplier')
    );
    this.refreshShootCooldown();
  }

  refreshShootCooldown() {
    this.setShootCooldown(
      this.baseShootCooldown * this.aimCooldownMultiplier * this.cooldownTuning
    );
  }

  // The weapon half of the aiming branch reset (Targeting resets its own half).
  resetWeaponTuning() {
    this.shootCooldown = this.baseShootCooldown;
    this.aimCooldownMultiplier = 1;
    this.cooldownTuning = 1;
    this.lanceDamageTuning = 1;
    this.pierceBonus = 0;
    this.weaponTuningSources = new Map();
    this.bulletSpeed = BULLET_SPEED;
    this.bulletLifetime = COMBAT_BULLET_LIFETIME;
  }

  applyAimingUpgrade(data = {}) {
    const targeting = this.targeting;
    const levelValue = Number(data?.level);
    if (Number.isFinite(levelValue)) {
      targeting.setUpgradeLevel(
        Math.max(this.targetingUpgradeLevel, Math.floor(levelValue))
      );
    }

    if (data?.resetWeights) {
      targeting.resetDangerWeights();
    }

    if (data?.dangerWeights) {
      targeting.mergeDangerWeights(data.dangerWeights);
    }

    if (Number.isFinite(data?.linearLeadTime)) {
      targeting.setLinearPredictionTime(
        Math.max(0, Number(data.linearLeadTime))
      );
    }

    if (data?.dynamicPrediction) {
      targeting.updateDynamicPredictionSettings(data.dynamicPrediction);
    }

    if (this.targetingUpgradeLevel >= 1) {
      targeting.setDangerScoreEnabled(true);
    }

    if (this.targetingUpgradeLevel >= 2) {
      targeting.setDynamicPredictionEnabled(true);
    }

    if (this.targetingUpgradeLevel >= 3) {
      const targetCount = Number(data?.multiLockTargets);
      if (Number.isFinite(targetCount) && targetCount > 0) {
        targeting.setMultiLockTargets(Math.max(1, Math.floor(targetCount)));
      }

      const cooldownMultiplier = Number(data?.cooldownMultiplier);
      if (Number.isFinite(cooldownMultiplier) && cooldownMultiplier > 0) {
        this.aimCooldownMultiplier = cooldownMultiplier;
        this.refreshShootCooldown();
      } else if (
        Number.isFinite(this.aimingConfig?.multiLock?.cooldownMultiplier)
      ) {
        this.aimCooldownMultiplier =
          this.aimingConfig.multiLock.cooldownMultiplier;
        this.refreshShootCooldown();
      }
    }

    // Fix-pass-2 (C3): if an upgrade lands while aimMode === 'manual', the
    // behavioral-flag snapshot captured at manual-on is now stale. Reconcile:
    //   - Update the snapshot so it reflects the upgrade's new flag state
    //     (what the player should see on switchback).
    //   - Force live flags back to false because manual still pauses them
    //     (the unconditional assignments above set them true regardless of
    //     aim mode — we have to re-zero them to honor manual's pause).
    if (this.aimMode === 'manual') {
      targeting.setAimModeFlagSnapshot({
        dangerScoreEnabled: this.targetingUpgradeLevel >= 1,
        dynamicPredictionEnabled: this.targetingUpgradeLevel >= 2,
      });
      targeting.setDangerScoreEnabled(false);
      targeting.setDynamicPredictionEnabled(false);
    }

    targeting.setTargetUpdateInterval(
      Number.isFinite(data?.targetUpdateInterval)
        ? Math.max(0.05, Number(data.targetUpdateInterval))
        : targeting.resolveTargetUpdateInterval()
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

    const spacing = this.aimingConfig?.multiLock?.parallelSpacing ?? 10;

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

    const spacing = this.aimingConfig?.multiLock?.parallelSpacing ?? 10;

    if (input.kind === 'target') {
      const enemy = input.enemy;
      if (!enemy) {
        return [];
      }

      const predicted = input.predictedAim || { x: enemy.x, y: enemy.y };
      const playerPos = input.fireOrigin || this.cachedPlayer.getPosition();

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

  processBulletHit(bullet, enemy, enemiesSystem) {
    if (!bullet || !enemy || bullet.hit) {
      return;
    }
    // Railshot: a piercing lance skips what it already went through.
    if (bullet.pierced?.includes(enemy)) {
      return;
    }

    if (bullet.pierceLeft > 0) {
      bullet.pierceLeft -= 1;
      bullet.pierced.push(enemy);
    } else {
      bullet.hit = true;
    }
    const healthBefore = Number.isFinite(enemy.health) ? enemy.health : null;
    let requestedDamage = Number.isFinite(bullet.damage) ? bullet.damage : 0;
    // Chain Capacitor without the Chain Lance: some lances hit twice.
    const capacitor = this.cardEffects.chainCapacitor;
    if (
      capacitor &&
      (bullet.kind === 'lance' || bullet.kind === 'flak') &&
      !this.evolutions.includes('arc') &&
      this.rollCardChance(capacitor.doubleHitChance)
    ) {
      requestedDamage *= 2;
    }
    // Harmonic beam: a large/medium rock it kills splits once more, along
    // the same seams (generateFragments is seeded by the rock's crackSeed).
    const beamSplit =
      bullet.kind === 'beam' &&
      enemy.type === 'asteroid' &&
      (enemy.size === 'large' || enemy.size === 'medium')
        ? {
            x: enemy.x,
            y: enemy.y,
            wave: enemy.wave,
            descriptors: enemy.generateFragments(),
          }
        : null;
    const rewards =
      bullet.kind !== 'chain' && this.evolutions.includes('salvage')
        ? enemiesSystem.rewardManager
        : null;
    const orbsBefore = rewards ? rewards.stats.totalOrbsDropped : 0;

    const damageResult = this.applyDamageToEnemy(
      enemiesSystem,
      enemy,
      requestedDamage,
      { hitPosition: { x: bullet.x, y: bullet.y } }
    );
    const remainingHealth = Number.isFinite(damageResult.remainingHealth)
      ? damageResult.remainingHealth
      : enemy.health ?? null;
    const effectiveDamage =
      Number.isFinite(healthBefore) && Number.isFinite(remainingHealth)
        ? Math.max(0, healthBefore - remainingHealth)
        : 0;
    const blockedByInvulnerability =
      enemy.type === 'boss' &&
      Boolean(enemy.invulnerable) &&
      effectiveDamage <= 0;

    if (
      blockedByInvulnerability &&
      typeof enemy.registerInvulnerabilityHit === 'function'
    ) {
      enemy.registerInvulnerabilityHit({ x: bullet.x, y: bullet.y });
    }

    damageResult.effectiveDamage = effectiveDamage;
    damageResult.blocked = blockedByInvulnerability;

    if (enemy.type === 'boss') {
      const maxHealth = Number.isFinite(enemy.maxHealth)
        ? enemy.maxHealth
        : null;
      const healthPercent =
        maxHealth && Number.isFinite(remainingHealth)
          ? Number(((remainingHealth / maxHealth) * 100).toFixed(1))
          : null;

      GameDebugLogger.log(
        'DAMAGE',
        blockedByInvulnerability
          ? 'Boss blocked bullet'
          : effectiveDamage > 0
            ? 'Boss took damage'
            : 'Boss bullet impact caused no damage',
        {
          requestedDamage,
          effectiveDamage,
          blocked: blockedByInvulnerability,
          killed: !!damageResult.killed,
          newHealth: remainingHealth,
          maxHealth,
          healthPercent,
          phase: enemy.currentPhase ?? null,
          invulnerable: !!enemy.invulnerable,
        }
      );
    }

    this.eventBus?.emit?.('bullet-hit', {
      bullet,
      enemy,
      position: { x: bullet.x, y: bullet.y },
      damage: effectiveDamage,
      requestedDamage,
      effectiveDamage,
      blocked: blockedByInvulnerability,
      killed: damageResult.killed,
      remainingHealth: damageResult.remainingHealth,
      invulnerable: !!enemy.invulnerable,
    });

    if (!blockedByInvulnerability) {
      if (!damageResult.killed && effectiveDamage > 0) {
        this.applyKnockback(bullet, enemy, effectiveDamage);
      }
      if (beamSplit && damageResult.killed) {
        this.spawnBeamFragment(enemiesSystem, enemy, beamSplit);
      }
      if (rewards && damageResult.killed) {
        this.dropProspectorOrbs(
          rewards,
          enemy,
          rewards.stats.totalOrbsDropped - orbsBefore
        );
      }
      if (bullet.kind !== 'chain') {
        this.applyEvolutionHit(enemy, requestedDamage, damageResult, bullet);
      }
    }
    // A flak bolt bursts on its first hit, blocked or not; its shrapnel
    // spares the enemy it struck.
    if (bullet.kind === 'flak') {
      bullet.volley.struck.push(enemy);
      this.burstFlak(bullet);
    }

    return damageResult;
  }

  // A shove along the bullet, heavier for bigger hits (PLAN.md R5.9). The AI
  // reasserts its own velocity, so it reads as a short stagger; asteroids
  // drift linearly and would keep it forever, so they are left alone.
  applyKnockback(bullet, enemy, damage) {
    this.pushEnemy(
      enemy,
      bullet.vx || 0,
      bullet.vy || 0,
      knockbackSpeed(damage)
    );
  }

  // Adds `speed` px/s along (dx, dy); bosses and heralds take a tenth, rocks
  // none (they would keep the drift forever).
  pushEnemy(enemy, dx, dy, speed) {
    if (enemy.type === 'asteroid') return;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const heavy = enemy.type === 'boss' || enemy.type === 'herald';
    const push = speed * (heavy ? KNOCKBACK_HEAVY_FACTOR : 1);
    const ix = (dx / length) * push;
    const iy = (dy / length) * push;
    enemy.vx = (enemy.vx ?? 0) + ix;
    enemy.vy = (enemy.vy ?? 0) + iy;
    // Steering strategies read `velocity` and write it back to vx/vy.
    if (enemy.velocity) {
      enemy.velocity.vx = (enemy.velocity.vx ?? 0) + ix;
      enemy.velocity.vy = (enemy.velocity.vy ?? 0) + iy;
    }
  }

  // === WEAPONS AND EVOLUTIONS (docs/NORTE.md §7 pillar 4) ===
  resetWeaponState() {
    this.weaponId = WEAPONS.lance.id;
    this.harmonicShots = 0;
    this.evolutions = [];
    this.apexes = [];
    this.beams = [];
    this.flakBursts = [];
    this.arcs = [];
    this.wells = [];
    this.arcSeed = 0;
    this.burns = new Map();
    this.slows = new Map();
    this.pulls = new Map();
    this.prospectorCarry = 0;
    this.cardEffects = {};
    this.cardRolls = 0;
    this.cinders = [];
    this.cinderTimer = 0;
    this.ions = [];
    this.ionTimer = 0;
    this.afterburnTrail = [];
    this.afterburnTimer = 0;
    this.afterburnDashing = false;
    this.staticShellPending = false;
    this.refreshLanceLook();
  }

  /** A family's "3 of a kind" synergy evolves the lance for the rest of the run. */
  evolveWeapon(family) {
    const evolution = WEAPON_EVOLUTIONS[family];
    if (!evolution || this.evolutions.includes(family)) {
      return;
    }
    this.evolutions.push(family);
    this.refreshLanceLook();
    this.eventBus?.emit?.('weapon-evolved', {
      family,
      id: evolution.id,
      name: evolution.name,
      description: evolution.description,
      weaponId: this.weaponId,
    });
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
    const every = HARMONIC_BEAM.every;
    return {
      weaponId: this.weaponId,
      name: WEAPONS[this.weaponId].name,
      chip: WEAPONS[this.weaponId].chip,
      shotsToBeam:
        this.weaponId === 'harmonic'
          ? every - (this.harmonicShots % every)
          : null,
      evolutions: this.evolutions.map((family) => {
        const apex = this.apexes.includes(family) ? WEAPON_APEX[family] : null;
        const evolution = apex || WEAPON_EVOLUTIONS[family];
        return {
          family,
          id: evolution.id,
          name: evolution.name,
          description: evolution.description,
          apex: Boolean(apex),
          short: apex ? apex.short : evolution.id.toUpperCase(),
        };
      }),
    };
  }

  // Every enemy a weapon effect can reach: a phased Shade (`intangible`) is
  // out of the Field for beams, arcs, burns, pulls and shoves, as for the lock.
  forEachSolidEnemy(callback) {
    this.cachedEnemies.forEachActiveEnemy((enemy) => {
      if (enemy && !enemy.destroyed && !enemy.intangible) callback(enemy);
    });
  }

  // Where a beam or a flak volley goes from `origin` (the muzzle): along the
  // right stick, onto the primary lock's lead point in auto, along the turret
  // otherwise.
  getWeaponAngle(origin) {
    const aim = this.aimMode === 'manual' ? null : this.getPrimaryAimPoint();
    if (this.stickAim) return Math.atan2(this.stickAim.y, this.stickAim.x);
    return aim
      ? Math.atan2(aim.y - origin.y, aim.x - origin.x)
      : this.cachedPlayer.getTurretAngle();
  }

  // Harmonic beam: damage lands on everything in the segment on the firing
  // frame; the beam stays on screen for HARMONIC_BEAM.duration. Aimed like the
  // lances: from the muzzle onto the primary lock's lead point in auto, along
  // the turret otherwise.
  fireBeam(playerPos, playerStats) {
    const origin = this.cachedPlayer.getMuzzlePoint();
    const angle = this.getWeaponAngle(origin);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const { width, duration } = HARMONIC_BEAM;
    const length =
      HARMONIC_BEAM.length *
      (this.cardEffects.thermalLens?.beamLengthMultiplier ?? 1);
    const end = { x: origin.x + dirX * length, y: origin.y + dirY * length };
    const damage =
      (Number(playerStats?.damage) || 0) * HARMONIC_BEAM.damageMultiplier;

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
      this.processBulletHit(
        { kind: 'beam', x, y, vx, vy, damage, hit: false },
        enemy,
        this.cachedEnemies
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
      maxRadius: HARMONIC_BEAM.flashRadius,
    });
    this.lastShotTime = -HARMONIC_BEAM.cooldownPenalty;

    this.eventBus?.emit?.('weapon-beam-fired', {
      position: origin,
      end,
      angle,
      damage,
      hits: struck.length,
    });
    this.eventBus?.emit?.('weapon-fired', {
      position: playerPos,
      target: end,
      centerlineTarget: end,
      weaponType: 'harmonic-beam',
      primaryTargetId: this.currentTarget ? this.currentTarget.id : null,
      targeting: {
        dynamicPrediction: this.usingDynamicPrediction(),
        lockCount: this.currentTargetLocks.length,
        multiLockActive: false,
        predictedPoints: [],
      },
    });
  }

  // Scatter Coil: a fan of flak bolts from the muzzle, aimed like the beam.
  // Multishot adds bolts to the fan; the volley waits FLAK.cooldownMultiplier
  // × the lance's cooldown.
  fireFlak(playerPos, playerStats) {
    const origin = this.cachedPlayer.getMuzzlePoint();
    const angle = this.getWeaponAngle(origin);
    const extra = Math.max(0, Math.floor(playerStats?.multishot ?? 1) - 1);
    const bolts = Math.min(FLAK.maxBolts, FLAK.bolts + extra);
    const fan = (FLAK.fan * Math.PI) / 180;
    // Shared by the volley's bolts: who its shrapnel already hit, and how
    // many bursts it has had (only the first lights the 3D scene).
    const volley = { struck: [], bursts: 0 };
    const predictedPoints = [];
    for (let i = 0; i < bolts; i += 1) {
      const a = angle + fan * (i / (bolts - 1) - 0.5);
      const end = {
        x: origin.x + Math.cos(a) * FLAK.range,
        y: origin.y + Math.sin(a) * FLAK.range,
      };
      this.projectiles.createBullet(origin, end, playerStats.damage, volley);
      predictedPoints.push({ enemyId: null, position: end });
    }
    this.lastShotTime = -this.shootCooldown * (FLAK.cooldownMultiplier - 1);

    const centre = {
      x: origin.x + Math.cos(angle) * FLAK.range,
      y: origin.y + Math.sin(angle) * FLAK.range,
    };
    this.eventBus?.emit?.('weapon-fired', {
      position: playerPos,
      target: centre,
      centerlineTarget: centre,
      weaponType: 'scatter',
      primaryTargetId: this.currentTarget ? this.currentTarget.id : null,
      targeting: {
        dynamicPrediction: this.usingDynamicPrediction(),
        lockCount: this.currentTargetLocks.length,
        multiLockActive: false,
        predictedPoints,
      },
    });
  }

  // A flak burst: shrapnel hits every solid enemy whose rim is within
  // FLAK.burstRadius, at most once per volley, through the same hit path as
  // the bolts (so the evolutions apply).
  burstFlak(bolt) {
    const { x, y, volley } = bolt;
    const struck = [];
    this.forEachSolidEnemy((enemy) => {
      if (volley.struck.includes(enemy)) return;
      const reach = FLAK.burstRadius + (enemy.radius || 0);
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
      this.processBulletHit(
        {
          kind: 'shrapnel',
          x: enemy.x - (dx / distance) * radius,
          y: enemy.y - (dy / distance) * radius,
          vx: (dx / distance) * this.bulletSpeed,
          vy: (dy / distance) * this.bulletSpeed,
          damage: bolt.shrapnel,
          hit: false,
        },
        enemy,
        this.cachedEnemies
      );
    });

    const angle = Math.atan2(bolt.vy || 0, bolt.vx || 1);
    this.flakBursts.push({
      x,
      y,
      angle,
      life: FLAK.burstDuration,
      maxLife: FLAK.burstDuration,
      maxRadius: FLAK.burstRadius,
      lit: volley.bursts === 0,
    });
    volley.bursts += 1;
    this.eventBus?.emit?.('flak-burst', {
      position: { x, y },
      radius: FLAK.burstRadius,
      angle,
      hits: struck.length,
    });
  }

  // One more fragment from a beam kill, turned half a step from the first
  // seam so it does not overlap its siblings; registered like the others
  // (EnemyDamageSystem.destroyAsteroid).
  spawnBeamFragment(enemies, parent, split) {
    const { descriptors } = split;
    if (!descriptors.length) return;
    const base = descriptors[0];
    const wave = enemies.waveState?.current || split.wave || 1;
    for (let k = 0; k < HARMONIC_BEAM.extraFragments; k += 1) {
      const turn = (Math.PI * (2 * k + 1)) / descriptors.length;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const ox = base.x - split.x;
      const oy = base.y - split.y;
      const descriptor = {
        ...base,
        x: split.x + ox * cos - oy * sin,
        y: split.y + ox * sin + oy * cos,
        vx: base.vx * cos - base.vy * sin,
        vy: base.vx * sin + base.vy * cos,
      };
      const [variant] = enemies.assignVariantsToFragments(
        [descriptor],
        parent,
        wave
      );
      const fragment = enemies.acquireAsteroid({
        ...descriptor,
        variant,
        wave: descriptor.wave || wave,
        random: enemies.createScopedRandom('fragments', 'fragment')?.random,
        randomScope: 'fragments',
      });
      if (!fragment) continue;
      enemies.warnIfWaveManagerRegistrationFailed(
        enemies.registerActiveEnemy(fragment),
        'fragment-spawn',
        fragment
      );
      const waveState = enemies.waveState;
      if (waveState?.isActive) {
        waveState.totalAsteroids += 1;
        waveState.asteroidsSpawned += 1;
      }
    }
  }

  // Prospector: +25 % of the orbs a lance kill dropped (Motherlode: +100 %),
  // carried across kills so small rocks (1 orb) still pay out on average.
  dropProspectorOrbs(rewards, enemy, dropped) {
    const { orbBonus } = this.apexes.includes('salvage')
      ? WEAPON_APEX.salvage
      : WEAPON_EVOLUTIONS.salvage;
    this.prospectorCarry += Math.max(0, dropped) * orbBonus;
    const extra = Math.floor(this.prospectorCarry + 1e-9);
    if (extra <= 0) return;
    this.prospectorCarry -= extra;
    rewards.createXPOrbs(enemy, extra, ORB_VALUE);
  }

  // Burn, slow and chain on a lance or beam hit (chain hits do not chain);
  // an Apex replaces its family's first stage.
  applyEvolutionHit(enemy, damage, result, hit) {
    if (!this.evolutions.length) return;
    const alive = !result.killed && !enemy.destroyed;
    if (alive && this.evolutions.includes('thermal')) {
      const { burn } = WEAPON_EVOLUTIONS.thermal;
      this.burns.set(enemy, {
        id: enemy.id,
        timer: 0,
        interval: burn.duration / burn.ticks,
        ticksLeft: burn.ticks,
        damage: damage * burn.damageFraction,
        spreadTo: this.apexes.includes('thermal') ? [] : null,
      });
    }
    // Bosses move on scripts, not on velocity: no slow and no pull.
    if (this.apexes.includes('field')) {
      this.pullToward(enemy, alive, hit.x, hit.y);
    } else if (
      alive &&
      enemy.type !== 'boss' &&
      this.evolutions.includes('field')
    ) {
      this.slows.set(enemy, {
        id: enemy.id,
        timer: WEAPON_EVOLUTIONS.field.slow.duration,
      });
    }
    if (this.evolutions.includes('arc')) {
      const { chain } = WEAPON_EVOLUTIONS.arc;
      const storm = this.apexes.includes('arc') ? WEAPON_APEX.arc.chain : null;
      this.chainFrom(
        enemy,
        damage * chain.damageFraction,
        (storm ? storm.jumps : chain.jumps) +
          (this.cardEffects.chainCapacitor?.extraJumps ?? 0),
        [enemy],
        storm ? storm.fork : 1
      );
    }
  }

  // Singularity: the target (if alive) and every non-boss whose rim is
  // within reach of the hit point are pulled toward it; the collapsing ring
  // is a `well`.
  pullToward(target, targetAlive, x, y) {
    const { radius, duration } = WEAPON_APEX.field.pull;
    this.forEachSolidEnemy((enemy) => {
      if (enemy.type === 'boss') return;
      const inReach =
        enemy === target
          ? targetAlive
          : Math.hypot(enemy.x - x, enemy.y - y) - (enemy.radius || 0) <=
            radius;
      if (!inReach) return;
      this.pulls.set(enemy, { id: enemy.id, timer: duration, x, y });
    });
    this.wells.push({ x, y, life: duration, maxLife: duration });
  }

  // Chain Lance: `jumps` hops, each to the nearest enemy within range not
  // yet in this chain. Storm Lance: the first hop goes to the `fork`
  // nearest, and each branch keeps jumping.
  chainFrom(source, damage, jumps = 1, visited = [source], fork = 1) {
    const { range } = WEAPON_EVOLUTIONS.arc.chain;
    const rangeSq = range * range + 1e-6;
    const near = [];
    this.forEachSolidEnemy((candidate) => {
      if (visited.includes(candidate)) return;
      const sq = (candidate.x - source.x) ** 2 + (candidate.y - source.y) ** 2;
      if (sq < rangeSq) near.push({ candidate, sq });
    });
    if (!near.length) return;
    near.sort((a, b) => a.sq - b.sq);
    const targets = near.slice(0, fork).map((entry) => entry.candidate);
    visited.push(...targets);

    const storm = this.apexes.includes('arc');
    targets.forEach((best) => {
      const dx = best.x - source.x;
      const dy = best.y - source.y;
      const distance = Math.hypot(dx, dy) || 1;
      this.addArc(source, best, storm ? { heavy: true } : null);
      this.processBulletHit(
        {
          kind: 'chain',
          x: best.x - (dx / distance) * (best.radius || 0),
          y: best.y - (dy / distance) * (best.radius || 0),
          vx: (dx / distance) * this.bulletSpeed,
          vy: (dy / distance) * this.bulletSpeed,
          damage,
          hit: false,
        },
        best,
        this.cachedEnemies
      );
    });
    if (jumps > 1) {
      targets.forEach((best) =>
        this.chainFrom(best, damage, jumps - 1, visited)
      );
    }
  }

  // A jagged arc between two circles (Chain Lance, Static Shell, Solar Flare
  // spread). `style`: { color } overrides the lance's arc colour, { heavy }
  // draws the Storm Lance's thicker bolt.
  addArc(source, target, style = null) {
    const { duration } = WEAPON_EVOLUTIONS.arc.chain;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy) || 1;
    // Rim to rim, so the arc shows in the gap instead of under the rocks.
    const startGap = Math.min(source.radius || 0, distance * 0.45);
    const endGap = Math.min(target.radius || 0, distance * 0.45);
    const span = distance - startGap - endGap;
    const ux = dx / distance;
    const uy = dy / distance;
    const points = [];
    const seed = (this.arcSeed += 1);
    for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
      const along = startGap + (span * i) / ARC_SEGMENTS;
      const jitter =
        i === 0 || i === ARC_SEGMENTS
          ? 0
          : hashUnit(seed * 31 + i) * ARC_JITTER;
      points.push({
        x: source.x + ux * along - uy * jitter,
        y: source.y + uy * along + ux * jitter,
      });
    }
    this.arcs.push({
      points,
      life: duration,
      maxLife: duration,
      color: style?.color ?? null,
      heavy: Boolean(style?.heavy),
    });
  }

  // Deterministic card roll (no game RNG here, like the arc jitter).
  rollCardChance(chance) {
    this.cardRolls += 1;
    return (hashUnit(this.cardRolls * 7 + 3) + 1) / 2 < chance;
  }

  // Cinder Trail / Ion Trail: a point every few px along the main thruster.
  dropTrailPoint(list, { life, radius }, { position }) {
    const last = list[list.length - 1];
    if (last && Math.hypot(last.x - position.x, last.y - position.y) < radius) {
      return;
    }
    list.push({ x: position.x, y: position.y, life, maxLife: life });
  }

  // Afterburn: while the ship dashes, a point every AFTERBURN_POINT_SPACING
  // px of its travel; `joined` links a point to the one before it.
  dropAfterburnPoints({ life }) {
    const player = this.cachedPlayer;
    if (player.isDead || !(player.dashTimer > 0)) {
      this.afterburnDashing = false;
      return;
    }
    const list = this.afterburnTrail;
    const { x, y } = player.getPosition();
    const last = this.afterburnDashing ? list[list.length - 1] : null;
    const dx = last ? x - last.x : 0;
    const dy = last ? y - last.y : 0;
    const distance = Math.hypot(dx, dy);
    if (!last || distance > AFTERBURN_JOIN_GAP) {
      list.push({ x, y, life, maxLife: life, joined: false });
    } else {
      const steps = Math.floor(distance / AFTERBURN_POINT_SPACING);
      for (let i = 1; i <= steps; i += 1) {
        const t = (i * AFTERBURN_POINT_SPACING) / distance;
        list.push({
          x: last.x + dx * t,
          y: last.y + dy * t,
          life,
          maxLife: life,
          joined: true,
        });
      }
    }
    this.afterburnDashing = true;
    if (list.length > AFTERBURN_MAX_POINTS) {
      list.splice(0, list.length - AFTERBURN_MAX_POINTS);
    }
  }

  // The Ion Trail spares rocks and halves on bosses (`bossFactor`).
  burnTrailTouches(list, { damage, radius, bossFactor }) {
    const ion = bossFactor !== undefined;
    const touched = [];
    this.forEachSolidEnemy((enemy) => {
      if (ion && enemy.type === 'asteroid') return;
      const reach = (enemy.radius || 0) + radius;
      const reachSq = reach * reach;
      if (
        list.some((c) => (c.x - enemy.x) ** 2 + (c.y - enemy.y) ** 2 <= reachSq)
      ) {
        touched.push(enemy);
      }
    });
    touched.forEach((enemy) => {
      if (enemy.destroyed) return;
      const scale = ion && enemy.type === 'boss' ? bossFactor : 1;
      this.applyDamageToEnemy(this.cachedEnemies, enemy, damage * scale, {
        hitPosition: { x: enemy.x, y: enemy.y },
      });
    });
  }

  // Pushes every enemy within `radius` straight away from `origin`.
  shoveFrom(origin, radius, speed) {
    if (!origin) return;
    this.forEachSolidEnemy((enemy) => {
      const dx = enemy.x - origin.x;
      const dy = enemy.y - origin.y;
      const reach = radius + (enemy.radius || 0);
      if (dx * dx + dy * dy > reach * reach) return;
      this.pushEnemy(enemy, dx, dy, speed);
    });
  }

  // Static Shell: an arc to every enemy within reach of the ship.
  dischargeStaticShell({ radius, damage }) {
    const { x, y } = this.cachedPlayer.getPosition();
    const origin = { x, y, radius: SHIP_SIZE };
    const struck = [];
    this.forEachSolidEnemy((enemy) => {
      const reach = radius + (enemy.radius || 0);
      if ((enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= reach * reach) {
        struck.push(enemy);
      }
    });
    struck.forEach((enemy) => {
      if (enemy.destroyed) return;
      this.addArc(origin, enemy);
      // A chain-kind hit: no burn, slow or chain procs off the discharge.
      this.processBulletHit(
        {
          kind: 'chain',
          x: enemy.x,
          y: enemy.y,
          vx: 0,
          vy: 0,
          damage,
          hit: false,
        },
        enemy,
        this.cachedEnemies
      );
    });
  }

  // Gravity Brake: undo part of this frame's travel near the ship.
  applyGravityBrake({ radius, slowFraction }, deltaTime) {
    const { x, y } = this.cachedPlayer.getPosition();
    const drag = slowFraction * deltaTime;
    this.forEachSolidEnemy((enemy) => {
      if (enemy.type === 'boss') return;
      if ((enemy.x - x) ** 2 + (enemy.y - y) ** 2 > radius * radius) return;
      enemy.x -= (enemy.vx || 0) * drag;
      enemy.y -= (enemy.vy || 0) * drag;
    });
  }

  updateWeaponEffects(deltaTime) {
    const fade = (list) => {
      let kept = 0;
      for (let i = 0; i < list.length; i += 1) {
        list[i].life -= deltaTime;
        if (list[i].life > 0) list[kept++] = list[i];
      }
      list.length = kept;
    };
    fade(this.beams);
    fade(this.flakBursts);
    fade(this.arcs);
    fade(this.cinders);
    fade(this.ions);
    fade(this.afterburnTrail);
    fade(this.wells);

    const { cinderTrail, ionTrail, afterburn, staticShell, gravityBrake } =
      this.cardEffects;
    if (afterburn) this.dropAfterburnPoints(afterburn);
    // Each trail ticks on its own timer while it has points.
    const tick = (list, trail, timerKey) => {
      if (!trail || !list.length) {
        this[timerKey] = 0;
        return;
      }
      this[timerKey] += deltaTime;
      while (this[timerKey] >= trail.tickInterval) {
        this[timerKey] -= trail.tickInterval;
        this.burnTrailTouches(list, trail);
      }
    };
    tick(this.cinders, cinderTrail, 'cinderTimer');
    tick(this.ions, ionTrail, 'ionTimer');
    tick(this.afterburnTrail, afterburn, 'afterburnTimer');
    if (this.staticShellPending) {
      this.staticShellPending = false;
      this.dischargeStaticShell(staticShell);
    }
    // The beam stays on the muzzle while it shows (its damage already landed).
    const player = this.cachedPlayer;
    if (this.beams.length && !player.isDead) {
      const muzzle = player.getMuzzlePoint();
      this.beams.forEach((beam) => {
        beam.ex += muzzle.x - beam.x;
        beam.ey += muzzle.y - beam.y;
        beam.x = muzzle.x;
        beam.y = muzzle.y;
      });
    }

    if (gravityBrake && !player.isDead) {
      this.applyGravityBrake(gravityBrake, deltaTime);
    }

    if (this.burns.size) {
      const spreads = [];
      this.burns.forEach((entry, enemy) => {
        entry.timer += deltaTime;
        while (
          entry.timer >= entry.interval - 1e-9 &&
          entry.ticksLeft > 0 &&
          !enemy.destroyed &&
          enemy.id === entry.id
        ) {
          entry.timer -= entry.interval;
          entry.ticksLeft -= 1;
          if (entry.spreadTo) this.spreadBurn(enemy, entry, spreads);
          this.applyDamageToEnemy(this.cachedEnemies, enemy, entry.damage, {
            hitPosition: { x: enemy.x, y: enemy.y },
          });
        }
        if (entry.ticksLeft <= 0 || enemy.destroyed || enemy.id !== entry.id) {
          this.burns.delete(enemy);
        }
      });
      // Added after the pass, so a fresh spread burn does not tick this frame.
      spreads.forEach(([enemy, entry]) => this.burns.set(enemy, entry));
    }

    if (this.pulls.size) {
      const { speed } = WEAPON_APEX.field.pull;
      this.pulls.forEach((entry, enemy) => {
        if (enemy.destroyed || enemy.id !== entry.id) {
          this.pulls.delete(enemy);
          return;
        }
        const dx = entry.x - enemy.x;
        const dy = entry.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        const step = Math.min(
          distance,
          speed * Math.min(deltaTime, entry.timer)
        );
        if (distance > 1e-9) {
          enemy.x += (dx / distance) * step;
          enemy.y += (dy / distance) * step;
        }
        entry.timer -= deltaTime;
        if (entry.timer <= 1e-9) this.pulls.delete(enemy);
      });
    }

    if (this.slows.size) {
      // Undo (1 − factor) of this frame's travel: the AI keeps its velocity.
      const drag = 1 - WEAPON_EVOLUTIONS.field.slow.factor;
      this.slows.forEach((entry, enemy) => {
        if (enemy.destroyed || enemy.id !== entry.id) {
          this.slows.delete(enemy);
          return;
        }
        const slowed = Math.min(deltaTime, entry.timer) * drag;
        enemy.x -= (enemy.vx || 0) * slowed;
        enemy.y -= (enemy.vy || 0) * slowed;
        entry.timer -= deltaTime;
        if (entry.timer <= 1e-9) this.slows.delete(enemy);
      });
    }
  }

  // Solar Flare: a burn tick sets every enemy whose rim is within reach of
  // the burning one's and is not burning alight, once per source, at half
  // duration; those do not spread.
  spreadBurn(source, entry, spreads) {
    const { radius, durationFraction, ticks } = WEAPON_APEX.thermal.spread;
    const { duration } = WEAPON_EVOLUTIONS.thermal.burn;
    this.forEachSolidEnemy((enemy) => {
      if (
        enemy === source ||
        this.burns.has(enemy) ||
        entry.spreadTo.includes(enemy) ||
        Math.hypot(enemy.x - source.x, enemy.y - source.y) -
          (enemy.radius || 0) -
          (source.radius || 0) >
          radius
      ) {
        return;
      }
      entry.spreadTo.push(enemy);
      this.addArc(source, enemy, { color: WEAPON_APEX.thermal.look.outer });
      spreads.push([
        enemy,
        {
          id: enemy.id,
          timer: 0,
          interval: (duration * durationFraction) / ticks,
          ticksLeft: ticks,
          damage: entry.damage,
          spreadTo: null,
        },
      ]);
    });
  }

  applyDamageToEnemy(enemiesSystem, enemy, damage, source) {
    const result = enemiesSystem.applyDamage(enemy, damage, { source });
    return {
      killed: !!result?.killed,
      remainingHealth: Math.max(
        0,
        result?.remainingHealth ?? enemy.health ?? 0
      ),
    };
  }

  // === GETTERS PÚBLICOS ===
  getCurrentTarget() {
    return this.targeting.getCurrentTarget();
  }

  /** Where the primary lock is aimed (lead included), or null. */
  getPrimaryAimPoint() {
    return this.targeting.getPrimaryAimPoint();
  }

  // Lance shot (docs/NORTE.md §3): 8×2 amber core behind a 4 px white-hot
  // head, axis +x, origin at the head. `head` is the emissive copy.
  // Colours follow the evolved look (lanceLook).
  ensureLanceSprite() {
    const scale = getRenderScale();
    const { body, head: headColor } = this.lanceLook;
    if (
      this.lanceSprite &&
      this.lanceSprite.scale === scale &&
      this.lanceSprite.body === body &&
      this.lanceSprite.headColor === headColor
    ) {
      return this.lanceSprite;
    }
    if (typeof document === 'undefined') {
      return null;
    }

    const bake = (drawHead, drawCore) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(LANCE_SPRITE.width * scale);
      canvas.height = Math.ceil(LANCE_SPRITE.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(scale, scale);
      ctx.translate(LANCE_SPRITE.originX, LANCE_SPRITE.height / 2);
      if (drawCore) {
        const core = ctx.createLinearGradient(-8, 0, 0, 0);
        core.addColorStop(0, withAlpha(body, 0));
        core.addColorStop(0.45, withAlpha(body, 0.9));
        core.addColorStop(1, body);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-1, -1);
        ctx.lineTo(0, 0);
        ctx.lineTo(-1, 1);
        ctx.closePath();
        ctx.fill();
      }
      if (drawHead) {
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 3.5);
        halo.addColorStop(
          0,
          withAlpha(headColor === PALETTE.text ? body : headColor, 0.55)
        );
        halo.addColorStop(1, withAlpha(body, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = headColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, 2, 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return canvas;
    };

    const lance = bake(true, true);
    const head = bake(true, false);
    this.lanceSprite =
      lance && head ? { lance, head, scale, body, headColor } : null;
    return this.lanceSprite;
  }

  drawLanceTrail(ctx, bullet) {
    const trail = bullet.trail;
    const count = trail.length + 1;
    const { trailStyles, width, outer, apex, sparkle } = this.lanceLook;
    ctx.lineCap = 'round';
    // Apex: a wide halo in `outer` under the trail, a white core over it.
    const polyline = (color, lineWidth) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let k = 1; k < trail.length; k += 1)
        ctx.lineTo(trail[k].x, trail[k].y);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    };
    if (outer) polyline(withAlpha(outer, 0.22), 4.5 * width);
    let prev = trail[0];
    for (let k = 1; k < count; k += 1) {
      const point = k < trail.length ? trail[k] : bullet;
      const f = k / (count - 1);
      ctx.strokeStyle = trailStyles[Math.round(f * (trailStyles.length - 1))];
      ctx.lineWidth = (0.3 + 1.7 * f) * width;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      prev = point;
    }
    if (apex) polyline(withAlpha(PALETTE.text, 0.75), 0.6 * width);
    if (sparkle) {
      ctx.fillStyle = withAlpha(sparkle, 0.85);
      for (let k = trail.length % 2; k < trail.length; k += 2) {
        const g = hashUnit(Math.round(trail[k].x * 7 + trail[k].y * 13));
        if (g < 0.1) continue;
        ctx.fillRect(trail[k].x - g, trail[k].y - g, 2 * g, 2 * g);
      }
    }
  }

  // Scatter Coil bolt: a short amber tracer fading in toward a white-hot
  // head. The emissive (bloom) copy is the core alone.
  drawFlakBolt(ctx, bolt, coreOnly = false) {
    const tail = bolt.trail[0] || bolt;
    const line = (style, lineWidth) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(bolt.x, bolt.y);
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    if (!coreOnly) {
      const glow = ctx.createLinearGradient(tail.x, tail.y, bolt.x, bolt.y);
      glow.addColorStop(0, withAlpha(FLAK_COLORS.tracer, 0));
      glow.addColorStop(1, withAlpha(FLAK_COLORS.tracer, 0.6));
      line(glow, 3.4);
    }
    line(withAlpha(FLAK_COLORS.core, 0.85), 1.2);
    ctx.fillStyle = FLAK_COLORS.core;
    ctx.beginPath();
    ctx.arc(bolt.x, bolt.y, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Beams, chain arcs and the burn/slow marks, in 'lighter' mode; the white
  // cores also go to the emissive (bloom) layer.
  drawWeaponEffects(ctx, emissive) {
    const look = this.lanceLook;
    this.cinders.forEach((cinder) => {
      const k = cinder.life / cinder.maxLife;
      ctx.fillStyle = withAlpha(WEAPON_EVOLUTIONS.thermal.look.trail, 0.5 * k);
      ctx.beginPath();
      ctx.arc(cinder.x, cinder.y, 2 + 3 * k, 0, Math.PI * 2);
      ctx.fill();
    });
    // Ion Trail: a cyan line, broken where thrust stopped.
    ctx.lineCap = 'round';
    for (let i = 1; i < this.ions.length; i += 1) {
      const a = this.ions[i - 1];
      const b = this.ions[i];
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > ION_TRAIL_GAP ** 2) continue;
      ctx.strokeStyle = withAlpha(PALETTE.player, 0.6 * (b.life / b.maxLife));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Afterburn: the dash's line, amber cooling to ember as it ages.
    const burnLine = this.afterburnTrail;
    for (let i = 1; i < burnLine.length; i += 1) {
      const a = burnLine[i - 1];
      const b = burnLine[i];
      if (!b.joined) continue;
      const k = b.life / b.maxLife;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = withAlpha(PALETTE.shot, AFTERBURN_LOOK.bandAlpha * k);
      ctx.lineWidth = AFTERBURN_LOOK.band * (0.5 + 0.5 * k);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(
        WEAPON_EVOLUTIONS.thermal.look.trail,
        AFTERBURN_LOOK.coreAlpha * k * k
      );
      ctx.lineWidth = AFTERBURN_LOOK.core;
      ctx.stroke();
    }
    this.burns.forEach((entry, enemy) => {
      const r = (enemy.radius || 12) * 0.9;
      const glow = ctx.createRadialGradient(
        enemy.x,
        enemy.y,
        0,
        enemy.x,
        enemy.y,
        r
      );
      glow.addColorStop(
        0,
        withAlpha(WEAPON_EVOLUTIONS.thermal.look.trail, 0.35)
      );
      glow.addColorStop(1, withAlpha(PALETTE.shot, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    this.slows.forEach((entry, enemy) => {
      ctx.lineWidth = LINE.thin;
      ctx.strokeStyle = withAlpha(WEAPON_EVOLUTIONS.field.look.trail, 0.55);
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, (enemy.radius || 12) + 4, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Singularity: rings on the pulled, a ring collapsing onto each hit point.
    const singularity = WEAPON_APEX.field;
    this.pulls.forEach((entry, enemy) => {
      ctx.lineWidth = LINE.thin;
      ctx.strokeStyle = withAlpha(singularity.look.outer, 0.6);
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, (enemy.radius || 12) + 3, 0, Math.PI * 2);
      ctx.stroke();
    });
    this.wells.forEach((well) => {
      const k = well.life / well.maxLife;
      ctx.lineWidth = 2;
      ctx.strokeStyle = withAlpha(singularity.look.outer, 0.8 * (1.2 - k));
      ctx.beginPath();
      ctx.arc(
        well.x,
        well.y,
        6 + (singularity.pull.radius - 6) * k,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    });

    ctx.lineCap = 'round';
    this.arcs.forEach((arc) => {
      const k = arc.life / arc.maxLife;
      const stroke = (target, color, lineWidth) => {
        target.strokeStyle = color;
        target.lineWidth = lineWidth;
        target.beginPath();
        target.moveTo(arc.points[0].x, arc.points[0].y);
        for (let i = 1; i < arc.points.length; i += 1) {
          target.lineTo(arc.points[i].x, arc.points[i].y);
        }
        target.stroke();
      };
      // Storm Lance bolts are thicker.
      const scale = arc.heavy ? 1.7 : 1;
      const color = arc.color || look.arc || PALETTE.player;
      if (arc.heavy) stroke(ctx, withAlpha(color, 0.3 * k), 6);
      stroke(ctx, withAlpha(color, 0.85 * k), 2.2 * scale);
      stroke(ctx, withAlpha(PALETTE.text, 0.9 * k), 0.8 * scale);
      if (emissive) stroke(emissive, withAlpha(PALETTE.text, k), 0.8);
    });

    // Flak bursts: a hot flash, a ring opening to the burst radius and a
    // spray of shrapnel streaks (angles hashed from the burst's position).
    this.flakBursts.forEach((burst) => {
      const k = burst.life / burst.maxLife;
      const r = FLAK.burstRadius * (0.35 + 0.65 * (1 - k));
      ctx.fillStyle = withAlpha(FLAK_COLORS.core, 0.6 * k * k);
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, 4 + 8 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 0.6 + 2 * k;
      ctx.strokeStyle = withAlpha(FLAK_COLORS.burst, 0.8 * k);
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, r, 0, Math.PI * 2);
      ctx.stroke();
      const seed = Math.round(burst.x * 7 + burst.y * 13);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = withAlpha(FLAK_COLORS.core, 0.9 * k);
      ctx.beginPath();
      for (let i = 0; i < FLAK_SPARKS; i += 1) {
        const a =
          burst.angle +
          (Math.PI * 2 * i) / FLAK_SPARKS +
          hashUnit(seed + i) * 0.4;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        ctx.moveTo(burst.x + cos * r * 0.55, burst.y + sin * r * 0.55);
        ctx.lineTo(burst.x + cos * r * 0.95, burst.y + sin * r * 0.95);
      }
      ctx.stroke();
      if (emissive) {
        emissive.fillStyle = withAlpha(FLAK_COLORS.core, k);
        emissive.beginPath();
        emissive.arc(burst.x, burst.y, 3 + 4 * k, 0, Math.PI * 2);
        emissive.fill();
      }
    });

    this.beams.forEach((beam) => {
      const k = beam.life / beam.maxLife;
      const ramp = (color, alpha) => {
        const g = ctx.createLinearGradient(beam.x, beam.y, beam.ex, beam.ey);
        g.addColorStop(0, withAlpha(color, alpha));
        g.addColorStop(0.8, withAlpha(color, alpha * 0.8));
        g.addColorStop(1, withAlpha(color, 0));
        return g;
      };
      const stroke = (target, style, lineWidth) => {
        target.lineCap = 'round';
        target.strokeStyle = style;
        target.lineWidth = lineWidth;
        target.beginPath();
        target.moveTo(beam.x, beam.y);
        target.lineTo(beam.ex, beam.ey);
        target.stroke();
      };
      stroke(ctx, ramp(BEAM_COLORS.glow, 0.35 * k), beam.width * 2.2);
      stroke(ctx, ramp(BEAM_COLORS.mid, 0.8 * k), beam.width);
      stroke(ctx, ramp(BEAM_COLORS.core, k), beam.width * 0.35);
      if (emissive) {
        stroke(emissive, ramp(BEAM_COLORS.core, k), beam.width * 0.5);
      }
    });
  }

  render(ctx) {
    if (!ctx) return;

    const player = this.cachedPlayer;
    const emissive = getEmissive();
    const sprite = this.ensureLanceSprite();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Always render bullets - they keep flying
    const projectileRenderStart = performance.now();
    emissive?.save();
    this.bullets.forEach((bullet) => {
      if (bullet.hit) return;

      if (bullet.kind === 'flak') {
        this.drawFlakBolt(ctx, bullet);
        if (emissive) this.drawFlakBolt(emissive, bullet, true);
        return;
      }

      if (bullet.trail.length > 0) {
        this.drawLanceTrail(ctx, bullet);
        if (emissive) this.drawLanceTrail(emissive, bullet);
      }

      if (!sprite) return;
      const angle = Math.atan2(bullet.vy || 0, bullet.vx || 1);
      const { headLength, width } = this.lanceLook;
      const draw = (target, image) => {
        target.save();
        target.translate(bullet.x, bullet.y);
        target.rotate(angle);
        target.scale(headLength, width);
        target.drawImage(
          image,
          -LANCE_SPRITE.originX,
          -LANCE_SPRITE.height / 2,
          LANCE_SPRITE.width,
          LANCE_SPRITE.height
        );
        target.restore();
      };
      draw(ctx, sprite.lance);
      if (emissive) draw(emissive, sprite.head);
    });
    this.drawWeaponEffects(ctx, emissive);
    emissive?.restore();

    ctx.restore(); // End 'lighter' mode

    if (Array.isArray(this.enemyBullets) && this.enemyBullets.length) {
      for (let i = 0; i < this.enemyBullets.length; i += 1) {
        const bullet = this.enemyBullets[i];

        if (!bullet || bullet.hit) {
          continue;
        }

        drawEnemyProjectile(ctx, bullet);
      }
    }
    this.projectilePerf.projectileRenderMs =
      performance.now() - projectileRenderStart;

    // The lock line starts at the turret's muzzle.
    const playerPosition = player.getMuzzlePoint();

    const lockAssignments =
      Array.isArray(this.currentLockAssignments) &&
      this.currentLockAssignments.length
        ? this.currentLockAssignments
        : this.currentTarget
          ? [
              {
                enemy: this.currentTarget,
                index: 0,
                duplicateIndex: 0,
                duplicateCount: 1,
              },
            ]
          : [];

    // Plan 01.07 Task 7 — gate targeting visual feedback by upgrade rank +
    // aim mode.
    //   rank 0 → nothing (skip lock ring + predicted markers + multi-lock).
    //   rank 1 → priority-lock ring + pulse on currentTarget (first assignment only).
    //   rank 2 → + predicted-impact marker (predictedAimPoints render).
    //   rank 3 → + multi-lock indicators (all assignments).
    //   aim mode 'manual' → all targeting render skipped (no leak).
    const targetingRank = this.targetingUpgradeLevel || 0;
    const renderTargetingFeedback =
      this.aimMode !== 'manual' && targetingRank >= 1;
    const renderMultiLock = targetingRank >= 3;

    if (
      renderTargetingFeedback &&
      lockAssignments.length &&
      player &&
      !player.isDead &&
      !player.isRetrying &&
      !player._quitExplosionHidden &&
      playerPosition
    ) {
      const pulseDuration = this.targetPulseDuration || 0.0001;
      const pulseRatio = Math.max(
        0,
        Math.min(1, this.targetIndicatorPulse / pulseDuration)
      );

      const duplicateTotals = new Map();
      lockAssignments.forEach((assignment) => {
        const target = assignment.enemy;
        if (!target || target.destroyed) {
          return;
        }
        const id = target.id || assignment.index;
        duplicateTotals.set(id, assignment.duplicateCount || 1);
      });

      lockAssignments.forEach((assignment, index) => {
        const target = assignment.enemy;
        if (!target || target.destroyed) {
          return;
        }

        // Rank 1/2 render only the primary lock (index 0). Rank 3 renders all.
        if (!renderMultiLock && index > 0) {
          return;
        }

        const duplicateIndex = assignment.duplicateIndex || 0;
        // Fix-pass-3 Finding 4: ring color follows THREAT TIER, not
        // assignment index. Plan visual-direction palette: low = thruster
        // cyan (#00F2FF), high = alert red (#FF3131), medium = warning
        // amber (#FFA800; the plan did not pin a specific medium hex —
        // documented in the SUMMARY.md fix-pass-3 section).
        const ringColor = this.getThreatPaletteColor(target);
        const baseAlpha =
          index === 0 ? this.lockHighlightAlpha : this.lockLineAlpha;
        const lineAlpha = Math.min(1, baseAlpha + pulseRatio * 0.25);
        const radiusBase = target.radius || 16;
        const arcRadius =
          radiusBase +
          6 +
          duplicateIndex * 4 +
          pulseRatio * (index === 0 ? 6 : 3.5);

        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = index === 0 ? LINE.thin : LINE.hair;
        ctx.strokeStyle = ringColor.ring(lineAlpha);
        ctx.beginPath();
        ctx.arc(target.x, target.y, arcRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.lineWidth = LINE.hair;
        ctx.strokeStyle = ringColor.line(lineAlpha * 0.35);
        ctx.beginPath();
        ctx.moveTo(playerPosition.x, playerPosition.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.restore();
      });
    }

    // Predicted-impact marker — rank 2+.
    const renderPredicted = this.aimMode !== 'manual' && targetingRank >= 2;
    if (
      renderPredicted &&
      this.predictedAimPoints.length &&
      this.usingDynamicPrediction()
    ) {
      this.predictedAimPoints.forEach(
        ({ enemy, position, index, duplicateIndex }) => {
          if (!position) {
            return;
          }
          // Rank 2 renders only the primary predicted marker; rank 3 renders all.
          if (!renderMultiLock && index > 0) {
            return;
          }

          // Predicted markers reuse the same threat-tier palette as the
          // lock ring (consistent visual language across rank 1 vs rank 2
          // affordances on the same target).
          const markerColor = this.getThreatPaletteColor(enemy);
          const alpha = index === 0 ? 0.55 : 0.38;
          const radius =
            (this.predictedMarkerRadius || 12) *
            (index === 0 ? 1 : 0.82 + duplicateIndex * 0.04);

          ctx.save();
          ctx.setLineDash([]);
          ctx.lineWidth = LINE.hair;
          ctx.strokeStyle = markerColor.ring(alpha);
          ctx.beginPath();
          ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.globalAlpha = alpha * 0.45;
          ctx.fillStyle = markerColor.fill(alpha * 0.35);
          ctx.beginPath();
          ctx.arc(position.x, position.y, radius * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      );
    }
  }

  /**
   * Fix-pass-3 Finding 4 helper. Map an enemy's threat-cache entry to a
   * palette triple {ring(alpha), line(alpha), fill(alpha)}. Tier bands
   * derived from `urgency` (the canonical "how dangerous is this enemy
   * right now" score from calculateImpactThreat — urgencyDistance=12 +
   * urgencyTime=10 weights, so the typical max scales near ~22 absent
   * hpUrgencyMultiplier stacking, or near ~46 with full hp stacking).
   *
   *   urgency <  1.5          → low    (#00F2FF cyan / thruster glow)
   *   urgency <  18           → medium (#FFA800 amber / warning)
   *   urgency >= 18           → high   (#FF3131 red / alert)
   *
   * Thresholds chosen so the default mid-arena distance threat (urgency
   * ≈ a couple) lands medium, idle-distant enemies land low, and
   * close-in-fast-incoming targets land high. The exact bands are tunable
   * via aimingConfig.threatPalette overrides without changing call sites.
   *
   * Returns a triple of helpers that take an alpha (0..1) and return the
   * 8-digit hex (#RRGGBBAA) — canvas-compatible and test-introspection-
   * friendly (the canonical hex appears in strokeStyle assignments).
   */
  getThreatPaletteColor(enemy) {
    const overrides = this.aimingConfig?.threatPalette || {};
    const lowHex = overrides.low || '#00F2FF';
    const mediumHex = overrides.medium || '#FFA800';
    const highHex = overrides.high || '#FF3131';
    const lowMaxUrgency = Number.isFinite(overrides.lowMaxUrgency)
      ? overrides.lowMaxUrgency
      : 1.5;
    const mediumMaxUrgency = Number.isFinite(overrides.mediumMaxUrgency)
      ? overrides.mediumMaxUrgency
      : 18;

    const id = enemy?.id;
    const cacheEntry = id != null ? this.targetThreatCache.get(id) : null;
    const urgency =
      cacheEntry?.breakdown?.impact?.urgency ??
      cacheEntry?.breakdown?.urgency ??
      0;

    let hex = mediumHex;
    if (urgency < lowMaxUrgency) {
      hex = lowHex;
    } else if (urgency >= mediumMaxUrgency) {
      hex = highHex;
    }

    // Returns the canonical hex (#RRGGBB) with the alpha encoded as the
    // 8-digit hex suffix #RRGGBBAA. Browsers (and canvas-2d) accept this
    // standard. The hex form keeps the palette token directly readable in
    // strokeStyle assignments (test introspection matches the hex slug).
    const colorAt = (alpha) => {
      const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
      const aHex = Math.round(clampedAlpha * 255)
        .toString(16)
        .padStart(2, '0');
      return `${hex}${aHex}`;
    };

    return {
      hex,
      ring: colorAt,
      line: colorAt,
      fill: colorAt,
    };
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

  getAimMode() {
    return this.targeting.getAimMode();
  }

  setAimMode(value) {
    this.targeting.setAimMode(value);
  }

  // === CONFIGURAÇÃO ===
  setShootCooldown(cooldown) {
    this.shootCooldown = Math.max(0.1, cooldown);
  }

  setTargetingRange(range) {
    this.targeting.setTargetingRange(range);
  }

  /**
   * Fix-pass-2 (C5): restore in-run toggle state (spread/aim mode, snapshot,
   * retarget flag) to the gameplay-default values. Called from both
   * `reset()` and the `player-reset` event listener so a player ending a run
   * in fan + manual starts the next run with the defaults (concentrated +
   * auto). Validation against VALID_*_MODES Sets mirrors the constructor
   * defensively so a constant file mis-edit can't silently corrupt state.
   */
  resetModeState() {
    this.spreadMode = VALID_SPREAD_MODES.has(COMBAT_SPREAD_MODE_DEFAULT)
      ? COMBAT_SPREAD_MODE_DEFAULT
      : 'concentrated';
    this.targeting.resetAimMode();
  }

  // === CLEANUP ===
  reset() {
    super.reset();
    this.projectiles.reset();
    this.targeting.clearLocks();
    this.lastShotTime = 0;
    this.resetWeaponState();
    // Fix-pass-2 (C5): restore the in-run toggle defaults so the next run
    // starts at concentrated + auto regardless of how the previous run ended.
    this.resetModeState();
    console.log('[CombatSystem] Reset');
  }

  destroy() {
    this.projectiles.reset();
    this.targeting.clearLocks();
    console.log('[CombatSystem] Destroyed');
  }
}

export default CombatSystem;
