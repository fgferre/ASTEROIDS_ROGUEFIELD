// src/modules/effects/Particles.js
//
// The pooled particles and what lives beside them: shockwave rings, hit
// markers, floating damage numbers, the muzzle-flash queue and the ambient
// field drift. EffectsSystem owns it; PlayerEffects, EnemyEffects and
// BossTransitions build their bursts on top of it; EffectsSystem ticks it; Renderer3D reads these lists through
// same-name getters on the effects object.

import { PALETTE } from '../../data/constants/palette.js';
import { GamePools } from '../../core/GamePools.js';
import { SHIELD_SHOCKWAVE_RADIUS } from '../../data/constants/gameplay.js';
import { DamageText, HitMarker } from '../EffectEntities.js';

// Ambient field life (docs/NORTE.md §2 "Fundo com volume"): matte micro-chips
// and a few faint amber crystal motes drifting through the camera view, so the
// Field is never empty. PROPOSAL from 17/10 (was: none), judged by playing.
// Kept in their own arrays, not in `particles`, so particle metrics and the
// determinism suites never see them. Rolls come from the effects' 'colors'
// fork, which nothing else draws from, so no other sequence shifts.
const AMBIENT = Object.freeze({
  fork: 'colors',
  chipCount: 28,
  chipSizeMin: 1, // logical px (drawn ~1–3 px)
  chipSizeMax: 2.5,
  chipSpeedMin: 3, // px/s
  chipSpeedMax: 10,
  chipSpinMax: 0.6, // rad/s either way
  chipAlphaMin: 0.55,
  chipAlphaMax: 0.95,
  moteCount: 6,
  moteSizeMin: 1.2,
  moteSizeMax: 2,
  moteSpeedMin: 1.5,
  moteSpeedMax: 4,
  moteAlpha: 0.25,
  lifeMin: 20, // s
  lifeMax: 40,
  fade: 2, // s of fade-in and fade-out
  margin: 24, // respawn this far outside the view; cull at twice it
});

export class Particles {
  /**
   * `randomRange(min, max, fork)`, `randomCentered(span, fork)`: the effects' random helpers; a particle's spin rolls from 'particles', the ambient drift from 'colors'.
   * `createMuzzleFlash(x, y, dirX, dirY)`: the effects' muzzle-flash burst; the queue flushes into it.
   * `hitMarkersEnabled()`: the hit markers setting; off means no markers.
   * `damageNumbersEnabled()`: the damage numbers setting; off means no floating numbers.
   */
  constructor({
    randomRange,
    randomCentered,
    createMuzzleFlash,
    hitMarkersEnabled,
    damageNumbersEnabled,
  }) {
    this.randomRange = randomRange;
    this.randomCentered = randomCentered;
    this.createMuzzleFlash = createMuzzleFlash;
    this.hitMarkersEnabled = hitMarkersEnabled;
    this.damageNumbersEnabled = damageNumbersEnabled;

    this.particles = [];
    this.shockwaves = [];
    this.hitMarkers = [];
    this.damageTexts = [];
    this.muzzleFlashQueue = [];
    this.ambientChips = [];
    this.ambientMotes = [];
    // The camera's visible logical rect, set every frame through drawAmbient.
    this.ambientView = null;
  }

  // Empty lists; the ambient view stays until the next frame sets it.
  reset() {
    this.particles = [];
    this.shockwaves = [];
    this.hitMarkers = [];
    this.damageTexts = [];
    this.muzzleFlashQueue = [];
    this.ambientChips = [];
    this.ambientMotes = [];
  }

  createParticle(x, y, vx, vy, color, size, life, type = 'normal') {
    const particle = GamePools.particles.acquire();

    // Configure particle from pool
    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.color = color;
    particle.size = size;
    particle.life = life;
    particle.maxLife = life;
    particle.alpha = 1;
    particle.type = type;
    particle.rotation = this.randomRange(0, Math.PI * 2, 'particles');
    particle.rotationSpeed = this.randomCentered(4, 'particles');
    particle.active = true;

    return particle;
  }

  queueMuzzleFlash(x, y, dirX, dirY) {
    this.muzzleFlashQueue.push(x, y, dirX, dirY);
  }

  flushMuzzleFlashQueue() {
    const queue = this.muzzleFlashQueue;
    if (!queue.length) {
      return;
    }

    for (let i = 0; i < queue.length; i += 4) {
      this.createMuzzleFlash(
        queue[i],
        queue[i + 1],
        queue[i + 2],
        queue[i + 3]
      );
    }

    queue.length = 0;
  }

