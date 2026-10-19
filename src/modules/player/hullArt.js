// src/modules/player/hullArt.js
//
// The hull's 2D art: its panels with the visual-upgrade levels applied (the
// 3D ship in render3d/playerMirror reads the same geometry) and the main
// menu's hull previews, drawn from baked sprites plus live lighting and
// thrust cones. PlayerSystem owns one and hands the calls through.

import {
  FILL_LIGHT,
  KEY_LIGHT_DIR,
  PALETTE,
  withAlpha,
} from '../../data/constants/palette.js';
import {
  getRenderScale,
  resolveDevicePixelRatio,
} from '../../core/viewport.js';
import { buildClosedPath } from './hullShape.js';

const PREVIEW_THRUST = 0.35;
const PREVIEW_ANGLE = -Math.PI / 2;

const coneLength = (thrust, thrusterLevel) =>
  (4 + 12 * thrust) * (1 + 0.1 * thrusterLevel);

const createSpriteCanvas = (width, height, scale) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  return { canvas, ctx };
};

// Thrust cone along +x from the origin: accent flame with a white-hot core.
const CONE_SIZE = { length: 32, height: 12 };
const coneSpriteCache = new Map();
const getConeSprite = (color, scale) => {
  const key = `${color}|${scale}`;
  if (!coneSpriteCache.has(key)) {
    const sprite = createSpriteCanvas(
      CONE_SIZE.length,
      CONE_SIZE.height,
      scale
    );
    if (sprite) {
      const { ctx } = sprite;
      const mid = CONE_SIZE.height / 2;
      const flame = (length, halfWidth, fill) => {
        ctx.beginPath();
        ctx.moveTo(0, mid - halfWidth);
        ctx.quadraticCurveTo(length * 0.3, mid - halfWidth, length, mid);
        ctx.quadraticCurveTo(length * 0.3, mid + halfWidth, 0, mid + halfWidth);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      const outer = ctx.createLinearGradient(0, 0, CONE_SIZE.length, 0);
      outer.addColorStop(0, withAlpha(color, 0.95));
      outer.addColorStop(0.35, withAlpha(color, 0.5));
      outer.addColorStop(1, withAlpha(color, 0));
      flame(CONE_SIZE.length, mid * 0.8, outer);
      const core = ctx.createLinearGradient(0, 0, CONE_SIZE.length * 0.45, 0);
      core.addColorStop(0, withAlpha(PALETTE.text, 1));
      core.addColorStop(1, withAlpha(PALETTE.text, 0));
      flame(CONE_SIZE.length * 0.45, mid * 0.35, core);
    }
    coneSpriteCache.set(key, sprite ? sprite.canvas : null);
  }
  return coneSpriteCache.get(key);
};

const drawCone = (ctx, sprite, x, y, rotation, length, width, alpha) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(sprite, 0, -width / 2, length, width);
  ctx.restore();
};

// Applies the visual-upgrade levels to a hull's panel data (shipModels.js).
const buildHullGeometry = (visual, levels) => {
  const levelOf = (key) => levels[key] || 0;
  const panels = visual.panels
    .filter(
      (panel) =>
        !panel.minLevel || levelOf(panel.minLevel.key) >= panel.minLevel.value
    )
    .map((panel) => {
      const steps = panel.grow ? levelOf(panel.grow.key) : 0;
      const points = panel.points.map((point, index) =>
        steps && panel.grow.indices.includes(index)
          ? {
              x: point.x + panel.grow.step.x * steps,
              y: point.y + panel.grow.step.y * steps,
            }
          : point
      );
      const length = Math.hypot(panel.facing.x, panel.facing.y) || 1;
      return {
        points,
        path: buildClosedPath(points),
        facing: { x: panel.facing.x / length, y: panel.facing.y / length },
        rcsPort: Number.isInteger(panel.rcsPort) ? points[panel.rcsPort] : null,
        armor: Boolean(panel.armor),
      };
    });
  const thrusterLevel = levelOf('thruster');
  const nozzleLength =
    visual.nozzleLength + visual.nozzleLengthPerLevel * thrusterLevel;
  const nozzles = visual.nozzles
    .filter((nozzle) => !nozzle.minLevel || thrusterLevel >= nozzle.minLevel)
    .map((nozzle) => ({ ...nozzle, exitX: nozzle.x - nozzleLength }));

  let minX = 0;
  let maxX = 0;
  let maxY = 0;
  panels.forEach((panel) =>
    panel.points.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, Math.abs(point.y));
    })
  );
  const minNozzleX = Math.min(...nozzles.map((nozzle) => nozzle.exitX));
  minX = Math.min(minX, minNozzleX);

  return {
    accent: PALETTE[visual.accent] || PALETTE.player,
    blades: Boolean(visual.blades),
    albedo: visual.albedo ?? 1,
    panels,
    nozzles,
    nozzleLength,
    nozzleRadius: nozzles[0].r,
    minNozzleX,
    retroPorts: visual.retroPorts,
    rcsPorts: panels.filter((panel) => panel.rcsPort).map((p) => p.rcsPort),
    cockpit: visual.cockpit,
    minX,
    maxX,
    maxY,
    extent: Math.max(-minX, maxX, maxY),
  };
};

