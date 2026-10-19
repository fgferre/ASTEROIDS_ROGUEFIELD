// The field's small things, copied every frame from the systems into
// Renderer3D's shared batches (`t`, its WebGL kit): shots and their trails,
// XP orbs and hearts, ambient chips, particles, shockwaves and the screen
// flash.

import { XP_ORB_SIZE } from '../../core/GameConstants.js';
import { PALETTE } from '../../data/constants/palette.js';
import { HALF_H, HALF_W, rgbOf } from './batches.js';
import { smoothstep } from './cameraRig.js';
import {
  mirrorWeaponEffects,
  pushFlakBolt,
  pushLance,
} from './weaponMirror.js';

const MAX_TRAIL_POINTS = 64;
const WHITE = [1, 1, 1];
// Shockwaves kick the impact pass only from KICK_WAVE_RADIUS up, full at
// KICK_WAVE_FULL.
const KICK_WAVE_RADIUS = 90;
const KICK_WAVE_FULL = 200;
const KICK_WAVE_MIN = 0.25;
const KICK_WAVE_MAX = 0.8;

export function mirrorProjectiles(t, combat) {
  if (!combat) return;
  const { lances } = t;

  const bullets = combat.bullets || [];
  const look = combat.lanceLook;
  const evolved = combat.evolutions.length > 0;
  const trail = pushTrail.bind(null, t);
  for (let i = 0; i < bullets.length; i += 1) {
    const b = bullets[i];
    if (!b || b.hit) continue;
    if (b.kind === 'flak') pushFlakBolt(t.THREE, t, b, trail);
    else pushLance(t.THREE, t, look, evolved, b, trail);
  }
  mirrorWeaponEffects(t.THREE, combat, t, t.flashes);

  const enemyBullets = combat.enemyBullets || [];
  for (let i = 0; i < enemyBullets.length; i += 1) {
    const b = enemyBullets[i];
    if (!b || b.hit) continue;
    const rgb = b.color ? rgbOf(t.THREE, b.color) : t.threatRgb;
    const r = b.radius || 4;
    pushTrail(t, b, rgb, r * 1.2, 1.2);
    lances.push(
      b.x,
      b.y,
      3,
      Math.atan2(b.vy || 0, b.vx || 1),
      r * 1.6,
      r * 0.75,
      rgb,
      1.8
    );
  }
}

function pushTrail(t, bullet, rgb, width, gain) {
  const trail = bullet.trail;
  if (!trail || !trail.length) return;
  const { ribbons } = t;
  const start = Math.max(0, trail.length - (MAX_TRAIL_POINTS - 1));
  let n = 0;
  for (let i = start; i < trail.length; i += 1) {
    ribbons.px[n] = trail[i].x;
    ribbons.py[n] = trail[i].y;
    n += 1;
  }
  ribbons.px[n] = bullet.x;
  ribbons.py[n] = bullet.y;
  ribbons.polyline(n + 1, 2.5, rgb, width, gain);
}

export function mirrorPickups(t, time, xpOrbs, healthHearts, pickups) {
  const orbs = xpOrbs?.xpOrbs || [];
  for (let i = 0; i < orbs.length; i += 1) {
    const orb = orbs[i];
    if (!orb || orb.collected) continue;
    const tier = orb.tier || 1;
    const base = XP_ORB_SIZE * (1 + (tier - 1) * 0.2);
    const age = Number.isFinite(orb.age) ? orb.age : time;
    const pulse = 1 + 0.18 * Math.sin(age * 4 + i * 0.7);
    t.glow.push(orb.x, 4, orb.y, t.xpRgb, base * 1.5 * pulse, 0.7, 1);
    t.glow.push(orb.x, 4.5, orb.y, WHITE, base * 0.35, 0.9, 1.2);
  }

  const hearts = healthHearts?.hearts || [];
  for (let i = 0; i < hearts.length; i += 1) {
    const heart = hearts[i];
    if (!heart || heart.isCollected()) continue;
    const pulse = 1 + Math.sin(heart.pulsePhase || 0) * 0.12;
    const r = heart.radius || 14;
    t.glow.push(heart.x, 4, heart.y, t.statusRgb, r * 1.6 * pulse, 0.7, 1);
    t.glow.push(heart.x, 4.5, heart.y, WHITE, r * 0.4, 0.9, 1.2);
  }

  t.pickups.update(pickups?.getActivePickups() || []);
}

