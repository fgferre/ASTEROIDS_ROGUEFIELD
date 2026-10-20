// src/modules/effects/PlayerEffects.js
//
// What the player's ship does, as light: the muzzle flash and hit sparks of
// its shots, the thruster plumes, the dash kick, the shield's sparks and its
// level 5 deflective blast, XP pickups and orb fusions, the level-up burst
// and the death explosion. EffectsSystem owns it and its player listeners
// land here.

import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';
import { PALETTE, withAlpha } from '../../data/constants/palette.js';
import { DASH_SHAKE } from '../../data/constants/gameplay.js';
import { DEATH_SLOW_MO, LEVEL_UP_SLOW_MO } from './GameTime.js';

const MAIN_THRUSTER_FLASH_THRESHOLD = 0.85;
const MAIN_THRUSTER_FLASH_COLOR = PALETTE.player;
const MAIN_THRUSTER_FLASH_DURATION = 0.05;
const MAIN_THRUSTER_FLASH_INTENSITY = 0.05;

// Light lingers (docs/NORTE.md §2): PROPOSAL from 17/10, judged by playing.
// A multiplier on the old lifetime: XP collect sparks were 0.3–0.5 s.
// Thruster embers keep their lifetimes.
const XP_SPARK_LIFE_SCALE = 1.5; // was 1

export class PlayerEffects {
  /**
   * `particleEffects`: the effects' Particles; every particle lands in its list, and its shockwaves, hit markers and muzzle-flash queue are used directly.
   * `createParticle(x, y, vx, vy, color, size, life, type)`: the effects' createParticle, not Particles' own: the thruster determinism suite stubs it on the effects object.
   * `randomFloat(fork)`: the effects' random helper; rolls draw from 'thrusters', 'muzzleFlash', 'hits' and 'explosions'.
   * `getScaledParticleCount(count, options)`: the effects' Reduced Particles scaling of a burst's count.
   * `particleDensity()`: the Reduced Particles density, read live; below 0.1 the thrusters stop.
   * `addScreenShake(presetOrIntensity, durationOrOptions)`, `addScreenFlash(color, duration, intensity)`: the effects' screen feedback.
   * `addFreezeFrame(duration, fade)`, `playSlowMotion(preset)`: the effects' game time.
   * `emit(name, payload)`: the effects' event bus; the deflective blast asks for its damage through it.
   * `player()`: the player service, resolved on use; the level-up burst starts at the ship.
   */
  constructor({
    particleEffects,
    createParticle,
    randomFloat,
    getScaledParticleCount,
    particleDensity,
    addScreenShake,
    addScreenFlash,
    addFreezeFrame,
    playSlowMotion,
    emit,
    player,
  }) {
    this.particleEffects = particleEffects;
    this.createParticle = createParticle;
    this.randomFloat = randomFloat;
    this.getScaledParticleCount = getScaledParticleCount;
    this.particleDensity = particleDensity;
    this.addScreenShake = addScreenShake;
    this.addScreenFlash = addScreenFlash;
    this.addFreezeFrame = addFreezeFrame;
    this.playSlowMotion = playSlowMotion;
    this.emit = emit;
    this.player = player;
  }

  // === EffectsSystem's player listeners land here ===