// Static hull art per (hull, levels, scale): matte base, seams + nozzles.
const bakeHullSprites = (geometry, scale) => {
  const half = Math.ceil(geometry.extent + 3);
  const size = half * 2;
  const base = createSpriteCanvas(size, size, scale);
  const detail = createSpriteCanvas(size, size, scale);
  if (!base || !detail) return null;
  [base, detail].forEach(({ ctx }) => ctx.translate(half, half));

  const housing = (ctx, nozzle) =>
    ctx.rect(
      nozzle.exitX,
      nozzle.y - nozzle.r,
      geometry.nozzleLength,
      nozzle.r * 2
    );

  // base: nozzle housings under the matte panels
  base.ctx.fillStyle = PALETTE.rockShadow;
  geometry.nozzles.forEach((nozzle) => {
    base.ctx.beginPath();
    housing(base.ctx, nozzle);
    base.ctx.fill();
  });
  base.ctx.fillStyle = PALETTE.hull;
  geometry.panels.forEach((panel) => base.ctx.fill(panel.path));

  // detail: seams, nozzle lips, dim cockpit slit
  const d = detail.ctx;
  d.lineJoin = 'round';
  d.strokeStyle = withAlpha(PALETTE.background, 0.9);
  d.lineWidth = 0.6;
  geometry.panels.forEach((panel) => d.stroke(panel.path));
  d.strokeStyle = withAlpha(PALETTE.neutral, 0.55);
  d.lineWidth = 0.4;
  geometry.nozzles.forEach((nozzle) => {
    d.beginPath();
    housing(d, nozzle);
    d.stroke();
    d.fillStyle = withAlpha(geometry.accent, 0.5);
    d.beginPath();
    d.ellipse(
      nozzle.exitX,
      nozzle.y,
      nozzle.r * 0.35,
      nozzle.r * 0.8,
      0,
      0,
      Math.PI * 2
    );
    d.fill();
  });
  const { cockpit } = geometry;
  d.lineCap = 'round';
  d.lineWidth = cockpit.width;
  d.strokeStyle = withAlpha(PALETTE.player, 0.75);
  d.beginPath();
  d.moveTo(cockpit.from.x, cockpit.from.y);
  d.lineTo(cockpit.to.x, cockpit.to.y);
  d.stroke();
  // blades (Solar Slicer) and armour plates (Bastion): edged in the accent
  d.strokeStyle = withAlpha(geometry.accent, 0.8);
  d.lineWidth = 0.5;
  geometry.panels
    .filter((panel) => panel.armor || (geometry.blades && panel.rcsPort))
    .forEach((panel) => d.stroke(panel.path));

  return { base: base.canvas, detail: detail.canvas, half };
};

export class HullArt {
  constructor() {
    this.hullGeometryCache = new Map();
    this.hullSpriteCache = new Map();
  }

  getHullGeometry(hullDefinition, levels) {
    const key = `${hullDefinition.id}|${levels.thruster}|${levels.rcs}|${levels.braking}`;
    let geometry = this.hullGeometryCache.get(key);
    if (!geometry) {
      geometry = buildHullGeometry(hullDefinition.visual, levels);
      this.hullGeometryCache.set(key, geometry);
    }
    return geometry;
  }

  getHullSprites(hullDefinition, levels, geometry, pixelScale) {
    const key = `${hullDefinition.id}|${levels.thruster}|${levels.rcs}|${levels.braking}|${pixelScale}`;
    if (!this.hullSpriteCache.has(key)) {
      this.hullSpriteCache.set(key, bakeHullSprites(geometry, pixelScale));
    }
    return this.hullSpriteCache.get(key);
  }

