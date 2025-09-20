// src/modules/EnemySystem.js
import * as CONSTANTS from '../core/GameConstants.js';

// === CLASSE ASTEROID (MOVIDA DO APP.JS) ===
class Asteroid {
  constructor(system, config = {}) {
    this.system = system;
    this.id = Date.now() + Math.random();
    this.size = config.size || 'small';
    this.variant = config.variant || 'common';
    this.wave = config.wave || 1;
    this.spawnedBy = config.spawnedBy ?? null;
    this.generation = config.generation ?? 0;

    this.radius = CONSTANTS.ASTEROID_SIZES[this.size] || 12;
    this.variantConfig =
      CONSTANTS.ASTEROID_VARIANTS[this.variant] ||
      CONSTANTS.ASTEROID_VARIANTS.common;
    this.behavior = this.variantConfig?.behavior || null;

    const baseMass = this.radius * this.radius * 0.05;
    this.mass = baseMass * (this.variantConfig?.massMultiplier ?? 1);

    const baseSpeed = CONSTANTS.ASTEROID_SPEEDS[this.size] || 40;
    const randomSpeed = baseSpeed * (0.8 + Math.random() * 0.4);
    const speedMultiplier = this.variantConfig?.speedMultiplier ?? 1;
    const finalSpeed = randomSpeed * speedMultiplier;

    this.x = config.x ?? 0;
    this.y = config.y ?? 0;

    if (Number.isFinite(config.vx) || Number.isFinite(config.vy)) {
      this.vx = (config.vx ?? 0) * speedMultiplier;
      this.vy = (config.vy ?? 0) * speedMultiplier;

      if (this.vx === 0 && this.vy === 0) {
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * finalSpeed;
        this.vy = Math.sin(angle) * finalSpeed;
      }
    } else {
      const angle = config.angle ?? Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * finalSpeed;
      this.vy = Math.sin(angle) * finalSpeed;
    }

    this.rotation = config.rotation ?? Math.random() * Math.PI * 2;
    this.rotationSpeed =
      (config.rotationSpeed ?? (Math.random() - 0.5) * 1.5) *
      (this.variantConfig?.rotationMultiplier ?? 1);

    const baseHealth =
      CONSTANTS.ASTEROID_BASE_HEALTH[this.size] ??
      CONSTANTS.ASTEROID_BASE_HEALTH.small ??
      10;
    const waveMultiplier = this.computeWaveHealthMultiplier(this.wave);
    const variantHP = this.variantConfig?.hpMultiplier ?? 1;

    this.maxHealth = Math.max(
      1,
      Math.round(baseHealth * waveMultiplier * variantHP)
    );
    this.health = this.maxHealth;

    this.lastDamageTime = 0;
    this.shieldHitCooldown = 0;
    this.destroyed = false;

    this.crackSeed = Math.floor(Math.random() * 1_000_000);
    this.crackStage = 0;
    this.crackLayers = this.generateCrackLayers();

    this.vertices = this.generateVertices();
    this.variantState = this.initializeVariantState();
  }

  computeWaveHealthMultiplier(wave) {
    const scaling = CONSTANTS.ASTEROID_HEALTH_SCALING || {};
    const perWave = scaling.perWave ?? 0;
    const maxMultiplier = scaling.maxMultiplier ?? 1;
    const waveIndex = Math.max(0, (wave || 1) - 1);
    const multiplier = 1 + perWave * waveIndex;
    return Math.min(multiplier, maxMultiplier);
  }

  initializeVariantState() {
    if (!this.behavior) {
      return {};
    }

    if (this.behavior.type === 'volatile') {
      return {
        fuseTimer: this.behavior.fuseTime ?? 0,
        armed: false,
        exploded: false,
      };
    }

    if (this.behavior.type === 'parasite') {
      return {
        attackCooldown: 0,
      };
    }

    return {};
  }

  createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  generateVertices() {
    const vertices = [];
    const seededRandom = this.createSeededRandom(this.crackSeed ^ 0x45f1);
    const numVertices = 7 + Math.floor(seededRandom() * 4);

    for (let i = 0; i < numVertices; i += 1) {
      const angle = (i / numVertices) * Math.PI * 2;
      const radiusVariation = 0.78 + seededRandom() * 0.42;
      const radius = this.radius * radiusVariation;
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }

    return vertices;
  }

