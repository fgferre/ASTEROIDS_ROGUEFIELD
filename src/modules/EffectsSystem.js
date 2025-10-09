import * as CONSTANTS from '../core/GameConstants.js';
import { GamePools } from '../core/GamePools.js';
import { ScreenShake } from '../utils/ScreenShake.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';

const MAIN_THRUSTER_FLASH_THRESHOLD = 0.85;
const MAIN_THRUSTER_FLASH_COLOR = '#3399FF';
const MAIN_THRUSTER_FLASH_DURATION = 0.05;
const MAIN_THRUSTER_FLASH_INTENSITY = 0.05;

class SpaceParticle {
  constructor(x, y, vx, vy, color, size, life, type = 'normal') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.alpha = 1;
    this.type = type;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 4;
  }

  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.life -= deltaTime;
    this.alpha = Math.max(0, this.life / this.maxLife);
    this.rotation += this.rotationSpeed * deltaTime;

    const friction = this.type === 'thruster' ? 0.98 : 0.96;
    this.vx *= friction;
    this.vy *= friction;

    return this.life > 0;
  }

  draw(ctx) {
    if (this.alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    if (this.type === 'spark') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.size * this.alpha;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-this.size, 0);
      ctx.lineTo(this.size, 0);
      ctx.stroke();
    } else if (this.type === 'crack') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = Math.max(0.6, this.size * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const length = this.size * 3.2;
      ctx.moveTo(-length * 0.5, 0);
      ctx.lineTo(length * 0.5, 0);
      ctx.stroke();
    } else if (this.type === 'debris') {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      const s = this.size * this.alpha;
      ctx.rect(-s / 2, -s / 2, s, s);
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.size * this.alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

class HitMarker {
  constructor(x, y, killed, damage) {
    this.x = x;
    this.y = y;
    this.killed = killed;
    this.damage = damage;
    this.life = 0.3; // 0.3s lifetime
    this.maxLife = 0.3;
    this.size = killed ? 12 : 8; // Larger for kills
    this.expansion = 0; // Expands outward
  }

  update(deltaTime) {
    this.life -= deltaTime;
    this.expansion += deltaTime * 20; // Expand at 20px/s
    return this.life > 0;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);

    const color = this.killed ? '#FF4444' : '#FFFF88';
    const lineWidth = this.killed ? 2.5 : 2;
    const radius = this.size + this.expansion;

    // Draw X shape for kills, + shape for hits
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    if (this.killed) {
      // X marker (45° rotation)
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      ctx.stroke();
    } else {
      // + marker
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      ctx.stroke();
    }

    ctx.restore();
  }
}

export default class EffectsSystem {
  constructor(config = {}) {
    const normalizedConfig =
      config && typeof config === 'object' && !Array.isArray(config) ? config : {};
    const { audio = null, ...dependencies } = normalizedConfig;

    this.dependencies = normalizeDependencies(dependencies);
    this.audio = audio ?? resolveService('audio', this.dependencies);
    this.particles = [];
    this.shockwaves = [];
    this.hitMarkers = []; // NEW: Hit marker tracking
    this.damageIndicators = []; // NEW: Directional damage indicators

    // Upgraded screen shake (Week 1: Balance & Feel)
    this.screenShake = new ScreenShake();
    this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
    this.screenFlash = {
      timer: 0,
      duration: 0,
      color: '#FFFFFF',
      intensity: 0,
    };

    this.settings = resolveService('settings', this.dependencies);
    this.motionReduced = false;
    this.screenShakeScale = 1;
    this.damageFlashEnabled = true;
    this.particleDensity = 1;

    if (typeof gameServices !== 'undefined') {
      gameServices.register('effects', this);
    }

    this.setupSettingsIntegration();
    this.setupEventListeners();

    console.log('[EffectsSystem] Initialized');
  }

  // === PARTICLE POOL HELPERS ===
  createParticle(x, y, vx, vy, color, size, life, type = 'normal') {
    const particle = GamePools.particles.acquire();

    // Configure particle from pool
    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.color = color;
    particle.size = size;
    particle.life = life;
    particle.maxLife = life;
    particle.alpha = 1;
    particle.type = type;
    particle.rotation = Math.random() * Math.PI * 2;
    particle.rotationSpeed = (Math.random() - 0.5) * 4;
    particle.active = true;

    return particle;
  }

  addParticle(x, y, vx, vy, color, size, life, type = 'normal') {
    const particle = this.createParticle(x, y, vx, vy, color, size, life, type);
    this.particles.push(particle);
    return particle;
  }

  setupSettingsIntegration() {
    if (!this.settings) {
      this.settings = resolveService('settings', this.dependencies);
    }

    if (
      this.settings &&
      typeof this.settings.getCategoryValues === 'function'
    ) {
      const accessibility = this.settings.getCategoryValues('accessibility');
      if (accessibility) {
        this.applyAccessibilityPreferences(accessibility);
      }

      const video = this.settings.getCategoryValues('video');
      if (video) {
        this.applyVideoPreferences(video);
      }
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.on('settings-accessibility-changed', (payload = {}) => {
        if (payload?.values) {
          this.applyAccessibilityPreferences(payload.values);
        }
      });

      gameEvents.on('settings-video-changed', (payload = {}) => {
        if (payload?.values) {
          this.applyVideoPreferences(payload.values);
        }
      });
    }
  }

  applyAccessibilityPreferences(values = {}) {
    this.motionReduced = Boolean(values.reducedMotion);
  }

  applyVideoPreferences(values = {}) {
    if (Number.isFinite(values.screenShakeIntensity)) {
      const normalized = Math.max(
        0,
        Math.min(1.5, Number(values.screenShakeIntensity))
      );
      this.screenShakeScale = normalized;
      if (this.screenShakeScale <= 0) {
        this.screenShake.reset();
      }
    }

    this.damageFlashEnabled = values.damageFlash !== false;
    if (!this.damageFlashEnabled) {
      this.screenFlash.timer = 0;
      this.screenFlash.intensity = 0;
    }

    if (typeof values.reducedParticles === 'boolean') {
      this.particleDensity = values.reducedParticles ? 0.55 : 1;
    }
  }

  getScaledParticleCount(baseCount, options = {}) {
    const numeric = Number(baseCount);
    const allowZero = options.allowZero === true;
    const minimum = Number.isFinite(options.minimum) ? options.minimum : 1;

    if (!Number.isFinite(numeric)) {
      return allowZero ? 0 : minimum;
    }

    const scaled = Math.round(numeric * this.particleDensity);
    if (allowZero) {
      return Math.max(0, scaled);
    }

    return Math.max(minimum, scaled);
  }

