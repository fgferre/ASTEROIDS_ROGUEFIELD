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

const shapeRenderers = {
  triangle: ({ enemy, ctx, colors, presets, size, config }) => {
    const effectiveSize = size ?? 12;
    const hullPreset = presets.hull ?? {};
    const finPreset = presets.fins ?? {};
    const accentPreset = presets.accents ?? {};
    const exhaustPreset = presets.exhaust ?? {};

    const thrust = typeof enemy.getThrustIntensity === 'function'
      ? enemy.getThrustIntensity()
      : enemy.thrustIntensity ?? enemy._renderThrust ?? 0;
    const showThrust = config?.showThrust !== false;

    if (showThrust && exhaustPreset.enabled !== false && thrust > 0) {
      const exhaustColor = exhaustPreset.color ?? colors.exhaust ?? 'rgba(255, 200, 120, 0.65)';
      ctx.beginPath();
      ctx.moveTo(-effectiveSize * 0.2, effectiveSize * 0.65);
      ctx.lineTo(-effectiveSize * (0.7 + thrust * 0.5), 0);
      ctx.lineTo(-effectiveSize * 0.2, -effectiveSize * 0.65);
      ctx.closePath();
      ctx.fillStyle = exhaustColor;
      ctx.globalAlpha = 0.6 + thrust * 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.moveTo(effectiveSize, 0);
    ctx.lineTo(-effectiveSize * 0.4, effectiveSize * 0.75);
    ctx.lineTo(-effectiveSize * 0.4, -effectiveSize * 0.75);
    ctx.closePath();
    ctx.fillStyle = hullPreset.fill ?? colors.body ?? '#6cf9ff';
    ctx.strokeStyle = hullPreset.stroke ?? colors.outline ?? '#0b2d33';
    ctx.lineWidth = hullPreset.strokeWidth ?? 2;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(effectiveSize * 0.2, 0);
    ctx.lineTo(-effectiveSize * 0.35, effectiveSize * 0.45);
    ctx.lineTo(-effectiveSize * 0.35, -effectiveSize * 0.45);
    ctx.closePath();
    ctx.fillStyle = finPreset.fill ?? colors.accents ?? '#2ad0ff';
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (accentPreset?.enabled !== false) {
      ctx.beginPath();
      ctx.arc(effectiveSize * 0.4, 0, effectiveSize * 0.25, 0, TAU);
      ctx.fillStyle = accentPreset.fill ?? colors.cockpit ?? '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },
  diamond: ({ enemy, ctx, colors, presets, size, config }) => {
    const effectiveSize = size ?? 16;
    const hullPreset = presets.hull ?? {};
    const accentPreset = presets.accents ?? {};
    const turretPreset = presets.turret ?? {};
    const turretAngle = enemy.turretAngle ?? enemy.rotation ?? 0;
    const showTurret = config?.showTurret !== false;

    ctx.beginPath();
    ctx.moveTo(0, -effectiveSize);
    ctx.lineTo(effectiveSize, 0);
    ctx.lineTo(0, effectiveSize);
    ctx.lineTo(-effectiveSize, 0);
    ctx.closePath();
    ctx.fillStyle = hullPreset.fill ?? colors.body ?? '#ffdd63';
    ctx.strokeStyle = hullPreset.stroke ?? colors.outline ?? '#413005';
    ctx.lineWidth = hullPreset.strokeWidth ?? 2;
    ctx.fill();
    ctx.stroke();

    if (accentPreset?.enabled !== false) {
      ctx.beginPath();
      ctx.moveTo(0, -effectiveSize * 0.6);
      ctx.lineTo(effectiveSize * 0.6, 0);
      ctx.lineTo(0, effectiveSize * 0.6);
      ctx.lineTo(-effectiveSize * 0.6, 0);
      ctx.closePath();
      ctx.fillStyle = accentPreset.fill ?? colors.accents ?? '#ffb347';
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (showTurret && turretPreset?.enabled !== false) {
      ctx.save();
      ctx.rotate(turretAngle - (enemy.rotation ?? 0));
      ctx.beginPath();
      ctx.roundRect(
        effectiveSize * 0.2,
        -effectiveSize * 0.15,
        effectiveSize * 0.9,
        effectiveSize * 0.3,
        effectiveSize * 0.1,
      );
      ctx.fillStyle = turretPreset.fill ?? colors.turret ?? '#ffe6a6';
      ctx.fill();
      ctx.restore();
    }
  },
  sphere: ({ enemy, ctx, colors, presets, size, config }) => {
    const effectiveSize = size ?? 18;
    const bodyPreset = presets.body ?? {};
    const pulsePreset = presets.pulse ?? {};
    const showPulse = config?.showPulse !== false;

    const pulseSpeed = config?.pulseSpeed ?? pulsePreset.speed ?? enemy.pulseSpeed ?? 2.2;
    const pulseAmount = config?.pulseAmount ?? pulsePreset.amount ?? enemy.pulseAmount ?? 0.25;
    const time = enemy.system?.time ?? performance.now() / 1000;
    const pulse = 1 + Math.sin(time * pulseSpeed) * pulseAmount;

    const gradient = ctx.createRadialGradient(0, 0, effectiveSize * 0.2, 0, 0, effectiveSize * pulse);
    gradient.addColorStop(0, bodyPreset.core ?? colors.core ?? '#fff1b8');
    gradient.addColorStop(1, bodyPreset.edge ?? colors.body ?? '#ffad33');
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.arc(0, 0, effectiveSize * pulse, 0, TAU);
    ctx.fill();

    if (showPulse && pulsePreset?.enabled !== false) {
      ctx.beginPath();
      ctx.arc(0, 0, effectiveSize * (pulse + 0.25), 0, TAU);
      ctx.strokeStyle = pulsePreset.stroke ?? colors.halo ?? 'rgba(255, 200, 120, 0.35)';
      ctx.lineWidth = pulsePreset.strokeWidth ?? 2;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },
  boss: ({ enemy, ctx, colors, presets, size, config }) => {
    const effectiveSize = size ?? 60;
    const auraPreset = presets.aura ?? {};
    const hullPreset = presets.hull ?? {};
    const corePreset = presets.core ?? {};
    const showAura = config?.showAura !== false;

    const auraPulse = config?.auraPulse ?? auraPreset.pulse ?? 0.18;
    const pulseSpeed = config?.pulseSpeed ?? auraPreset.speed ?? 1.2;
    const time = enemy.system?.time ?? performance.now() / 1000;
    const pulse = 1 + Math.sin(time * pulseSpeed) * auraPulse;

    if (showAura && auraPreset?.enabled !== false) {
      const gradient = ctx.createRadialGradient(0, 0, effectiveSize, 0, 0, effectiveSize * (1.5 * pulse));
      const innerColor = auraPreset.inner ?? colors.aura ?? 'rgba(255, 120, 90, 0.4)';
      const outerColor = auraPreset.outer ?? 'rgba(120, 20, 10, 0)';
      gradient.addColorStop(0, innerColor);
      gradient.addColorStop(1, outerColor);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, effectiveSize * 1.5 * pulse, 0, TAU);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 0, effectiveSize, 0, TAU);
    ctx.fillStyle = hullPreset.fill ?? colors.body ?? '#8c4cff';
    ctx.strokeStyle = hullPreset.stroke ?? colors.outline ?? '#2d0a57';
    ctx.lineWidth = hullPreset.strokeWidth ?? 6;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, effectiveSize * 0.55, 0, TAU);
    ctx.fillStyle = corePreset.fill ?? colors.core ?? '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  },
};

const defaultStrategies = {
  procedural: ({ enemy, ctx, colors, presets, config }) => {
    if (!ctx) return;

    const palette = colors || resolvePalette(enemy);
    const renderPreset = presets || resolvePresets(enemy);
    const size = enemy.radius ?? enemy.size;
    const shape = config?.shape ?? enemy.renderShape ?? 'triangle';
    const renderer = shapeRenderers[shape];

    if (!renderer) {
      console.warn(`[RenderComponent] Unknown procedural shape: ${shape}`);
      return;
    }

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const rotation = enemy.rotation ?? 0;
    if (rotation) {
      ctx.rotate(rotation);
    }

    renderer({ enemy, ctx, colors: palette, presets: renderPreset, size, config });

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
