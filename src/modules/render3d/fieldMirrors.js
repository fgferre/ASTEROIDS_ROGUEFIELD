// The field's small things, copied every frame from the systems into
// Renderer3D's shared batches (`t`, its WebGL kit): shots and their trails,
// XP orbs and hearts, ambient chips, particles, shockwaves and the screen
// flash.

import { PALETTE } from '../../data/constants/palette.js';
import { getOrbConfig } from '../xp/orbClasses.js';
import { HALF_H, HALF_W, SHOT_SHAPES, rgbOf } from './batches.js';
import { smoothstep } from './cameraRig.js';
import { HEART_HEIGHT, orbHeight } from './fieldTokens.js';
import {
  mirrorWeaponEffects,
  pushFlakBolt,
  pushLance,
  pushSeeker,
} from './weaponMirror.js';

const MAX_TRAIL_POINTS = 64;
const WHITE = [1, 1, 1];
// Shockwaves kick the impact pass only from KICK_WAVE_RADIUS up, full at
// KICK_WAVE_FULL.
const KICK_WAVE_RADIUS = 90;
const KICK_WAVE_FULL = 200;
const KICK_WAVE_MIN = 0.25;
const KICK_WAVE_MAX = 0.8;
// proposta 20/10: an orb faster than minSpeed px/s (pulled, or bursting out
// of a kill) trails a streak of its last `seconds` of travel, at most
// maxLength px, `width` × its size across; it fades in over the next
// minSpeed px/s.
const ORB_STREAK = {
  minSpeed: 90,
  seconds: 0.05,
  maxLength: 36,
  width: 0.45,
  gain: 1.3,
};
// proposta 20/10: a fused orb is born `scale` bigger and eases back to its
// size over `seconds`.
const FUSION_POP = { scale: 0.35, seconds: 0.3 };

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
    else if (b.kind === 'seeker') pushSeeker(t.THREE, t, b, trail);
    else pushLance(t.THREE, t, look, evolved, b, trail);
  }
  mirrorWeaponEffects(t.THREE, combat, t, t.flashes);

  // Enemy shots: a barbed dart in the shot's own colour, as its trail.
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
      1.8,
      SHOT_SHAPES.dart
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

// XP orbs and hearts: their bodies (fieldTokens.js) in the light of a glow;
// pickup tokens and chests (pickupMirror.js, chestMirror.js).
export function mirrorPickups(t, time, xpOrbs, healthHearts, pickups) {
  const orbs = xpOrbs?.xpOrbs || [];
  t.orbCrystals.begin();
  for (let i = 0; i < orbs.length; i += 1) {
    const orb = orbs[i];
    if (!orb || orb.collected) continue;
    const tier = orb.tier || 1;
    const look = getOrbConfig(orb.class);
    const rgb = rgbOf(t.THREE, look.baseColor);
    const age = Number.isFinite(orb.age) ? orb.age : time;
    const base = look.radius * fusionPop(orb, age);
    const pulse = 1 + 0.18 * Math.sin(age * 4 + i * 0.7);
    const h = orbHeight(base);
    t.glow.push(orb.x, h, orb.y, rgb, base * 1.6 * pulse, 0.45, 1);
    t.orbCrystals.pushOrb(orb, tier, base, age, rgb);
    pushOrbStreak(t, orb, h, base, rgb);
  }
  t.orbCrystals.end();

  const hearts = healthHearts?.hearts || [];
  t.heartTokens.begin();
  for (let i = 0; i < hearts.length; i += 1) {
    const heart = hearts[i];
    if (!heart || heart.isCollected()) continue;
    const phase = heart.pulsePhase || 0;
    const pulse = 1 + Math.sin(phase) * 0.12;
    const r = heart.radius || 14;
    const h = HEART_HEIGHT;
    t.glow.push(heart.x, h, heart.y, t.statusRgb, r * 1.9 * pulse, 0.5, 1);
    t.heartTokens.pushHeart(heart.x, heart.y, r, phase, t.statusRgb);
  }
  t.heartTokens.end();

  const field = pickups?.getActivePickups() || [];
  t.pickups.update(field);
  t.chests.update(field, t.glow);
}

function fusionPop(orb, age) {
  if (orb.source !== 'fusion' || !(age < FUSION_POP.seconds)) return 1;
  return 1 + FUSION_POP.scale * (1 - age / FUSION_POP.seconds) ** 2;
}

function pushOrbStreak(t, orb, h, size, rgb) {
  const speed = Math.hypot(orb.vx || 0, orb.vy || 0);
  if (!(speed > ORB_STREAK.minSpeed)) return;
  const k = Math.min(ORB_STREAK.seconds, ORB_STREAK.maxLength / speed);
  const fade = Math.min(1, (speed - ORB_STREAK.minSpeed) / ORB_STREAK.minSpeed);
  t.ribbons.streak(
    orb.x - orb.vx * k,
    orb.y - orb.vy * k,
    orb.x,
    orb.y,
    h,
    rgb,
    size * ORB_STREAK.width,
    ORB_STREAK.gain * fade
  );
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
      continue;
    }
    // climbing or sinking with the chunks (debrisChunks.js), so a burst opens
    // into a ball seen from the side, not a sheet
    const up = t.debris.lift(
      p,
      undefined,
      Math.max(0, (p.maxLife || 0) - (p.life || 0))
    );
    if (p.type === 'smoke') {
      t.smoke.push(p.x, 3 + up, p.y, rgb, p.size * 2.8, p.alpha * 0.5);
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
        2 + up,
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
        2 + up,
        rgb,
        Math.max(0.6, p.size * 0.4),
        2 * p.alpha
      );
    } else {
      glow.push(
        p.x,
        2 + up,
        p.y,
        rgb,
        Math.max(1, p.size * p.alpha * 2.4),
        p.alpha,
        2
      );
      if (p.type === 'flare')
        glow.push(p.x, 2.5 + up, p.y, WHITE, p.size * 0.6, p.alpha, 2.5);
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
