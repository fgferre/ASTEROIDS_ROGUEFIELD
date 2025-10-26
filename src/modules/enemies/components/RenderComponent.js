import {
  ENEMY_EFFECT_COLORS,
  ENEMY_RENDER_PRESETS,
} from '../../../data/constants/visual.js';

const TAU = Math.PI * 2;

const resolvePalette = (enemy) => {
  if (!enemy?.type) {
    return {};
  }
  const colors = ENEMY_EFFECT_COLORS?.[enemy.type];
  return colors ?? {};
};

const resolvePresets = (enemy) => {
  if (!enemy?.type) {
    return {};
  }
  const presets = ENEMY_RENDER_PRESETS?.[enemy.type];
  return presets ?? {};
};

const defaultStrategies = {
  'procedural-triangle': ({ enemy, ctx, colors, presets }) => {
    if (!ctx) return;

    const palette = colors || resolvePalette(enemy);
    const renderPreset = presets || resolvePresets(enemy);
    const hullPreset = renderPreset.hull ?? {};
    const finPreset = renderPreset.fins ?? {};
    const accentPreset = renderPreset.accents ?? {};
    const exhaustPreset = renderPreset.exhaust ?? {};

    const size = enemy.radius ?? enemy.size ?? 12;
    const thrust = typeof enemy.getThrustIntensity === 'function'
      ? enemy.getThrustIntensity()
      : enemy.thrustIntensity ?? enemy._renderThrust ?? 0;

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.rotation ?? 0);

    if (exhaustPreset.enabled !== false && thrust > 0) {
      const exhaustColor = exhaustPreset.color ?? palette.exhaust ?? 'rgba(255, 200, 120, 0.65)';
      ctx.beginPath();
      ctx.moveTo(-size * 0.2, size * 0.65);
      ctx.lineTo(-size * (0.7 + thrust * 0.5), 0);
      ctx.lineTo(-size * 0.2, -size * 0.65);
      ctx.closePath();
      ctx.fillStyle = exhaustColor;
      ctx.globalAlpha = 0.6 + thrust * 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.4, size * 0.75);
    ctx.lineTo(-size * 0.4, -size * 0.75);
    ctx.closePath();
    ctx.fillStyle = hullPreset.fill ?? palette.body ?? '#6cf9ff';
    ctx.strokeStyle = hullPreset.stroke ?? palette.outline ?? '#0b2d33';
    ctx.lineWidth = hullPreset.strokeWidth ?? 2;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(size * 0.2, 0);
    ctx.lineTo(-size * 0.35, size * 0.45);
    ctx.lineTo(-size * 0.35, -size * 0.45);
    ctx.closePath();
    ctx.fillStyle = finPreset.fill ?? palette.accents ?? '#2ad0ff';
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (accentPreset?.enabled !== false) {
      ctx.beginPath();
      ctx.arc(size * 0.4, 0, size * 0.25, 0, TAU);
      ctx.fillStyle = accentPreset.fill ?? palette.cockpit ?? '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  },
  'procedural-diamond': ({ enemy, ctx, colors, presets }) => {
    if (!ctx) return;

    const palette = colors || resolvePalette(enemy);
    const renderPreset = presets || resolvePresets(enemy);
    const hullPreset = renderPreset.hull ?? {};
    const accentPreset = renderPreset.accents ?? {};
    const turretPreset = renderPreset.turret ?? {};

    const size = enemy.radius ?? enemy.size ?? 16;
    const turretAngle = enemy.turretAngle ?? enemy.rotation ?? 0;

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.rotation ?? 0);

    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size, 0);
    ctx.closePath();
    ctx.fillStyle = hullPreset.fill ?? palette.body ?? '#ffdd63';
    ctx.strokeStyle = hullPreset.stroke ?? palette.outline ?? '#413005';
    ctx.lineWidth = hullPreset.strokeWidth ?? 2;
    ctx.fill();
    ctx.stroke();

    if (accentPreset?.enabled !== false) {
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.6);
      ctx.lineTo(size * 0.6, 0);
      ctx.lineTo(0, size * 0.6);
      ctx.lineTo(-size * 0.6, 0);
      ctx.closePath();
      ctx.fillStyle = accentPreset.fill ?? palette.accents ?? '#ffb347';
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (turretPreset?.enabled !== false) {
      ctx.save();
      ctx.rotate(turretAngle - (enemy.rotation ?? 0));
      ctx.beginPath();
      ctx.roundRect(size * 0.2, -size * 0.15, size * 0.9, size * 0.3, size * 0.1);
      ctx.fillStyle = turretPreset.fill ?? palette.turret ?? '#ffe6a6';
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  },
  'procedural-sphere': ({ enemy, ctx, colors, presets }) => {
    if (!ctx) return;
    const palette = colors || resolvePalette(enemy);
    const renderPreset = presets || resolvePresets(enemy);
    const bodyPreset = renderPreset.body ?? {};
    const pulsePreset = renderPreset.pulse ?? {};

    const size = enemy.radius ?? enemy.size ?? 18;
    const pulseSpeed = pulsePreset.speed ?? enemy.pulseSpeed ?? 2.2;
    const pulseAmount = pulsePreset.amount ?? enemy.pulseAmount ?? 0.25;
    const time = enemy.system?.time ?? performance.now() / 1000;
    const pulse = 1 + Math.sin(time * pulseSpeed) * pulseAmount;

    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    const gradient = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * pulse);
    gradient.addColorStop(0, bodyPreset.core ?? palette.core ?? '#fff1b8');
    gradient.addColorStop(1, bodyPreset.edge ?? palette.body ?? '#ffad33');
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.arc(0, 0, size * pulse, 0, TAU);
    ctx.fill();

    if (pulsePreset?.enabled !== false) {
      ctx.beginPath();
      ctx.arc(0, 0, size * (pulse + 0.25), 0, TAU);
      ctx.strokeStyle = pulsePreset.stroke ?? palette.halo ?? 'rgba(255, 200, 120, 0.35)';
      ctx.lineWidth = pulsePreset.strokeWidth ?? 2;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  },
  'procedural-boss': ({ enemy, ctx, colors, presets }) => {
    if (!ctx) return;
    const palette = colors || resolvePalette(enemy);
    const renderPreset = presets || resolvePresets(enemy);
    const auraPreset = renderPreset.aura ?? {};
    const hullPreset = renderPreset.hull ?? {};
    const corePreset = renderPreset.core ?? {};

    const size = enemy.radius ?? enemy.size ?? 60;
    const auraPulse = auraPreset.pulse ?? 0.18;
    const pulseSpeed = auraPreset.speed ?? 1.2;
    const time = enemy.system?.time ?? performance.now() / 1000;
    const pulse = 1 + Math.sin(time * pulseSpeed) * auraPulse;

    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    if (auraPreset?.enabled !== false) {
      const gradient = ctx.createRadialGradient(0, 0, size, 0, 0, size * (1.5 * pulse));
      gradient.addColorStop(0, auraPreset.inner ?? palette.aura ?? 'rgba(255, 120, 90, 0.4)');
      gradient.addColorStop(1, auraPreset.outer ?? 'rgba(120, 20, 10, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.5 * pulse, 0, TAU);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 0, size, 0, TAU);
    ctx.fillStyle = hullPreset.fill ?? palette.body ?? '#8c4cff';
    ctx.strokeStyle = hullPreset.stroke ?? palette.outline ?? '#2d0a57';
    ctx.lineWidth = hullPreset.strokeWidth ?? 6;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, size * 0.55, 0, TAU);
    ctx.fillStyle = corePreset.fill ?? palette.core ?? '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  },
  delegate: ({ enemy, ctx }) => {
    if (typeof enemy?.onDraw === 'function') {
      enemy.onDraw(ctx);
    }
  },
};

export class RenderComponent {
  constructor(config = {}) {
    this.config = { ...config };
    this.strategy = config.strategy || 'delegate';
    this.strategies = new Map(Object.entries(defaultStrategies));
  }

  registerStrategy(name, handler) {
    if (!name || typeof handler !== 'function') {
      return;
    }
    this.strategies.set(name, handler);
  }

  setStrategy(name) {
    this.strategy = name;
  }

  draw(context) {
    const enemy = context?.enemy;
    const ctx = context?.ctx;
    if (!enemy || !ctx) {
      return;
    }

    const strategyName = enemy.renderStrategy || this.strategy;
    const handler = this.strategies.get(strategyName) || this.strategies.get('delegate');

    const colors = context.colors ?? resolvePalette(enemy);
    const presets = context.presets ?? resolvePresets(enemy);

    handler?.({ enemy, ctx, colors, presets, config: this.config });

    if (this.config.debug) {
      drawDebugInfo({ enemy, ctx, colors });
    }
  }
}

const drawDebugInfo = ({ enemy, ctx }) => {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius ?? 16, 0, TAU);
  ctx.stroke();
  ctx.restore();
};