  releaseParticle(particle) {
    if (!particle) {
      return;
    }

    if (particle.bossEffectTag) {
      delete particle.bossEffectTag;
    }

    if (typeof particle === 'object' && particle !== null) {
      if (Object.prototype.hasOwnProperty.call(particle, 'active')) {
        particle.active = false;
      }

      const ctorName =
        particle.constructor && typeof particle.constructor.name === 'string'
          ? particle.constructor.name
          : null;

      if (ctorName && ctorName !== 'Object') {
        return;
      }

      if (particle.active !== undefined) {
        try {
          GamePools.particles.release(particle);
        } catch (error) {
          console.debug(
            '[EffectsSystem] Particle not from pool, skipping release'
          );
        }
      }
    }
  }

  updateParticles(deltaTime) {
    // Update particles and return expired ones to pool
    const particles = this.particles;
    let writeIndex = 0;

    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      if (
        particle &&
        typeof particle.update === 'function' &&
        particle.update(deltaTime)
      ) {
        particles[writeIndex++] = particle;
      } else if (particle) {
        this.releaseParticle(particle);
      }
    }

    particles.length = writeIndex;

    // Return oldest particles to pool if we have too many
    if (particles.length > 150) {
      const toRemove = particles.length - 100;
      for (let i = 0; i < toRemove; i += 1) {
        if (particles[i]) {
          this.releaseParticle(particles[i]);
        }
      }
      if (toRemove > 0) {
        particles.copyWithin(0, toRemove);
        particles.length -= toRemove;
      }
    }
  }

  createShockwaveEffect(data) {
    if (!data || !data.position) {
      return;
    }

    const radius =
      typeof data.radius === 'number' ? data.radius : SHIELD_SHOCKWAVE_RADIUS;

    const duration =
      typeof data.duration === 'number' && data.duration > 0
        ? data.duration
        : 0.45;
    const baseWidth =
      typeof data.baseWidth === 'number' && data.baseWidth > 0
        ? data.baseWidth
        : 10;
    const maxAlpha =
      typeof data.maxAlpha === 'number' ? Math.max(0, data.maxAlpha) : 0.6;
    const widthFade = typeof data.widthFade === 'number' ? data.widthFade : 0.6;
    const easingPower =
      typeof data.easingPower === 'number' ? data.easingPower : 1;

    const wave = {
      x: data.position.x,
      y: data.position.y,
      maxRadius: radius,
      radius: 0,
      timer: 0,
      duration,
      baseWidth,
      maxAlpha,
      alpha: maxAlpha,
      widthFade,
      easingPower,
      color: data.color,
    };

    this.shockwaves.push(wave);
    if (this.shockwaves.length > 6) {
      this.shockwaves = this.shockwaves.slice(-6);
    }
  }

  createExplosionShockwave(data = {}) {
    if (!data.position) {
      return;
    }

    const radius = data.radius ?? 80;
    this.createShockwaveEffect({
      position: data.position,
      radius,
      duration: data.duration ?? 0.6,
      baseWidth: data.baseWidth ?? 18,
      maxAlpha: data.maxAlpha ?? 0.78,
      widthFade: data.widthFade ?? 0.45,
      easingPower: data.easingPower ?? 0.8,
      color: data.color ?? PALETTE.shot,
    });

    const innerScale = data.innerScale ?? 0.55;
    if (innerScale > 0) {
      this.createShockwaveEffect({
        position: data.position,
        radius: radius * innerScale,
        duration: data.innerDuration ?? 0.5,
        baseWidth: data.innerBaseWidth ?? 10,
        maxAlpha: data.innerMaxAlpha ?? 0.6,
        widthFade: data.innerWidthFade ?? 0.7,
        easingPower: data.innerEasingPower ?? 1.1,
        color: data.innerColor ?? PALETTE.text,
      });
    }
  }

  updateShockwaves(deltaTime) {
    const shockwaves = this.shockwaves;
    let writeIndex = 0;

    for (let i = 0; i < shockwaves.length; i += 1) {
      const wave = shockwaves[i];
      if (!wave) {
        continue;
      }

      wave.timer += deltaTime;
      const progress = Math.min(1, wave.timer / wave.duration);
      const easingPower =
        Number.isFinite(wave.easingPower) && wave.easingPower > 0
          ? wave.easingPower
          : 1;
      const easedProgress =
        easingPower === 1 ? progress : Math.pow(progress, easingPower);

      wave.radius = wave.maxRadius * easedProgress;
      wave.alpha = Math.max(0, wave.maxAlpha * (1 - easedProgress));

      const widthFade = Number.isFinite(wave.widthFade) ? wave.widthFade : 0.6;
      const widthFactor = Math.max(0, 1 - easedProgress * widthFade);
      wave.lineWidth = Math.max(0.35, wave.baseWidth * widthFactor);

      if (wave.timer < wave.duration) {
        shockwaves[writeIndex++] = wave;
      }
    }

    shockwaves.length = writeIndex;
  }

  createHitMarker(position, killed, damage) {
    if (!this.hitMarkersEnabled()) return;
    this.hitMarkers.push(new HitMarker(position.x, position.y, killed, damage));
  }

  updateHitMarkers(deltaTime) {
    const markers = this.hitMarkers;
    let writeIndex = 0;

    for (let i = 0; i < markers.length; i += 1) {
      const marker = markers[i];
      if (marker && marker.update(deltaTime)) {
        markers[writeIndex++] = marker;
      }
    }

    markers.length = writeIndex;
  }

  createFloatingDamageText(x, y, damage, isCritical = false) {
    if (!this.damageNumbersEnabled()) return;
    this.damageTexts.push(new DamageText(x, y, damage, isCritical));
  }

  updateDamageTexts(deltaTime) {
    const texts = this.damageTexts;
    let writeIndex = 0;

    for (let i = 0; i < texts.length; i += 1) {
      const text = texts[i];
      if (text && text.update(deltaTime)) {
        texts[writeIndex++] = text;
      }
    }

    texts.length = writeIndex;
  }

  // Spawns inside the view on the first fill, then just outside an edge,
  // heading for a random point in the view.
  spawnAmbient(view, mote, inside) {
    const roll = (min, max) => this.randomRange(min, max, AMBIENT.fork);
    const m = AMBIENT.margin;
    let x;
    let y;
    let angle;
    if (inside) {
      x = view.x + roll(0, view.width);
      y = view.y + roll(0, view.height);
      angle = roll(0, Math.PI * 2);
    } else {
      const side = Math.floor(roll(0, 4));
      const along = roll(0, 1);
      x = side === 1 ? view.x + view.width + m : view.x - m;
      y = side === 2 ? view.y + view.height + m : view.y - m;
      if (side === 0 || side === 2) x = view.x + along * view.width;
      else y = view.y + along * view.height;
      const tx = view.x + roll(0.2, 0.8) * view.width;
      const ty = view.y + roll(0.2, 0.8) * view.height;
      angle = Math.atan2(ty - y, tx - x);
    }
    const speed = mote
      ? roll(AMBIENT.moteSpeedMin, AMBIENT.moteSpeedMax)
      : roll(AMBIENT.chipSpeedMin, AMBIENT.chipSpeedMax);
    const life = roll(AMBIENT.lifeMin, AMBIENT.lifeMax);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: roll(0, Math.PI * 2),
      rotationSpeed: mote ? 0 : roll(-AMBIENT.chipSpinMax, AMBIENT.chipSpinMax),
      size: mote
        ? roll(AMBIENT.moteSizeMin, AMBIENT.moteSizeMax)
        : roll(AMBIENT.chipSizeMin, AMBIENT.chipSizeMax),
      color: roll(0, 1) < 0.5 ? PALETTE.rock : PALETTE.rockLit,
      baseAlpha: mote
        ? AMBIENT.moteAlpha
        : roll(AMBIENT.chipAlphaMin, AMBIENT.chipAlphaMax),
      alpha: 0,
      life,
      maxLife: life,
      type: 'debris',
    };
  }

  updateAmbient(deltaTime) {
    const view = this.ambientView;
    if (!view) return;
    const m = AMBIENT.margin * 2;
    const step = (list, count, mote) => {
      const firstFill = list.length === 0;
      while (list.length < count) {
        list.push(this.spawnAmbient(view, mote, firstFill));
      }
      for (let i = 0; i < list.length; i += 1) {
        const a = list[i];
        a.x += a.vx * deltaTime;
        a.y += a.vy * deltaTime;
        a.rotation += a.rotationSpeed * deltaTime;
        a.life -= deltaTime;
        const outside =
          a.x < view.x - m ||
          a.x > view.x + view.width + m ||
          a.y < view.y - m ||
          a.y > view.y + view.height + m;
        if (a.life <= 0 || outside) {
          list[i] = this.spawnAmbient(view, mote, false);
          continue;
        }
        const fade = Math.min(
          1,
          (a.maxLife - a.life) / AMBIENT.fade,
          a.life / AMBIENT.fade
        );
        a.alpha = a.baseAlpha * fade;
      }
    };
    step(this.ambientChips, AMBIENT.chipCount, false);
    step(this.ambientMotes, AMBIENT.moteCount, true);
  }
}