  generateCrackLayers() {
    const thresholds = CONSTANTS.ASTEROID_CRACK_THRESHOLDS || [];
    if (!thresholds.length) return [];

    const layers = [];
    const seededRandom = this.createSeededRandom(this.crackSeed ^ 0x9e3779);

    for (let i = 0; i < thresholds.length; i += 1) {
      const lineCount = 3 + i * 2;
      const lines = [];

      for (let j = 0; j < lineCount; j += 1) {
        const startAngle = seededRandom() * Math.PI * 2;
        const offset = (seededRandom() - 0.5) * 0.9;
        const lengthFactor = 0.35 + seededRandom() * 0.5;
        const startRadius = this.radius * (0.25 + seededRandom() * 0.45);
        const endRadius = startRadius + this.radius * lengthFactor * (0.5 + seededRandom() * 0.5);

        lines.push({
          x1: Math.cos(startAngle) * startRadius,
          y1: Math.sin(startAngle) * startRadius,
          x2: Math.cos(startAngle + offset) * endRadius,
          y2: Math.sin(startAngle + offset) * endRadius,
          width: 0.6 + seededRandom() * 0.9,
        });
      }

      layers.push(lines);
    }

    return layers;
  }

  update(deltaTime) {
    if (this.destroyed) {
      return;
    }

    if (this.behavior?.type === 'parasite') {
      this.updateParasiteBehavior(deltaTime);
    }

    if (this.behavior?.type === 'volatile') {
      this.updateVolatileBehavior(deltaTime);
    }

    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.rotation += this.rotationSpeed * deltaTime;

    const margin = this.radius;
    if (this.x < -margin) this.x = CONSTANTS.GAME_WIDTH + margin;
    if (this.x > CONSTANTS.GAME_WIDTH + margin) this.x = -margin;
    if (this.y < -margin) this.y = CONSTANTS.GAME_HEIGHT + margin;
    if (this.y > CONSTANTS.GAME_HEIGHT + margin) this.y = -margin;

    if (this.lastDamageTime > 0) {
      this.lastDamageTime = Math.max(0, this.lastDamageTime - deltaTime);
    }

    if (this.shieldHitCooldown > 0) {
      this.shieldHitCooldown = Math.max(0, this.shieldHitCooldown - deltaTime);
    }
  }

  updateVolatileBehavior(deltaTime) {
    if (!this.variantState) {
      this.variantState = {};
    }

    if (typeof this.variantState.fuseTimer !== 'number') {
      return;
    }

    this.variantState.fuseTimer -= deltaTime;

    if (
      !this.variantState.armed &&
      typeof this.behavior?.armTime === 'number' &&
      this.variantState.fuseTimer <= this.behavior.armTime
    ) {
      this.variantState.armed = true;
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('asteroid-volatile-armed', {
          asteroid: this,
          position: { x: this.x, y: this.y },
        });
      }
    }

