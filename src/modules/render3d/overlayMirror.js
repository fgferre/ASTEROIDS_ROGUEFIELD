// The overlays (hit markers, damage numbers, the boss-transition border,
// the lock marks, the magnetism field), mirrored every frame into
// Renderer3D's WebGL kit (`t`) and its DOM boss flash.

import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';
import { PALETTE, withAlpha } from '../../data/constants/palette.js';

const OVERLAY_H = 9;

// The overlays as flat ribbons on the field plane and camera-facing
// sprites. `flashScale`: Reduce Flashing (0.3) or 1.
export function mirrorOverlays(t, player, effects, xpOrbs, combat, flashScale) {
  const { ribbons } = t;
  const alive =
    player &&
    !player.isDead &&
    !player.isRetrying &&
    !player._quitExplosionHidden &&
    player.position;

  if (effects) {
    const markers = effects.hitMarkers || [];
    for (let i = 0; i < markers.length; i += 1) {
      const m = markers[i];
      if (!m) continue;
      const alpha = Math.max(0, m.life / m.maxLife);
      const r = m.size + m.expansion;
      const k = m.killed ? Math.SQRT1_2 : 1;
      const a = r * k;
      const b = m.killed ? a : 0;
      const gain = 0.7 * alpha;
      ribbons.segment(
        m.x - a,
        m.y - b,
        m.x + a,
        m.y + b,
        OVERLAY_H,
        t.textRgb,
        1.2,
        gain
      );
      ribbons.segment(
        m.x + b,
        m.y - a,
        m.x - b,
        m.y + a,
        OVERLAY_H,
        t.textRgb,
        1.2,
        gain
      );
    }

    const texts = effects.damageTexts || [];
    for (let i = 0; i < texts.length; i += 1) {
      const d = texts[i];
      if (!d) continue;
      t.texts.push(
        d.damage,
        d.x,
        d.y,
        d.size,
        d.color,
        Math.min(1, d.life * 2)
      );
    }

    mirrorBossTransitions(t, effects.bossTransitionEffects, flashScale);
  }

  if (!alive) return;
  const { x: px, y: py } = player.position;
  mirrorLocks(t, combat, player);

  const orbs = xpOrbs?.xpOrbs || [];
  let orbActive = false;
  for (let i = 0; i < orbs.length && !orbActive; i += 1) {
    orbActive = Boolean(orbs[i] && !orbs[i].collected);
  }
  if (orbActive) {
    const radius = player.getMagnetismRadius() || xpOrbs.getMagnetismRadius();
    const dashes = Math.max(12, Math.round((Math.PI * 2 * radius) / 6));
    ribbons.circle(px, py, radius, OVERLAY_H, t.accentRgb, 1, 0.25, dashes);
  }
}

// Gated by the aiming rank: rank 1 ring + line, rank 2 the predicted-aim
// marker, rank 3 every lock; nothing in manual aim. The
// lock line leaves the turret's muzzle.
export function mirrorLocks(t, combat, player) {
  if (!combat || combat.aimMode === 'manual') return;
  const rank = combat.targetingUpgradeLevel || 0;
  if (rank < 1) return;
  const { x: mx, y: my } = player.getMuzzlePoint();
  const { ribbons, accentRgb } = t;
  const multi = rank >= 3;
  const locks = combat.currentLockAssignments || [];
  const pulse = Math.max(
    0,
    Math.min(
      1,
      combat.targetIndicatorPulse / (combat.targetPulseDuration || 0.0001)
    )
  );
  const count = locks.length || (combat.currentTarget ? 1 : 0);
  for (let i = 0; i < count; i += 1) {
    if (!multi && i > 0) break;
    const lock = locks[i];
    const target = lock ? lock.enemy : combat.currentTarget;
    if (!target || target.destroyed) continue;
    const base = i === 0 ? combat.lockHighlightAlpha : combat.lockLineAlpha;
    const alpha = Math.min(1, (base || 0.6) + pulse * 0.25);
    const radius =
      (target.radius || 16) +
      6 +
      (lock?.duplicateIndex || 0) * 4 +
      pulse * (i === 0 ? 6 : 3.5);
    const dashes = Math.max(8, Math.round((Math.PI * 2 * radius) / 10));
    ribbons.circle(
      target.x,
      target.y,
      radius,
      OVERLAY_H,
      accentRgb,
      i === 0 ? 1.5 : 1,
      alpha * 0.8,
      dashes,
      0.6
    );
    ribbons.segment(
      mx,
      my,
      target.x,
      target.y,
      OVERLAY_H,
      accentRgb,
      1,
      alpha * 0.3
    );
  }

  if (rank < 2 || !combat.usingDynamicPrediction()) return;
  const points = combat.predictedAimPoints || [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point?.position || (!multi && point.index > 0)) continue;
    const primary = point.index === 0;
    const alpha = primary ? 0.55 : 0.38;
    const radius =
      (combat.predictedMarkerRadius || 12) *
      (primary ? 1 : 0.82 + (point.duplicateIndex || 0) * 0.04);
    const { x, y } = point.position;
    ribbons.circle(x, y, radius, OVERLAY_H, accentRgb, 1, alpha);
    t.glow.push(x, OVERLAY_H, y, accentRgb, radius * 0.9, alpha * 0.3, 0.6);
  }
}

export function mirrorBossTransitions(t, list, flashScale) {
  let border = 0;
  let wash = 0;
  let width = 0;
  let color = PALETTE.boss;
  const effects = list || [];
  // Reduce Flashing: 30 % strength, a steady fade instead of the pulse, and
  // an effect starting under 0.34 s after another still showing is skipped.
  const reduced = flashScale < 1;
  for (let i = 0; i < effects.length; i += 1) {
    const e = effects[i];
    if (!e) continue;
    if (
      reduced &&
      effects.some((o) => o && o.timer > e.timer && o.timer - e.timer < 0.34)
    ) {
      continue;
    }
    const progress = Math.min(1, e.timer / e.duration);
    const fadePower = Number.isFinite(e.fadePower)
      ? Math.max(0.1, e.fadePower)
      : 1.5;
    const fade = Math.max(0, 1 - Math.pow(progress, fadePower));
    const frequency = Number.isFinite(e.pulseFrequency)
      ? e.pulseFrequency
      : 1.8;
    const pulse = reduced
      ? 1
      : 0.65 + 0.35 * Math.sin(progress * Math.PI * frequency);
    const b = e.maxAlpha * fade * pulse * flashScale;
    const w = e.overlayAlpha * fade * Math.min(1, pulse + 0.15) * flashScale;
    if (b > border) {
      border = b;
      width = e.borderWidth * (0.85 + 0.15 * pulse);
    }
    wash = Math.max(wash, w);
    if (e.color) color = e.color;
  }
  // quantized so the DOM is touched only when the look changes
  const key =
    border > 0.01 || wash > 0.01
      ? `${color}|${Math.round(border * 50)}|${Math.round(wash * 50)}|${Math.round(width)}`
      : '';
  if (key === t.bossFlashKey) return;
  t.bossFlashKey = key;
  const style = t.bossFlash.style;
  if (!key) {
    style.opacity = '0';
    return;
  }
  // canvas px are logical px × the scale of the 800×600 box that fits it
  const scale =
    Math.min(
      t.canvas.clientWidth / GAME_WIDTH,
      t.canvas.clientHeight / GAME_HEIGHT
    ) || 1;
  const px = Math.max(1, width * scale);
  style.opacity = '1';
  style.background = withAlpha(color, wash);
  style.boxShadow = `inset 0 0 ${px * 1.4}px ${px}px ${withAlpha(color, border)}`;
}
