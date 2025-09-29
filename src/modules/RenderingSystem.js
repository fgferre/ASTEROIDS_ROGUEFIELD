import * as CONSTANTS from '../core/GameConstants.js';
import RenderBatch from '../core/RenderBatch.js';
import CanvasStateManager from '../core/CanvasStateManager.js';
import GradientCache from '../core/GradientCache.js';

const MAX_VISUAL_TILT = 0.3;
const TILT_MULTIPLIER = 0.12;
const MIN_OUTLINE_POINTS = 3;
const EPSILON = 1e-6;

function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  if (length < EPSILON) {
    return { x: 0, y: 0, length: 0 };
  }

  return { x: x / length, y: y / length, length };
}

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

const SPACE_SKY_LAYERS = [
  { density: 220, vx: -0.006, vy: -0.002, size: 0.9, glow: 0.35 },
  { density: 380, vx: -0.01, vy: -0.004, size: 1.2, glow: 0.48 },
  { density: 490, vx: -0.016, vy: -0.007, size: 1.5, glow: 0.62 },
  { density: 60, vx: -0.015, vy: -0.006, size: 2.2, glow: 0.9 },
];

const SPACE_SKY_PRESETS = {
  minimal: {
    densityK: 0.5,
    twinkleHz: 0.8,
    twinkleAmp: 0.45,
    tint: { r: 230, g: 238, b: 255 },
    drift: { vx: 0, vy: 0 },
  },
  cinematic: {
    densityK: 0.8,
    twinkleHz: 0.9,
    twinkleAmp: 0.55,
    tint: { r: 225, g: 236, b: 255 },
    drift: { vx: -0.002, vy: -0.001 },
  },
  deep_space: {
    densityK: 0.6,
    twinkleHz: 0.7,
    twinkleAmp: 0.5,
    tint: { r: 210, g: 228, b: 255 },
    drift: { vx: -0.004, vy: -0.001 },
  },
  warp_hint: {
    densityK: 1,
    twinkleHz: 1.1,
    twinkleAmp: 0.6,
    tint: { r: 235, g: 240, b: 255 },
    drift: { vx: -0.03, vy: -0.012 },
  },
};

function resolveDevicePixelRatio() {
  if (typeof window === 'undefined') {
    return 1;
  }

  const ratio = Number(window.devicePixelRatio) || 1;
  return Math.max(1, Math.min(2, ratio));
}

function resolveTimestamp() {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now();
  }

  return Date.now();
}

function normalizeTintValue(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return clamp(Math.round(value), 0, 255);
}

function extractVelocityComponent(velocity, primaryKey, fallbackKey) {
  if (!velocity) {
    return 0;
  }

  if (Number.isFinite(velocity[primaryKey])) {
    return velocity[primaryKey];
  }

  if (Number.isFinite(velocity[fallbackKey])) {
    return velocity[fallbackKey];
  }

  return 0;
}

class SpaceSkyBackground {
  constructor() {
    this.dpr = resolveDevicePixelRatio();
    this.layers = SPACE_SKY_LAYERS.map((layer) => ({
      density: layer.density,
      vx: layer.vx,
      vy: layer.vy,
      size: layer.size,
      glow: layer.glow,
      stars: [],
    }));

    this.width = 0;
    this.height = 0;
    this.areaMP = 0;

    this.densityK = 1;
    this.twinkleHz = 0.9;
    this.twinkleAmp = 0.55;
    this.tint = { r: 225, g: 236, b: 255 };
    this.parallax = {
      enabled: true,
      factor: 0.06,
      tilt: 0.045,
      maxTilt: 0.06,
      speedForMaxTilt: CONSTANTS.SHIP_MAX_SPEED || 220,
    };
    this.baseDrift = { vx: 0, vy: 0 };

    this.velocityProvider = null;
    this.lastTime = resolveTimestamp();
    this.currentPreset = null;

    this.applyPreset('cinematic');
  }

  bindVelocityProvider(fn) {
    this.velocityProvider = typeof fn === 'function' ? fn : null;
  }