    if (this.variantState.fuseTimer <= 0 && !this.variantState.exploded) {
      this.variantState.exploded = true;
      if (this.system && typeof this.system.handleVolatileTimeout === 'function') {
        this.system.handleVolatileTimeout(this);
      }
    }
  }

  updateParasiteBehavior(deltaTime) {
    const behavior = this.behavior;
    if (!behavior) return;

    const player =
      typeof gameServices !== 'undefined' && gameServices.has('player')
        ? gameServices.get('player')
        : null;

    if (!player || !player.position) {
      return;
    }

    const dx = player.position.x - this.x;
    const dy = player.position.y - this.y;
    const distance = Math.hypot(dx, dy) || 0.0001;
    const dirX = dx / distance;
    const dirY = dy / distance;

    const acceleration = behavior.acceleration ?? 0;
    this.vx += dirX * acceleration * deltaTime;
    this.vy += dirY * acceleration * deltaTime;

    const maxSpeed = behavior.maxSpeed ?? Infinity;
    const currentSpeed = Math.hypot(this.vx, this.vy);
    if (currentSpeed > maxSpeed) {
      const scale = maxSpeed / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }

    const minDistance = behavior.minDistance ?? 0;
    if (distance < minDistance) {
      const repelStrength = (minDistance - distance) / Math.max(minDistance, 1);
      this.vx -= dirX * acceleration * repelStrength * deltaTime * 1.2;
      this.vy -= dirY * acceleration * repelStrength * deltaTime * 1.2;
    }

    if (!this.variantState) {
      this.variantState = { attackCooldown: 0 };
    }

    this.variantState.attackCooldown = Math.max(
      0,
      (this.variantState.attackCooldown || 0) - deltaTime
    );

    const playerRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : CONSTANTS.SHIP_SIZE;
    const attackRange =
      (behavior.minDistance ?? 0) + this.radius + playerRadius + 6;

    if (
      distance <= attackRange &&
      this.variantState.attackCooldown === 0 &&
      this.system &&
      typeof this.system.applyDirectDamageToPlayer === 'function'
    ) {
      const damage = behavior.contactDamage ?? 20;
      const result = this.system.applyDirectDamageToPlayer(damage, {
        cause: 'parasite',
        position: { x: this.x, y: this.y },
      });

      if (result?.applied) {
        this.variantState.attackCooldown = behavior.cooldown ?? 1.2;
      }
    }
  }

  updateCrackStage() {
    const thresholds = CONSTANTS.ASTEROID_CRACK_THRESHOLDS || [];
    if (!thresholds.length || this.maxHealth <= 0) {
      return;
    }

    const ratio = this.health / this.maxHealth;
    let newStage = 0;

    for (let i = 0; i < thresholds.length; i += 1) {
      if (ratio <= thresholds[i]) {
        newStage = i + 1;
      }
    }

    if (newStage !== this.crackStage) {
      this.crackStage = newStage;
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('asteroid-crack-stage-changed', {
          asteroid: this,
          stage: this.crackStage,
          ratio,
          variant: this.variant,
        });
      }
    }
  }

  takeDamage(damage) {
    if (this.destroyed) {
      return false;
    }

    const appliedDamage = Math.max(0, damage);
    if (appliedDamage <= 0) {
      return false;
    }

    this.health = Math.max(0, this.health - appliedDamage);
    this.lastDamageTime = 0.12;
    this.updateCrackStage();
    return this.health <= 0;
  }

  getVariantColors() {
    const fallback = {
      fill: { large: '#8B4513', medium: '#A0522D', small: '#CD853F' }[
        this.size
      ] || '#8B4513',
      stroke: '#654321',
      cracks: 'rgba(255, 255, 255, 0.45)',
    };

    const colors = this.variantConfig?.colors;
    if (!colors) {
      return fallback;
    }

    return {
      fill: colors.fill || fallback.fill,
      stroke: colors.stroke || fallback.stroke,
      cracks: colors.cracks || fallback.cracks,
      glow: colors.glow,
      innerGlow: colors.innerGlow,
      pulse: colors.pulse,
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const colors = this.getVariantColors();
    const isFlashing = this.lastDamageTime > 0;
    let fillStyle = colors.fill;

    if (this.behavior?.type === 'volatile' && !isFlashing) {
      const fuse = this.variantState?.fuseTimer ?? this.behavior?.fuseTime ?? 0;
      const normalizedFuse = Math.max(0, Math.min(fuse / (this.behavior?.fuseTime || 1), 1));
      const pulseIntensity = 1 - normalizedFuse;
      if (colors.pulse) {
        const baseColor = colors.fill;
        fillStyle = this.mixColor(baseColor, colors.pulse, pulseIntensity * 0.8);
      }
    }

    if (isFlashing) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#FFFFFF';
    } else {
      ctx.fillStyle = fillStyle;
      ctx.strokeStyle = colors.stroke;

      if (colors.glow || colors.innerGlow) {
        ctx.shadowColor = colors.glow || colors.innerGlow;
        ctx.shadowBlur = 12;
      }
    }

    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < this.vertices.length; i += 1) {
      const vertex = this.vertices[i];
      if (i === 0) {
        ctx.moveTo(vertex.x, vertex.y);
      } else {
        ctx.lineTo(vertex.x, vertex.y);
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (this.crackStage > 0 && !isFlashing) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = colors.cracks || 'rgba(255, 255, 255, 0.45)';

      for (let stage = 0; stage < this.crackStage; stage += 1) {
        const lines = this.crackLayers[stage];
        if (!lines) continue;

        lines.forEach((line) => {
          ctx.beginPath();
          ctx.moveTo(line.x1, line.y1);
          ctx.lineTo(line.x2, line.y2);
          ctx.lineWidth = line.width;
          ctx.stroke();
        });
      }
    }

    ctx.restore();
  }

  mixColor(baseColor, overlayColor, factor) {
    if (factor <= 0) return baseColor;
    if (factor >= 1) return overlayColor;

    const parseColor = (color) => {
      if (typeof color !== 'string') {
        return { r: 255, g: 255, b: 255 };
      }

      if (color.startsWith('#')) {
        const hex = color.slice(1);
        const bigint = parseInt(hex, 16);
        if (hex.length === 6) {
          return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
          };
        }
      }

      const rgbaMatch = color.match(/rgba?\s*\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgbaMatch) {
        return {
          r: Number.parseInt(rgbaMatch[1], 10) || 255,
          g: Number.parseInt(rgbaMatch[2], 10) || 255,
          b: Number.parseInt(rgbaMatch[3], 10) || 255,
        };
      }

      return { r: 255, g: 255, b: 255 };
    };

    const base = parseColor(baseColor);
    const overlay = parseColor(overlayColor);

    const mix = (component) =>
      Math.round(base[component] + (overlay[component] - base[component]) * factor);

    return `rgb(${mix('r')}, ${mix('g')}, ${mix('b')})`;
  }

  generateFragments() {
    if (this.size === 'small') {
      return [];
    }

    const newSize = this.size === 'large' ? 'medium' : 'small';
    const count = 2 + Math.floor(Math.random() * 2);
    const fragments = [];
    const baseSpeed = CONSTANTS.ASTEROID_SPEEDS[newSize] || 40;

    for (let i = 0; i < count; i += 1) {
      const angle =
        (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const speed = baseSpeed * (0.85 + Math.random() * 0.45);
      const distance = this.radius * (0.5 + Math.random() * 0.4);

      fragments.push({
        x: this.x + Math.cos(angle) * distance,
        y: this.y + Math.sin(angle) * distance,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: newSize,
        wave: this.wave,
        spawnedBy: this.id,
        generation: (this.generation ?? 0) + 1,
      });
    }

    return fragments;
  }
}

