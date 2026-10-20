// src/modules/CombatSystem.js
import { BaseSystem } from '../core/BaseSystem.js';
import { requireService } from '../core/serviceUtils.js';
import { Targeting } from './combat/Targeting.js';
import { Projectiles } from './combat/Projectiles.js';
import { Weapons } from './combat/Weapons.js';
import { HitResolution } from './combat/HitResolution.js';
import { CardEffects } from './combat/CardEffects.js';
import { COMBAT_AIMING_UPGRADE_CONFIG } from '../data/constants/gameplay.js';
// The knockback suite imports it from here.
export { knockbackSpeed } from './combat/HitResolution.js';

class CombatSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'CombatSystem',
      serviceName: 'combat',
      enableRandomManagement: false,
    });

    // === CONFIGURAÇÕES DE MIRA AVANÇADA ===
    this.aimingConfig = COMBAT_AIMING_UPGRADE_CONFIG || {};
    this.lockLineAlpha = this.aimingConfig?.feedback?.lockLineAlpha ?? 0.35;
    this.lockHighlightAlpha =
      this.aimingConfig?.feedback?.lockHighlightAlpha ?? 0.75;
    this.predictedMarkerRadius =
      this.aimingConfig?.feedback?.predictedMarkerRadius ?? 12;

    this.lastKnownPlayerStats = null;
    // Built first: Targeting reads the lance speed while it sets up.
    this.weapons = new Weapons({
      player: () => this.cachedPlayer,
      enemies: () => this.cachedEnemies,
      targeting: () => this.targeting,
      createBullet: (...args) => this.projectiles.createBullet(...args),
      hitEnemy: (hit, enemy) =>
        this.hits.processBulletHit(hit, enemy, this.cachedEnemies),
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      cardEffects: () => this.cards.cardEffects,
      tuning: () => ({
        aimCooldownMultiplier: this.cards.aimCooldownMultiplier,
        cooldownTuning: this.cards.cooldownTuning,
      }),
    });
    this.targeting = new Targeting({
      player: () => this.cachedPlayer,
      enemies: () => this.cachedEnemies,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      playerStats: () => this.lastKnownPlayerStats,
      bulletSpeed: () => this.weapons.bulletSpeed,
      spreadMode: () => this.weapons.spreadMode,
      computeParallelOffset: (...args) =>
        this.weapons.computeParallelOffset(...args),
    });
    this.projectiles = new Projectiles({
      physics: () => this.cachedPhysics,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      weapon: () => ({
        weaponId: this.weapons.weaponId,
        bulletSpeed: this.weapons.bulletSpeed,
        bulletLifetime: this.weapons.bulletLifetime,
        trailLength: this.weapons.trailLength,
        thermalLens: this.cards.cardEffects.thermalLens,
        lanceDamageTuning: this.cards.lanceDamageTuning,
        lanceApexDamage: this.weapons.lanceApexDamage,
        lancePierce: this.weapons.lancePierce,
        pierceBonus: this.cards.pierceBonus,
      }),
      burstFlak: (bolt) => this.weapons.burstFlak(bolt),
    });
    this.hits = new HitResolution({
      weapons: () => this.weapons,
      cards: () => this.cards,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
    });
    // Built after Weapons: it resets the shot tuning as it sets up.
    this.cards = new CardEffects({
      player: () => this.cachedPlayer,
      enemies: () => this.cachedEnemies,
      targeting: () => this.targeting,
      weapons: () => this.weapons,
      hits: () => this.hits,
    });

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
      this.cards.resetWeaponTuning();
      this.resetWeaponState();
      this.targeting.targetThreatCache.clear();
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
      this.cards.applyAimingUpgrade(data || {});
    });

    this.registerEventListener('upgrade-weapon-tuning', (data) => {
      this.cards.applyWeaponTuning(data);
    });

    // A weapon card names its weapon (src/content/weapons/).
    this.registerEventListener('upgrade-weapon', (data = {}) => {
      this.weapons.takeWeapon(data.weaponId);
    });

    // Cards that add a weapon behaviour keep the payload of their latest rank.
    this.registerEventListener('upgrade-thermal-lens', (data) => {
      this.cards.cardEffects.thermalLens = data;
    });
    this.registerEventListener('upgrade-chain-capacitor', (data) => {
      this.cards.cardEffects.chainCapacitor = data;
    });
    this.registerEventListener('upgrade-static-shell', (data) => {
      this.cards.cardEffects.staticShell = data;
    });
    this.registerEventListener('upgrade-gravity-brake', (data) => {
      this.cards.cardEffects.gravityBrake = data;
    });
    this.registerEventListener('upgrade-cinder-trail', (data) => {
      this.cards.cardEffects.cinderTrail = data;
    });
    this.registerEventListener('upgrade-ion-trail', (data) => {
      this.cards.cardEffects.ionTrail = data;
    });
    this.registerEventListener('upgrade-afterburn', (data) => {
      this.cards.cardEffects.afterburn = data;
    });

    this.registerEventListener('thruster-effect', (data = {}) => {
      if (data.type !== 'main' || !(data.intensity > 0)) return;
      const cards = this.cards;
      const { cinderTrail, ionTrail } = cards.cardEffects;
      if (cinderTrail) cards.dropTrailPoint(cards.cinders, cinderTrail, data);
      if (ionTrail) cards.dropTrailPoint(cards.ions, ionTrail, data);
    });

    // Emergency brake (Braking System 3): a shove, no damage.
    this.registerEventListener('player-braked', (data = {}) => {
      this.cards.shoveFrom(data.position, data.radius, data.knockback);
    });

    // Discharged on the next update, outside the collision pass that hit us.
    this.registerEventListener('player-took-damage', () => {
      if (this.cards.cardEffects.staticShell) {
        this.cards.staticShellPending = true;
      }
    });

    this.registerEventListener('synergy-unlocked', (data = {}) => {
      this.evolveWeapon(data.family);
    });
    this.registerEventListener('apex-unlocked', (data = {}) => {
      this.weapons.apexWeapon(data.family);
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
  // Targeting owns this state. The 3D renderer, the fire paths and the aim
  // regression suite read it on the combat object; the setters
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
  // paths and (usingDynamicPrediction) the 3D renderer.
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
  // Projectiles owns the shots in flight. The 3D renderer, the HUD metrics,
  // Herald and the test helpers read these arrays on the combat object; the
  // weapons suite assigns `bullets`.
  get bullets() {
    return this.projectiles.bullets;
  }

  set bullets(value) {
    this.projectiles.bullets = value;
  }

  get enemyBullets() {
    return this.projectiles.enemyBullets;
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

    // Only target and shoot when ship hull exists (visible and alive) and
    // the pilot has it (a Warden's entrance holds it).
    if (
      !player.isDead &&
      !player.isRetrying &&
      !player._quitExplosionHidden &&
      !player.controlsHeld
    ) {
      this.targeting.updateStickAim(player.getAimStick());
      this.targeting.updateTargeting(deltaTime);
      player.setAimPoint(this.targeting.getPrimaryAimPoint());
      player.setTurretLayers(
        this.targeting.computeLockCount(playerStats),
        this.weapons.getLockAims()
      );

      if (playerStats) {
        this.weapons.handleShooting(deltaTime, playerStats);
      }
    }

    // Always update bullets - they keep flying even without ship hull
    const projectileUpdateStart = performance.now();
    this.projectiles.updateBullets(deltaTime);
    this.projectiles.updateEnemyBullets(deltaTime, player);
    const perf = this.projectiles.projectilePerf;
    perf.projectileUpdateMs = performance.now() - projectileUpdateStart;
    perf.projectilePlayerCount = this.bullets.length;
    perf.projectileEnemyCount = this.enemyBullets.length;

    const enemies = this.cachedEnemies;
    this.cachedPhysics.forEachBulletCollision(
      this.bullets,
      (bullet, asteroid) => {
        if (!asteroid || bullet.hit) {
          return;
        }
        this.hits.processBulletHit(bullet, asteroid, enemies);
      }
    );
    this.cards.updateWeaponEffects(deltaTime);
  }

  // === WEAPONS (combat/Weapons.js) ===
  // Weapons owns the guns. The 3D renderer and the weapons, upgrade and aim
  // suites read these fields on the combat object; the aim
  // suite writes lastShotTime.
  get weaponId() {
    return this.weapons.weaponId;
  }

  get spreadMode() {
    return this.weapons.spreadMode;
  }

  get evolutions() {
    return this.weapons.evolutions;
  }

  get apexes() {
    return this.weapons.apexes;
  }

  get lanceLook() {
    return this.weapons.lanceLook;
  }

  get trailLength() {
    return this.weapons.trailLength;
  }

  get beams() {
    return this.weapons.beams;
  }

  get flakBursts() {
    return this.weapons.flakBursts;
  }

  get bulletSpeed() {
    return this.weapons.bulletSpeed;
  }

  get shootCooldown() {
    return this.weapons.shootCooldown;
  }

  get baseShootCooldown() {
    return this.weapons.baseShootCooldown;
  }

  get lastShotTime() {
    return this.weapons.lastShotTime;
  }

  set lastShotTime(value) {
    this.weapons.lastShotTime = value;
  }

  // Called on the combat object: the HUD and the run recap read the weapon
  // state, the test helpers and suites fire, lay lanes and evolve.
  handleShooting(deltaTime, playerStats) {
    this.weapons.handleShooting(deltaTime, playerStats);
  }

  applyConcentratedFire(input, shotCount) {
    return this.weapons.applyConcentratedFire(input, shotCount);
  }

  evolveWeapon(family) {
    this.weapons.evolveWeapon(family);
  }

  getWeaponState() {
    return this.weapons.getWeaponState();
  }

  // === HITS AND CARDS (combat/HitResolution.js, combat/CardEffects.js) ===
  // CardEffects owns what the cards leave on the Field. The 3D weapon mirror
  // and the weapons, upgrade and afterburn suites read it on the combat
  // object.
  get arcs() {
    return this.cards.arcs;
  }

  get wells() {
    return this.cards.wells;
  }

  get burns() {
    return this.cards.burns;
  }

  get slows() {
    return this.cards.slows;
  }

  get pulls() {
    return this.cards.pulls;
  }

  get cinders() {
    return this.cards.cinders;
  }

  get ions() {
    return this.cards.ions;
  }

  get afterburnTrail() {
    return this.cards.afterburnTrail;
  }

  // Called on the combat object by the weapons, upgrade, knockback, afterburn
  // and boss feedback suites.
  processBulletHit(bullet, enemy, enemiesSystem) {
    return this.hits.processBulletHit(bullet, enemy, enemiesSystem);
  }

  updateWeaponEffects(deltaTime) {
    this.cards.updateWeaponEffects(deltaTime);
  }

  // A new run: the weapon, the cards in play and the Prospector carry.
  resetWeaponState() {
    this.weapons.resetWeaponState();
    this.cards.resetCardState();
    this.hits.resetProspectorCarry();
  }

  // === GETTERS PÚBLICOS ===
  getCurrentTarget() {
    return this.targeting.getCurrentTarget();
  }

  /** Where the primary lock is aimed (lead included), or null. */
  getPrimaryAimPoint() {
    return this.targeting.getPrimaryAimPoint();
  }

  // === MODE STATE (plan 01.07 FIX-05) ===
  getSpreadMode() {
    return this.weapons.getSpreadMode();
  }

  setSpreadMode(value) {
    this.weapons.setSpreadMode(value);
  }

  getAimMode() {
    return this.targeting.getAimMode();
  }

  setAimMode(value) {
    this.targeting.setAimMode(value);
  }

  // === CONFIGURAÇÃO ===
  /**
   * Fix-pass-2 (C5): restore in-run toggle state (spread/aim mode, snapshot,
   * retarget flag) to the gameplay-default values. Called from both
   * `reset()` and the `player-reset` event listener so a player ending a run
   * in fan + manual starts the next run with the defaults (concentrated +
   * auto). Validation against VALID_*_MODES Sets mirrors the constructor
   * defensively so a constant file mis-edit can't silently corrupt state.
   */
  resetModeState() {
    this.weapons.resetSpreadMode();
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