  // Weapon fire feedback (Week 1: Balance & Feel)
  onBulletCreated(data) {
    if (data?.from && data?.bullet) {
      // Calculate firing direction from bullet velocity
      const vx = data.bullet.vx || 0;
      const vy = data.bullet.vy || 0;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > 0) {
        this.particleEffects.queueMuzzleFlash(
          data.from.x,
          data.from.y,
          vx / speed,
          vy / speed
        );
      }
    }
  }

  onThruster(data) {
    if (!data || !data.position || !data.direction) return;

    this.spawnThrusterVFX(
      data.position.x,
      data.position.y,
      data.direction.x,
      data.direction.y,
      data.intensity,
      data.type,
      data.visualLevel || 0
    );

    if (
      data.type === 'main' &&
      typeof data.intensity === 'number' &&
      data.intensity >= MAIN_THRUSTER_FLASH_THRESHOLD
    ) {
      this.addScreenFlash(
        MAIN_THRUSTER_FLASH_COLOR,
        MAIN_THRUSTER_FLASH_DURATION,
        MAIN_THRUSTER_FLASH_INTENSITY
      );
    }
  }

  onBulletHit(data) {
    if (data?.position) {
      const effectiveDamage = Number.isFinite(data?.effectiveDamage)
        ? data.effectiveDamage
        : Number.isFinite(data?.damage)
          ? data.damage
          : 0;
      const blocked = Boolean(data?.blocked);
      if (!blocked && (effectiveDamage > 0 || data.killed)) {
        this.particleEffects.createHitMarker(
          data.position,
          data.killed || false,
          effectiveDamage
        );
      }
      this.createBulletImpact(
        data.position,
        { x: data.enemy?.vx || 0, y: data.enemy?.vy || 0 },
        data.killed || false,
        { blocked }
      );
    }
  }

  onLevelUp() {
    this.addScreenShake(6, 0.4);
    this.playSlowMotion(LEVEL_UP_SLOW_MO);
    this.addScreenFlash(PALETTE.xp, 0.15, 0.2);
    this.createLevelUpExplosion(this.player().position);
  }

  onDeath(data) {
    this.playSlowMotion(DEATH_SLOW_MO);
    if (data?.position) {
      this.createEpicShipExplosion(data.position);
    }
  }

  // === The bursts ===

  // Dash kick (PLAN.md step 6, proposal 17/10): a short shake and a hard
  // thruster burst out of the tail; the 3D ship mirror draws the afterimages.
  createDashBurst(position, direction) {
    this.addScreenShake(DASH_SHAKE.intensity, DASH_SHAKE.duration);
    const tailX = position.x - direction.x * 12;
    const tailY = position.y - direction.y * 12;
    for (let i = 0; i < 4; i += 1) {
      this.spawnThrusterVFX(
        tailX,
        tailY,
        direction.x,
        direction.y,
        3,
        'main',
        3
      );
    }
  }

  spawnThrusterVFX(
    worldX,
    worldY,
    dirX,
    dirY,
    intensity = 1,
    type = 'main',
    visualLevel = 0
  ) {
    if (this.particleDensity() < 0.1) return; // Optimization

    const thrusterFork = 'thrusters';

    // === UPGRADE SCALING: SPRAY -> AFTERBURNER ===
    // We want a massive feeling of power at high levels.

    let countMultiplier = 1;
    let speedMultiplier = 1;
    let spreadFactor = 1;
    let lifeMultiplier = 1;
    let colorPalette = 'orange'; // orange, blue, neon

    // Scale based on Visual Level (0 to 5+)
    if (type === 'main') {
      if (visualLevel >= 5) {
        // ULTRA AFTERBURNER
        countMultiplier = 4.0; // Huge density
        speedMultiplier = 2.5; // Very fast jets
        spreadFactor = 0.3; // Tight focused beam
        lifeMultiplier = 0.6; // Short intense life
        colorPalette = 'neon';
      } else if (visualLevel >= 3) {
        // PLASMA JET
        countMultiplier = 2.5;
        speedMultiplier = 1.8;
        spreadFactor = 0.6;
        colorPalette = 'blue';
      } else {
        // STANDARD SPRAY
        countMultiplier = 1.0;
        speedMultiplier = 1.0;
        spreadFactor = 1.2; // Loose spray
        colorPalette = 'orange';
      }
    } else {
      // Side/Aux thrusters - also need juice!
      if (visualLevel >= 5) {
        // PRECISION JETS (Rank 5+)
        countMultiplier = 3.0;
        speedMultiplier = 2.0;
        spreadFactor = 0.4; // Very tight
        colorPalette = 'neon';
      } else if (visualLevel >= 3) {
        // ION BURSTS (Rank 3-4)
        countMultiplier = 1.8;
        speedMultiplier = 1.4;
        spreadFactor = 0.8;
        colorPalette = 'blue';
      } else {
        // GAS PUFFS (Rank 0-2)
        countMultiplier = 1.0;
        speedMultiplier = 1.0;
        spreadFactor = 1.5; // Wide gas cloud
        colorPalette = 'orange'; // Or white/grey for gas? Keep orange for consistency
      }
    }

    // Base Configuration
    let baseCount = (type === 'main' ? 1 : 0.6) * countMultiplier * intensity;
    // Fractional parts accumulation (deterministic probabalistic check)
    if (this.randomFloat(thrusterFork) > baseCount % 1)
      baseCount = Math.floor(baseCount);
    else baseCount = Math.ceil(baseCount);
    if (intensity > 0) baseCount = Math.max(1, baseCount);

    const baseSpeed = (type === 'main' ? 140 : 100) * speedMultiplier;

    for (let c = 0; c < baseCount; c++) {
      const spread = (this.randomFloat(thrusterFork) - 0.5) * spreadFactor;

      // Calculate velocity vector with spread
      // Main thrusters point opposite to direction
      const angleBase = Math.atan2(-dirY, -dirX);
      const angle = angleBase + spread * 0.5; // +/- 0.25 radians approx

      const speed = baseSpeed * (0.8 + this.randomFloat(thrusterFork) * 0.5);

      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      // One light, the player's (docs/NORTE.md §2): white-hot core, cyan
      // body, dimmer cyan tail. Upgrade tiers change count, speed and
      // spread above, not the hue.
      let color;
      const t = this.randomFloat(thrusterFork);
      const hot = colorPalette === 'neon' ? 0.6 : 0.8;
      if (t > hot) color = PALETTE.text;
      else if (t > 0.35) color = PALETTE.player;
      else color = withAlpha(PALETTE.player, 0.55);

      this.particleEffects.particles.push(
        this.createParticle(
          worldX + (this.randomFloat(thrusterFork) - 0.5) * 4,
          worldY + (this.randomFloat(thrusterFork) - 0.5) * 4,
          vx + (this.randomFloat(thrusterFork) - 0.5) * 10,
          vy + (this.randomFloat(thrusterFork) - 0.5) * 10,
          color,
          (1.5 + this.randomFloat(thrusterFork) * 2) *
            (type === 'main' ? 1.5 : 1), // Size
          (0.2 + this.randomFloat(thrusterFork) * 0.3) * lifeMultiplier, // Life
          'thruster'
        )
      );
    }
  }

  // A crisp amber flare at the nose plus a few embers. It must read as the
  // gun firing, not as a projectile: small, short, no stretch along the shot.
  // The random rolls stay in the old order so the muzzleFlash fork is stable.
  createMuzzleFlash(x, y, dirX, dirY) {
    const flareJitter = this.randomFloat('muzzleFlash');
    this.particleEffects.particles.push(
      this.createParticle(
        x + dirX * 18,
        y + dirY * 18,
        dirX * 30,
        dirY * 30,
        PALETTE.shot,
        3 + flareJitter * 0.4, // radius: a 6 px flare, 2 px hot core
        0.06,
        'flare'
      )
    );

    const sparkCount = this.getScaledParticleCount(
      5 + this.randomFloat('muzzleFlash') * 3
    );
    const baseAngle = Math.atan2(dirY, dirX);

    for (let i = 0; i < sparkCount; i++) {
      const angle = baseAngle + (this.randomFloat('muzzleFlash') - 0.5) * 1.2;
      const speed = 60 + this.randomFloat('muzzleFlash') * 90;
      const hot = this.randomFloat('muzzleFlash') > 0.7;
      const size = 0.5 + this.randomFloat('muzzleFlash') * 0.5;
      const life = 0.08 + this.randomFloat('muzzleFlash') * 0.1;
      if (i >= 4) continue;

      this.particleEffects.particles.push(
        this.createParticle(
          x + dirX * 19,
          y + dirY * 19,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          hot ? PALETTE.text : PALETTE.shot,
          size,
          life,
          'spark'
        )
      );
    }
  }

  createBulletImpact(position, enemyVelocity, killed, options = {}) {
    const blocked = Boolean(options?.blocked);
    // More particles if killed, fewer for just a hit
    const particleCount = this.getScaledParticleCount(
      blocked ? 8 : killed ? 12 : 6
    );

    for (let i = 0; i < particleCount; i++) {
      const angle = this.randomFloat('hits') * Math.PI * 2;
      const speed = blocked
        ? 60 + this.randomFloat('hits') * 90
        : 80 + this.randomFloat('hits') * 100;

      // The shot's amber light on a hit; a blocked hit only knocks off matte
      // chips so it doesn't read as successful damage.
      const roll = this.randomFloat('hits');
      const color = blocked
        ? PALETTE.neutral
        : roll > (killed ? 0.3 : 0.5)
          ? PALETTE.shot
          : PALETTE.text;

      // Inherit some momentum from the enemy
      const vx = Math.cos(angle) * speed + enemyVelocity.x * 0.3;
      const vy = Math.sin(angle) * speed + enemyVelocity.y * 0.3;

      // BIGGER sparks (more visible)
      const size = blocked
        ? 2 + this.randomFloat('hits') * 1.4
        : killed
          ? 3 + this.randomFloat('hits') * 2.5
          : 2.5 + this.randomFloat('hits') * 2;

      // Longer lifetime
      const life = blocked
        ? 0.12 + this.randomFloat('hits') * 0.08
        : 0.18 + this.randomFloat('hits') * 0.12;

      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          vx,
          vy,
          color,
          size,
          life,
          blocked ? 'debris' : 'spark'
        )
      );
    }
  }

  createShieldHitEffect(data = {}) {
    if (!data.position) {
      return;
    }

    const normalInput = data.normal || { x: 0, y: -1 };
    const normalLength = Math.hypot(normalInput.x || 0, normalInput.y || 0);
    const nx = normalLength > 0 ? normalInput.x / normalLength : 0;
    const ny = normalLength > 0 ? normalInput.y / normalLength : -1;

    const level = Number.isFinite(data.level) ? data.level : 1;
    const intensityBase = Number.isFinite(data.intensity) ? data.intensity : 1;
    const intensity = Math.min(2.5, Math.max(0.6, intensityBase));

    const particleCount = this.getScaledParticleCount(
      12 + level * 2 + intensity * 4
    );
    for (let i = 0; i < particleCount; i += 1) {
      const spread = (this.randomFloat('hits') - 0.5) * Math.PI * 0.7;
      const angle = Math.atan2(-ny, -nx) + spread;
      const speed = 140 + this.randomFloat('hits') * 120 * intensity;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      this.particleEffects.particles.push(
        this.createParticle(
          data.position.x,
          data.position.y,
          vx,
          vy,
          withAlpha(PALETTE.player, 0.6 + this.randomFloat('hits') * 0.3),
          2.4 + this.randomFloat('hits') * 1.6,
          0.28 + this.randomFloat('hits') * 0.18,
          'spark'
        )
      );
    }

    const glow = this.createParticle(
      data.position.x,
      data.position.y,
      -nx * 40,
      -ny * 40,
      withAlpha(PALETTE.player, 0.4),
      5 + level * 1.3,
      0.3 + 0.05 * level
    );
    this.particleEffects.particles.push(glow);

    this.addScreenShake(3 + level * 0.6, 0.15 + 0.02 * intensity);
    this.addScreenFlash(
      withAlpha(PALETTE.player, 0.22),
      0.12,
      0.18 + 0.04 * level
    );
  }

  // Level 5 shield: deflective explosion when shield breaks
  createShieldDeflectiveExplosion(data) {
    if (!data?.position) return;

    this.particleEffects.createShockwaveEffect({
      position: data.position,
      radius: 200, // AoE damage radius
      color: withAlpha(PALETTE.player, 0.6),
    });

    // Screen effects
    this.addScreenShake(12, 0.4);
    this.addScreenFlash(withAlpha(PALETTE.player, 0.4), 0.3, 0.2);

    // Emit damage event for enemies in radius
    this.emit('shield-explosion-damage', {
      position: data.position,
      radius: 200,
      damage: 50, // AoE damage amount
    });
  }

  createXPCollectEffect(x, y) {
    const count = this.getScaledParticleCount(6);
    for (let i = 0; i < count; i++) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 25 + this.randomFloat('explosions') * 40;
      const particle = this.createParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        PALETTE.xp,
        1.5 + this.randomFloat('explosions') * 1.5,
        (0.3 + this.randomFloat('explosions') * 0.2) * XP_SPARK_LIFE_SCALE
      );
      this.particleEffects.particles.push(particle);
    }
  }

  createOrbFusionEffect(data) {
    const tier = data?.tier || 1;
    const consumed = data?.consumed || 0;
    const particleColor = data?.color || PALETTE.xp;
    const glowColor = data?.glow || withAlpha(PALETTE.xp, 0.35);
    const flashColor = data?.flash || withAlpha(PALETTE.xp, 0.2);
    const { x, y } = data.position;

    const particleCount = this.getScaledParticleCount(
      12 + Math.min(24, tier * 4 + Math.floor(consumed / 2))
    );

    for (let i = 0; i < particleCount; i += 1) {
      const angle =
        (Math.PI * 2 * i) / particleCount +
        this.randomFloat('explosions') * 0.3;
      const speed = 60 + this.randomFloat('explosions') * 80;
      const particle = this.createParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        particleColor,
        1.5 + this.randomFloat('explosions') * 2.5,
        0.4 + this.randomFloat('explosions') * 0.35,
        'spark'
      );
      this.particleEffects.particles.push(particle);
    }

    // The flash where the new orb forms: short and white-hot at its core
    // (proposta 20/10: 0.14 s, was a 0.4–0.8 s halo).
    const flash = this.createParticle(
      x,
      y,
      0,
      0,
      particleColor,
      6 + tier * 1.8,
      0.14,
      'flare'
    );
    this.particleEffects.particles.push(flash);

    const ringCount = this.getScaledParticleCount(4 + tier, { minimum: 2 });
    for (let i = 0; i < ringCount; i += 1) {
      const angle = (Math.PI * 2 * i) / ringCount;
      const speed = 40 + tier * 12;
      const particle = this.createParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        glowColor,
        2.5 + tier * 0.8,
        0.45 + this.randomFloat('explosions') * 0.2
      );
      this.particleEffects.particles.push(particle);
    }

    this.addScreenShake(2 + tier * 0.6, 0.12 + tier * 0.03);
    this.addScreenFlash(flashColor, 0.1, 0.14 + tier * 0.02);
  }

  createEpicShipExplosion(position) {
    // EPIC DEATH EXPLOSION - High velocity fragments + massive shockwave

    // Huge freeze frame for dramatic impact
    this.addFreezeFrame(0.35, 0.4);

    // Massive screen shake
    this.addScreenShake(15, 0.6);

    // Bright white flash
    this.addScreenFlash(withAlpha(PALETTE.text, 0.8), 0.4, 0.6);

    // HIGH VELOCITY FRAGMENTS (50-80 particles)
    const fragmentCount = this.getScaledParticleCount(
      50 + this.randomFloat('explosions') * 30
    );
    for (let i = 0; i < fragmentCount; i++) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      // HIGH VELOCITY: 250-500 px/s
      const speed = 250 + this.randomFloat('explosions') * 250;

      // Half light (the ship's cyan, white-hot), half matte hull chips
      const colorChoice = this.randomFloat('explosions');
      const light = colorChoice < 0.5;
      let color;
      if (colorChoice < 0.25) color = PALETTE.text;
      else if (colorChoice < 0.5) color = PALETTE.player;
      else if (colorChoice < 0.75) color = PALETTE.hullLit;
      else color = PALETTE.hull;

      // Large fragments
      const size = 3 + this.randomFloat('explosions') * 4;

      // Long lifetime
      const life = 0.6 + this.randomFloat('explosions') * 0.4;

      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          size,
          life,
          light ? 'spark' : 'debris'
        )
      );
    }

    // MASSIVE DESTRUCTIVE SHOCKWAVE (70% of screen)
    const screenWidth = GAME_WIDTH || 1920;
    const screenHeight = GAME_HEIGHT || 1080;
    const maxDimension = Math.max(screenWidth, screenHeight);
    const shockwaveRadius = maxDimension * 0.7; // 70% of screen

    this.particleEffects.createShockwaveEffect({
      position: position,
      radius: shockwaveRadius,
      duration: 0.8, // Longer duration
      color: withAlpha(PALETTE.player, 0.6),
      baseWidth: 8, // Thick wave
      maxAlpha: 0.8, // Very visible
    });

    // Secondary inner shockwave (more intense)
    setTimeout(() => {
      this.particleEffects.createShockwaveEffect({
        position: position,
        radius: shockwaveRadius * 0.5,
        duration: 0.5,
        color: withAlpha(PALETTE.text, 0.7),
        baseWidth: 6,
        maxAlpha: 0.9,
      });
    }, 100);
  }

  createLevelUpExplosion(player) {
    const count = this.getScaledParticleCount(20);
    for (let i = 0; i < count; i++) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 60 + this.randomFloat('explosions') * 120;
      const particle = this.createParticle(
        player.x,
        player.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        this.randomFloat('explosions') > 0.75 ? PALETTE.text : PALETTE.xp,
        2 + this.randomFloat('explosions') * 2,
        0.6 + this.randomFloat('explosions') * 0.4,
        'spark'
      );
      this.particleEffects.particles.push(particle);
    }
  }
}
