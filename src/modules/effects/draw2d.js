// FROZEN (18/10/2026): the Canvas 2D gameplay renderer is an easter egg
// (`?renderer=2d`). No new features, no 2D/3D parity, no captures: new
// machines, weapons and effects are built in src/modules/render3d/ only.
// Touch this file only to keep it from breaking.
// tests/process/render2d-frozen.test.js pins its size.
//
// The effects as the 2D renderer draws them, plus the two lists only it reads
// (boss attack telegraphs, directional damage chevrons), which it keeps.
// EffectsSystem owns it, ticks those lists, and hands it the rest as `fx`.

import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';
import { applyBaseTransform } from '../../core/viewport.js';
import { LINE, PALETTE } from '../../data/constants/palette.js';
import { getEmissive } from '../../core/bloomLayer.js';
import { drawParticle } from '../EffectEntities.js';
import { WARDEN_KINDS } from '../../data/enemies/boss.js';

export class Draw2D {
  constructor() {
    this.telegraphs = [];
    this.damageIndicators = [];
  }

  reset() {
    this.telegraphs = [];
    this.damageIndicators = [];
  }

  addTelegraph(boss) {
    if (boss && !this.telegraphs.includes(boss)) {
      this.telegraphs.push(boss);
    }
  }

  pruneTelegraphs() {
    if (!this.telegraphs.length) return;
    this.telegraphs = this.telegraphs.filter(
      (boss) => boss && !boss.destroyed && boss.telegraph
    );
  }

  createDirectionalDamageIndicator(damageSourcePos, playerPos) {
    // Calculate angle from player to damage source
    const dx = damageSourcePos.x - playerPos.x;
    const dy = damageSourcePos.y - playerPos.y;
    const angle = Math.atan2(dy, dx);

    // Calculate screen edge position
    // Use half screen dimensions to position at edge
    const halfWidth = GAME_WIDTH / 2;
    const halfHeight = GAME_HEIGHT / 2;

    // Find intersection with screen edge
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Calculate which edge the indicator should appear on
    let edgeX, edgeY;
    const tanAngle = Math.abs(sin / cos);

    if (tanAngle < halfHeight / halfWidth) {
      // Hit left or right edge
      edgeX = cos > 0 ? GAME_WIDTH - 40 : 40;
      edgeY = halfHeight + (edgeX - halfWidth) * (sin / cos);
    } else {
      // Hit top or bottom edge
      edgeY = sin > 0 ? GAME_HEIGHT - 40 : 40;
      edgeX = halfWidth + (edgeY - halfHeight) * (cos / sin);
    }

    this.damageIndicators.push({
      x: edgeX,
      y: edgeY,
      angle: angle + Math.PI, // Point inward toward threat
      life: 0.6, // 0.6s visibility
      maxLife: 0.6,
      expansion: 0,
      color: PALETTE.threat,
    });
  }

  updateDamageIndicators(deltaTime) {
    const indicators = this.damageIndicators;
    let writeIndex = 0;

    for (let i = 0; i < indicators.length; i += 1) {
      const indicator = indicators[i];
      if (!indicator) {
        continue;
      }

      indicator.life -= deltaTime;
      indicator.expansion += deltaTime * 30; // Expand at 30px/s
      if (indicator.life > 0) {
        indicators[writeIndex++] = indicator;
      }
    }

    indicators.length = writeIndex;
  }

  applyScreenShake(ctx, screenShake) {
    // Apply trauma-based screen shake
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    screenShake.apply(ctx, centerX, centerY);
  }

  // `fx`: { particles, shockwaves, hitMarkers, damageTexts, screenFlash,
  // bossTransitionEffects }, read from EffectsSystem each frame.
  draw(ctx, fx) {
    this.drawWorld(ctx, fx);
    this.drawScreenSpace(ctx, fx);
  }

  drawAmbient(ctx, ambientChips, motes) {
    for (let i = 0; i < ambientChips.length; i += 1) {
      drawParticle(ctx, ambientChips[i]);
    }

    if (!motes.length) return;
    const paint = (target, radiusScale) => {
      target.save();
      target.globalCompositeOperation = 'lighter';
      target.fillStyle = PALETTE.shot;
      for (let i = 0; i < motes.length; i += 1) {
        const mote = motes[i];
        if (mote.alpha <= 0) continue;
        target.globalAlpha = mote.alpha;
        target.beginPath();
        target.arc(mote.x, mote.y, mote.size * radiusScale, 0, Math.PI * 2);
        target.fill();
      }
      target.restore();
    };
    paint(ctx, 0.6);
    const emissive = getEmissive();
    if (emissive) paint(emissive, 1.8);
  }