// === SISTEMA DE INIMIGOS ===
class EnemySystem {
  constructor() {
    this.asteroids = [];
    this.spawnTimer = 0;
    this.spawnDelay = 1.0;
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = false;

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('enemies', this);
    }

    this.setupEventListeners();

    console.log('[EnemySystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;

    gameEvents.on('shield-shockwave', (data) => {
      this.handleShockwave(data);
    });
  }

  createInitialWaveState() {
    return {
      current: 1,
      totalAsteroids: CONSTANTS.ASTEROIDS_PER_WAVE_BASE,
      asteroidsSpawned: 0,
      asteroidsKilled: 0,
      isActive: true,
      breakTimer: 0,
      completedWaves: 0,
      timeRemaining: CONSTANTS.WAVE_DURATION,
      spawnTimer: 0,
      spawnDelay: 1.0,
      initialSpawnDone: false,
    };
  }

  createInitialSessionStats() {
    return {
      totalKills: 0,
      timeElapsed: 0,
    };
  }

  // === UPDATE PRINCIPAL ===
  update(deltaTime) {
    if (!this.sessionActive) {
      return;
    }

    this.sessionStats.timeElapsed += deltaTime;

    this.updateAsteroids(deltaTime);
    this.updateWaveLogic(deltaTime);
    this.cleanupDestroyed();
  }

  updateWaveLogic(deltaTime) {
    const wave = this.waveState;

    if (!wave) return;

    if (wave.isActive) {
      wave.timeRemaining = Math.max(0, wave.timeRemaining - deltaTime);
      this.handleSpawning(deltaTime);

      const allAsteroidsKilled =
        wave.asteroidsKilled >= wave.totalAsteroids &&
        this.getAsteroids().length === 0;

      if (wave.timeRemaining <= 0 || allAsteroidsKilled) {
        this.completeCurrentWave();
      }
    } else if (wave.breakTimer > 0) {
      wave.breakTimer = Math.max(0, wave.breakTimer - deltaTime);

      if (wave.breakTimer === 0) {
        this.startNextWave();
      }
    }
  }

  // === GERENCIAMENTO DE ASTEROIDES ===
  updateAsteroids(deltaTime) {
    this.asteroids.forEach((asteroid) => {
      if (!asteroid.destroyed) {
        asteroid.update(deltaTime);
      }
    });

    // Física de colisão entre asteroides
    this.handleAsteroidCollisions();
  }

  handleAsteroidCollisions() {
    for (let i = 0; i < this.asteroids.length - 1; i++) {
      const a1 = this.asteroids[i];
      if (a1.destroyed) continue;

      for (let j = i + 1; j < this.asteroids.length; j++) {
        const a2 = this.asteroids[j];
        if (a2.destroyed) continue;

        this.checkAsteroidCollision(a1, a2);
      }
    }
  }

