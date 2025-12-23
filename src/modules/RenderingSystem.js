import { GAME_HEIGHT, GAME_WIDTH, SHIP_SIZE } from '../core/GameConstants.js';
import RenderBatch from '../core/RenderBatch.js';
import CanvasStateManager from '../core/CanvasStateManager.js';
import GradientCache from '../core/GradientCache.js';
import RandomService from '../core/RandomService.js';
import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { GameDebugLogger } from '../utils/dev/GameDebugLogger.js';
import { MAGNETISM_RADIUS } from '../data/constants/gameplay.js';
import { normalize as normalizeVector } from '../utils/vectorHelpers.js';

// [NEO-ARCADE] Shield Visual Constants
const SHIELD_HEX_SIZE = 24;

const MAX_VISUAL_TILT = 0.3;
const TILT_MULTIPLIER = 0.12;
const MIN_OUTLINE_POINTS = 3;
const EPSILON = 1e-6;

function computePolygonArea(points) {
  if (!Array.isArray(points) || points.length < MIN_OUTLINE_POINTS) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return area / 2;
}

function expandHullOutline(outline, padding) {
  if (!Array.isArray(outline) || outline.length < MIN_OUTLINE_POINTS) {
    return null;
  }

  if (!padding) {
    return outline.map((point) => ({ x: point.x, y: point.y }));
  }

  const orientation = computePolygonArea(outline) >= 0 ? 1 : -1;
  const expanded = [];

  for (let i = 0; i < outline.length; i += 1) {
    const prev = outline[(i - 1 + outline.length) % outline.length];
    const curr = outline[i];
    const next = outline[(i + 1) % outline.length];

    if (!curr) {
      expanded.push({ x: 0, y: 0 });
      continue;
    }

    const edgePrev = normalizeVector(curr.x - prev.x, curr.y - prev.y);
    const edgeNext = normalizeVector(next.x - curr.x, next.y - curr.y);

    const normalPrev = {
      x: -edgePrev.y * orientation,
      y: edgePrev.x * orientation,
    };
    const normalNext = {
      x: -edgeNext.y * orientation,
      y: edgeNext.x * orientation,
    };

    const normalSum = normalizeVector(
      normalPrev.x + normalNext.x,
      normalPrev.y + normalNext.y
    );

    const cross =
      (curr.x - prev.x) * (next.y - curr.y) -
      (curr.y - prev.y) * (next.x - curr.x);
    const isConcave = orientation > 0 ? cross < 0 : cross > 0;

    let offsetDir =
      normalSum.length > EPSILON
        ? normalSum
        : normalizeVector(normalPrev.x, normalPrev.y);

    if (isConcave) {
      const radial = normalizeVector(curr.x, curr.y);
      if (radial.length > EPSILON) {
        offsetDir = radial;
      }
    }

    const denom = offsetDir.x * normalPrev.x + offsetDir.y * normalPrev.y;
    const safeDenom =
      Math.abs(denom) > EPSILON ? denom : denom >= 0 ? EPSILON : -EPSILON;

    const scale = padding / safeDenom;

    expanded.push({
      x: curr.x + offsetDir.x * scale,
      y: curr.y + offsetDir.y * scale,
    });
  }

  return expanded;
}

function buildPathFromPoints(points) {
  if (!Array.isArray(points) || points.length < MIN_OUTLINE_POINTS) {
    return null;
  }

  const path = new Path2D();
  let moved = false;

  points.forEach((point) => {
    if (!point) return;
    if (!moved) {
      path.moveTo(point.x, point.y);
      moved = true;
    } else {
      path.lineTo(point.x, point.y);
    }
  });

  if (!moved) {
    return null;
  }

  path.closePath();
  return path;
}

function computeOutlineRadius(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return 0;
  }

  return points.reduce((max, point) => {
    if (!point) return max;
    const radius = Math.hypot(point.x, point.y);
    return radius > max ? radius : max;
  }, 0);
}

const SPACE_SKY_RANDOM_SEED = 'rendering:starfield';

function resolveDevicePixelRatio() {
  if (typeof window === 'undefined') {
    return 1;
  }

  const ratio = Number(window.devicePixelRatio) || 1;
  return Math.max(1, Math.min(2, ratio));
}


