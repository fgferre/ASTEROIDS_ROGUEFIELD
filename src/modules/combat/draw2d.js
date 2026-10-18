// FROZEN (18/10/2026): the Canvas 2D gameplay renderer is an easter egg
// (`?renderer=2d`). No new features, no 2D/3D parity, no captures: new
// machines, weapons and effects are built in src/modules/render3d/ only.
// Touch this file only to keep it from breaking.
// tests/process/render2d-frozen.test.js pins its size.
//
// The shots, the weapon effects and the lock feedback as the 2D renderer
// draws them, plus the lance sprite cache only it reads. CombatSystem owns it
// and hands it the combat state as `fx`, built on each call:
//   player, bullets, enemyBullets, projectilePerf (the draw times itself into
//   it), lanceLook, beams, flakBursts, arcs, wells, burns, slows, pulls,
//   cinders, ions, afterburnTrail, currentTarget, currentLockAssignments,
//   predictedAimPoints, usingDynamicPrediction (a boolean),
//   targetingUpgradeLevel, aimMode, targetPulseDuration,
//   targetIndicatorPulse, targetThreatCache, aimingConfig, lockHighlightAlpha,
//   lockLineAlpha, predictedMarkerRadius.

import { drawEnemyProjectile } from '../../utils/drawEnemyProjectile.js';
import { hashUnit } from './CardEffects.js';
import { ION_TRAIL_GAP } from '../../data/constants/gameplay.js';
import { getRenderScale } from '../../core/viewport.js';
import { getEmissive } from '../../core/bloomLayer.js';
import { LINE, PALETTE, withAlpha } from '../../data/constants/palette.js';
import { WEAPONS, WEAPON_APEX, WEAPON_EVOLUTIONS } from '../../data/weapons.js';

const LANCE_SPRITE = { width: 16, height: 8, originX: 12 };
const BEAM_COLORS = WEAPONS.harmonic.colors;
const FLAK = WEAPONS.scatter.flak;
const FLAK_COLORS = WEAPONS.scatter.colors;
const FLAK_SPARKS = 7; // proposta 18/10: 2D shrapnel streaks per burst
// Afterburn's 2D look, proposta 18/10: an amber band (px wide when fresh)
// under a hot core that cools first, so old segments read as embers.
const AFTERBURN_LOOK = { band: 6, bandAlpha: 0.55, core: 2, coreAlpha: 0.85 };

export class CombatDraw2D {
  constructor() {
    this.lanceSprite = null;
  }