  drawWorld(ctx, fx) {
    const emissive = getEmissive();
    for (let i = 0; i < fx.particles.length; i += 1) {
      drawParticle(ctx, fx.particles[i], emissive);
    }

    this.drawShockwaves(ctx, fx, emissive);
    this.drawTelegraphs(ctx);

    // Draw hit markers
    for (let i = 0; i < fx.hitMarkers.length; i += 1) {
      const marker = fx.hitMarkers[i];
      if (marker) {
        marker.draw(ctx);
      }
    }

    // Draw damage numbers
    for (let i = 0; i < fx.damageTexts.length; i += 1) {
      const text = fx.damageTexts[i];
      if (text) {
        text.draw(ctx);
      }
    }
  }

  drawScreenSpace(ctx, fx) {
    if (!ctx) return;

    // Screen-space overlays should stay anchored to the viewport.
    this.drawScreenSpaceLayer(ctx, () => {
      this.drawDamageIndicators(ctx);

      if (fx.screenFlash.timer > 0) {
        const alpha =
          (fx.screenFlash.timer / fx.screenFlash.duration) *
          fx.screenFlash.intensity;
        ctx.fillStyle = fx.screenFlash.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      }

      this.drawBossTransitions(ctx, fx);
    });
  }

  drawScreenSpaceLayer(ctx, drawCallback) {
    if (!ctx || typeof drawCallback !== 'function') {
      return;
    }

    ctx.save();
    applyBaseTransform(ctx);

    try {
      drawCallback();
    } finally {
      ctx.restore();
    }
  }