  getScaledProbability(probability) {
    const numeric = Number(probability);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    const clamped = Math.max(0, Math.min(1, numeric));
    return Math.max(0, Math.min(1, clamped * this.particleDensity));
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;

    // Weapon fire feedback (Week 1: Balance & Feel)
    gameEvents.on('bullet-created', (data) => {
      if (data?.from && data?.bullet) {
        // Calculate firing direction from bullet velocity
        const vx = data.bullet.vx || 0;
        const vy = data.bullet.vy || 0;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 0) {
          this.createMuzzleFlash(data.from.x, data.from.y, vx / speed, vy / speed);
        }
      }
    });

    gameEvents.on('thruster-effect', (data) => {
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
    });

    gameEvents.on('bullet-hit', (data) => {
      if (data?.position) {
        this.createHitMarker(data.position, data.killed || false, data.damage || 0);
        this.createBulletImpact(
          data.position,
          { x: data.enemy?.vx || 0, y: data.enemy?.vy || 0 },
          data.killed || false
        );
      }
    });

    gameEvents.on('enemy-destroyed', (data) => {
      if (data?.enemy) {
        this.createAsteroidExplosion(data.enemy);
      }
    });

    gameEvents.on('asteroid-crack-stage-changed', (data) => {
      if (data?.position) {
        this.createCrackDebris(data);
      }
    });

    gameEvents.on('asteroid-volatile-armed', (data) => {
      if (data?.position) {
        this.addScreenFlash('rgba(255, 140, 60, 0.18)', 0.12, 0.08);
        this.spawnVolatileWarning(data.position);
      }
    });

    gameEvents.on('asteroid-volatile-exploded', (data) => {
      this.createVolatileExplosionEffect(data);
    });

    gameEvents.on('asteroid-volatile-trail', (data) => {
      this.spawnVolatileTrail(data);
    });

    gameEvents.on('player-leveled-up', () => {
      this.addScreenShake(6, 0.4);
      this.addFreezeFrame(0.2, 0.4);
      this.addScreenFlash('#FFD700', 0.15, 0.2);

      const player = resolveService('player', this.dependencies);
      if (player) {
        this.createLevelUpExplosion(player.position);
      }
    });

    gameEvents.on('xp-collected', (data) => {
      if (data?.position) {
        this.createXPCollectEffect(data.position.x, data.position.y);
      }
    });

    gameEvents.on('xp-orb-fused', (data) => {
      if (data?.position) {
        this.createOrbFusionEffect(data);
      }
    });

    gameEvents.on('player-took-damage', (data) => {
      // Intense screen shake
      this.addScreenShake(8, 0.3);

      // Red damage flash
      this.addScreenFlash('rgba(255, 50, 50, 0.4)', 0.25, 0.3);

      // Brief freeze frame for impact
      this.addFreezeFrame(0.12, 0.15);

      // Directional damage indicator
      if (data?.damageSource && data?.playerPosition) {
        this.createDirectionalDamageIndicator(data.damageSource, data.playerPosition);
      }
    });