  // Lance shot (docs/NORTE.md §3): 8×2 amber core behind a 4 px white-hot
  // head, axis +x, origin at the head. `head` is the emissive copy.
  // Colours follow the evolved look (lanceLook).
  ensureLanceSprite(fx) {
    const scale = getRenderScale();
    const { body, head: headColor } = fx.lanceLook;
    if (
      this.lanceSprite &&
      this.lanceSprite.scale === scale &&
      this.lanceSprite.body === body &&
      this.lanceSprite.headColor === headColor
    ) {
      return this.lanceSprite;
    }
    if (typeof document === 'undefined') {
      return null;
    }

    const bake = (drawHead, drawCore) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(LANCE_SPRITE.width * scale);
      canvas.height = Math.ceil(LANCE_SPRITE.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(scale, scale);
      ctx.translate(LANCE_SPRITE.originX, LANCE_SPRITE.height / 2);
      if (drawCore) {
        const core = ctx.createLinearGradient(-8, 0, 0, 0);
        core.addColorStop(0, withAlpha(body, 0));
        core.addColorStop(0.45, withAlpha(body, 0.9));
        core.addColorStop(1, body);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-1, -1);
        ctx.lineTo(0, 0);
        ctx.lineTo(-1, 1);
        ctx.closePath();
        ctx.fill();
      }
      if (drawHead) {
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 3.5);
        halo.addColorStop(
          0,
          withAlpha(headColor === PALETTE.text ? body : headColor, 0.55)
        );
        halo.addColorStop(1, withAlpha(body, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = headColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, 2, 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return canvas;
    };

    const lance = bake(true, true);
    const head = bake(true, false);
    this.lanceSprite =
      lance && head ? { lance, head, scale, body, headColor } : null;
    return this.lanceSprite;
  }

  drawLanceTrail(ctx, bullet, fx) {
    const trail = bullet.trail;
    const count = trail.length + 1;
    const { trailStyles, width, outer, apex, sparkle } = fx.lanceLook;
    ctx.lineCap = 'round';
    // Apex: a wide halo in `outer` under the trail, a white core over it.
    const polyline = (color, lineWidth) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let k = 1; k < trail.length; k += 1)
        ctx.lineTo(trail[k].x, trail[k].y);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    };
    if (outer) polyline(withAlpha(outer, 0.22), 4.5 * width);
    let prev = trail[0];
    for (let k = 1; k < count; k += 1) {
      const point = k < trail.length ? trail[k] : bullet;
      const f = k / (count - 1);
      ctx.strokeStyle = trailStyles[Math.round(f * (trailStyles.length - 1))];
      ctx.lineWidth = (0.3 + 1.7 * f) * width;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      prev = point;
    }
    if (apex) polyline(withAlpha(PALETTE.text, 0.75), 0.6 * width);
    if (sparkle) {
      ctx.fillStyle = withAlpha(sparkle, 0.85);
      for (let k = trail.length % 2; k < trail.length; k += 2) {
        const g = hashUnit(Math.round(trail[k].x * 7 + trail[k].y * 13));
        if (g < 0.1) continue;
        ctx.fillRect(trail[k].x - g, trail[k].y - g, 2 * g, 2 * g);
      }
    }
  }

  // Scatter Coil bolt: a short amber tracer fading in toward a white-hot
  // head. The emissive (bloom) copy is the core alone.
  drawFlakBolt(ctx, bolt, coreOnly = false) {
    const tail = bolt.trail[0] || bolt;
    const line = (style, lineWidth) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(bolt.x, bolt.y);
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    if (!coreOnly) {
      const glow = ctx.createLinearGradient(tail.x, tail.y, bolt.x, bolt.y);
      glow.addColorStop(0, withAlpha(FLAK_COLORS.tracer, 0));
      glow.addColorStop(1, withAlpha(FLAK_COLORS.tracer, 0.6));
      line(glow, 3.4);
    }
    line(withAlpha(FLAK_COLORS.core, 0.85), 1.2);
    ctx.fillStyle = FLAK_COLORS.core;
    ctx.beginPath();
    ctx.arc(bolt.x, bolt.y, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Beams, chain arcs and the burn/slow marks, in 'lighter' mode; the white
  // cores also go to the emissive (bloom) layer.
  drawWeaponEffects(ctx, emissive, fx) {
    const look = fx.lanceLook;
    fx.cinders.forEach((cinder) => {
      const k = cinder.life / cinder.maxLife;
      ctx.fillStyle = withAlpha(WEAPON_EVOLUTIONS.thermal.look.trail, 0.5 * k);
      ctx.beginPath();
      ctx.arc(cinder.x, cinder.y, 2 + 3 * k, 0, Math.PI * 2);
      ctx.fill();
    });
    // Ion Trail: a cyan line, broken where thrust stopped.
    ctx.lineCap = 'round';
    for (let i = 1; i < fx.ions.length; i += 1) {
      const a = fx.ions[i - 1];
      const b = fx.ions[i];
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > ION_TRAIL_GAP ** 2) continue;
      ctx.strokeStyle = withAlpha(PALETTE.player, 0.6 * (b.life / b.maxLife));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Afterburn: the dash's line, amber cooling to ember as it ages.
    const burnLine = fx.afterburnTrail;
    for (let i = 1; i < burnLine.length; i += 1) {
      const a = burnLine[i - 1];
      const b = burnLine[i];
      if (!b.joined) continue;
      const k = b.life / b.maxLife;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = withAlpha(PALETTE.shot, AFTERBURN_LOOK.bandAlpha * k);
      ctx.lineWidth = AFTERBURN_LOOK.band * (0.5 + 0.5 * k);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(
        WEAPON_EVOLUTIONS.thermal.look.trail,
        AFTERBURN_LOOK.coreAlpha * k * k
      );
      ctx.lineWidth = AFTERBURN_LOOK.core;
      ctx.stroke();
    }
    fx.burns.forEach((entry, enemy) => {
      const r = (enemy.radius || 12) * 0.9;
      const glow = ctx.createRadialGradient(
        enemy.x,
        enemy.y,
        0,
        enemy.x,
        enemy.y,
        r
      );
      glow.addColorStop(
        0,
        withAlpha(WEAPON_EVOLUTIONS.thermal.look.trail, 0.35)
      );
      glow.addColorStop(1, withAlpha(PALETTE.shot, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    fx.slows.forEach((entry, enemy) => {
      ctx.lineWidth = LINE.thin;
      ctx.strokeStyle = withAlpha(WEAPON_EVOLUTIONS.field.look.trail, 0.55);
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, (enemy.radius || 12) + 4, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Singularity: rings on the pulled, a ring collapsing onto each hit point.
    const singularity = WEAPON_APEX.field;
    fx.pulls.forEach((entry, enemy) => {
      ctx.lineWidth = LINE.thin;
      ctx.strokeStyle = withAlpha(singularity.look.outer, 0.6);
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, (enemy.radius || 12) + 3, 0, Math.PI * 2);
      ctx.stroke();
    });
    fx.wells.forEach((well) => {
      const k = well.life / well.maxLife;
      ctx.lineWidth = 2;
      ctx.strokeStyle = withAlpha(singularity.look.outer, 0.8 * (1.2 - k));
      ctx.beginPath();
      ctx.arc(
        well.x,
        well.y,
        6 + (singularity.pull.radius - 6) * k,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    });

    ctx.lineCap = 'round';
    fx.arcs.forEach((arc) => {
      const k = arc.life / arc.maxLife;
      const stroke = (target, color, lineWidth) => {
        target.strokeStyle = color;
        target.lineWidth = lineWidth;
        target.beginPath();
        target.moveTo(arc.points[0].x, arc.points[0].y);
        for (let i = 1; i < arc.points.length; i += 1) {
          target.lineTo(arc.points[i].x, arc.points[i].y);
        }
        target.stroke();
      };
      // Storm Lance bolts are thicker.
      const scale = arc.heavy ? 1.7 : 1;
      const color = arc.color || look.arc || PALETTE.player;
      if (arc.heavy) stroke(ctx, withAlpha(color, 0.3 * k), 6);
      stroke(ctx, withAlpha(color, 0.85 * k), 2.2 * scale);
      stroke(ctx, withAlpha(PALETTE.text, 0.9 * k), 0.8 * scale);
      if (emissive) stroke(emissive, withAlpha(PALETTE.text, k), 0.8);
    });

    // Flak bursts: a hot flash, a ring opening to the burst radius and a
    // spray of shrapnel streaks (angles hashed from the burst's position).
    fx.flakBursts.forEach((burst) => {
      const k = burst.life / burst.maxLife;
      const r = FLAK.burstRadius * (0.35 + 0.65 * (1 - k));
      ctx.fillStyle = withAlpha(FLAK_COLORS.core, 0.6 * k * k);
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, 4 + 8 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 0.6 + 2 * k;
      ctx.strokeStyle = withAlpha(FLAK_COLORS.burst, 0.8 * k);
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, r, 0, Math.PI * 2);
      ctx.stroke();
      const seed = Math.round(burst.x * 7 + burst.y * 13);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = withAlpha(FLAK_COLORS.core, 0.9 * k);
      ctx.beginPath();
      for (let i = 0; i < FLAK_SPARKS; i += 1) {
        const a =
          burst.angle +
          (Math.PI * 2 * i) / FLAK_SPARKS +
          hashUnit(seed + i) * 0.4;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        ctx.moveTo(burst.x + cos * r * 0.55, burst.y + sin * r * 0.55);
        ctx.lineTo(burst.x + cos * r * 0.95, burst.y + sin * r * 0.95);
      }
      ctx.stroke();
      if (emissive) {
        emissive.fillStyle = withAlpha(FLAK_COLORS.core, k);
        emissive.beginPath();
        emissive.arc(burst.x, burst.y, 3 + 4 * k, 0, Math.PI * 2);
        emissive.fill();
      }
    });

    fx.beams.forEach((beam) => {
      const k = beam.life / beam.maxLife;
      const ramp = (color, alpha) => {
        const g = ctx.createLinearGradient(beam.x, beam.y, beam.ex, beam.ey);
        g.addColorStop(0, withAlpha(color, alpha));
        g.addColorStop(0.8, withAlpha(color, alpha * 0.8));
        g.addColorStop(1, withAlpha(color, 0));
        return g;
      };
      const stroke = (target, style, lineWidth) => {
        target.lineCap = 'round';
        target.strokeStyle = style;
        target.lineWidth = lineWidth;
        target.beginPath();
        target.moveTo(beam.x, beam.y);
        target.lineTo(beam.ex, beam.ey);
        target.stroke();
      };
      stroke(ctx, ramp(BEAM_COLORS.glow, 0.35 * k), beam.width * 2.2);
      stroke(ctx, ramp(BEAM_COLORS.mid, 0.8 * k), beam.width);
      stroke(ctx, ramp(BEAM_COLORS.core, k), beam.width * 0.35);
      if (emissive) {
        stroke(emissive, ramp(BEAM_COLORS.core, k), beam.width * 0.5);
      }
    });
  }

  render(ctx, fx) {
    if (!ctx) return;

    const player = fx.player;
    const emissive = getEmissive();
    const sprite = this.ensureLanceSprite(fx);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Always render bullets - they keep flying
    const projectileRenderStart = performance.now();
    emissive?.save();
    fx.bullets.forEach((bullet) => {
      if (bullet.hit) return;

      if (bullet.kind === 'flak') {
        this.drawFlakBolt(ctx, bullet);
        if (emissive) this.drawFlakBolt(emissive, bullet, true);
        return;
      }

      if (bullet.trail.length > 0) {
        this.drawLanceTrail(ctx, bullet, fx);
        if (emissive) this.drawLanceTrail(emissive, bullet, fx);
      }

      if (!sprite) return;
      const angle = Math.atan2(bullet.vy || 0, bullet.vx || 1);
      const { headLength, width } = fx.lanceLook;
      const draw = (target, image) => {
        target.save();
        target.translate(bullet.x, bullet.y);
        target.rotate(angle);
        target.scale(headLength, width);
        target.drawImage(
          image,
          -LANCE_SPRITE.originX,
          -LANCE_SPRITE.height / 2,
          LANCE_SPRITE.width,
          LANCE_SPRITE.height
        );
        target.restore();
      };
      draw(ctx, sprite.lance);
      if (emissive) draw(emissive, sprite.head);
    });
    this.drawWeaponEffects(ctx, emissive, fx);
    emissive?.restore();

    ctx.restore(); // End 'lighter' mode

    if (Array.isArray(fx.enemyBullets) && fx.enemyBullets.length) {
      for (let i = 0; i < fx.enemyBullets.length; i += 1) {
        const bullet = fx.enemyBullets[i];

        if (!bullet || bullet.hit) {
          continue;
        }

        drawEnemyProjectile(ctx, bullet);
      }
    }
    fx.projectilePerf.projectileRenderMs =
      performance.now() - projectileRenderStart;

    // The lock line starts at the turret's muzzle.
    const playerPosition = player.getMuzzlePoint();

    const lockAssignments =
      Array.isArray(fx.currentLockAssignments) &&
      fx.currentLockAssignments.length
        ? fx.currentLockAssignments
        : fx.currentTarget
          ? [
              {
                enemy: fx.currentTarget,
                index: 0,
                duplicateIndex: 0,
                duplicateCount: 1,
              },
            ]
          : [];

    // Plan 01.07 Task 7 — gate targeting visual feedback by upgrade rank +
    // aim mode.
    //   rank 0 → nothing (skip lock ring + predicted markers + multi-lock).
    //   rank 1 → priority-lock ring + pulse on currentTarget (first assignment only).
    //   rank 2 → + predicted-impact marker (predictedAimPoints render).
    //   rank 3 → + multi-lock indicators (all assignments).
    //   aim mode 'manual' → all targeting render skipped (no leak).
    const targetingRank = fx.targetingUpgradeLevel || 0;
    const renderTargetingFeedback =
      fx.aimMode !== 'manual' && targetingRank >= 1;
    const renderMultiLock = targetingRank >= 3;

    if (
      renderTargetingFeedback &&
      lockAssignments.length &&
      player &&
      !player.isDead &&
      !player.isRetrying &&
      !player._quitExplosionHidden &&
      playerPosition
    ) {
      const pulseDuration = fx.targetPulseDuration || 0.0001;
      const pulseRatio = Math.max(
        0,
        Math.min(1, fx.targetIndicatorPulse / pulseDuration)
      );

      const duplicateTotals = new Map();
      lockAssignments.forEach((assignment) => {
        const target = assignment.enemy;
        if (!target || target.destroyed) {
          return;
        }
        const id = target.id || assignment.index;
        duplicateTotals.set(id, assignment.duplicateCount || 1);
      });

      lockAssignments.forEach((assignment, index) => {
        const target = assignment.enemy;
        if (!target || target.destroyed) {
          return;
        }

        // Rank 1/2 render only the primary lock (index 0). Rank 3 renders all.
        if (!renderMultiLock && index > 0) {
          return;
        }

        const duplicateIndex = assignment.duplicateIndex || 0;
        // Fix-pass-3 Finding 4: ring color follows THREAT TIER, not
        // assignment index. Plan visual-direction palette: low = thruster
        // cyan (#00F2FF), high = alert red (#FF3131), medium = warning
        // amber (#FFA800; the plan did not pin a specific medium hex —
        // documented in the SUMMARY.md fix-pass-3 section).
        const ringColor = this.getThreatPaletteColor(target, fx);
        const baseAlpha =
          index === 0 ? fx.lockHighlightAlpha : fx.lockLineAlpha;
        const lineAlpha = Math.min(1, baseAlpha + pulseRatio * 0.25);
        const radiusBase = target.radius || 16;
        const arcRadius =
          radiusBase +
          6 +
          duplicateIndex * 4 +
          pulseRatio * (index === 0 ? 6 : 3.5);

        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = index === 0 ? LINE.thin : LINE.hair;
        ctx.strokeStyle = ringColor.ring(lineAlpha);
        ctx.beginPath();
        ctx.arc(target.x, target.y, arcRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.lineWidth = LINE.hair;
        ctx.strokeStyle = ringColor.line(lineAlpha * 0.35);
        ctx.beginPath();
        ctx.moveTo(playerPosition.x, playerPosition.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.restore();
      });
    }

    // Predicted-impact marker — rank 2+.
    const renderPredicted = fx.aimMode !== 'manual' && targetingRank >= 2;
    if (
      renderPredicted &&
      fx.predictedAimPoints.length &&
      fx.usingDynamicPrediction
    ) {
      fx.predictedAimPoints.forEach(
        ({ enemy, position, index, duplicateIndex }) => {
          if (!position) {
            return;
          }
          // Rank 2 renders only the primary predicted marker; rank 3 renders all.
          if (!renderMultiLock && index > 0) {
            return;
          }

          // Predicted markers reuse the same threat-tier palette as the
          // lock ring (consistent visual language across rank 1 vs rank 2
          // affordances on the same target).
          const markerColor = this.getThreatPaletteColor(enemy, fx);
          const alpha = index === 0 ? 0.55 : 0.38;
          const radius =
            (fx.predictedMarkerRadius || 12) *
            (index === 0 ? 1 : 0.82 + duplicateIndex * 0.04);

          ctx.save();
          ctx.setLineDash([]);
          ctx.lineWidth = LINE.hair;
          ctx.strokeStyle = markerColor.ring(alpha);
          ctx.beginPath();
          ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.globalAlpha = alpha * 0.45;
          ctx.fillStyle = markerColor.fill(alpha * 0.35);
          ctx.beginPath();
          ctx.arc(position.x, position.y, radius * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      );
    }
  }

  /**
   * Fix-pass-3 Finding 4 helper. Map an enemy's threat-cache entry to a
   * palette triple {ring(alpha), line(alpha), fill(alpha)}. Tier bands
   * derived from `urgency` (the canonical "how dangerous is this enemy
   * right now" score from calculateImpactThreat — urgencyDistance=12 +
   * urgencyTime=10 weights, so the typical max scales near ~22 absent
   * hpUrgencyMultiplier stacking, or near ~46 with full hp stacking).
   *
   *   urgency <  1.5          → low    (#00F2FF cyan / thruster glow)
   *   urgency <  18           → medium (#FFA800 amber / warning)
   *   urgency >= 18           → high   (#FF3131 red / alert)
   *
   * Thresholds chosen so the default mid-arena distance threat (urgency
   * ≈ a couple) lands medium, idle-distant enemies land low, and
   * close-in-fast-incoming targets land high. The exact bands are tunable
   * via aimingConfig.threatPalette overrides without changing call sites.
   *
   * Returns a triple of helpers that take an alpha (0..1) and return the
   * 8-digit hex (#RRGGBBAA) — canvas-compatible and test-introspection-
   * friendly (the canonical hex appears in strokeStyle assignments).
   */
  getThreatPaletteColor(enemy, fx) {
    const overrides = fx.aimingConfig?.threatPalette || {};
    const lowHex = overrides.low || '#00F2FF';
    const mediumHex = overrides.medium || '#FFA800';
    const highHex = overrides.high || '#FF3131';
    const lowMaxUrgency = Number.isFinite(overrides.lowMaxUrgency)
      ? overrides.lowMaxUrgency
      : 1.5;
    const mediumMaxUrgency = Number.isFinite(overrides.mediumMaxUrgency)
      ? overrides.mediumMaxUrgency
      : 18;

    const id = enemy?.id;
    const cacheEntry = id != null ? fx.targetThreatCache.get(id) : null;
    const urgency =
      cacheEntry?.breakdown?.impact?.urgency ??
      cacheEntry?.breakdown?.urgency ??
      0;

    let hex = mediumHex;
    if (urgency < lowMaxUrgency) {
      hex = lowHex;
    } else if (urgency >= mediumMaxUrgency) {
      hex = highHex;
    }

    // Returns the canonical hex (#RRGGBB) with the alpha encoded as the
    // 8-digit hex suffix #RRGGBBAA. Browsers (and canvas-2d) accept this
    // standard. The hex form keeps the palette token directly readable in
    // strokeStyle assignments (test introspection matches the hex slug).
    const colorAt = (alpha) => {
      const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
      const aHex = Math.round(clampedAlpha * 255)
        .toString(16)
        .padStart(2, '0');
      return `${hex}${aHex}`;
    };

    return {
      hex,
      ring: colorAt,
      line: colorAt,
      fill: colorAt,
    };
  }
}