  setParallax(factor, tilt, maxTilt, speedForMaxTilt) {
    if (Number.isFinite(factor)) {
      this.parallax.factor = factor;
    }

    if (Number.isFinite(tilt)) {
      this.parallax.tilt = Math.abs(tilt);
    }

    if (Number.isFinite(maxTilt)) {
      this.parallax.maxTilt = Math.abs(maxTilt);
    }

    if (Number.isFinite(speedForMaxTilt) && speedForMaxTilt > EPSILON) {
      this.parallax.speedForMaxTilt = speedForMaxTilt;
    }

    if (this.parallax.tilt > this.parallax.maxTilt) {
      this.parallax.tilt = this.parallax.maxTilt;
    }
  }

  enableParallax(enabled) {
    this.parallax.enabled = Boolean(enabled);
  }

  resize(width, height) {
    const newWidth = Math.max(1, Math.floor(width));
    const newHeight = Math.max(1, Math.floor(height));

    if (newWidth === this.width && newHeight === this.height) {
      return;
    }

    const previousWidth = this.width || newWidth;
    const previousHeight = this.height || newHeight;
    const scaleX = previousWidth > 0 ? newWidth / previousWidth : 1;
    const scaleY = previousHeight > 0 ? newHeight / previousHeight : 1;

    this.width = newWidth;
    this.height = newHeight;
    this.areaMP = (this.width * this.height) / 1_000_000;

    if (previousWidth === 0 || previousHeight === 0) {
      this.layers.forEach((layer) => {
        layer.stars.length = 0;
      });
    } else {
      this.layers.forEach((layer) => {
        layer.stars.forEach((star) => {
          star.x *= scaleX;
          star.y *= scaleY;
        });
      });
    }

    this.rebuild();
  }

  rebuild() {
    if (!this.width || !this.height) {
      return;
    }

    const areaFactor = Math.max(0.6, this.areaMP);
    this.layers.forEach((layer) => {
      const target = Math.floor(layer.density * this.densityK * areaFactor);
      const { stars } = layer;

      if (stars.length < target) {
        for (let i = stars.length; i < target; i += 1) {
          stars.push(this.makeStar());
        }
      } else if (stars.length > target) {
        stars.length = target;
      }
    });
  }