  // Matte facets lit by the fixed world key light: the lit amount follows
  // the ship's rotation, so it is drawn live over the baked base.
  renderHullLighting(ctx, geometry, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.save();
    geometry.panels.forEach((panel) => {
      const wx = panel.facing.x * cos - panel.facing.y * sin;
      const wy = panel.facing.x * sin + panel.facing.y * cos;
      const light = wx * KEY_LIGHT_DIR.x + wy * KEY_LIGHT_DIR.y;
      ctx.globalAlpha = (0.12 + 0.88 * Math.max(0, light)) * geometry.albedo;
      ctx.fillStyle = PALETTE.hullLit;
      ctx.fill(panel.path);
      if (light < 0) {
        ctx.globalAlpha = -light;
        ctx.fillStyle = FILL_LIGHT;
        ctx.fill(panel.path);
      }
    });
    ctx.restore();
  }

  // `options`: the levels, angle and thrust to draw, and the pixel scale.
  renderHullModel(ctx, hullDefinition, options) {
    if (!ctx || !hullDefinition?.visual) {
      return false;
    }

    const { levels, angle, thrust } = options;
    const geometry = this.getHullGeometry(hullDefinition, levels);
    const pixelScale = options.pixelScale || getRenderScale();
    const sprites = this.getHullSprites(
      hullDefinition,
      levels,
      geometry,
      pixelScale
    );
    if (!sprites) {
      return false;
    }

    const cone = getConeSprite(geometry.accent, pixelScale);

    // main thrust sits under the hull
    if (cone && thrust.main > 0.01) {
      const length = coneLength(thrust.main, levels.thruster);
      geometry.nozzles.forEach((nozzle) => {
        drawCone(
          ctx,
          cone,
          nozzle.exitX,
          nozzle.y,
          Math.PI,
          length * (nozzle.r / geometry.nozzleRadius),
          nozzle.r * 5,
          thrust.main
        );
      });
    }

    const { half } = sprites;
    ctx.drawImage(sprites.base, -half, -half, half * 2, half * 2);
    this.renderHullLighting(ctx, geometry, angle);
    ctx.drawImage(sprites.detail, -half, -half, half * 2, half * 2);

    if (cone && thrust.aux > 0.01) {
      geometry.retroPorts.forEach((port) => {
        drawCone(
          ctx,
          cone,
          port.x,
          port.y,
          0,
          3 + 7 * thrust.aux,
          3.5,
          thrust.aux
        );
      });
    }
    if (cone) {
      geometry.rcsPorts.forEach((port) => {
        const amount = port.y < 0 ? thrust.sideL : thrust.sideR;
        if (amount > 0.01) {
          drawCone(
            ctx,
            cone,
            port.x,
            port.y,
            port.y < 0 ? -Math.PI / 2 : Math.PI / 2,
            2 + 5 * amount,
            3,
            amount
          );
        }
      });
    }

    return true;
  }

  renderHullPreview(ctx, hullDefinition, options = {}) {
    if (!ctx || !hullDefinition?.visual) {
      return false;
    }

    const canvas = ctx.canvas;
    if (!canvas) {
      return false;
    }

    // Native-resolution backing store for the CSS box (crisp at DPR 2).
    const cssWidth = Number.isFinite(options.width)
      ? options.width
      : canvas.clientWidth || canvas.width;
    const cssHeight = Number.isFinite(options.height)
      ? options.height
      : canvas.clientHeight || canvas.height;
    if (!Number.isFinite(options.width) && canvas.clientWidth > 0) {
      const dpr = resolveDevicePixelRatio();
      const width = Math.round(cssWidth * dpr);
      const height = Math.round(cssHeight * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    const pixelRatio = canvas.width / cssWidth;

    const padding = Number.isFinite(options.padding)
      ? Math.max(0, options.padding)
      : 10;
    const levels = { thruster: 0, rcs: 0, braking: 0 };
    const geometry = this.getHullGeometry(hullDefinition, levels);
    const tailX = geometry.minNozzleX - coneLength(PREVIEW_THRUST, 0);
    const minX = Math.min(geometry.minX, tailX);
    const spanX = Math.max(1, geometry.maxX - minX);
    const spanY = Math.max(1, geometry.maxY * 2);
    // nose points up: ship x runs along the preview's height
    const scale = Math.min(
      Math.max(1, cssWidth - padding * 2) / spanY,
      Math.max(1, cssHeight - padding * 2) / spanX
    );

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (options.clear !== false) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.translate(cssWidth / 2, cssHeight / 2);
    ctx.scale(scale, scale);
    ctx.rotate(PREVIEW_ANGLE);
    ctx.translate(-(geometry.maxX + minX) / 2, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this.renderHullModel(ctx, hullDefinition, {
      levels,
      angle: PREVIEW_ANGLE,
      pixelScale: scale * pixelRatio,
      thrust: { main: PREVIEW_THRUST, aux: 0, sideL: 0, sideR: 0 },
    });
    ctx.restore();
    return true;
  }
}
