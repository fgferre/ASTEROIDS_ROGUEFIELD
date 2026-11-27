// src/modules/CombatSystem.js
import { BaseSystem } from '../core/BaseSystem.js';
import { requireService } from '../core/serviceUtils.js';
import { Targeting } from './combat/Targeting.js';
import { Projectiles } from './combat/Projectiles.js';
import { Weapons } from './combat/Weapons.js';
import { HitResolution } from './combat/HitResolution.js';
import { CardEffects } from './combat/CardEffects.js';
import { routeCardEffects } from './cardEffectRoutes.js';
import { burstFlak } from './combat/beamAndFan.js';
import { kindledDied } from './combat/fanForms.js';
import { thermiteDied } from './combat/missileForms.js';
import {
  applyConcentratedFire,
  computeParallelOffset,
} from './combat/volleyLanes.js';
import {
  holsterWeaponField,
  steerSeeker,
  tickWeaponField,
} from './combat/firePatterns.js';
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
      cards: () => this.cards,
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
      computeParallelOffset,
      weaponReach: () => this.weapons.reach,
    });
    this.projectiles = new Projectiles({
      physics: () => this.cachedPhysics,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      weapon: () => ({
        form: this.weapons.weapon,
        bulletSpeed: this.weapons.bulletSpeed,
        bulletLifetime: this.weapons.bulletLifetime,
        trailLength: this.weapons.trailLength,
        thermalLens: this.cards.cardEffects.thermalLens,
        lanceApexDamage: this.weapons.lanceApexDamage,
        lancePierce: this.weapons.lancePierce,
        pierceBonus: this.cards.pierceBonus,
      }),
      burstFlak: (bolt) => burstFlak(this.weapons, bolt),
      steer: (missile, dt) => steerSeeker(this.weapons, missile, dt),
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
      enemyBullets: () => this.projectiles.enemyBullets,
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

    this.registerEventListener('stasis-started', ({ duration } = {}) => {
      this.projectiles.freezeEnemyBullets(duration);
    });

    // The card effects routed to combat (src/modules/cardEffectRoutes.js): a
    // card that adds a weapon behaviour keeps the payload of its latest rank
    // where the card says; these compute.
    routeCardEffects(
      this,
      'combat',
      (event, fn) => this.registerEventListener(event, fn),
      {
        'upgrade-aiming-suite': (data) => {
          this.cards.applyAimingUpgrade(data || {});
        },
        'upgrade-weapon-tuning': (data) => {
          this.cards.applyWeaponTuning(data);
        },
        // A weapon card names its weapon (src/content/weapons/).
        'upgrade-weapon': (data = {}) => {
          this.weapons.takeWeapon(data.weaponId);
        },
        // The new flight's Auto Turret card: the cannon leaves the nose for the
        // auto aim (PlayerSystem lifts noseAim on the same event).
        'upgrade-auto-aim': () => {
          this.targeting.setAimMode('auto');
        },
      }
    );

    // Gyro Servos: every dash runs the cannon hot for a moment.
    this.registerEventListener('player-dashed', () => {
      if (this.cards.cardEffects.dashFire) this.cards.startDashFire();
    });

    // The trails drop from the pilot's own main burn (`pilot`), never the
    // computer's brake, even while the flame shows only its steady third.
    this.registerEventListener('thruster-effect', (data = {}) => {
      if (data.type !== 'main' || !data.pilot) return;
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
    // Kindling: a burning rock that dies flies apart in burning pieces;
    // Thermite: a molten one's pieces cool off.
    this.registerEventListener('enemy-destroyed', (data = {}) => {
      if (!data.enemy) return;
      kindledDied(this.weapons, data.enemy, data.fragments);
      thermiteDied(this.weapons, data.enemy, data.fragments);
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
      const next =
        this.weapons.spreadMode === 'concentrated' ? 'fan' : 'concentrated';
      this.setSpreadMode(next);
      this.eventBus?.emit?.('combat-mode-toggled', {
        kind: 'spread',
        mode: next,
      });
    });

    this.registerEventListener('toggle-aim-mode', (data = {}) => {
      const screen = data?.screen;
      if (screen !== 'playing') {
        return;
      }
      // The cannon on the nose (until the Auto Turret) has no auto aim to
      // toggle to.
      if (this.cachedPlayer.noseAim) {
        return;
      }
      const next = this.targeting.aimMode === 'auto' ? 'manual' : 'auto';
      this.targeting.setAimMode(next);
      this.eventBus?.emit?.('combat-mode-toggled', { kind: 'aim', mode: next });
    });

    // `combat-mode-toggled` ({ kind: 'aim' | 'spread', mode }) tells the HUD a
    // toggle changed the mode in play; the run-start reset stays silent.

    // Enemy projectiles are forwarded to the combat system by EnemySystem.
    // Subscribing here would duplicate the handling and spawn two bullets.
  }

  getCachedPlayer() {
    return this.cachedPlayer;
  }

  // === TARGETING (combat/Targeting.js) ===
  // Targeting owns the aim state; readers ask it (combat.targeting.aimMode).

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

  // What a Retry brings back of the combat: the enemy shots in flight.
  getSnapshotState() {
    return { enemyBullets: this.projectiles.getSnapshotState() };
  }

  restoreSnapshotState(snapshot) {
    this.projectiles.restoreSnapshotState(snapshot.enemyBullets);
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

  enemyWithin(player, radius) {
    const { x, y } = player.position;
    const enemies = this.cachedEnemies.getActiveEnemies();
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (enemy.intangible) continue;
      if (Math.hypot(enemy.x - x, enemy.y - y) <= radius) return true;
    }
    return false;
  }

  // === UPDATE PRINCIPAL ===
  update(deltaTime) {
    const player = this.cachedPlayer;
    const playerStats = player.getStats();
    // Close Quarters: one scan a frame, here where the enemies are known, so
    // the bonus reaches every weapon through the stats they are handed.
    if (playerStats && player.closeDamageMultiplier > 1) {
      playerStats.damage *= this.enemyWithin(player, player.closeRadius)
        ? player.closeDamageMultiplier
        : 1;
    }
    this.lastKnownPlayerStats = playerStats || null;

    // Only target and shoot when ship hull exists (visible and alive) and
    // the pilot has it (a Warden's entrance holds it).
    if (
      !player.isDead &&
      !player.isRetrying &&
      !player._quitExplosionHidden &&
      !player.controlsHeld
    ) {
      if (player.noseAim && this.targeting.aimMode !== 'manual') {
        this.targeting.setAimMode('manual');
      }
      this.targeting.updateStickAim(player.getAimStick());
      this.targeting.updateTargeting(deltaTime);
      player.setAimPoint(this.targeting.getPrimaryAimPoint());
      player.setTurretLayers(
        this.targeting.computeLockCount(playerStats),
        this.weapons.getLockAims()
      );

      if (playerStats) {
        this.weapons.handleShooting(deltaTime, playerStats);
        tickWeaponField(this.weapons, deltaTime, playerStats);
      }
    } else {
      holsterWeaponField(this.weapons);
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
  // Weapons owns the guns; readers ask it (combat.weapons.beams).

  // Called on the combat object: the HUD and the run recap read the weapon
  // state, the test helpers and suites fire, lay lanes and evolve.
  handleShooting(deltaTime, playerStats) {
    this.weapons.handleShooting(deltaTime, playerStats);
  }

  applyConcentratedFire(input, shotCount) {
    return applyConcentratedFire(this.weapons, input, shotCount);
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
    this.weapons.lastShotTime = 0;
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