// [NEO-ARCADE] Multi-Plane 2.5D Parallax Starfield
// Replaces 3D projection with robust 2D layer scrolling for guaranteed visibility
class SpaceSkyBackground {
  constructor(randomGenerator = null) {
    this.random = this.resolveRandomGenerator(randomGenerator);
    this.width = 0;
    this.height = 0;

    // Configuration
    this.layers = [
      {
        speed: 0.1,
        count: 150,
        sizeMin: 1.5,
        sizeMax: 2.5,
        colorRate: 0.1,
        stars: [],
      }, // Background (Slow, Small)
      {
        speed: 0.3,
        count: 200,
        sizeMin: 2.5,
        sizeMax: 4.0,
        colorRate: 0.3,
        stars: [],
      }, // Midground
      {
        speed: 0.6,
        count: 100,
        sizeMin: 4.0,
        sizeMax: 6.0,
        colorRate: 0.6,
        stars: [],
      }, // Foreground (Fast, Big)
    ];

    this.stars = [];
    this.initialized = false;
  }

  resolveRandomGenerator(randomGenerator) {
    if (randomGenerator && typeof randomGenerator.float === 'function') {
      return randomGenerator;
    }
    return new RandomService(SPACE_SKY_RANDOM_SEED);
  }

  randomFloat() {
    if (this.random && typeof this.random.float === 'function') {
      return this.random.float();
    }
    return Math.random();
  }

  randomRange(min, max) {
    if (this.random && typeof this.random.range === 'function') {
      return this.random.range(min, max);
    }
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + this.randomFloat() * (high - low);
  }

  randomInt(min, max) {
    if (this.random && typeof this.random.int === 'function') {
      return this.random.int(min, max);
    }
    return Math.floor(this.randomRange(min, max + 1));
  }

  randomChance(probability) {
    if (this.random && typeof this.random.chance === 'function') {
      return this.random.chance(probability);
    }
    return this.randomFloat() < probability;
  }

  // Required by RenderingSystem.onReset() - reassigns random generator and rebuilds stars
  reseed(randomGenerator) {
    this.random = this.resolveRandomGenerator(randomGenerator);
    this.initialized = false; // Force rebuild on next render
    if (this.width > 0 && this.height > 0) {
      this.rebuild();
    }
  }

  resize(width, height) {
    // Rebuild if: not initialized, or dimensions changed significantly
    const dimensionsChanged =
      Math.abs(this.width - width) > 10 || Math.abs(this.height - height) > 10;

    if (!this.initialized || dimensionsChanged) {
      this.width = width;
      this.height = height;
      this.rebuild();
    }
  }

  rebuild() {
    // Use actual dimensions with fallback
    const w = this.width > 0 ? this.width : 800;
    const h = this.height > 0 ? this.height : 600;

    // 1. Rebuild Stars
    this.stars = [];
    this.layers.forEach((layer, layerIndex) => {
      layer.stars = [];
      for (let i = 0; i < layer.count; i++) {
        const star = {
          x: this.randomRange(0, w),
          y: this.randomRange(0, h),
          size:
            layer.sizeMin +
            this.randomFloat() * (layer.sizeMax - layer.sizeMin),
          speed: layer.speed,
          layerIndex,
          color: this.pickNeonColor(layer.colorRate),
          phase: this.randomFloat() * Math.PI * 2,
          blinkSpeed: 1 + this.randomFloat() * 2,
          jitter: this.randomFloat(),
        };
        layer.stars.push(star);
        this.stars.push(star);
      }
    });

    // 2. Generate Nebula Clouds (Deep Atmosphere)
    this.nebulaClouds = [];
    const cloudCount = 15;
    const colors = [
      'rgba(60, 0, 100, 0.04)', // Deep Purple
      'rgba(0, 40, 100, 0.04)', // Deep Blue
      'rgba(100, 0, 60, 0.03)', // Magenta Haze
      'rgba(0, 80, 80, 0.03)', // Cyan Haze
    ];

    for (let i = 0; i < cloudCount; i++) {
      this.nebulaClouds.push({
        x: this.randomRange(0, w),
        y: this.randomRange(0, h),
        radius: 300 + this.randomFloat() * 500,
        color: colors[this.randomInt(0, colors.length - 1)],
        vx: (this.randomFloat() - 0.5) * 5, // Very slow drift
        vy: (this.randomFloat() - 0.5) * 5,
        phase: this.randomFloat() * Math.PI * 2,
      });
    }

    this.initialized = true;
  }