  // Boss attack telegraphs: a lane for the charge (dark for the Null), a wedge
  // for the fan, a line per core for the chorus. They read the boss's live
  // state each frame, so the owner is the boss itself.
  drawTelegraphs(ctx) {
    if (!ctx || !this.telegraphs.length) return;

    for (let i = 0; i < this.telegraphs.length; i += 1) {
      const boss = this.telegraphs[i];
      const t = boss?.telegraph;
      if (!t || boss.destroyed) continue;

      const duration = t.duration > 0 ? t.duration : 1;
      const progress = Math.min(1, Math.max(0, 1 - t.timer / duration));
      const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 6);
      // the Choir's fan comes from its singing core, so the ring hugs that
      const radius = Math.max(
        20,
        t.type === 'fan' && boss.bossKind === 'choir'
          ? WARDEN_KINDS.choir.coreRadius * 1.3
          : boss.radius || 60
      );
      // a telegraph may start off the hull (a Choir core); default the hull
      const originX = Number.isFinite(t.x) ? t.x : boss.x;
      const originY = Number.isFinite(t.y) ? t.y : boss.y;

      ctx.save();
      ctx.translate(originX, originY);
      ctx.rotate(t.angle || 0);
      ctx.globalCompositeOperation = 'lighter';

      if (t.type === 'charge' && t.tone === 'dark') {
        // the Null's lane: a dark band between two violet edges
        const length = Math.max(radius * 2, t.length || 400);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.35 + 0.4 * progress;
        ctx.fillStyle = PALETTE.background;
        ctx.fillRect(0, -radius * 0.9, length, radius * 1.8);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3 + 0.6 * progress;
        ctx.strokeStyle = PALETTE.boss;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -radius * 0.9);
        ctx.lineTo(length, -radius * 0.9);
        ctx.moveTo(0, radius * 0.9);
        ctx.lineTo(length, radius * 0.9);
        ctx.stroke();
        ctx.globalAlpha = 0.35 + 0.55 * progress;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -progress * 120;
        ctx.beginPath();
        ctx.moveTo(radius * 0.6, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (t.type === 'chorus') {
        // one line from each living core to the locked focus point
        ctx.globalAlpha = (0.3 + 0.6 * progress) * (0.7 + 0.3 * pulse);
        ctx.strokeStyle = PALETTE.threat;
        ctx.lineWidth = 2 + 4 * progress;
        ctx.beginPath();
        for (const line of t.lines || []) {
          const x = line.x - originX;
          const y = line.y - originY;
          ctx.moveTo(x, y);
          ctx.lineTo(
            x + Math.cos(line.angle) * line.length,
            y + Math.sin(line.angle) * line.length
          );
        }
        ctx.stroke();
      } else if (t.type === 'charge') {
        const length = Math.max(radius * 2, t.length || 400);
        // faint lane, widening as the strike nears
        ctx.globalAlpha = 0.08 + 0.18 * progress;
        ctx.fillStyle = PALETTE.threat;
        ctx.fillRect(0, -radius * 0.9, length, radius * 1.8);
        // sharp dashed centerline
        ctx.globalAlpha = 0.35 + 0.55 * progress;
        ctx.strokeStyle = PALETTE.threat;
        ctx.lineWidth = 2;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -progress * 120;
        ctx.beginPath();
        ctx.moveTo(radius * 0.6, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        // chevron at the end
        ctx.beginPath();
        ctx.moveTo(length - 18, -12);
        ctx.lineTo(length, 0);
        ctx.lineTo(length - 18, 12);
        ctx.stroke();
      } else if (t.type === 'fan') {
        const arc = Math.max(0.1, t.arc || 0.8);
        const length = Math.max(radius * 1.5, t.length || 180);
        ctx.globalAlpha = 0.07 + 0.2 * progress;
        ctx.fillStyle = PALETTE.threat;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, length, -arc / 2, arc / 2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.3 + 0.6 * progress;
        ctx.strokeStyle = PALETTE.threat;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // warning ring around the hull, pulsing faster as it nears
      ctx.rotate(-(t.angle || 0));
      ctx.globalAlpha = (0.2 + 0.5 * progress) * (0.6 + 0.4 * pulse);
      ctx.strokeStyle = PALETTE.threat;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * (1.15 + 0.1 * pulse), 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  // A ring in the source's color with a thin hot core; the bloom layer gives
  // it the glow that shadowBlur used to fake.
  drawShockwaves(ctx, fx, emissive = null) {
    if (!ctx) return;

    for (let i = 0; i < fx.shockwaves.length; i += 1) {
      const wave = fx.shockwaves[i];
      if (!wave || wave.radius <= 0) continue;
      const color = wave.color || PALETTE.shot;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = wave.alpha;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(LINE.thin, wave.lineWidth * 0.3);
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.globalAlpha = wave.alpha * 0.6;
      ctx.lineWidth = LINE.hair;
      ctx.strokeStyle = PALETTE.text;
      ctx.stroke();
      ctx.restore();

      if (emissive) {
        emissive.save();
        emissive.globalAlpha = wave.alpha;
        emissive.beginPath();
        emissive.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
        emissive.lineWidth = Math.max(LINE.base, wave.lineWidth * 0.5);
        emissive.strokeStyle = color;
        emissive.stroke();
        emissive.restore();
      }
    }
  }

  drawBossTransitions(ctx, fx) {
    if (!ctx || !Array.isArray(fx.bossTransitionEffects)) {
      return;
    }

    const { width, height } = ctx.canvas || {
      width: GAME_WIDTH || 800,
      height: GAME_HEIGHT || 600,
    };

    fx.bossTransitionEffects.forEach((effect) => {
      if (!effect) {
        return;
      }

      const progress = Math.min(1, effect.timer / effect.duration);
      const fadePower = Number.isFinite(effect.fadePower)
        ? Math.max(0.1, effect.fadePower)
        : 1.5;
      const fade = Math.max(0, 1 - Math.pow(progress, fadePower));
      const pulseFrequency = Number.isFinite(effect.pulseFrequency)
        ? effect.pulseFrequency
        : 1.8;
      const pulse = 0.65 + 0.35 * Math.sin(progress * Math.PI * pulseFrequency);
      const borderAlpha = effect.maxAlpha * fade * pulse;

      if (borderAlpha > 0.01) {
        const strokeWidth = effect.borderWidth * (0.85 + 0.15 * pulse);
        const inset = strokeWidth / 2 + 6;

        ctx.save();
        ctx.globalAlpha = borderAlpha;
        ctx.strokeStyle = effect.color || PALETTE.boss;
        ctx.lineWidth = strokeWidth;
        ctx.shadowColor = effect.color || PALETTE.boss;
        ctx.shadowBlur = strokeWidth * 1.4 * fade;
        ctx.beginPath();
        ctx.strokeRect(
          inset,
          inset,
          Math.max(0, width - inset * 2),
          Math.max(0, height - inset * 2)
        );
        ctx.restore();
      }

      const overlayAlpha =
        effect.overlayAlpha * fade * Math.min(1, pulse + 0.15);
      if (overlayAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = overlayAlpha;
        ctx.fillStyle = effect.color || PALETTE.boss;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
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
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = indicator.color;
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
}