  checkAsteroidCollision(a1, a2) {
    const dx = a2.x - a1.x;
    const dy = a2.y - a1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = a1.radius + a2.radius;

    if (distance < minDistance && distance > 0) {
      const nx = dx / distance;
      const ny = dy / distance;

      // Correção de penetração
      const overlap = minDistance - distance;
      const percent = 0.5;
      a1.x -= nx * overlap * percent;
      a1.y -= ny * overlap * percent;
      a2.x += nx * overlap * percent;
      a2.y += ny * overlap * percent;

      // Impulso elástico com massa
      const rvx = a2.vx - a1.vx;
      const rvy = a2.vy - a1.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0) {
        const e = CONSTANTS.COLLISION_BOUNCE;
        const invMass1 = 1 / a1.mass;
        const invMass2 = 1 / a2.mass;
        const j = (-(1 + e) * velAlongNormal) / (invMass1 + invMass2);

        const jx = j * nx;
        const jy = j * ny;

        a1.vx -= jx * invMass1;
        a1.vy -= jy * invMass1;
        a2.vx += jx * invMass2;
        a2.vy += jy * invMass2;
      }

      // Rotação adicional
      a1.rotationSpeed += (Math.random() - 0.5) * 1.5;
      a2.rotationSpeed += (Math.random() - 0.5) * 1.5;
    }
  }

  // === SISTEMA DE SPAWNING ===
  handleSpawning(deltaTime) {
    const wave = this.waveState;
    if (!wave || !wave.isActive) {
      return;
    }

    this.spawnTimer -= deltaTime;

    if (this.shouldSpawn() && this.spawnTimer <= 0) {
      this.spawnAsteroid();
      this.spawnTimer = wave.spawnDelay * (0.5 + Math.random() * 0.5);
    }
  }

  shouldSpawn() {
    const wave = this.waveState;
    if (!wave || !wave.isActive) {
      return false;
    }

    return (
      wave.asteroidsSpawned < wave.totalAsteroids &&
      this.getAsteroids().length < CONSTANTS.MAX_ASTEROIDS_ON_SCREEN
    );
  }

  spawnAsteroid() {
    if (!this.sessionActive) return null;

    const side = Math.floor(Math.random() * 4);
    let x;
    let y;
    const margin = 80;

    switch (side) {
      case 0:
        x = Math.random() * CONSTANTS.GAME_WIDTH;
        y = -margin;
        break;
      case 1:
        x = CONSTANTS.GAME_WIDTH + margin;
        y = Math.random() * CONSTANTS.GAME_HEIGHT;
        break;
      case 2:
        x = Math.random() * CONSTANTS.GAME_WIDTH;
        y = CONSTANTS.GAME_HEIGHT + margin;
        break;
      default:
        x = -margin;
        y = Math.random() * CONSTANTS.GAME_HEIGHT;
        break;
    }

    let size;
    const rand = Math.random();
    if (rand < 0.5) size = 'large';
    else if (rand < 0.8) size = 'medium';
    else size = 'small';

    const waveNumber = this.waveState?.current || 1;
    const variant = this.decideVariant(size, {
      wave: waveNumber,
      spawnType: 'spawn',
    });

    const asteroid = new Asteroid(this, {
      x,
      y,
      size,
      variant,
      wave: waveNumber,
    });

    this.asteroids.push(asteroid);

    if (this.waveState && this.waveState.isActive) {
      this.waveState.asteroidsSpawned += 1;
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('enemy-spawned', {
        enemy: asteroid,
        type: 'asteroid',
        size,
        variant,
        wave: waveNumber,
        maxHealth: asteroid.maxHealth,
        position: { x, y },
      });
    }

    return asteroid;
  }

  applyDamage(asteroid, damage, options = {}) {
    if (!asteroid || typeof asteroid.takeDamage !== 'function') {
      return { killed: false, remainingHealth: 0, fragments: [] };
    }

    if (asteroid.destroyed) {
      return { killed: false, remainingHealth: 0, fragments: [] };
    }

    const killed = asteroid.takeDamage(damage);
    const remainingHealth = Math.max(0, asteroid.health);

    if (killed) {
      const fragments = this.destroyAsteroid(asteroid, {
        cause: options.cause || 'damage',
        createFragments: options.createFragments !== false,
        triggerExplosion: options.triggerExplosion,
      });
      return { killed: true, remainingHealth: 0, fragments };
    }

    return { killed: false, remainingHealth, fragments: [] };
  }

  // === GERENCIAMENTO DE DESTRUIÇÃO ===
  destroyAsteroid(asteroid, options = {}) {
    if (!asteroid || asteroid.destroyed) return [];

    const waveNumber = this.waveState?.current || asteroid.wave || 1;
    const createFragments = options.createFragments !== false;

    asteroid.destroyed = true;

    const fragmentDescriptors = createFragments
      ? asteroid.generateFragments()
      : [];
    const fragments = [];

    if (fragmentDescriptors.length > 0) {
      const fragmentVariants = this.assignVariantsToFragments(
        fragmentDescriptors,
        asteroid,
        waveNumber
      );

      fragmentDescriptors.forEach((descriptor, index) => {
        const fragment = new Asteroid(this, {
          ...descriptor,
          variant: fragmentVariants[index],
          wave: descriptor.wave || waveNumber,
        });
        this.asteroids.push(fragment);
        fragments.push(fragment);
      });

      if (this.waveState && this.waveState.isActive) {
        this.waveState.totalAsteroids += fragments.length;
        this.waveState.asteroidsSpawned += fragments.length;
      }
    }

    if (this.waveState) {
      this.waveState.asteroidsKilled += 1;
    }

    this.sessionStats.totalKills += 1;

    const shouldExplode =
      options.triggerExplosion === true ||
      (options.triggerExplosion !== false && this.isVolatileVariant(asteroid));

    if (shouldExplode) {
      this.triggerVolatileExplosion(asteroid, options.cause || 'destroyed');
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('enemy-destroyed', {
        enemy: asteroid,
        fragments,
        position: { x: asteroid.x, y: asteroid.y },
        size: asteroid.size,
        variant: asteroid.variant,
        maxHealth: asteroid.maxHealth,
        cause: options.cause || 'destroyed',
        wave: waveNumber,
        spawnedBy: asteroid.spawnedBy,
      });
    }

    if (this.waveState && this.waveState.isActive) {
      const allAsteroidsKilled =
        this.waveState.asteroidsKilled >= this.waveState.totalAsteroids &&
        this.getAsteroids().length === 0;

      if (allAsteroidsKilled && this.waveState.timeRemaining > 0) {
        this.completeCurrentWave();
      }
    }

    return fragments;
  }

  decideVariant(size, context = {}) {
    if (context.forcedVariant) {
      return context.forcedVariant;
    }

    const chanceConfig = CONSTANTS.ASTEROID_VARIANT_CHANCES || {};
    const variantConfig = CONSTANTS.ASTEROID_VARIANTS || {};
    const info = chanceConfig[size];

    if (!info) {
      return 'common';
    }

    const wave = context.wave ?? this.waveState?.current ?? 1;
    let chance = info.baseChance ?? 0;
    chance += this.computeVariantWaveBonus(wave);
    chance = Math.min(Math.max(chance, 0), 1);

    const distribution = { ...(info.distribution || {}) };

    Object.keys(distribution).forEach((key) => {
      const variant = variantConfig[key];
      const allowedSizes = variant?.allowedSizes;
      const minWave = variant?.availability?.minWave;

      const sizeAllowed =
        !Array.isArray(allowedSizes) || allowedSizes.includes(size);
      const waveAllowed =
        typeof minWave !== 'number' || wave >= minWave;
      const disallowed =
        Array.isArray(context.disallowedVariants) &&
        context.disallowedVariants.includes(key);

      if (!variant || !sizeAllowed || !waveAllowed || disallowed) {
        delete distribution[key];
      }
    });

    const availableKeys = Object.keys(distribution);
    if (!availableKeys.length || Math.random() > chance) {
      return 'common';
    }

    const totalWeight = availableKeys.reduce(
      (sum, key) => sum + (distribution[key] ?? 0),
      0
    );

    if (totalWeight <= 0) {
      return 'common';
    }

    let roll = Math.random() * totalWeight;
    for (let i = 0; i < availableKeys.length; i += 1) {
      const key = availableKeys[i];
      roll -= distribution[key];
      if (roll <= 0) {
        return key;
      }
    }

    return availableKeys[availableKeys.length - 1] || 'common';
  }

  computeVariantWaveBonus(wave) {
    const config = CONSTANTS.ASTEROID_VARIANT_CHANCES?.waveBonus;
    if (!config) return 0;

    const startWave = config.startWave ?? Infinity;
    if (wave < startWave) {
      return 0;
    }

    const increment = config.increment ?? 0;
    const maxBonus = config.maxBonus ?? 0;
    const extraWaves = Math.max(0, wave - startWave + 1);
    return Math.min(maxBonus, extraWaves * increment);
  }

  assignVariantsToFragments(fragments, parent, wave) {
    if (!Array.isArray(fragments) || fragments.length === 0) {
      return [];
    }

    const variants = new Array(fragments.length).fill('common');

    if (parent?.size === 'large') {
      const denseChance = Math.min(1, 0.3 + this.computeVariantWaveBonus(wave));
      if (Math.random() < denseChance) {
        const denseIndex = Math.floor(Math.random() * fragments.length);
        variants[denseIndex] = 'denseCore';
      }
    }

    for (let i = 0; i < fragments.length; i += 1) {
      if (variants[i] !== 'common') {
        continue;
      }

      const fragment = fragments[i];
      const disallowed = [];

      if (parent?.size === 'large' && variants.includes('denseCore')) {
        disallowed.push('denseCore');
      }

      variants[i] = this.decideVariant(fragment.size, {
        wave,
        spawnType: 'fragment',
        parent,
        disallowedVariants: disallowed,
      });
    }

    return variants;
  }

  isVolatileVariant(asteroid) {
    if (!asteroid) return false;
    const variant =
      CONSTANTS.ASTEROID_VARIANTS?.[asteroid.variant] ||
      CONSTANTS.ASTEROID_VARIANTS?.common;
    return variant?.behavior?.type === 'volatile';
  }

  triggerVolatileExplosion(asteroid, cause = 'destroyed') {
    if (!asteroid) return;

    const variant =
      CONSTANTS.ASTEROID_VARIANTS?.[asteroid.variant] ||
      CONSTANTS.ASTEROID_VARIANTS?.common;
    const explosion = variant?.behavior?.explosion;

    if (!explosion) {
      return;
    }

    const radius = explosion.radius ?? 0;
    const damage = explosion.damage ?? 0;
    if (radius <= 0 || damage <= 0) {
      return;
    }

    const radiusSq = radius * radius;

    this.asteroids.forEach((target) => {
      if (!target || target === asteroid || target.destroyed) {
        return;
      }

      const dx = target.x - asteroid.x;
      const dy = target.y - asteroid.y;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq <= radiusSq) {
        this.applyDamage(target, damage, {
          cause: 'volatile-explosion',
          sourceId: asteroid.id,
        });
      }
    });

    this.applyDirectDamageToPlayer(damage, {
      cause: 'volatile-explosion',
      position: { x: asteroid.x, y: asteroid.y },
      radius,
    });

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('asteroid-volatile-exploded', {
        asteroid,
        position: { x: asteroid.x, y: asteroid.y },
        radius,
        damage,
        cause,
      });
    }
  }

  handleVolatileTimeout(asteroid) {
    if (!asteroid || asteroid.destroyed) {
      return;
    }

    this.destroyAsteroid(asteroid, {
      createFragments: false,
      cause: 'self-destruct',
      triggerExplosion: true,
    });
  }

  applyDirectDamageToPlayer(amount, context = {}) {
    if (typeof gameServices === 'undefined' || !gameServices.has('player')) {
      return { applied: false };
    }

    const player = gameServices.get('player');
    if (!player || typeof player.takeDamage !== 'function') {
      return { applied: false };
    }

    if (Number.isFinite(player.invulnerableTimer) && player.invulnerableTimer > 0) {
      return { applied: false };
    }

    const remaining = player.takeDamage(amount);
    if (typeof remaining !== 'number') {
      return { applied: false, absorbed: true };
    }

    if (typeof player.setInvulnerableTimer === 'function') {
      player.setInvulnerableTimer(0.5);
    } else {
      player.invulnerableTimer = 0.5;
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-took-damage', {
        damage: amount,
        remaining,
        max: player.maxHealth,
        position: { ...player.position },
        cause: context.cause || 'enemy',
      });
    }

    if (remaining <= 0 && gameServices.has('world')) {
      const world = gameServices.get('world');
      if (world && typeof world.handlePlayerDeath === 'function') {
        if (world.playerAlive !== false) {
          world.handlePlayerDeath();
        }
      }
    }

    return { applied: true, remaining };
  }

  cleanupDestroyed() {
    const countBefore = this.asteroids.length;
    this.asteroids = this.asteroids.filter((asteroid) => !asteroid.destroyed);

    if (this.asteroids.length !== countBefore) {
      // Debug
      // console.log(`[EnemySystem] Cleaned up ${countBefore - this.asteroids.length} asteroids`);
    }
  }

  // === GETTERS PÚBLICOS ===
  getAsteroids() {
    return this.asteroids.filter((asteroid) => !asteroid.destroyed);
  }

  getAllAsteroids() {
    return [...this.asteroids];
  }

  getAsteroidCount() {
    return this.asteroids.filter((asteroid) => !asteroid.destroyed).length;
  }

  render(ctx) {
    if (!ctx) return;

    this.asteroids.forEach((asteroid) => {
      if (!asteroid.destroyed && typeof asteroid.draw === 'function') {
        asteroid.draw(ctx);
      }
    });
  }

  // === INTERFACE PARA OUTROS SISTEMAS ===
  spawnInitialAsteroids(count = 4) {
    if (!this.waveState) return;

    const remaining = Math.max(
      0,
      this.waveState.totalAsteroids - this.waveState.asteroidsSpawned
    );

    const spawnCount = Math.min(count, remaining);

    for (let i = 0; i < spawnCount; i++) {
      this.spawnAsteroid();
    }

    this.waveState.initialSpawnDone = true;
    console.log(`[EnemySystem] Spawned ${spawnCount} initial asteroids`);
  }

  // === RESET E CLEANUP ===
  reset() {
    this.asteroids = [];
    this.spawnTimer = 0;
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = true;

    this.spawnInitialAsteroids(4);
    console.log('[EnemySystem] Reset');
  }

  destroy() {
    this.asteroids = [];
    this.sessionActive = false;
    console.log('[EnemySystem] Destroyed');
  }

  stop() {
    this.sessionActive = false;
  }

  completeCurrentWave() {
    if (!this.waveState) return;

    const wave = this.waveState;
    if (!wave.isActive) return;

    wave.isActive = false;
    wave.breakTimer = CONSTANTS.WAVE_BREAK_TIME;
    wave.completedWaves += 1;
    wave.spawnTimer = 0;
    wave.initialSpawnDone = false;

    this.grantWaveRewards();

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('wave-completed', {
        wave: wave.current,
        completedWaves: wave.completedWaves,
        breakTimer: wave.breakTimer,
      });
    }
  }

  startNextWave() {
    if (!this.waveState) return;

    const wave = this.waveState;
    wave.current += 1;
    wave.totalAsteroids = Math.floor(
      CONSTANTS.ASTEROIDS_PER_WAVE_BASE *
        Math.pow(CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER, wave.current - 1)
    );
    wave.totalAsteroids = Math.min(wave.totalAsteroids, 25);
    wave.asteroidsSpawned = 0;
    wave.asteroidsKilled = 0;
    wave.isActive = true;
    wave.timeRemaining = CONSTANTS.WAVE_DURATION;
    wave.spawnTimer = 1.0;
    wave.spawnDelay = Math.max(0.8, 2.0 - wave.current * 0.1);
    wave.initialSpawnDone = false;

    this.spawnInitialAsteroids(4);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('wave-started', {
        wave: wave.current,
        totalAsteroids: wave.totalAsteroids,
      });
    }
  }

  grantWaveRewards() {
    const progression =
      typeof gameServices !== 'undefined' && gameServices.has('progression')
        ? gameServices.get('progression')
        : null;
    const player =
      typeof gameServices !== 'undefined' && gameServices.has('player')
        ? gameServices.get('player')
        : null;

    if (!progression || !player) return;

    const orbCount = 4 + Math.floor(this.waveState.current / 2);

    for (let i = 0; i < orbCount; i++) {
      const angle = (i / orbCount) * Math.PI * 2;
      const distance = 100;
      progression.createXPOrb(
        player.position.x + Math.cos(angle) * distance,
        player.position.y + Math.sin(angle) * distance,
        20 + this.waveState.current * 5
      );
    }
  }

  getWaveState() {
    if (!this.waveState) return null;

    return { ...this.waveState };
  }

  getSessionStats() {
    return { ...this.sessionStats };
  }

  handleShockwave(data) {
    if (!data || !data.position) {
      return;
    }

    const radius =
      typeof data.radius === 'number'
        ? data.radius
        : CONSTANTS.SHIELD_SHOCKWAVE_RADIUS;
    const force =
      typeof data.force === 'number'
        ? data.force
        : CONSTANTS.SHIELD_SHOCKWAVE_FORCE;

    const radiusSq = radius * radius;
    const originX = data.position.x;
    const originY = data.position.y;

    this.asteroids.forEach((asteroid) => {
      if (!asteroid || asteroid.destroyed) {
        return;
      }

      const dx = asteroid.x - originX;
      const dy = asteroid.y - originY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq > radiusSq || distanceSq === 0) {
        return;
      }

      const distance = Math.sqrt(distanceSq);
      const falloff = 1 - Math.min(distance / radius, 1);
      const impulse = (force * falloff) / Math.max(asteroid.mass, 1);
      const nx = dx / Math.max(distance, 0.001);
      const ny = dy / Math.max(distance, 0.001);

      asteroid.vx += nx * impulse;
      asteroid.vy += ny * impulse;
      asteroid.rotationSpeed += (Math.random() - 0.5) * 4 * falloff;
      asteroid.lastDamageTime = Math.max(asteroid.lastDamageTime, 0.12);
    });
  }
}

export { EnemySystem, Asteroid };
