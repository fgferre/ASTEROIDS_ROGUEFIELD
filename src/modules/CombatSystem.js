// src/modules/CombatSystem.js
import { BaseSystem } from '../core/BaseSystem.js';
import { requireService } from '../core/serviceUtils.js';
import { drawEnemyProjectile } from '../utils/drawEnemyProjectile.js';
import { Targeting } from './combat/Targeting.js';
import { Projectiles } from './combat/Projectiles.js';
import { Weapons } from './combat/Weapons.js';
import { HitResolution } from './combat/HitResolution.js';
import { CardEffects, hashUnit } from './combat/CardEffects.js';
import {
  COMBAT_AIMING_UPGRADE_CONFIG,
  ION_TRAIL_GAP,
} from '../data/constants/gameplay.js';
// The knockback suite imports it from here.
export { knockbackSpeed } from './combat/HitResolution.js';
import { getRenderScale } from '../core/viewport.js';
import { getEmissive } from '../core/bloomLayer.js';
import { LINE, PALETTE, withAlpha } from '../data/constants/palette.js';
import { WEAPONS, WEAPON_APEX, WEAPON_EVOLUTIONS } from '../data/weapons.js';

const LANCE_SPRITE = { width: 16, height: 8, originX: 12 };
const BEAM_COLORS = WEAPONS.harmonic.colors;
const FLAK = WEAPONS.scatter.flak;
const FLAK_COLORS = WEAPONS.scatter.colors;
const FLAK_SPARKS = 7; // proposta 18/10: 2D shrapnel streaks per burst
// Afterburn's 2D look, proposta 18/10: an amber band (px wide when fresh)
// under a hot core that cools first, so old segments read as embers.
const AFTERBURN_LOOK = { band: 6, bandAlpha: 0.55, core: 2, coreAlpha: 0.85 };

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
      this.cards.resetWeaponTuning();
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
      this.cards.applyAimingUpgrade(data || {});
    });

    this.registerEventListener('upgrade-weapon-tuning', (data) => {
      this.cards.applyWeaponTuning(data);
    });

    // A weapon card names its weapon (data/weapons.js); an unknown id is ignored.
    const takeWeapon = (data = {}) => {
      if (WEAPONS[data.weaponId]) this.weapons.weaponId = data.weaponId;
    };
    this.registerEventListener('upgrade-weapon-harmonic', takeWeapon);
    this.registerEventListener('upgrade-weapon-scatter', takeWeapon);

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
        this.weapons.handleShooting(deltaTime, playerStats);
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
        this.hits.processBulletHit(bullet, asteroid, enemies);
      }
    );
    this.cards.updateWeaponEffects(deltaTime);
  }

  // === WEAPONS (combat/Weapons.js) ===
  // Weapons owns the guns. Both renderers, the 2D draw and the weapons,
  // upgrade and aim suites read these fields on the combat object; the aim
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
  // CardEffects owns what the cards leave on the Field. The 3D weapon mirror,
  // the 2D draw and the weapons, upgrade and afterburn suites read it on the
  // combat object.
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