    // Level 5 shield: deflective explosion when shield breaks
    gameEvents.on('shield-deflective-explosion', (data) => {
      if (!data?.position) return;

      // Create cyan shockwave effect
      this.createShockwaveEffect({
        position: data.position,
        radius: 200, // AoE damage radius
        color: 'rgba(0, 255, 255, 0.6)',
      });

      // Screen effects
      this.addScreenShake(12, 0.4);
      this.addScreenFlash('rgba(0, 255, 255, 0.4)', 0.3, 0.2);

      // Emit damage event for enemies in radius
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('shield-explosion-damage', {
          position: data.position,
          radius: 200,
          damage: 50, // AoE damage amount
        });
      }
    });

    gameEvents.on('shield-deflected', (data) => {
      this.createShieldHitEffect(data);
    });

    gameEvents.on('player-died', (data) => {
      if (data?.position) {
        this.createEpicShipExplosion(data.position);
      }
    });
  }

  update(deltaTime) {
    if (this.freezeFrame.timer > 0) {
      this.freezeFrame.timer -= deltaTime;
      if (this.freezeFrame.timer < 0) this.freezeFrame.timer = 0;
      deltaTime *= this.freezeFrame.fade;
    }

    // Update screen shake (new trauma-based system)
    this.screenShake.update(deltaTime);

    if (this.screenFlash.timer > 0) {
      this.screenFlash.timer -= deltaTime;
      if (this.screenFlash.timer < 0) this.screenFlash.timer = 0;
    }

    this.updateParticles(deltaTime);
    this.updateShockwaves(deltaTime);
    this.updateHitMarkers(deltaTime);
    this.updateDamageIndicators(deltaTime);
    return deltaTime;
  }

  updateHitMarkers(deltaTime) {
    this.hitMarkers = this.hitMarkers.filter(marker => marker.update(deltaTime));
  }

  updateDamageIndicators(deltaTime) {
    this.damageIndicators = this.damageIndicators.filter(indicator => {
      indicator.life -= deltaTime;
      indicator.expansion += deltaTime * 30; // Expand at 30px/s
      return indicator.life > 0;
    });
  }

  updateParticles(deltaTime) {
    // Update particles and return expired ones to pool
    const activeParticles = [];
    for (const particle of this.particles) {
      if (particle && typeof particle.update === 'function' && particle.update(deltaTime)) {
        activeParticles.push(particle);
      } else if (particle) {
        // Only try to return to pool if it came from the pool
        // Check if it has the pooled object structure
        if (particle.active !== undefined && !particle.constructor.name) {
          try {
            GamePools.particles.release(particle);
          } catch (error) {
            // If release fails, it wasn't from this pool - just ignore
            console.debug('[EffectsSystem] Particle not from pool, skipping release');
          }
        }
        // For old SpaceParticle instances, just let them be garbage collected
      }
    }
    this.particles = activeParticles;

    // Return oldest particles to pool if we have too many
    if (this.particles.length > 150) {
      const excessParticles = this.particles.splice(0, this.particles.length - 100);
      for (const particle of excessParticles) {
        if (particle && particle.active !== undefined && !particle.constructor.name) {
          try {
            GamePools.particles.release(particle);
          } catch (error) {
            // Ignore release errors for non-pool particles
          }
        }
      }
    }
  }

  updateShockwaves(deltaTime) {
    this.shockwaves = this.shockwaves.filter((wave) => {
      if (!wave) return false;

      wave.timer += deltaTime;
      const progress = Math.min(1, wave.timer / wave.duration);
      const easingPower =
        Number.isFinite(wave.easingPower) && wave.easingPower > 0
          ? wave.easingPower
          : 1;
      const easedProgress =
        easingPower === 1 ? progress : Math.pow(progress, easingPower);

      wave.radius = wave.maxRadius * easedProgress;
      wave.alpha = Math.max(0, wave.maxAlpha * (1 - easedProgress));

      const widthFade = Number.isFinite(wave.widthFade) ? wave.widthFade : 0.6;
      const widthFactor = Math.max(0, 1 - easedProgress * widthFade);
      wave.lineWidth = Math.max(0.35, wave.baseWidth * widthFactor);

      return wave.timer < wave.duration;
    });
  }

  applyScreenShake(ctx) {
    // Apply trauma-based screen shake
    const centerX = CONSTANTS.GAME_WIDTH / 2;
    const centerY = CONSTANTS.GAME_HEIGHT / 2;
    this.screenShake.apply(ctx, centerX, centerY);
  }

  draw(ctx) {
    this.particles.forEach((p) => p.draw(ctx));

    this.drawShockwaves(ctx);

    // Draw hit markers
    this.hitMarkers.forEach((marker) => marker.draw(ctx));

    // Draw directional damage indicators
    this.drawDamageIndicators(ctx);

    if (this.screenFlash.timer > 0) {
      const alpha =
        (this.screenFlash.timer / this.screenFlash.duration) *
        this.screenFlash.intensity;
      ctx.save();
      ctx.fillStyle = this.screenFlash.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }

  drawShockwaves(ctx) {
    if (!ctx) return;

    this.shockwaves.forEach((wave) => {
      if (!wave) return;

      ctx.save();
      ctx.globalAlpha = wave.alpha;
      ctx.strokeStyle = wave.color || 'rgba(0, 191, 255, 1)';
      ctx.lineWidth = Math.max(0.5, wave.lineWidth);

      if (wave.shadowColor) {
        const blurBase = Number.isFinite(wave.shadowBlur)
          ? wave.shadowBlur
          : 25;
        ctx.shadowColor = wave.shadowColor;
        ctx.shadowBlur = blurBase * wave.alpha;
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      if (wave.fillColor) {
        ctx.fillStyle = wave.fillColor;
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  addScreenShake(intensity, duration) {
    const inputIntensity = Number.isFinite(intensity) ? intensity : 0;
    const inputDuration = Number.isFinite(duration) ? duration : 0;

    const scale = Math.max(0, this.screenShakeScale ?? 1);
    const motionScale = this.motionReduced ? 0.45 : 1;
    const finalIntensity = inputIntensity * scale * motionScale;

    if (finalIntensity <= 0) {
      return;
    }

    let finalDuration = inputDuration;
    if (this.motionReduced) {
      finalDuration = Math.min(finalDuration, 0.2);
    }
    finalDuration = Math.max(0, finalDuration);
    if (finalDuration <= 0) {
      return;
    }

    // Convert old intensity (0-12 range) to trauma (0-1 range)
    // Old max was ~12, so divide by 15 to get 0-0.8 trauma range
    const trauma = Math.min(1, finalIntensity / 15);
    this.screenShake.add(trauma, finalDuration);
  }

  addFreezeFrame(duration, fade = 0) {
    let finalDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    let finalFade = Number.isFinite(fade) ? fade : 0;

    if (this.motionReduced) {
      finalDuration = Math.min(finalDuration, 0.12);
      finalFade = Math.min(finalFade, 0.2);
    }

    if (finalDuration <= 0) {
      return;
    }

    this.freezeFrame.timer = Math.max(this.freezeFrame.timer, finalDuration);
    this.freezeFrame.duration = Math.max(
      this.freezeFrame.duration,
      finalDuration
    );
    this.freezeFrame.fade = finalFade;
  }

  addScreenFlash(color, duration, intensity) {
    if (!this.damageFlashEnabled) {
      return;
    }

    let finalDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    let finalIntensity = Number.isFinite(intensity)
      ? Math.max(0, intensity)
      : 0;

    if (this.motionReduced) {
      finalDuration = Math.min(finalDuration, 0.18);
      finalIntensity *= 0.6;
    }

    if (finalDuration <= 0 || finalIntensity <= 0) {
      return;
    }

    this.screenFlash.color = color;
    this.screenFlash.duration = finalDuration;
    this.screenFlash.timer = finalDuration;
    this.screenFlash.intensity = finalIntensity;
  }

  spawnThrusterVFX(worldX, worldY, dirX, dirY, intensity = 1, type = 'main', visualLevel = 0) {
    const i = Math.max(0, Math.min(1, intensity));

    // AGGRESSIVE Visual upgrade scaling matching design doc v3:
    // Rank 5 = +150% particles (2.5x), +100% size (2x), +50% lifetime (1.5x), +50% speed (creates longer trail)
    const visualBoost = 1 + (visualLevel * 0.3); // 30% per level = 2.5x at rank 5
    const sizeBoost = 1 + (visualLevel * 0.2); // 20% per level = 2x at rank 5
    const lifeBoost = 1 + (visualLevel * 0.1); // 10% per level = 1.5x at rank 5
    const speedBoost = 1 + (visualLevel * 0.1); // 10% per level = 1.5x at rank 5 (creates "length")

    let baseCount, speedBase, sizeRange, lifeRange, colorFn;

    switch (type) {
      case 'main':
        baseCount = 3 * visualBoost;
        speedBase = 120 * speedBoost; // Faster particles = longer visible trail
        sizeRange = [2.0 * sizeBoost, 3.2 * sizeBoost];
        lifeRange = [0.22 * lifeBoost, 0.28 * lifeBoost];
        // Color progression: Orange → Yellow → Cyan-blue (no white plasma)
        colorFn = () => {
          if (visualLevel >= 5) {
            // RANK 5: Electric cyan-blue (no white)
            return `hsl(${190 + Math.random() * 20}, 100%, ${70 + Math.random() * 12}%)`;
          } else if (visualLevel >= 4) {
            // RANK 4: Bright cyan
            return `hsl(${185 + Math.random() * 25}, 100%, ${68 + Math.random() * 14}%)`;
          } else if (visualLevel >= 3) {
            // RANK 3: Bright yellow
            return `hsl(${45 + Math.random() * 15}, 100%, ${68 + Math.random() * 14}%)`;
          } else if (visualLevel >= 1) {
            // RANK 1-2: Brighter orange
            return `hsl(${25 + Math.random() * 20}, 100%, ${63 + Math.random() * 14}%)`;
          }
          // Base: Standard orange
          return `hsl(${18 + Math.random() * 22}, 100%, ${60 + Math.random() * 16}%)`;
        };
        break;
      case 'aux':
        baseCount = 2 * visualBoost;
        speedBase = 105 * speedBoost;
        sizeRange = [1.8 * sizeBoost, 2.6 * sizeBoost];
        lifeRange = [0.18 * lifeBoost, 0.26 * lifeBoost];
        // Braking thrusters get brighter with upgrades
        colorFn = () => {
          if (visualLevel >= 3) {
            return `hsl(${190 + Math.random() * 20}, 100%, ${75 + Math.random() * 15}%)`;
          }
          return `hsl(${200 + Math.random() * 25}, 100%, ${68 + Math.random() * 18}%)`;
        };
        break;
      default: // 'side'
        baseCount = 2 * visualBoost;
        speedBase = 110 * speedBoost;
        sizeRange = [1.6 * sizeBoost, 2.2 * sizeBoost];
        lifeRange = [0.16 * lifeBoost, 0.22 * lifeBoost];
        // RCS thrusters: Blue → BRIGHT CYAN
        colorFn = () => {
          if (visualLevel >= 5) {
            // RANK 5: ELECTRIC CYAN
            return `hsl(${180 + Math.random() * 10}, 100%, ${80 + Math.random() * 15}%)`;
          } else if (visualLevel >= 3) {
            // RANK 3+: Bright cyan
            return `hsl(${180 + Math.random() * 20}, 100%, ${75 + Math.random() * 15}%)`;
          }
          // Base: Standard blue
          return `hsl(${200 + Math.random() * 25}, 100%, ${70 + Math.random() * 18}%)`;
        };
    }

    const rawCount = baseCount * (0.8 + i * 2.0);
    const count = this.getScaledParticleCount(rawCount);

    for (let c = 0; c < count; c++) {
      const jitter = (Math.random() - 0.5) * 0.35;
      const spd = speedBase * (0.8 + i * 1.6) * (0.85 + Math.random() * 0.3);
      const vx = (-dirX + jitter) * spd + (Math.random() - 0.5) * 20;
      const vy = (-dirY + jitter) * spd + (Math.random() - 0.5) * 20;
      const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
      const life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);

      this.particles.push(
        this.createParticle(
          worldX + (Math.random() - 0.5) * 3,
          worldY + (Math.random() - 0.5) * 3,
          vx,
          vy,
          colorFn(),
          size,
          life,
          'thruster'
        )
      );

      // Spark probability increases with visual level (25% → 70% at rank 5)
      const sparkProbability = 0.25 + (visualLevel * 0.09);
      if (Math.random() < this.getScaledProbability(sparkProbability)) {
        const sparkSpd = spd * (0.9 + Math.random() * 0.3);
        const sparkSize = (1.2 + Math.random() * 0.8) * sizeBoost;
        this.particles.push(
          this.createParticle(
            worldX,
            worldY,
            -dirX * sparkSpd,
            -dirY * sparkSpd,
            '#FFFFFF',
            sparkSize,
            0.08 + Math.random() * 0.06,
            'spark'
          )
        );
      }
    }
  }

  createMuzzleFlash(x, y, dirX, dirY) {
    // Create 5-8 bright particles shooting forward from weapon barrel
    const particleCount = this.getScaledParticleCount(5 + Math.random() * 3);

    for (let i = 0; i < particleCount; i++) {
      // Cone spread: ±20° from firing direction (wider cone)
      const spreadAngle = (Math.random() - 0.5) * 0.35; // ~20° in radians
      const angle = Math.atan2(dirY, dirX) + spreadAngle;

      // Speed: 200-350 px/s in firing direction (FASTER, more visible)
      const speed = 200 + Math.random() * 150;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      // Color: BRIGHT white-yellow (more visible)
      const useWhite = Math.random() > 0.5;
      const color = useWhite
        ? '#FFFFFF' // Pure white
        : `hsl(${50 + Math.random() * 10}, 100%, 95%)`; // Very bright yellow

      // Size: 3-6px (BIGGER sparks, more visible)
      const size = 3 + Math.random() * 3;

      // Lifetime: 0.12-0.20s (longer duration)
      const life = 0.12 + Math.random() * 0.08;

      this.particles.push(
        this.createParticle(
          x + dirX * 10, // Spawn further ahead (more visible separation)
          y + dirY * 10,
          vx,
          vy,
          color,
          size,
          life,
          'spark'
        )
      );
    }
  }

  createHitMarker(position, killed, damage) {
    this.hitMarkers.push(new HitMarker(position.x, position.y, killed, damage));
  }

  createDirectionalDamageIndicator(damageSourcePos, playerPos) {
    // Calculate angle from player to damage source
    const dx = damageSourcePos.x - playerPos.x;
    const dy = damageSourcePos.y - playerPos.y;
    const angle = Math.atan2(dy, dx);

    // Calculate screen edge position
    // Use half screen dimensions to position at edge
    const halfWidth = CONSTANTS.GAME_WIDTH / 2;
    const halfHeight = CONSTANTS.GAME_HEIGHT / 2;

    // Find intersection with screen edge
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Calculate which edge the indicator should appear on
    let edgeX, edgeY;
    const tanAngle = Math.abs(sin / cos);

    if (tanAngle < halfHeight / halfWidth) {
      // Hit left or right edge
      edgeX = cos > 0 ? CONSTANTS.GAME_WIDTH - 40 : 40;
      edgeY = halfHeight + (edgeX - halfWidth) * (sin / cos);
    } else {
      // Hit top or bottom edge
      edgeY = sin > 0 ? CONSTANTS.GAME_HEIGHT - 40 : 40;
      edgeX = halfWidth + (edgeY - halfHeight) * (cos / sin);
    }

    this.damageIndicators.push({
      x: edgeX,
      y: edgeY,
      angle: angle + Math.PI, // Point inward toward threat
      life: 0.6, // 0.6s visibility
      maxLife: 0.6,
      expansion: 0,
      color: 'rgba(255, 50, 50, 0.9)', // Bright red
    });
  }

  drawDamageIndicators(ctx) {
    this.damageIndicators.forEach((indicator) => {
      ctx.save();

      // Fade out based on remaining life
      const alpha = indicator.life / indicator.maxLife;

      // Translate to indicator position
      ctx.translate(indicator.x, indicator.y);
      ctx.rotate(indicator.angle);

      // Draw chevron (triple arrow: <<<)
      ctx.strokeStyle = indicator.color.replace('0.9)', `${alpha * 0.9})`);
      ctx.fillStyle = indicator.color.replace('0.9)', `${alpha * 0.7})`);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const size = 15 + indicator.expansion * 0.5; // Slight expansion
      const spacing = 8;

      // Draw three chevrons (>>>)
      for (let i = 0; i < 3; i++) {
        const offsetX = i * spacing;
        ctx.beginPath();
        ctx.moveTo(offsetX, -size);
        ctx.lineTo(offsetX + size, 0);
        ctx.lineTo(offsetX, size);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  createBulletImpact(position, enemyVelocity, killed) {
    // More particles if killed, fewer for just a hit
    const particleCount = this.getScaledParticleCount(killed ? 12 : 6);

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 100; // FASTER (80-180 vs 60-140)

      // Spark color: BRIGHT red if killed, BRIGHT cyan/blue if hit (different from muzzle)
      const color = killed
        ? (Math.random() > 0.3 ? '#FF3333' : '#FFAA00') // Red/orange mix for kills
        : (Math.random() > 0.5 ? '#00FFFF' : '#88FFFF'); // Cyan for hits (contrast with yellow muzzle)

      // Inherit some momentum from the enemy
      const vx = Math.cos(angle) * speed + enemyVelocity.x * 0.3;
      const vy = Math.sin(angle) * speed + enemyVelocity.y * 0.3;

      // BIGGER sparks (more visible)
      const size = killed ? 3 + Math.random() * 2.5 : 2.5 + Math.random() * 2;

      // Longer lifetime
      const life = 0.18 + Math.random() * 0.12; // 0.18-0.30s

      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          vx,
          vy,
          color,
          size,
          life,
          'spark'
        )
      );
    }
  }

  createShockwaveEffect(data) {
    if (!data || !data.position) {
      return;
    }

    const radius =
      typeof data.radius === 'number'
        ? data.radius
        : CONSTANTS.SHIELD_SHOCKWAVE_RADIUS;

    const duration =
      typeof data.duration === 'number' && data.duration > 0
        ? data.duration
        : 0.45;
    const baseWidth =
      typeof data.baseWidth === 'number' && data.baseWidth > 0
        ? data.baseWidth
        : 10;
    const maxAlpha =
      typeof data.maxAlpha === 'number' ? Math.max(0, data.maxAlpha) : 0.6;
    const widthFade = typeof data.widthFade === 'number' ? data.widthFade : 0.6;
    const easingPower =
      typeof data.easingPower === 'number' ? data.easingPower : 1;

    const wave = {
      x: data.position.x,
      y: data.position.y,
      maxRadius: radius,
      radius: 0,
      timer: 0,
      duration,
      baseWidth,
      maxAlpha,
      alpha: maxAlpha,
      widthFade,
      easingPower,
      color: data.color,
      shadowColor: data.shadowColor,
      shadowBlur: data.shadowBlur,
      fillColor: data.fillColor,
    };

    this.shockwaves.push(wave);
    if (this.shockwaves.length > 6) {
      this.shockwaves = this.shockwaves.slice(-6);
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
      const spread = (Math.random() - 0.5) * Math.PI * 0.7;
      const angle = Math.atan2(-ny, -nx) + spread;
      const speed = 140 + Math.random() * 120 * intensity;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      this.particles.push(
        this.createParticle(
          data.position.x,
          data.position.y,
          vx,
          vy,
          `rgba(80, 220, 255, ${0.6 + Math.random() * 0.3})`,
          2.4 + Math.random() * 1.6,
          0.28 + Math.random() * 0.18,
          'spark'
        )
      );
    }

    const glow = this.createParticle(
      data.position.x,
      data.position.y,
      -nx * 40,
      -ny * 40,
      'rgba(140, 240, 255, 0.4)',
      5 + level * 1.3,
      0.3 + 0.05 * level
    );
    this.particles.push(glow);

    this.addScreenShake(3 + level * 0.6, 0.15 + 0.02 * intensity);
    this.addScreenFlash('rgba(0, 191, 255, 0.22)', 0.12, 0.18 + 0.04 * level);
  }

  createXPCollectEffect(x, y) {
    const count = this.getScaledParticleCount(6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 40;
      const particle = this.createParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        '#00DDFF',
        1.5 + Math.random() * 1.5,
        0.3 + Math.random() * 0.2
      );
      this.particles.push(particle);
    }
  }

  createOrbFusionEffect(data) {
    const tier = data?.tier || 1;
    const consumed = data?.consumed || 0;
    const particleColor = data?.color || '#FFFFFF';
    const glowColor = data?.glow || 'rgba(255, 255, 255, 0.35)';
    const flashColor = data?.flash || 'rgba(255, 255, 255, 0.2)';
    const { x, y } = data.position;

    const particleCount = this.getScaledParticleCount(
      12 + Math.min(24, tier * 4 + Math.floor(consumed / 2))
    );

    for (let i = 0; i < particleCount; i += 1) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.3;
      const speed = 60 + Math.random() * 80;
      const particle = this.createParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        particleColor,
        1.5 + Math.random() * 2.5,
        0.4 + Math.random() * 0.35,
        'spark'
      );
      this.particles.push(particle);
    }

    const halo = this.createParticle(
      x,
      y,
      0,
      0,
      glowColor,
      5 + tier * 1.8,
      0.35 + tier * 0.07
    );
    this.particles.push(halo);

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
        0.45 + Math.random() * 0.2
      );
      this.particles.push(particle);
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
    this.addScreenFlash('rgba(255, 255, 255, 0.8)', 0.4, 0.6);

    // HIGH VELOCITY FRAGMENTS (50-80 particles)
    const fragmentCount = this.getScaledParticleCount(50 + Math.random() * 30);
    for (let i = 0; i < fragmentCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      // HIGH VELOCITY: 250-500 px/s
      const speed = 250 + Math.random() * 250;

      // Mix of colors: white, yellow, orange, red
      const colorChoice = Math.random();
      let color;
      if (colorChoice < 0.25) color = '#FFFFFF'; // White hot
      else if (colorChoice < 0.5) color = '#FFFF00'; // Yellow
      else if (colorChoice < 0.75) color = '#FF8800'; // Orange
      else color = '#FF3333'; // Red

      // Large fragments
      const size = 3 + Math.random() * 4;

      // Long lifetime
      const life = 0.6 + Math.random() * 0.4;

      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          size,
          life,
          'debris'
        )
      );
    }

    // MASSIVE DESTRUCTIVE SHOCKWAVE (70% of screen)
    const screenWidth = CONSTANTS.GAME_WIDTH || 1920;
    const screenHeight = CONSTANTS.GAME_HEIGHT || 1080;
    const maxDimension = Math.max(screenWidth, screenHeight);
    const shockwaveRadius = maxDimension * 0.7; // 70% of screen

    this.createShockwaveEffect({
      position: position,
      radius: shockwaveRadius,
      duration: 0.8, // Longer duration
      color: 'rgba(255, 100, 50, 0.6)', // Orange-red
      baseWidth: 8, // Thick wave
      maxAlpha: 0.8 // Very visible
    });

    // Secondary inner shockwave (more intense)
    setTimeout(() => {
      this.createShockwaveEffect({
        position: position,
        radius: shockwaveRadius * 0.5,
        duration: 0.5,
        color: 'rgba(255, 200, 100, 0.7)', // Bright yellow-orange
        baseWidth: 6,
        maxAlpha: 0.9
      });
    }, 100);
  }

  createLevelUpExplosion(player) {
    const count = this.getScaledParticleCount(20);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      const particle = this.createParticle(
        player.x,
        player.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        `hsl(${Math.random() * 40 + 40}, 100%, 60%)`,
        2 + Math.random() * 2,
        0.6 + Math.random() * 0.4,
        'spark'
      );
      this.particles.push(particle);
    }
  }

  createAsteroidExplosion(asteroid) {
    if (!asteroid) {
      return;
    }

    const variantColors =
      typeof asteroid.getVariantColors === 'function'
        ? asteroid.getVariantColors()
        : null;
    const debrisColor = variantColors?.fill || '#8B4513';
    const sparkColor =
      variantColors?.glow ||
      variantColors?.pulse ||
      `hsl(${Math.random() * 20 + 30}, 100%, 70%)`;
    const secondarySparkColor = variantColors?.cracks || 'rgba(255, 220, 170, 0.85)';

    const baseCount = { large: 12, medium: 8, small: 5 }[asteroid.size] || 6;
    const radius = Number.isFinite(asteroid.radius) ? Math.max(asteroid.radius, 12) : 20;
    const densityFactor = Math.max(1, radius / 22);
    const particleCount = this.getScaledParticleCount(Math.round(baseCount * densityFactor));

    const parentVx = Number.isFinite(asteroid.vx) ? asteroid.vx : 0;
    const parentVy = Number.isFinite(asteroid.vy) ? asteroid.vy : 0;
    const momentumScale = 0.35;
    const speedScale = Math.max(0.85, Math.min(1.8, radius / 24));

    if (asteroid.size === 'small') {
      this.addScreenShake(2 + radius * 0.01, 0.12);
    } else if (asteroid.size === 'medium') {
      this.addScreenShake(4 + radius * 0.012, 0.18);
    } else if (asteroid.size === 'large') {
      this.addScreenShake(8 + radius * 0.015, 0.28);
      this.addFreezeFrame(0.18, 0.24);
      this.addScreenFlash(variantColors?.glow || '#FF6B6B', 0.22, 0.12);
    }

    for (let i = 0; i < particleCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (40 + Math.random() * 80) * speedScale;

      const offset = radius * 0.5 * (Math.random() - 0.5);
      const spawnX = asteroid.x + Math.cos(angle) * offset;
      const spawnY = asteroid.y + Math.sin(angle) * offset;

      const debris = this.createParticle(
        spawnX,
        spawnY,
        Math.cos(angle) * speed + parentVx * momentumScale,
        Math.sin(angle) * speed + parentVy * momentumScale,
        debrisColor,
        2 + Math.random() * 3.2,
        0.6 + Math.random() * 0.45,
        'debris'
      );
      this.particles.push(debris);

      const spark = this.createParticle(
        asteroid.x,
        asteroid.y,
        Math.cos(angle) * speed * 1.25 + parentVx * momentumScale,
        Math.sin(angle) * speed * 1.25 + parentVy * momentumScale,
        sparkColor,
        1.6 + Math.random() * 1.6,
        0.32 + Math.random() * 0.22,
        'spark'
      );
      this.particles.push(spark);

      if (Math.random() < 0.35) {
        const secondary = new SpaceParticle(
          asteroid.x,
          asteroid.y,
          Math.cos(angle + Math.PI / 2) * speed * 0.6,
          Math.sin(angle + Math.PI / 2) * speed * 0.6,
          secondarySparkColor,
          1.2 + Math.random() * 1,
          0.28 + Math.random() * 0.18,
          'spark'
        );
        this.particles.push(secondary);
      }
    }
  }

  resolveAsteroidColors(variant, size) {
    const fallbackBySize = {
      large: '#8B4513',
      medium: '#A0522D',
      small: '#CD853F',
    };
    const config =
      CONSTANTS.ASTEROID_VARIANTS?.[variant] ||
      CONSTANTS.ASTEROID_VARIANTS?.common;
    const colors = config?.colors || {};
    const fallbackFill = fallbackBySize[size] || fallbackBySize.medium;

    return {
      cracks: colors.cracks || 'rgba(255, 235, 200, 0.92)',
      glow:
        colors.innerGlow ||
        colors.glow ||
        'rgba(255, 255, 255, 0.28)',
      debris: colors.fill || fallbackFill,
    };
  }

  createCrackDebris(event = {}) {
    if (!event || !event.position) {
      return;
    }

    const position = event.position;
    const rotation = Number.isFinite(event.rotation) ? event.rotation : 0;
    const radius = Number.isFinite(event.radius)
      ? Math.max(event.radius, 6)
      : 18;
    const variant = event.variant || 'common';
    const size = event.size || 'medium';

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const toWorldPoint = (point) => ({
      x: position.x + point.x * cos - point.y * sin,
      y: position.y + point.x * sin + point.y * cos,
    });

    const rotateVector = (vector) => ({
      x: vector.x * cos - vector.y * sin,
      y: vector.x * sin + vector.y * cos,
    });

    const colors = this.resolveAsteroidColors(variant, size);
    const intensity = Math.max(1, Math.round(event.intensity ?? 1));
    const baseLifetime = 0.2 + intensity * 0.08;
    const burst = event.burst || {};

    const segmentsInput = Array.isArray(event.segments) ? event.segments : [];
    const sanitizedSegments = segmentsInput
      .map((segment) => {
        if (!segment) {
          return null;
        }

        const startX = Number.isFinite(segment.start?.x)
          ? segment.start.x
          : Number.isFinite(segment.x1)
            ? segment.x1
            : 0;
        const startY = Number.isFinite(segment.start?.y)
          ? segment.start.y
          : Number.isFinite(segment.y1)
            ? segment.y1
            : 0;
        const endX = Number.isFinite(segment.end?.x)
          ? segment.end.x
          : Number.isFinite(segment.x2)
            ? segment.x2
            : 0;
        const endY = Number.isFinite(segment.end?.y)
          ? segment.end.y
          : Number.isFinite(segment.y2)
            ? segment.y2
            : 0;
        const length = Number.isFinite(segment.length)
          ? segment.length
          : Math.hypot(endX - startX, endY - startY);

        if (!Number.isFinite(length) || length <= 0.2) {
          return null;
        }

        return {
          id: segment.id || null,
          width: Number.isFinite(segment.width) ? segment.width : 1,
          length,
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          type: segment.type || 'line',
        };
      })
      .filter(Boolean);

    const createSegmentKey = (segment) => {
      const startX = Number.isFinite(segment.start?.x) ? segment.start.x : 0;
      const startY = Number.isFinite(segment.start?.y) ? segment.start.y : 0;
      const endX = Number.isFinite(segment.end?.x) ? segment.end.x : 0;
      const endY = Number.isFinite(segment.end?.y) ? segment.end.y : 0;
      const type = segment.type || 'line';
      return [
        segment.id ?? 'no-id',
        startX.toFixed(4),
        startY.toFixed(4),
        endX.toFixed(4),
        endY.toFixed(4),
        type,
      ].join(':');
    };

    const segments = [];
    const seenSegments = new Set();

    sanitizedSegments.forEach((segment) => {
      const key = createSegmentKey(segment);
      if (seenSegments.has(key)) {
        return;
      }

      seenSegments.add(key);
      segments.push(segment);
    });

    if (!segments.length) {
      return;
    }

    segments.sort((a, b) => b.length - a.length);

    const baseCrackCount = Math.max(
      1,
      Math.round(segments.length * (0.65 + this.particleDensity * 0.45))
    );

    const cracksToSpawn = Math.max(
      1,
      Math.min(
        segments.length,
        this.getScaledParticleCount(baseCrackCount, {
          allowZero: false,
          minimum: 1,
        })
      )
    );

    const selectedSegments = segments.slice(0, cracksToSpawn);

    selectedSegments.forEach((segment) => {
      const worldStart = toWorldPoint(segment.start);
      const worldEnd = toWorldPoint(segment.end);
      const midX = (worldStart.x + worldEnd.x) * 0.5;
      const midY = (worldStart.y + worldEnd.y) * 0.5;
      const angle = Math.atan2(worldEnd.y - worldStart.y, worldEnd.x - worldStart.x);
      const crackLength = Math.max(0.5, segment.length);

      const crack = new SpaceParticle(
        midX,
        midY,
        0,
        0,
        colors.cracks,
        Math.max(0.55, crackLength / 3.2),
        baseLifetime + Math.min(0.12, crackLength / (radius * 6)),
        'crack'
      );
      crack.rotation = angle;
      crack.rotationSpeed = 0;
      this.particles.push(crack);

      if (!this.motionReduced) {
        const sparkSpeed = 22 + Math.random() * 28;
        this.particles.push(
          this.createParticle(
            worldEnd.x,
            worldEnd.y,
            Math.cos(angle) * sparkSpeed * 0.32,
            Math.sin(angle) * sparkSpeed * 0.32,
            colors.glow,
            0.9 + Math.random() * 0.7,
            0.22 + Math.random() * 0.16,
            'spark'
          )
        );
      }
    });

    const shardCount = this.getScaledParticleCount(burst.shards ?? 0, {
      allowZero: true,
    });

    if (shardCount > 0 && selectedSegments.length > 0) {
      for (let i = 0; i < shardCount; i += 1) {
        const segment = selectedSegments[i % selectedSegments.length];
        const t = Math.random();
        const localPoint = {
          x: segment.start.x + (segment.end.x - segment.start.x) * t,
          y: segment.start.y + (segment.end.y - segment.start.y) * t,
        };
        const worldPoint = toWorldPoint(localPoint);
        const direction = rotateVector({
          x: segment.end.x - segment.start.x,
          y: segment.end.y - segment.start.y,
        });
        const dirLength = Math.hypot(direction.x, direction.y) || 1;
        const normalized = {
          x: direction.x / dirLength,
          y: direction.y / dirLength,
        };
        const speed = 22 + Math.random() * 32;

        this.particles.push(
          this.createParticle(
            worldPoint.x,
            worldPoint.y,
            normalized.x * speed,
            normalized.y * speed,
            colors.debris,
            1.4 + Math.random() * 1.6,
            0.38 + Math.random() * 0.22,
            'debris'
          )
        );
      }
    }

    const sparkBase =
      (burst.sparks ?? intensity * 2) +
      Math.max(0, Number.isFinite(burst.cracks) ? burst.cracks * 0.3 : 0);
    const sparkCount = this.getScaledParticleCount(sparkBase, {
      allowZero: true,
    });

    for (let i = 0; i < sparkCount; i += 1) {
      const segment =
        selectedSegments.length > 0
          ? selectedSegments[Math.floor(Math.random() * selectedSegments.length)]
          : null;
      const t = Math.random();
      const localOrigin = segment
        ? {
            x: segment.start.x + (segment.end.x - segment.start.x) * t,
            y: segment.start.y + (segment.end.y - segment.start.y) * t,
          }
        : { x: 0, y: 0 };
      const worldOrigin = toWorldPoint(localOrigin);

      let dirX;
      let dirY;

      if (segment) {
        const rotated = rotateVector({
          x: segment.end.x - segment.start.x,
          y: segment.end.y - segment.start.y,
        });
        const dirLength = Math.hypot(rotated.x, rotated.y) || 1;
        dirX = rotated.x / dirLength;
        dirY = rotated.y / dirLength;
      } else {
        const angle = Math.random() * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      }

      const speed = 35 + Math.random() * 40;

      this.particles.push(
        this.createParticle(
          worldOrigin.x,
          worldOrigin.y,
          dirX * speed,
          dirY * speed,
          colors.glow,
          1.2 + Math.random() * 0.8,
          0.24 + Math.random() * 0.14,
          'spark'
        )
      );
    }
  }

  spawnVolatileTrail(data = {}) {
    if (!data || !data.position) {
      return;
    }

    const config = data.config || {};
    const position = data.position;
    const velocity = data.velocity || { x: 0, y: 0 };
    const hasVelocity =
      Number.isFinite(velocity.x) &&
      Number.isFinite(velocity.y) &&
      (velocity.x !== 0 || velocity.y !== 0);
    const baseAngle = hasVelocity
      ? Math.atan2(velocity.y, velocity.x) + Math.PI
      : Math.random() * Math.PI * 2;

    const colors = config.colors || {};
    const coreColor = colors.core || 'rgba(255, 200, 130, 0.9)';
    const emberColor = colors.ember || 'rgba(255, 110, 40, 0.85)';
    const smokeColor = colors.smoke || 'rgba(60, 24, 10, 0.35)';

    const resolveRange = (value, fallback) => {
      if (Array.isArray(value)) {
        const min = Number.isFinite(value[0]) ? value[0] : fallback[0];
        const max = Number.isFinite(value[1]) ? value[1] : fallback[1];
        return [min, max];
      }
      if (Number.isFinite(value)) {
        return [value, value];
      }
      return fallback;
    };

    const intensityInput = Number.isFinite(data.intensity)
      ? data.intensity
      : Number.isFinite(data.fuseProgress)
        ? data.fuseProgress
        : 0;
    const intensity = Math.max(0, Math.min(1, intensityInput));
    const armedBonus = data.armed ? 0.15 : 0;
    const totalIntensity = Math.min(1.2, intensity + armedBonus);

    const countRange = config.countRange || [2, 4];
    const countMin = Array.isArray(countRange)
      ? countRange[0] ?? 2
      : countRange;
    const countMax = Array.isArray(countRange)
      ? countRange[1] ?? countMin
      : countMin;
    const spawnCount = this.getScaledParticleCount(
      this.randomRange(countMin, countMax + totalIntensity * 1.2)
    );

    const spread = Number.isFinite(config.spread) ? config.spread : Math.PI / 4;
    const speedRange = resolveRange(config.speedRange, [28, 90]);
    const sizeRange = resolveRange(config.sizeRange, [2.2, 3.6]);
    const lifeRange = resolveRange(config.lifeRange, [0.26, 0.46]);
    const jitter = Number.isFinite(config.emberJitter) ? config.emberJitter : 5;

    const speedMagnitude = Math.hypot(velocity.x || 0, velocity.y || 0);
    const speedScale =
      0.7 + Math.min(1.2, speedMagnitude / 140) * 0.4 + totalIntensity * 0.3;

    for (let i = 0; i < spawnCount; i += 1) {
      const angleOffset = (Math.random() - 0.5) * spread;
      const angle = baseAngle + angleOffset;
      const offsetMag = this.randomRange(0, jitter);
      const spawnX = position.x + Math.cos(angle + Math.PI) * offsetMag;
      const spawnY = position.y + Math.sin(angle + Math.PI) * offsetMag;

      const emberSpeed =
        this.randomRange(speedRange[0], speedRange[1]) * speedScale;
      const emberLife =
        this.randomRange(lifeRange[0], lifeRange[1]) *
        (0.7 + totalIntensity * 0.5);
      const emberSize =
        this.randomRange(sizeRange[0], sizeRange[1]) *
        (0.75 + totalIntensity * 0.45);

      const spark = this.createParticle(
        spawnX,
        spawnY,
        Math.cos(angle) * emberSpeed,
        Math.sin(angle) * emberSpeed,
        emberColor,
        emberSize * 0.6,
        emberLife * 0.75,
        'spark'
      );
      this.particles.push(spark);

      const core = new SpaceParticle(
        spawnX,
        spawnY,
        Math.cos(angle) * emberSpeed * 0.45,
        Math.sin(angle) * emberSpeed * 0.45,
        coreColor,
        emberSize,
        emberLife
      );
      this.particles.push(core);

      if (Math.random() < this.getScaledProbability(0.55)) {
        const smoke = new SpaceParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * emberSpeed * 0.25,
          Math.sin(angle) * emberSpeed * 0.25,
          smokeColor,
          emberSize * (1.2 + Math.random() * 0.6),
          emberLife * (1.3 + Math.random() * 0.4)
        );
        this.particles.push(smoke);
      }

      if (Math.random() < this.getScaledProbability(0.3)) {
        const glint = new SpaceParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * emberSpeed * 0.2,
          Math.sin(angle) * emberSpeed * 0.2,
          'rgba(255, 220, 180, 0.7)',
          emberSize * 0.5,
          emberLife * 0.5
        );
        this.particles.push(glint);
      }
    }
  }

  spawnVolatileWarning(position) {
    const particles = this.getScaledParticleCount(6);
    for (let i = 0; i < particles; i += 1) {
      const angle = (i / particles) * Math.PI * 2;
      const speed = 20 + Math.random() * 15;
      const particle = this.createParticle(
        position.x,
        position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        'rgba(255, 120, 0, 0.45)',
        1.8 + Math.random() * 0.6,
        0.35 + Math.random() * 0.15,
        'spark'
      );
      this.particles.push(particle);
    }
  }

  createExplosionShockwave(data = {}) {
    if (!data.position) {
      return;
    }

    const radius = data.radius ?? 80;
    this.createShockwaveEffect({
      position: data.position,
      radius,
      duration: data.duration ?? 0.6,
      baseWidth: data.baseWidth ?? 18,
      maxAlpha: data.maxAlpha ?? 0.78,
      widthFade: data.widthFade ?? 0.45,
      easingPower: data.easingPower ?? 0.8,
      color: data.color ?? 'rgba(255, 180, 90, 1)',
      shadowColor: data.shadowColor ?? 'rgba(255, 130, 50, 0.75)',
      shadowBlur: data.shadowBlur ?? 34,
    });

    const innerScale = data.innerScale ?? 0.55;
    if (innerScale > 0) {
      this.createShockwaveEffect({
        position: data.position,
        radius: radius * innerScale,
        duration: data.innerDuration ?? 0.5,
        baseWidth: data.innerBaseWidth ?? 10,
        maxAlpha: data.innerMaxAlpha ?? 0.6,
        widthFade: data.innerWidthFade ?? 0.7,
        easingPower: data.innerEasingPower ?? 1.1,
        color: data.innerColor ?? 'rgba(255, 220, 200, 1)',
        shadowColor: data.innerShadowColor ?? 'rgba(255, 200, 160, 0.55)',
        shadowBlur: data.innerShadowBlur ?? 22,
        fillColor: data.innerFillColor ?? 'rgba(255, 210, 170, 0.12)',
      });
    }
  }

  createVolatileExplosionEffect(data) {
    if (!data || !data.position) {
      return;
    }

    const radius = data.radius ?? 70;
    const position = data.position;
    const intensity = Math.min(1.2, radius / 90);

    this.addScreenShake(7 + radius * 0.025, 0.32);
    this.addScreenFlash('rgba(255, 150, 70, 0.55)', 0.26, 0.24);

    this.createExplosionShockwave({
      position,
      radius: radius * 1.05,
    });

    const particleTotal = this.getScaledParticleCount(
      22 + Math.floor(radius / 5)
    );
    for (let i = 0; i < particleTotal; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (70 + Math.random() * 150) * (0.8 + intensity * 0.4);

      const flame = new SpaceParticle(
        position.x,
        position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        `rgba(255, ${Math.floor(140 + Math.random() * 70)}, ${Math.floor(
          40 + Math.random() * 40
        )}, ${0.7 + Math.random() * 0.2})`,
        2.4 + Math.random() * 1.8,
        0.38 + Math.random() * 0.24,
        'spark'
      );
      this.particles.push(flame);

      const debris = this.createParticle(
        position.x + (Math.random() - 0.5) * radius * 0.4,
        position.y + (Math.random() - 0.5) * radius * 0.4,
        Math.cos(angle) * speed * 0.6,
        Math.sin(angle) * speed * 0.6,
        '#5E1A0D',
        2 + Math.random() * 2,
        0.6 + Math.random() * 0.2,
        'debris'
      );
      this.particles.push(debris);
    }

    const smokeCount = this.getScaledParticleCount(10 + Math.floor(radius / 8));
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius * 0.55;
      const speed = 20 + Math.random() * 50;
      const smoke = new SpaceParticle(
        position.x + Math.cos(angle) * distance,
        position.y + Math.sin(angle) * distance,
        Math.cos(angle) * speed * 0.35,
        Math.sin(angle) * speed * 0.35,
        `rgba(60, 30, 20, ${0.25 + Math.random() * 0.18})`,
        3.5 + Math.random() * 3.5,
        0.85 + Math.random() * 0.5
      );
      this.particles.push(smoke);
    }

    this.particles.push(
      new SpaceParticle(
        position.x,
        position.y,
        0,
        0,
        'rgba(255, 200, 140, 0.5)',
        radius * 0.24,
        0.45 + Math.random() * 0.2
      )
    );
  }

  randomRange(min, max) {
    const start = Number.isFinite(min) ? min : 0;
    const end = Number.isFinite(max) ? max : start;
    if (end === start) {
      return start;
    }

    const low = Math.min(start, end);
    const high = Math.max(start, end);
    return low + Math.random() * (high - low);
  }

  reset() {
    this.particles = [];
    this.shockwaves = [];
    this.hitMarkers = [];
    this.screenShake.reset();
    this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
    this.screenFlash = {
      timer: 0,
      duration: 0,
      color: '#FFFFFF',
      intensity: 0,
    };
  }
}
