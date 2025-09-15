// Este sistema centraliza efeitos visuais e responde a eventos de jogo

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
    this.screenShake = { intensity: 0, duration: 0, timer: 0 };
    this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
    this.screenFlash = { timer: 0, duration: 0, color: '#FFFFFF', intensity: 0 };

    if (typeof gameServices !== 'undefined') {
      gameServices.register('effects', this);
    }

    this.setupEventListeners();

    console.log('[EffectsSystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents !== 'undefined') {
      gameEvents.on('thruster-effect', (data) => {
        this.spawnThrusterVFX(
          data.position.x,
          data.position.y,
          data.direction.x,
          data.direction.y,
          data.intensity,
          data.type
        );
      });
    }
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
    return deltaTime;
  }

  updateParticles(deltaTime) {
    this.particles = this.particles.filter((p) => p.update(deltaTime));
    if (this.particles.length > 150) {
      this.particles = this.particles.slice(-100);
    }
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

  addScreenShake(intensity, duration) {
    this.screenShake.intensity = Math.max(this.screenShake.intensity, intensity);
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

  spawnThrusterVFX(x, y, dirX, dirY, intensity = 1, type = 'main') {
    const i = Math.max(0, Math.min(1, intensity));
    let baseCount, speedBase, sizeRange, lifeRange, colorFn;

    switch (type) {
      case 'main':
        baseCount = 3;
        speedBase = 120;
        sizeRange = [2.0, 3.2];
        lifeRange = [0.22, 0.28];
        colorFn = () => `hsl(${18 + Math.random() * 22}, 100%, ${62 + Math.random() * 18}%)`;
        break;
      case 'aux':
        baseCount = 2;
        speedBase = 105;
        sizeRange = [1.8, 2.6];
        lifeRange = [0.18, 0.26];
        colorFn = () => `hsl(${200 + Math.random() * 25}, 100%, ${68 + Math.random() * 18}%)`;
        break;
      default: // 'side'
        baseCount = 2;
        speedBase = 110;
        sizeRange = [1.6, 2.2];
        lifeRange = [0.16, 0.22];
        colorFn = () => `hsl(${200 + Math.random() * 25}, 100%, ${70 + Math.random() * 18}%)`;
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
          x + (Math.random() - 0.5) * 3,
          y + (Math.random() - 0.5) * 3,
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
            x,
            y,
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
      if (this.audio && typeof this.audio.playBigExplosion === 'function') {
        this.audio.playBigExplosion();
      }
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
}