  makeStar() {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      phase: Math.random() * Math.PI * 2,
      jitter: randomRange(0.6, 1.4),
    };
  }

  applyPreset(name, overrides = {}) {
    const preset = SPACE_SKY_PRESETS[name];
    if (!preset) {
      return false;
    }

    this.densityK =
      Number.isFinite(preset.densityK) && preset.densityK > 0
        ? preset.densityK
        : this.densityK;
    this.twinkleHz = Number.isFinite(preset.twinkleHz)
      ? Math.max(0, preset.twinkleHz)
      : this.twinkleHz;
    this.twinkleAmp = Number.isFinite(preset.twinkleAmp)
      ? Math.max(0, preset.twinkleAmp)
      : this.twinkleAmp;

    if (preset.tint) {
      this.tint = {
        r: normalizeTintValue(preset.tint.r, this.tint.r),
        g: normalizeTintValue(preset.tint.g, this.tint.g),
        b: normalizeTintValue(preset.tint.b, this.tint.b),
      };
    }

    if (preset.drift) {
      this.baseDrift = {
        vx: Number.isFinite(preset.drift.vx) ? preset.drift.vx : 0,
        vy: Number.isFinite(preset.drift.vy) ? preset.drift.vy : 0,
      };
    } else {
      this.baseDrift = { vx: 0, vy: 0 };
    }

    if (overrides.tint) {
      this.tint = {
        r: normalizeTintValue(overrides.tint.r, this.tint.r),
        g: normalizeTintValue(overrides.tint.g, this.tint.g),
        b: normalizeTintValue(overrides.tint.b, this.tint.b),
      };
    }

    if (overrides.densityK != null && Number.isFinite(overrides.densityK)) {
      this.densityK = Math.max(0.2, Math.min(4, overrides.densityK));
    }

    if (overrides.twinkleHz != null && Number.isFinite(overrides.twinkleHz)) {
      this.twinkleHz = Math.max(0, overrides.twinkleHz);
    }

    if (overrides.twinkleAmp != null && Number.isFinite(overrides.twinkleAmp)) {
      this.twinkleAmp = Math.max(0, overrides.twinkleAmp);
    }

    if (overrides.drift) {
      this.baseDrift = {
        vx: Number.isFinite(overrides.drift.vx)
          ? overrides.drift.vx
          : this.baseDrift.vx,
        vy: Number.isFinite(overrides.drift.vy)
          ? overrides.drift.vy
          : this.baseDrift.vy,
      };
    }

    this.currentPreset = name;
    this.rebuild();
    return true;
  }

  resolveVelocity(options) {
    const provided = options?.velocity;
    if (provided) {
      return provided;
    }

    if (typeof this.velocityProvider === 'function') {
      return this.velocityProvider();
    }

    return null;
  }

  detectVisualPreset() {
    if (typeof document === 'undefined' || !document.body) {
      return null;
    }

    const reduced = document.body.classList.contains('particles-reduced');
    return reduced ? 'minimal' : 'cinematic';
  }

  render(ctx, options = {}) {
    if (!ctx) return;

    const canvasWidth = Number.isFinite(options.width)
      ? options.width
      : ctx.canvas?.width;
    const canvasHeight = Number.isFinite(options.height)
      ? options.height
      : ctx.canvas?.height;

    if (canvasWidth && canvasHeight) {
      this.resize(canvasWidth, canvasHeight);
    }

    const preset = this.detectVisualPreset();
    if (preset && preset !== this.currentPreset) {
      this.applyPreset(preset);
    }

    const now = resolveTimestamp();
    const delta = now - this.lastTime;
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const dt = Math.min(34, safeDelta);
    this.lastTime = now;

    const velocity = this.resolveVelocity(options);
    const rawVX = extractVelocityComponent(velocity, 'vx', 'x');
    const rawVY = extractVelocityComponent(velocity, 'vy', 'y');

    let driftVX = this.baseDrift.vx;
    let driftVY = this.baseDrift.vy;
    let tilt = 0;

    if (velocity && this.parallax.enabled) {
      const vxMs = Number.isFinite(rawVX) ? rawVX / 1000 : 0;
      const vyMs = Number.isFinite(rawVY) ? rawVY / 1000 : 0;

      driftVX += -vxMs * this.parallax.factor;
      driftVY += -vyMs * this.parallax.factor;

      const speed = Math.hypot(rawVX, rawVY);
      if (speed > EPSILON) {
        const referenceSpeed = Math.max(
          EPSILON,
          Number.isFinite(this.parallax.speedForMaxTilt)
            ? this.parallax.speedForMaxTilt
            : CONSTANTS.SHIP_MAX_SPEED || speed
        );
        const speedRatio = clamp(speed / referenceSpeed, 0, 1);
        const bankDirection = -rawVX / speed;
        const desiredTilt = bankDirection * this.parallax.tilt * speedRatio;

        tilt = clamp(
          desiredTilt,
          -this.parallax.maxTilt,
          this.parallax.maxTilt
        );
      }
    }

    ctx.save();

    if (tilt !== 0) {
      ctx.translate(this.width / 2, this.height / 2);
      ctx.rotate(tilt);
      ctx.translate(-this.width / 2, -this.height / 2);
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);

    const gradient = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.2,
      this.width / 2,
      this.height / 2,
      Math.hypot(this.width, this.height) * 0.55
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const twinkleStep = this.twinkleHz * 2 * Math.PI * (dt / 1000);

    this.layers.forEach((layer) => {
      const vx = (layer.vx + driftVX) * this.dpr;
      const vy = (layer.vy + driftVY) * this.dpr;

      layer.stars.forEach((star) => {
        star.x += vx * dt;
        star.y += vy * dt;

        if (star.x < 0) star.x += this.width;
        else if (star.x >= this.width) star.x -= this.width;
        if (star.y < 0) star.y += this.height;
        else if (star.y >= this.height) star.y -= this.height;

        star.phase += twinkleStep * star.jitter;

        const twinkle =
          1 -
          this.twinkleAmp * 0.5 +
          Math.sin(star.phase) * (this.twinkleAmp * 0.5);
        const alpha = Math.min(1, layer.glow * 1.05 * twinkle);
        const radius = Math.max(
          0.5,
          layer.size *
            (0.9 + 0.2 * Math.sin(star.phase * 0.7)) *
            star.jitter *
            this.dpr
        );

        ctx.fillStyle = `rgba(${this.tint.r}, ${this.tint.g}, ${this.tint.b}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    ctx.restore();
  }
}

class RenderingSystem {
  constructor() {
    this.spaceSky = new SpaceSkyBackground();
    this.spaceSky.setParallax(0.06, 0.05, 0.06, CONSTANTS.SHIP_MAX_SPEED);

    // Batch rendering optimization systems
    this.renderBatch = new RenderBatch();
    this.stateManager = new CanvasStateManager();
    this.gradientCache = new GradientCache();

    // Performance tracking
    this.renderStats = {
      frameCount: 0,
      lastStatsTime: performance.now(),
      avgFrameTime: 0,
      batchEfficiency: 0
    };

    this.cachedPlayer = null;
    this.cachedProgression = null;
    this.cachedXPOrbs = null;
    this.cachedEffects = null;
    this.cachedCombat = null;
    this.cachedEnemies = null;

    this.shieldVisualCache = {
      signature: '',
      path: null,
      radius: CONSTANTS.SHIP_SIZE,
      padding: 0,
    };
    this.shieldGradientCache = {
      radius: 0,
      ratio: 0,
      canvas: null,
      context: null,
      size: 0,
    };

    if (typeof gameServices !== 'undefined') {
      this.spaceSky.bindVelocityProvider(() => {
        this.resolveCachedServices();
        const player = this.cachedPlayer;
        if (!player) {
          return null;
        }

        if (typeof player.getVelocity === 'function') {
          return player.getVelocity();
        }

        if (player.velocity) {
          return { ...player.velocity };
        }

        return null;
      });
      gameServices.register('renderer', this);
    }

    // Initialize state manager with common presets
    this.stateManager.createPreset('starfield', {
      fillStyle: 'rgba(255, 255, 255, 0.8)',
      strokeStyle: 'transparent',
      globalAlpha: 1,
      shadowBlur: 0
    });

    console.log('[RenderingSystem] Initialized with batch rendering optimization');
  }

  resolveCachedServices(force = false) {
    if (typeof gameServices === 'undefined') {
      return;
    }

    const fetch = (name) => {
      if (typeof gameServices.has === 'function' && !gameServices.has(name)) {
        return null;
      }
      try {
        return gameServices.get(name);
      } catch (error) {
        return null;
      }
    };

    if (force || !this.cachedPlayer) {
      this.cachedPlayer = fetch('player');
    }
    if (force || !this.cachedProgression) {
      this.cachedProgression = fetch('progression');
    }
    if (force || !this.cachedXPOrbs) {
      this.cachedXPOrbs = fetch('xp-orbs');
    }
    if (force || !this.cachedEffects) {
      this.cachedEffects = fetch('effects');
    }
    if (force || !this.cachedCombat) {
      this.cachedCombat = fetch('combat');
    }
    if (force || !this.cachedEnemies) {
      this.cachedEnemies = fetch('enemies');
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

    this.resolveCachedServices();

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

    // Combat (bullets)
    const combat = this.cachedCombat;
    if (combat && typeof combat.render === 'function') {
      combat.render(ctx);
    }

    // Enemies
    const enemies = this.cachedEnemies;
    if (enemies && typeof enemies.render === 'function') {
      enemies.render(ctx);
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

  drawBackground(ctx, playerVelocity) {
    if (this.spaceSky) {
      this.spaceSky.render(ctx, {
        width: ctx.canvas?.width ?? CONSTANTS.GAME_WIDTH,
        height: ctx.canvas?.height ?? CONSTANTS.GAME_HEIGHT,
        velocity: playerVelocity,
      });
      return;
    }

    const gradient = ctx.createRadialGradient(
      CONSTANTS.GAME_WIDTH / 2,
      CONSTANTS.GAME_HEIGHT / 2,
      0,
      CONSTANTS.GAME_WIDTH / 2,
      CONSTANTS.GAME_HEIGHT / 2,
      Math.max(CONSTANTS.GAME_WIDTH, CONSTANTS.GAME_HEIGHT)
    );
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.6, '#000510');
    gradient.addColorStop(1, '#000000');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONSTANTS.GAME_WIDTH, CONSTANTS.GAME_HEIGHT);
  }

  drawMagnetismField(ctx, player, xpOrbs) {
    if (!player || !xpOrbs) return;

    const orbs =
      typeof xpOrbs.getActiveOrbs === 'function'
        ? xpOrbs.getActiveOrbs()
        : [];
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
        : CONSTANTS.MAGNETISM_RADIUS);

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 221, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(playerPosition.x, playerPosition.y, magnetismRadius, 0, Math.PI * 2);
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
      Math.min(MAX_VISUAL_TILT, angularVelocity * TILT_MULTIPLIER),
    );

    const shieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;

    if (shieldState?.isActive && shieldState.maxHits > 0) {
      const ratio = Math.max(
        0,
        Math.min(1, shieldState.currentHits / shieldState.maxHits),
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
            : 0,
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
          ctx.rotate(angle);
          if (tilt !== 0) {
            ctx.transform(1, 0, tilt, 1, 0, 0);
          }

          const now =
            typeof performance !== 'undefined' &&
            typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          const pulse = 0.6 + 0.4 * Math.sin(now / 180);

          const gradientCanvas = this.ensureShieldGradientCanvas(
            radiusForGradient,
            ratio,
          );

          ctx.globalCompositeOperation = 'lighter';

          if (gradientCanvas) {
            const offset = gradientCanvas.width / 2;
            ctx.drawImage(gradientCanvas, -offset, -offset);
          } else {
            const glowGradient = ctx.createRadialGradient(
              0,
              0,
              radiusForGradient * 0.35,
              0,
              0,
              radiusForGradient * 1.25,
            );
            glowGradient.addColorStop(
              0,
              `rgba(120, 240, 255, ${0.08 + ratio * 0.14})`,
            );
            glowGradient.addColorStop(
              0.55,
              `rgba(0, 190, 255, ${0.25 + ratio * 0.3})`,
            );
            glowGradient.addColorStop(1, 'rgba(0, 150, 255, 0)');
            ctx.fillStyle = glowGradient;
            ctx.fill(shieldPath);
          }

          ctx.globalCompositeOperation = 'source-over';
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.shadowColor = `rgba(90, 200, 255, ${0.75 + ratio * 0.15})`;
          ctx.shadowBlur = 10 + ratio * 16 + pulse * 4;
          ctx.lineWidth = 2.4 + ratio * 2.2 + pulse * 0.35;
          ctx.strokeStyle = `rgba(160, 245, 255, ${0.52 + ratio * 0.35})`;
          ctx.stroke(shieldPath);

          ctx.shadowBlur = 0;
          ctx.lineWidth = 1 + ratio * 1.4;
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.28 + ratio * 0.3})`;
          ctx.globalAlpha = 0.9;
          ctx.stroke(shieldPath);
          ctx.restore();
        }
      }
    }

    player.render(ctx, { tilt });
  }

  resolveShieldVisual(player, padding) {
    const cache = this.shieldVisualCache;
    const hullOutline =
      typeof player.getHullOutline === 'function'
        ? player.getHullOutline()
        : null;

    let signature = `circle:${padding}`;
    if (Array.isArray(hullOutline) && hullOutline.length >= MIN_OUTLINE_POINTS) {
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

      if (Array.isArray(hullOutline) && hullOutline.length >= MIN_OUTLINE_POINTS) {
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
        : CONSTANTS.SHIP_SIZE;
    const fallback =
      typeof player.getShieldRadius === 'function'
        ? player.getShieldRadius()
        : hullRadius + padding;
    return Math.max(fallback, CONSTANTS.SHIP_SIZE);
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

    console.log(`[RenderingSystem] Performance Stats - Frames: ${renderStats.frameCount}`);
    console.log(`  Avg Frame Time: ${renderStats.avgFrameTime.toFixed(2)}ms`);
    console.log(`  Batch Efficiency: ${batchStats.efficiency}`);
    console.log(`  State Efficiency: ${stateStats.efficiency}`);
    console.log(`  Gradient Cache: ${gradientStats.hitRates.gradients} hit rate`);
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
      gradientStats: this.gradientCache.getStats()
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
      globalAlpha: 1
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
      lineWidth
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
      batchEfficiency: 0
    };

    this.renderBatch.resetStats();
    this.stateManager.resetStats();
    this.gradientCache.reset();

    console.log('[RenderingSystem] Performance tracking reset');
  }
}

export default RenderingSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RenderingSystem;
}
