import * as CONSTANTS from '../core/GameConstants.js';

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

export default class EffectsSystem {
  constructor(audio) {
    this.audio = audio;
    this.particles = [];
    this.shockwaves = [];
    this.screenShake = { intensity: 0, duration: 0, timer: 0 };
    this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
    this.screenFlash = {
      timer: 0,
      duration: 0,
      color: '#FFFFFF',
      intensity: 0,
    };

    if (typeof gameServices !== 'undefined') {
      gameServices.register('effects', this);
    }

    this.setupEventListeners();

    console.log('[EffectsSystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;

    gameEvents.on('thruster-effect', (data) => {
      if (!data || !data.position || !data.direction) return;

      this.spawnThrusterVFX(
        data.position.x,
        data.position.y,
        data.direction.x,
        data.direction.y,
        data.intensity,
        data.type
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

    gameEvents.on('enemy-destroyed', (data) => {
      if (data?.enemy) {
        this.createAsteroidExplosion(data.enemy);
      }
    });

    gameEvents.on('asteroid-crack-stage-changed', (data) => {
      if (data?.asteroid) {
        this.createCrackDebris(data.asteroid, data.stage);
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

      const player = gameServices.get('player');
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

    gameEvents.on('player-took-damage', () => {
      this.addScreenShake(8, 0.3);
    });

    gameEvents.on('shield-shockwave', (data) => {
      this.createShockwaveEffect(data);
      this.addScreenShake(10, 0.35);
      this.addScreenFlash('rgba(0, 191, 255, 0.35)', 0.25, 0.18);
    });

    gameEvents.on('shield-deflected', (data) => {
      this.createShieldHitEffect(data);
    });
  }

  update(deltaTime) {
    if (this.freezeFrame.timer > 0) {
      this.freezeFrame.timer -= deltaTime;
      if (this.freezeFrame.timer < 0) this.freezeFrame.timer = 0;
      deltaTime *= this.freezeFrame.fade;
    }

    if (this.screenShake.timer > 0) {
      this.screenShake.timer -= deltaTime;
      if (this.screenShake.timer <= 0) {
        this.screenShake.intensity = 0;
        this.screenShake.duration = 0;
      }
    }

    if (this.screenFlash.timer > 0) {
      this.screenFlash.timer -= deltaTime;
      if (this.screenFlash.timer < 0) this.screenFlash.timer = 0;
    }

    this.updateParticles(deltaTime);
    this.updateShockwaves(deltaTime);
    return deltaTime;
  }

  updateParticles(deltaTime) {
    this.particles = this.particles.filter((p) => p.update(deltaTime));
    if (this.particles.length > 150) {
      this.particles = this.particles.slice(-100);
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
    if (this.screenShake.timer > 0) {
      const shakeAmount =
        this.screenShake.intensity *
        (this.screenShake.timer / this.screenShake.duration);
      ctx.translate(
        (Math.random() - 0.5) * shakeAmount,
        (Math.random() - 0.5) * shakeAmount
      );
    }
  }

  draw(ctx) {
    this.particles.forEach((p) => p.draw(ctx));

    this.drawShockwaves(ctx);

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
        const blurBase = Number.isFinite(wave.shadowBlur) ? wave.shadowBlur : 25;
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
    this.screenShake.intensity = Math.max(
      this.screenShake.intensity,
      intensity
    );
    this.screenShake.duration = Math.max(this.screenShake.duration, duration);
    this.screenShake.timer = this.screenShake.duration;
  }

  addFreezeFrame(duration, fade = 0) {
    this.freezeFrame.timer = Math.max(this.freezeFrame.timer, duration);
    this.freezeFrame.duration = Math.max(this.freezeFrame.duration, duration);
    this.freezeFrame.fade = fade;
  }

  addScreenFlash(color, duration, intensity) {
    this.screenFlash.color = color;
    this.screenFlash.duration = duration;
    this.screenFlash.timer = duration;
    this.screenFlash.intensity = intensity;
  }

  spawnThrusterVFX(worldX, worldY, dirX, dirY, intensity = 1, type = 'main') {
    const i = Math.max(0, Math.min(1, intensity));
    let baseCount, speedBase, sizeRange, lifeRange, colorFn;

    switch (type) {
      case 'main':
        baseCount = 3;
        speedBase = 120;
        sizeRange = [2.0, 3.2];
        lifeRange = [0.22, 0.28];
        colorFn = () =>
          `hsl(${18 + Math.random() * 22}, 100%, ${62 + Math.random() * 18}%)`;
        break;
      case 'aux':
        baseCount = 2;
        speedBase = 105;
        sizeRange = [1.8, 2.6];
        lifeRange = [0.18, 0.26];
        colorFn = () =>
          `hsl(${200 + Math.random() * 25}, 100%, ${68 + Math.random() * 18}%)`;
        break;
      default: // 'side'
        baseCount = 2;
        speedBase = 110;
        sizeRange = [1.6, 2.2];
        lifeRange = [0.16, 0.22];
        colorFn = () =>
          `hsl(${200 + Math.random() * 25}, 100%, ${70 + Math.random() * 18}%)`;
    }

    const count = Math.max(1, Math.round(baseCount * (0.8 + i * 2.0)));

    for (let c = 0; c < count; c++) {
      const jitter = (Math.random() - 0.5) * 0.35;
      const spd = speedBase * (0.8 + i * 1.6) * (0.85 + Math.random() * 0.3);
      const vx = (-dirX + jitter) * spd + (Math.random() - 0.5) * 20;
      const vy = (-dirY + jitter) * spd + (Math.random() - 0.5) * 20;
      const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
      const life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);

      this.particles.push(
        new SpaceParticle(
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

      if (Math.random() < 0.25) {
        const sparkSpd = spd * (0.9 + Math.random() * 0.3);
        this.particles.push(
          new SpaceParticle(
            worldX,
            worldY,
            -dirX * sparkSpd,
            -dirY * sparkSpd,
            '#FFFFFF',
            1.2 + Math.random() * 0.8,
            0.08 + Math.random() * 0.06,
            'spark'
          )
        );
      }
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
    const widthFade =
      typeof data.widthFade === 'number' ? data.widthFade : 0.6;
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

    const particleCount = Math.round(12 + level * 2 + intensity * 4);
    for (let i = 0; i < particleCount; i += 1) {
      const spread = (Math.random() - 0.5) * Math.PI * 0.7;
      const angle = Math.atan2(-ny, -nx) + spread;
      const speed = 140 + Math.random() * 120 * intensity;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      this.particles.push(
        new SpaceParticle(
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

    const glow = new SpaceParticle(
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
    this.addScreenFlash(
      'rgba(0, 191, 255, 0.22)',
      0.12,
      0.18 + 0.04 * level
    );
  }

  createXPCollectEffect(x, y) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 40;
      const particle = new SpaceParticle(
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

    const particleCount = 12 + Math.min(24, tier * 4 + Math.floor(consumed / 2));

    for (let i = 0; i < particleCount; i += 1) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.3;
      const speed = 60 + Math.random() * 80;
      const particle = new SpaceParticle(
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

    const halo = new SpaceParticle(
      x,
      y,
      0,
      0,
      glowColor,
      5 + tier * 1.8,
      0.35 + tier * 0.07
    );
    this.particles.push(halo);

    const ringCount = 4 + tier;
    for (let i = 0; i < ringCount; i += 1) {
      const angle = (Math.PI * 2 * i) / ringCount;
      const speed = 40 + tier * 12;
      const particle = new SpaceParticle(
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

  createLevelUpExplosion(player) {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      const particle = new SpaceParticle(
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
    const particleCount = { large: 12, medium: 8, small: 5 }[asteroid.size];

    if (asteroid.size === 'small') {
      this.addScreenShake(2, 0.1);
    } else if (asteroid.size === 'medium') {
      this.addScreenShake(4, 0.15);
    } else if (asteroid.size === 'large') {
      this.addScreenShake(8, 0.25);
      this.addFreezeFrame(0.15, 0.2);
      this.addScreenFlash('#FF6B6B', 0.2, 0.1);
    }

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;

      const debris = new SpaceParticle(
        asteroid.x + (Math.random() - 0.5) * asteroid.radius,
        asteroid.y + (Math.random() - 0.5) * asteroid.radius,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        '#8B4513',
        2 + Math.random() * 3,
        0.6 + Math.random() * 0.4,
        'debris'
      );
      this.particles.push(debris);

      const spark = new SpaceParticle(
        asteroid.x,
        asteroid.y,
        Math.cos(angle) * speed * 1.3,
        Math.sin(angle) * speed * 1.3,
        `hsl(${Math.random() * 60 + 15}, 100%, 70%)`,
        1.5 + Math.random() * 1.5,
        0.3 + Math.random() * 0.2,
        'spark'
      );
      this.particles.push(spark);
    }
  }

  createCrackDebris(asteroid, stage = 1) {
    const intensity = Math.min(Math.max(stage, 1), 3);
    const sparks = 2 + intensity * 2;

    for (let i = 0; i < sparks; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 45;

      const spark = new SpaceParticle(
        asteroid.x + Math.cos(angle) * asteroid.radius * 0.4,
        asteroid.y + Math.sin(angle) * asteroid.radius * 0.4,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        'rgba(255, 235, 200, 0.85)',
        1 + Math.random() * 1.2,
        0.25 + Math.random() * 0.2,
        'spark'
      );
      this.particles.push(spark);
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
    const countMin = Array.isArray(countRange) ? countRange[0] ?? 2 : countRange;
    const countMax = Array.isArray(countRange) ? countRange[1] ?? countMin : countMin;
    const spawnCount = Math.max(
      1,
      Math.round(
        this.randomRange(countMin, countMax + totalIntensity * 1.2)
      )
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

      const spark = new SpaceParticle(
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

      if (Math.random() < 0.55) {
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

      if (Math.random() < 0.3) {
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
    const particles = 6;
    for (let i = 0; i < particles; i += 1) {
      const angle = (i / particles) * Math.PI * 2;
      const speed = 20 + Math.random() * 15;
      const particle = new SpaceParticle(
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

    const particleTotal = 22 + Math.floor(radius / 5);
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

      const debris = new SpaceParticle(
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

    const smokeCount = 10 + Math.floor(radius / 8);
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
    this.screenShake = { intensity: 0, duration: 0, timer: 0 };
    this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
    this.screenFlash = {
      timer: 0,
      duration: 0,
      color: '#FFFFFF',
      intensity: 0,
    };
  }
}