// `impact`: the lens kick (ImpactKick) big shockwaves drive.
export function mirrorEffects(t, effects, impact) {
  if (!effects) return;
  const { THREE, glow, matte, ribbons } = t;

  const chips = effects.ambientChips || [];
  for (let i = 0; i < chips.length; i += 1) {
    const c = chips[i];
    matte.push(c.x, -6, c.y, rgbOf(THREE, c.color), c.size * 1.3, c.alpha);
  }
  const motes = effects.ambientMotes || [];
  for (let i = 0; i < motes.length; i += 1) {
    const m = motes[i];
    glow.push(m.x, -4, m.y, t.shotRgb, m.size * 2.4, m.alpha, 1.4);
  }

  const particles = effects.particles || [];
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    if (!p || !(p.alpha > 0)) continue;
    const rgb = rgbOf(THREE, p.color);
    if (p.type === 'debris') {
      t.debris.push(p, rgb);
    } else if (p.type === 'smoke') {
      t.smoke.push(p.x, 3, p.y, rgb, p.size * 2.8, p.alpha * 0.5);
    } else if (p.type === 'spark') {
      // stretched along velocity, like the 2D strokeSpark
      const speed = Math.hypot(p.vx, p.vy);
      const stretch = p.size * Math.max(1.5, Math.min(4, speed * 0.012));
      const k = speed > 1 ? stretch / speed : 0;
      ribbons.streak(
        p.x - p.vx * k,
        p.y - p.vy * k,
        p.x + p.vx * k * 0.3,
        p.y + p.vy * k * 0.3,
        2,
        rgb,
        Math.max(0.6, Math.min(stretch * 0.35, p.size * p.alpha)),
        1.6 * p.alpha
      );
    } else if (p.type === 'crack') {
      const half = p.size * 1.6;
      const cx = Math.cos(p.rotation || 0) * half;
      const cy = Math.sin(p.rotation || 0) * half;
      ribbons.streak(
        p.x - cx,
        p.y - cy,
        p.x + cx,
        p.y + cy,
        2,
        rgb,
        Math.max(0.6, p.size * 0.4),
        2 * p.alpha
      );
    } else {
      glow.push(
        p.x,
        2,
        p.y,
        rgb,
        Math.max(1, p.size * p.alpha * 2.4),
        p.alpha,
        2
      );
      if (p.type === 'flare')
        glow.push(p.x, 2.5, p.y, WHITE, p.size * 0.6, p.alpha, 2.5);
    }
  }

  const waves = effects.shockwaves || [];
  for (let i = 0; i < t.shockwaves.length; i += 1) {
    const mesh = t.shockwaves[i];
    const wave = waves[i];
    if (!wave || !(wave.radius > 0)) {
      mesh.visible = false;
      continue;
    }
    const rgb = rgbOf(THREE, wave.color || PALETTE.shot);
    if (t.flashes.observe(wave, rgb)) kickForWave(impact, wave);
    const alpha = Math.max(0, Math.min(1, wave.alpha)) * 1.6;
    const width = Math.max(1.5, (wave.lineWidth || 4) * 0.3);
    const extent = wave.radius + width * 3 + 2;
    const { uniforms } = mesh.material;
    mesh.visible = true;
    mesh.position.set(wave.x - HALF_W, 1.5, wave.y - HALF_H);
    mesh.scale.set(extent, 1, extent);
    uniforms.uRadius.value = wave.radius;
    uniforms.uWidth.value = width;
    uniforms.uExtent.value = extent;
    uniforms.uColor.value.setRGB(
      rgb[0] * alpha,
      rgb[1] * alpha,
      rgb[2] * alpha
    );
  }

  const screenFlash = effects.screenFlash;
  const alpha =
    screenFlash && screenFlash.timer > 0 && screenFlash.duration > 0
      ? (screenFlash.timer / screenFlash.duration) * screenFlash.intensity
      : 0;
  if (
    Math.abs(alpha - t.flashAlpha) > 0.01 ||
    (alpha === 0 && t.flashAlpha !== 0)
  ) {
    t.flashAlpha = alpha;
    t.flash.style.opacity = String(alpha);
    if (alpha > 0) t.flash.style.background = screenFlash.color;
  }
}

// Only big blasts kick the lens; strength grows with the wave's reach.
function kickForWave(impact, wave) {
  const radius = wave.maxRadius || 0;
  if (radius < KICK_WAVE_RADIUS) return;
  const k = smoothstep(KICK_WAVE_RADIUS, KICK_WAVE_FULL, radius);
  impact.kick(KICK_WAVE_MIN + (KICK_WAVE_MAX - KICK_WAVE_MIN) * k);
}