  // Generate neon colors with Math.random() to avoid RandomService issues
  pickNeonColor(vibranceChance) {
    if (this.randomChance(vibranceChance)) {
      const palette = [
        { r: 0, g: 255, b: 255 }, // Cyan
        { r: 255, g: 0, b: 255 }, // Magenta
        { r: 100, g: 255, b: 100 }, // Neon Green
        { r: 255, g: 200, b: 50 }, // Gold
      ];
      return palette[this.randomInt(0, palette.length - 1)];
    }
    // White/blue tinted stars
    return { r: 220, g: 235, b: 255 };
  }

  render(ctx, options = {}) {
    if (!ctx) return;

    const width = options.width || ctx.canvas.width;
    const height = options.height || ctx.canvas.height;

    if (!this.initialized || this.width !== width || this.height !== height) {
      this.resize(width, height);
    }

    // 1. Clear background - deep space
    ctx.fillStyle = '#030810';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw subtle nebula clouds
    this.drawNebula(ctx);

    // 3. Update & draw stars
    // Safeguard against NaN velocity - check both {vx,vy} and {x,y} formats
    const rawVelocity = options.velocity || {};
    const vx = Number.isFinite(rawVelocity.vx)
      ? rawVelocity.vx
      : Number.isFinite(rawVelocity.x)
        ? rawVelocity.x
        : 0;
    const vy = Number.isFinite(rawVelocity.vy)
      ? rawVelocity.vy
      : Number.isFinite(rawVelocity.y)
        ? rawVelocity.y
        : 0;

    const dt = 16 / 1000;
    const time = Date.now() / 1000;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // Additive blending for neon glow

    this.stars.forEach((star) => {
      // Parallax movement - opposite to player velocity
      star.x -= vx * star.speed * dt;
      star.y -= vy * star.speed * dt;

      // Wrap around screen edges
      if (star.x < -10) star.x += width + 20;
      if (star.x > width + 10) star.x -= width + 20;
      if (star.y < -10) star.y += height + 20;
      if (star.y > height + 10) star.y -= height + 20;

      // Twinkle effect
      const blink = Math.sin(time * star.blinkSpeed + star.phase);
      const alpha = 0.6 + 0.4 * blink;

      // Neon color with glow
      const c = star.color;
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;

      // Draw diamond shape
      const r = star.size / 2;
      ctx.beginPath();
      ctx.moveTo(star.x, star.y - r);
      ctx.lineTo(star.x + r, star.y);
      ctx.lineTo(star.x, star.y + r);
      ctx.lineTo(star.x - r, star.y);
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();

    // 4. Vignette overlay
    this.drawVignette(ctx, width, height);
  }

  drawNebula(ctx) {
    if (!this.nebulaClouds) return;

    const time = Date.now() / 1000;
    const width = this.width;
    const height = this.height;

    this.nebulaClouds.forEach((cloud) => {
      // Slow drift
      let x = cloud.x + cloud.vx * time;
      let y = cloud.y + cloud.vy * time;

      // Wrap
      x = ((x % width) + width) % width;
      y = ((y % height) + height) % height;

      // Pulse size slightly
      const r = cloud.radius * (0.9 + 0.2 * Math.sin(time * 0.2 + cloud.phase));

      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, cloud.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      // Draw larger rect to cover gradient area
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }

  drawVignette(ctx, width, height) {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.4,
      width / 2,
      height / 2,
      Math.hypot(width, height) * 0.7
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}

class RenderingSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      enableRandomManagement: true,
      systemName: 'RenderingSystem',
      serviceName: 'renderer',
      randomForkLabels: {
        base: 'rendering.base',
        starfield: 'rendering.starfield',
        assets: 'rendering.assets',
      },
    });

    this.spaceSky = new SpaceSkyBackground(this.getRandomFork('starfield'));
    // [NEO-ARCADE] New 3D Starfield does not require legacy parallax/velocity configuration

    // Batch rendering optimization systems
    this.renderBatch = new RenderBatch();
    this.stateManager = new CanvasStateManager();
    this.gradientCache = new GradientCache();

    // Performance tracking
    this.renderStats = {
      frameCount: 0,
      lastStatsTime: performance.now(),
      avgFrameTime: 0,
      batchEfficiency: 0,
    };

    this.cachedPlayer = null;
    this.cachedProgression = null;
    this.cachedXPOrbs = null;
    this.cachedHealthHearts = null;
    this.cachedEffects = null;
    this.cachedCombat = null;
    this.cachedEnemies = null;
    this.cachedUI = null;

    this._lastEnemyRenderLog = 0;
    this._loggedBossRenderIds = new Set();

    this._loggedBossRenderIds = new Set();

    this.shieldVisualCache = {
      signature: '',
      patternCanvas: null, // [NEO-ARCADE] Cache for hex pattern
      path: null,
      radius: SHIP_SIZE,
      padding: 0,
    };
    this.shieldGradientCache = {
      radius: 0,
      ratio: 0,
      canvas: null,
      context: null,
      size: 0,
    };

    // Initialize state manager with common presets
    this.stateManager.createPreset('starfield', {
      fillStyle: 'rgba(255, 255, 255, 0.8)',
      strokeStyle: 'transparent',
      globalAlpha: 1,
      shadowBlur: 0,
    });

    this.resolveCachedServices(
      {
        cachedPlayer: 'player',
        cachedProgression: 'progression',
        cachedXPOrbs: 'xp-orbs',
        cachedHealthHearts: 'healthHearts',
        cachedEffects: 'effects',
        cachedCombat: 'combat',
        cachedEnemies: 'enemies',
        cachedUI: 'ui',
      },
      { force: true }
    );
  }

  onReset() {
    if (this.spaceSky) {
      const starfieldRandom = this.getRandomFork('starfield');
      this.spaceSky.reseed(starfieldRandom);
    }
  }

  render(ctx) {
    if (!ctx) return;

    const frameStart = performance.now();

    // Initialize state manager if needed
    if (!this.stateManager.currentState.fillStyle) {
      this.stateManager.initialize(ctx);
      this.gradientCache.preloadGradients(ctx);
    }

    ctx.save();

    this.resolveCachedServices({
      cachedPlayer: 'player',
      cachedProgression: 'progression',
      cachedXPOrbs: 'xp-orbs',
      cachedHealthHearts: 'healthHearts',
      cachedEffects: 'effects',
      cachedCombat: 'combat',
      cachedEnemies: 'enemies',
      cachedUI: 'ui',
    });

    const effects = this.cachedEffects;
    if (effects && typeof effects.applyScreenShake === 'function') {
      effects.applyScreenShake(ctx);
    }

    const player = this.cachedPlayer;
    const playerVelocity =
      typeof player?.getVelocity === 'function'
        ? player.getVelocity()
        : player?.velocity || null;

    // Optimized rendering with batching
    this.renderOptimized(ctx, player, playerVelocity);

    ctx.restore();

    // Update performance stats
    this.updateRenderStats(frameStart);
  }

  renderOptimized(ctx, player, playerVelocity) {
    // Background phase
    this.stateManager.transitionToPhase(ctx, 'background');
    this.drawBackground(ctx, playerVelocity);

    // Objects phase - batch similar objects
    this.stateManager.transitionToPhase(ctx, 'objects');

    // XP Orbs
    const xpOrbs = this.cachedXPOrbs;
    if (xpOrbs && typeof xpOrbs.render === 'function') {
      xpOrbs.render(ctx);
    }

    // Health Hearts
    const healthHearts = this.cachedHealthHearts;
    if (healthHearts && typeof healthHearts.render === 'function') {
      healthHearts.render(ctx);
    }

    // Combat (bullets)
    const combat = this.cachedCombat;
    if (combat && typeof combat.render === 'function') {
      combat.render(ctx);
    }

    // Enemies
    const enemies = this.cachedEnemies;
    if (enemies) {
      if (typeof enemies.render === 'function') {
        enemies.render(ctx);
      }

      this.logEnemyRenderLoop(enemies);
      this.renderBossEntities(ctx, enemies);
    }

    // Player
    if (player) {
      this.renderPlayer(ctx, player);
    }

    // UI Elements
    this.stateManager.transitionToPhase(ctx, 'ui');
    this.drawMagnetismField(ctx, player, xpOrbs);

    // Effects phase
    this.stateManager.transitionToPhase(ctx, 'effects');
    const effects = this.cachedEffects;
    if (effects && typeof effects.draw === 'function') {
      effects.draw(ctx);
    }
  }

  logEnemyRenderLoop(enemies) {
    if (!enemies) {
      return;
    }

    const now = Date.now();
    if (this._lastEnemyRenderLog && now - this._lastEnemyRenderLog < 1000) {
      return;
    }

    const collection = this.resolveEnemyCollection(enemies);
    const enemyTypes = collection
      .filter((enemy) => enemy && !enemy.destroyed)
      .map((enemy) => enemy.type || 'unknown');

    const typeCounts = enemyTypes.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    GameDebugLogger.log('RENDER', 'Enemy render loop', {
      totalEnemies: enemyTypes.length,
      types: typeCounts,
    });

    this._lastEnemyRenderLog = now;
  }

  renderBossEntities(ctx, enemies) {
    if (!ctx || !enemies) {
      return;
    }

    const collection = this.resolveEnemyCollection(enemies);
    if (!Array.isArray(collection) || collection.length === 0) {
      this._loggedBossRenderIds.clear();
      return;
    }

    const activeBosses = collection.filter(
      (enemy) => enemy && !enemy.destroyed && enemy.type === 'boss'
    );

    if (activeBosses.length === 0) {
      if (this._loggedBossRenderIds.size > 0) {
        this._loggedBossRenderIds.clear();
      }
      return;
    }

    const activeIds = new Set(activeBosses.map((boss) => boss?.id));
    this._loggedBossRenderIds.forEach((id) => {
      if (!activeIds.has(id)) {
        this._loggedBossRenderIds.delete(id);
      }
    });

    activeBosses.forEach((boss) => {
      if (!boss) return;

      if (boss.id && !this._loggedBossRenderIds.has(boss.id)) {
        GameDebugLogger.log('RENDER', 'Boss first render', {
          id: boss.id,
          position: { x: boss.x, y: boss.y },
          radius: boss.radius,
          phase: boss.currentPhase,
          hasOnDraw: typeof boss.onDraw === 'function',
        });
        this._loggedBossRenderIds.add(boss.id);
      }

      if (typeof boss.onDraw === 'function') {
        boss.onDraw(ctx);
        return;
      }

      this.drawBossFallback(ctx, boss);
    });
  }

  resolveEnemyCollection(enemies) {
    if (!enemies) {
      return [];
    }

    try {
      if (typeof enemies.getAllEnemies === 'function') {
        const all = enemies.getAllEnemies();
        if (Array.isArray(all)) {
          return all;
        }
      }
    } catch (error) {
      // Ignore errors when accessing enemy collections
    }

    const candidates = [
      enemies.asteroids,
      enemies.enemies,
      enemies.activeEnemies,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  drawBossFallback(ctx, boss) {
    if (!ctx || !boss) {
      return;
    }

    ctx.save();
    ctx.translate(boss.x ?? 0, boss.y ?? 0);

    const phaseColors = Array.isArray(boss.phaseColors)
      ? boss.phaseColors
      : ['#ff6b6b', '#f9c74f', '#4d96ff'];
    const color = phaseColors[boss.currentPhase || 0] || '#ffffff';
    const radius = Number.isFinite(boss.radius) ? boss.radius : 60;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.restore();

    GameDebugLogger.log('RENDER', 'Boss rendered (fallback)', {
      id: boss.id,
      position: { x: boss.x, y: boss.y },
      phase: boss.currentPhase,
    });
  }

  drawBackground(ctx, playerVelocity) {
    if (this.spaceSky) {
      this.spaceSky.render(ctx, {
        width: ctx.canvas?.width ?? GAME_WIDTH,
        height: ctx.canvas?.height ?? GAME_HEIGHT,
        velocity: playerVelocity,
      });
      return;
    }

    const gradient = ctx.createRadialGradient(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      0,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      Math.max(GAME_WIDTH, GAME_HEIGHT)
    );
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.6, '#000510');
    gradient.addColorStop(1, '#000000');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  drawMagnetismField(ctx, player, xpOrbs) {
    if (!player || !xpOrbs) return;

    // Don't render magnetism range when ship hull doesn't exist
    if (player.isDead || player.isRetrying || player._quitExplosionHidden) {
      return;
    }

    const orbs =
      typeof xpOrbs.getActiveOrbs === 'function' ? xpOrbs.getActiveOrbs() : [];
    const hasActiveOrb = orbs.some((orb) => !orb.collected);
    if (!hasActiveOrb) return;

    const playerPosition =
      typeof player.getPosition === 'function'
        ? player.getPosition()
        : player.position;
    if (!playerPosition) return;

    const magnetismRadius =
      (typeof player.getMagnetismRadius === 'function'
        ? player.getMagnetismRadius()
        : null) ||
      (typeof xpOrbs.getMagnetismRadius === 'function'
        ? xpOrbs.getMagnetismRadius()
        : MAGNETISM_RADIUS);

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 221, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(
      playerPosition.x,
      playerPosition.y,
      magnetismRadius,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }

  renderPlayer(ctx, player) {
    if (!player || typeof player.render !== 'function') return;

    const angularVelocity =
      typeof player.getAngularVelocity === 'function'
        ? player.getAngularVelocity()
        : player.angularVelocity || 0;

    const tilt = Math.max(
      -MAX_VISUAL_TILT,
      Math.min(MAX_VISUAL_TILT, angularVelocity * TILT_MULTIPLIER)
    );

    // Get recoil offset from player stats
    const playerStats =
      typeof player.getStats === 'function' ? player.getStats() : null;
    const recoilOffset = playerStats?.recoilOffset || { x: 0, y: 0 };

    // Apply recoil by translating the context
    ctx.save();
    ctx.translate(recoilOffset.x, recoilOffset.y);

    const shieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;

    // Only render shield when ship hull exists
    const hullExists =
      !player.isDead && !player.isRetrying && !player._quitExplosionHidden;
    if (hullExists && shieldState?.isActive && shieldState.maxHits > 0) {
      const ratio = Math.max(
        0,
        Math.min(1, shieldState.currentHits / shieldState.maxHits)
      );
      const position =
        typeof player.getPosition === 'function'
          ? player.getPosition()
          : player.position;

      if (position) {
        const padding = Math.max(
          0,
          typeof player.getShieldPadding === 'function'
            ? player.getShieldPadding()
            : 0
        );

        const visuals = this.resolveShieldVisual(player, padding);
        const shieldPath = visuals.path;
        const radiusForGradient = visuals.radius;

        if (shieldPath && radiusForGradient > 0) {
          const angle =
            typeof player.getAngle === 'function'
              ? player.getAngle()
              : player.angle || 0;

          ctx.save();
          ctx.translate(position.x, position.y);
          // [NEO-ARCADE] Rotate shield slightly independently for "floating field" feel
          const time = Date.now() / 1000;
          ctx.rotate(angle);

          // Counter-rotate pattern for stability or rotate for effect?
          // Let's rotate the field slowly
          const fieldRotation = Math.sin(time * 0.5) * 0.1;

          if (tilt !== 0) {
            ctx.transform(1, 0, tilt, 1, 0, 0);
          }

          // === SOAP BUBBLE V3 (Vibrant Rainbow Reference) ===

          ctx.globalCompositeOperation = 'source-over';

          // 1. Base Bubble (Oil Slick Fill)
          const bubbleRadius = radiusForGradient;
          const oilGrad = ctx.createRadialGradient(
            bubbleRadius * 0.3,
            -bubbleRadius * 0.3,
            0,
            0,
            0,
            bubbleRadius
          );
          // Stronger colors for "Rainbow Effect"
          oilGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
          oilGrad.addColorStop(0.3, 'rgba(0, 255, 255, 0.15)'); // Cyan
          oilGrad.addColorStop(0.5, 'rgba(255, 0, 255, 0.15)'); // Magenta
          oilGrad.addColorStop(0.7, 'rgba(255, 255, 0, 0.12)'); // Yellow
          oilGrad.addColorStop(
            0.95,
            `rgba(255, 255, 255, ${0.2 + ratio * 0.2})`
          ); // Rim catch

          ctx.beginPath();
          ctx.arc(0, 0, bubbleRadius, 0, Math.PI * 2);
          ctx.fillStyle = oilGrad;
          ctx.fill();

          // 2. The RIM (Rainbow Ring)
          const rimGrad = ctx.createLinearGradient(
            -bubbleRadius,
            -bubbleRadius,
            bubbleRadius,
            bubbleRadius
          );
          rimGrad.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
          rimGrad.addColorStop(0.33, 'rgba(255, 0, 255, 0.8)');
          rimGrad.addColorStop(0.66, 'rgba(255, 255, 0, 0.8)');
          rimGrad.addColorStop(1, 'rgba(0, 255, 255, 0.8)');

          ctx.lineWidth = 1.5;
          ctx.strokeStyle = rimGrad;
          ctx.beginPath();
          ctx.arc(0, 0, bubbleRadius, 0, Math.PI * 2);
          ctx.stroke();

          // 3. Window Reflection (Primary Top Left)
          ctx.save();
          ctx.translate(-bubbleRadius * 0.5, -bubbleRadius * 0.5);
          ctx.rotate(-Math.PI / 6);

          ctx.beginPath();
          // Softbox shape
          ctx.ellipse(
            0,
            0,
            bubbleRadius * 0.35,
            bubbleRadius * 0.2,
            0,
            0,
            Math.PI * 2
          );

          const windowGrad = ctx.createLinearGradient(0, -20, 0, 20);
          windowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          windowGrad.addColorStop(1, 'rgba(255, 255, 255, 0.1)');

          ctx.fillStyle = windowGrad;
          ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.restore();

          // 4. Bottom Reflection (Bounce Light)
          ctx.save();
          ctx.translate(bubbleRadius * 0.5, bubbleRadius * 0.5);
          ctx.rotate(Math.PI / 6);
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            bubbleRadius * 0.25,
            bubbleRadius * 0.1,
            0,
            0,
            Math.PI * 2
          );

          const botGrad = ctx.createLinearGradient(0, -10, 0, 10);
          botGrad.addColorStop(0, 'rgba(0, 255, 255, 0.1)');
          botGrad.addColorStop(1, 'rgba(0, 255, 255, 0.5)');

          ctx.fillStyle = botGrad;
          ctx.filter = 'blur(4px)';
          ctx.fill();
          ctx.restore();

          ctx.restore();
        }
      }
    }

    player.render(ctx, { tilt });

    // Restore context (remove recoil transform)
    ctx.restore();
  }

  resolveShieldVisual(player, padding) {
    const cache = this.shieldVisualCache;
    const hullOutline =
      typeof player.getHullOutline === 'function'
        ? player.getHullOutline()
        : null;

    let signature = `circle:${padding}`;
    if (
      Array.isArray(hullOutline) &&
      hullOutline.length >= MIN_OUTLINE_POINTS
    ) {
      const keyParts = [padding, hullOutline.length];
      for (let i = 0; i < Math.min(4, hullOutline.length); i += 1) {
        const vertex = hullOutline[i] || { x: 0, y: 0 };
        keyParts.push(Math.round((vertex.x ?? 0) * 100) / 100);
        keyParts.push(Math.round((vertex.y ?? 0) * 100) / 100);
      }
      signature = keyParts.join(':');
    }

    if (cache.signature !== signature) {
      const fallbackRadius = this.resolveShieldFallbackRadius(player, padding);

      if (
        Array.isArray(hullOutline) &&
        hullOutline.length >= MIN_OUTLINE_POINTS
      ) {
        const expanded = expandHullOutline(hullOutline, padding);
        const outlineToUse =
          expanded && expanded.length >= MIN_OUTLINE_POINTS
            ? expanded
            : hullOutline.map((vertex) => ({ ...vertex }));
        const outlinePath = buildPathFromPoints(outlineToUse);
        const outlineRadius = computeOutlineRadius(outlineToUse);
        cache.path = outlinePath || null;
        cache.radius = Math.max(outlineRadius, fallbackRadius);
      } else {
        const path = new Path2D();
        path.arc(0, 0, fallbackRadius, 0, Math.PI * 2);
        cache.path = path;
        cache.radius = fallbackRadius;
      }

      cache.signature = signature;
      cache.padding = padding;
    }

    if (!cache.path) {
      const fallbackRadius = this.resolveShieldFallbackRadius(player, padding);
      const path = new Path2D();
      path.arc(0, 0, fallbackRadius, 0, Math.PI * 2);
      cache.path = path;
      cache.radius = fallbackRadius;
    }

    return cache;
  }

  resolveShieldFallbackRadius(player, padding) {
    const hullRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : SHIP_SIZE;
    const fallback =
      typeof player.getShieldRadius === 'function'
        ? player.getShieldRadius()
        : hullRadius + padding;
    return Math.max(fallback, SHIP_SIZE);
  }

  ensureShieldGradientCanvas(radius, ratio) {
    // Use the new gradient cache system for better performance
    return this.gradientCache.createShieldGradient(null, radius, ratio);
  }

  /**
   * Update rendering performance statistics
   */
  updateRenderStats(frameStart) {
    const frameTime = performance.now() - frameStart;
    this.renderStats.frameCount++;

    // Calculate rolling average
    if (this.renderStats.frameCount === 1) {
      this.renderStats.avgFrameTime = frameTime;
    } else {
      const alpha = 0.1; // Smoothing factor
      this.renderStats.avgFrameTime =
        this.renderStats.avgFrameTime * (1 - alpha) + frameTime * alpha;
    }

    // Update batch efficiency
    const batchStats = this.renderBatch.getStats();
    this.renderStats.batchEfficiency = parseFloat(batchStats.efficiency) || 0;

    // Log stats every 5 seconds
    const now = performance.now();
    if (now - this.renderStats.lastStatsTime > 5000) {
      this.logPerformanceStats();
      this.renderStats.lastStatsTime = now;
    }
  }

  /**
   * Log comprehensive performance statistics
   */
  logPerformanceStats() {
    const renderStats = this.renderStats;
    const batchStats = this.renderBatch.getStats();
    const stateStats = this.stateManager.getStats();
    const gradientStats = this.gradientCache.getStats();

    console.log(
      `[RenderingSystem] Performance Stats - Frames: ${renderStats.frameCount}`
    );
    console.log(`  Avg Frame Time: ${renderStats.avgFrameTime.toFixed(2)}ms`);
    console.log(`  Batch Efficiency: ${batchStats.efficiency}`);
    console.log(`  State Efficiency: ${stateStats.efficiency}`);
    console.log(
      `  Gradient Cache: ${gradientStats.hitRates.gradients} hit rate`
    );
    console.log(`  Canvas Cache: ${gradientStats.hitRates.canvases} hit rate`);
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics() {
    return {
      frameTime: this.renderStats.avgFrameTime,
      frameCount: this.renderStats.frameCount,
      batchEfficiency: this.renderStats.batchEfficiency,
      batchStats: this.renderBatch.getStats(),
      stateStats: this.stateManager.getStats(),
      gradientStats: this.gradientCache.getStats(),
    };
  }

  /**
   * Optimize rendering for specific object types
   */
  renderBatchedCircles(ctx, circles, fillStyle, strokeStyle = null) {
    if (!circles || circles.length === 0) return;

    const batch = this.renderBatch.beginBatch('circles', {
      fillStyle,
      strokeStyle,
      globalAlpha: 1,
    });

    for (const circle of circles) {
      this.renderBatch.addCircle(
        circle.x,
        circle.y,
        circle.radius,
        fillStyle,
        strokeStyle
      );
    }

    this.renderBatch.flushBatch(ctx);
  }

  /**
   * Render batched lines for trails, effects
   */
  renderBatchedLines(ctx, lines, strokeStyle, lineWidth = 1) {
    if (!lines || lines.length === 0) return;

    const batch = this.renderBatch.beginBatch('lines', {
      strokeStyle,
      lineWidth,
    });

    for (const line of lines) {
      this.renderBatch.addLine(
        line.x1,
        line.y1,
        line.x2,
        line.y2,
        strokeStyle,
        lineWidth
      );
    }

    this.renderBatch.flushBatch(ctx);
  }

  /**
   * Reset all performance stats and caches
   */
  resetPerformanceTracking() {
    this.renderStats = {
      frameCount: 0,
      lastStatsTime: performance.now(),
      avgFrameTime: 0,
      batchEfficiency: 0,
    };

    this.renderBatch.resetStats();
    this.stateManager.resetStats();
    this.gradientCache.reset();

    console.log('[RenderingSystem] Performance tracking reset');
  }

  // [NEO-ARCADE] Procedural Hexagon Pattern Generation
  createHexagonPattern() {
    const size = SHIELD_HEX_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * Math.sqrt(3);
    const tempCtx = canvas.getContext('2d');

    tempCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; // Very subtle white/cyan
    tempCtx.lineWidth = 1;
    tempCtx.lineCap = 'round';

    // Draw Hexagon (approximated for tiling)
    tempCtx.beginPath();
    const w = size;
    const h = (size * Math.sqrt(3)) / 2;

    tempCtx.moveTo(0, h);
    tempCtx.lineTo(w / 2, 0);
    tempCtx.lineTo(w * 1.5, 0);
    tempCtx.lineTo(w * 2, h);
    tempCtx.lineTo(w * 1.5, h * 2);
    tempCtx.lineTo(w / 2, h * 2);
    tempCtx.lineTo(0, h);
    tempCtx.stroke();

    return canvas;
  }
}

export default RenderingSystem;
