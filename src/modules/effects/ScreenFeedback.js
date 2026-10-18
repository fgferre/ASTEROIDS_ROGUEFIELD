// src/modules/effects/ScreenFeedback.js
//
// Screen shake and screen flash: how hits, kills and blasts move and light
// the whole view, under the player's shake strength, Reduced Motion and
// Reduce Flashing. EffectsSystem owns it and ticks it at the effects' speed,
// so hit-stop and slow motion stretch them too.

import { PALETTE } from '../../data/constants/palette.js';
import { ScreenShake, ShakePresets } from '../../utils/ScreenShake.js';

// Hits feel like hits (PLAN.md step 5). PROPOSAL from 17/10, judged by playing.
// Numeric shake intensity becomes trauma as intensity / divisor (was 15).
const SHAKE_INTENSITY_DIVISOR = 10;
export const PLAYER_HIT_SHAKE = { intensity: 7, duration: 0.35 }; // was 8 / 0.3 s; 7 keeps a hit (trauma 0.7) below death/boss (1.0)
// Settings → Accessibility → Reduce Flashing: flashes at 30 % strength, at
// most one every 0.34 s (under WCAG's three a second); ones too faint to see
// at that strength are dropped so they never hold the window.
const REDUCED_FLASH = Object.freeze({ scale: 0.3, gap: 0.34, floor: 0.02 });

export class ScreenFeedback {
  /**
   * `random()`: the effects' screenShake random fork; read at construction and on every reset.
   * `screenShakeScale()`: the player's shake strength, 0 to 2.
   * `motionReduced()`: Reduced Motion; softer, shorter shakes and flashes.
   * `flashingReduced()`: Reduce Flashing; weaker, rarer flashes.
   * `damageFlashEnabled()`: the damage flash setting; off means no flash.
   */
  constructor({
    random,
    screenShakeScale,
    motionReduced,
    flashingReduced,
    damageFlashEnabled,
  }) {
    this.random = random;
    this.screenShakeScale = screenShakeScale;
    this.motionReduced = motionReduced;
    this.flashingReduced = flashingReduced;
    this.damageFlashEnabled = damageFlashEnabled;

    // Upgraded screen shake (Week 1: Balance & Feel)
    this.screenShake = new ScreenShake(random());
    this.screenShakeSeedState = this.screenShake.captureSeedState();
    this.screenFlash = {
      timer: 0,
      duration: 0,
      color: PALETTE.text,
      intensity: 0,
    };
    this.flashGap = 0;
  }

  captureSeedState() {
    this.screenShakeSeedState = this.screenShake.captureSeedState();
  }

  // Fresh shake seeds from the fork (BaseSystem's reset hook).
  reseedShake() {
    this.screenShakeSeedState = this.screenShake.reseed(this.random(), {
      preserveTrauma: true,
    });
  }

  // Back to the stored shake seeds, no flash.
  reset() {
    this.screenShakeSeedState = this.screenShake.reseed(this.random(), {
      seedState: this.screenShakeSeedState,
    });
    this.flashGap = 0;
    this.screenFlash = {
      timer: 0,
      duration: 0,
      color: PALETTE.text,
      intensity: 0,
    };
  }

  update(deltaTime) {
    // Update screen shake (new trauma-based system)
    this.screenShake.update(deltaTime);

    if (this.screenFlash.timer > 0) {
      this.screenFlash.timer -= deltaTime;
      if (this.screenFlash.timer < 0) this.screenFlash.timer = 0;
    }
    this.flashGap = Math.max(0, this.flashGap - deltaTime);
  }

  addScreenShake(presetOrIntensity, durationOrOptions) {
    const scale = Math.max(0, this.screenShakeScale() ?? 1);
    const motionScale = this.motionReduced() ? 0.45 : 1;

    let trauma = 0;
    let finalDuration = 0;

    const isPlainObject = (value) =>
      value && typeof value === 'object' && !Array.isArray(value);

    if (typeof presetOrIntensity === 'string') {
      const preset = ShakePresets[presetOrIntensity];
      if (!preset) {
        return;
      }

      const options = isPlainObject(durationOrOptions) ? durationOrOptions : {};
      trauma = Number.isFinite(preset.trauma) ? Math.max(0, preset.trauma) : 0;
      finalDuration = Number.isFinite(preset.duration)
        ? Math.max(0, preset.duration)
        : 0;

      if (Number.isFinite(options.trauma)) {
        trauma = options.trauma;
      } else {
        const traumaMultiplier = Number.isFinite(options.traumaMultiplier)
          ? options.traumaMultiplier
          : 1;
        const traumaOffset = Number.isFinite(options.traumaOffset)
          ? options.traumaOffset
          : 0;
        trauma = trauma * traumaMultiplier + traumaOffset;
      }

      if (Number.isFinite(options.duration)) {
        finalDuration = options.duration;
      } else {
        const durationMultiplier = Number.isFinite(options.durationMultiplier)
          ? options.durationMultiplier
          : 1;
        const durationOffset = Number.isFinite(options.durationOffset)
          ? options.durationOffset
          : 0;
        finalDuration = finalDuration * durationMultiplier + durationOffset;
      }

      if (Number.isFinite(options.maxTrauma)) {
        trauma = Math.min(trauma, options.maxTrauma);
      }
      if (Number.isFinite(options.minTrauma)) {
        trauma = Math.max(trauma, options.minTrauma);
      }
      if (Number.isFinite(options.maxDuration)) {
        finalDuration = Math.min(finalDuration, options.maxDuration);
      }
      if (Number.isFinite(options.minDuration)) {
        finalDuration = Math.max(finalDuration, options.minDuration);
      }

      trauma = Math.max(0, trauma);
      finalDuration = Math.max(0, finalDuration);
    } else if (
      isPlainObject(presetOrIntensity) &&
      Number.isFinite(presetOrIntensity.trauma) &&
      Number.isFinite(presetOrIntensity.duration)
    ) {
      const options = isPlainObject(durationOrOptions) ? durationOrOptions : {};
      trauma = Math.max(0, presetOrIntensity.trauma);
      finalDuration = Math.max(0, presetOrIntensity.duration);

      if (Number.isFinite(options.trauma)) {
        trauma = options.trauma;
      }
      if (Number.isFinite(options.duration)) {
        finalDuration = options.duration;
      }
    } else {
      const intensity = Number.isFinite(presetOrIntensity)
        ? presetOrIntensity
        : 0;
      const inputDuration = Number.isFinite(durationOrOptions)
        ? durationOrOptions
        : 0;

      const finalIntensity = intensity * scale * motionScale;

      if (finalIntensity <= 0) {
        return;
      }

      finalDuration = inputDuration;
      if (this.motionReduced()) {
        finalDuration = Math.min(finalDuration, 0.2);
      }
      finalDuration = Math.max(0, finalDuration);
      if (finalDuration <= 0) {
        return;
      }

      const traumaFromIntensity = Math.min(
        1,
        finalIntensity / SHAKE_INTENSITY_DIVISOR
      );
      this.screenShake.add(traumaFromIntensity, finalDuration);
      return;
    }

    trauma *= scale * motionScale;

    if (trauma <= 0) {
      return;
    }

    if (this.motionReduced()) {
      finalDuration = Math.min(finalDuration, 0.2);
    }

    finalDuration = Math.max(0, finalDuration);
    if (finalDuration <= 0) {
      return;
    }

    trauma = Math.min(1, trauma);
    this.screenShake.add(trauma, finalDuration);
  }

  addScreenFlash(color, duration, intensity) {
    if (!this.damageFlashEnabled()) {
      return;
    }

    let finalDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    let finalIntensity = Number.isFinite(intensity)
      ? Math.max(0, intensity)
      : 0;

    if (this.motionReduced()) {
      finalDuration = Math.min(finalDuration, 0.18);
      finalIntensity *= 0.6;
    }

    if (finalDuration <= 0 || finalIntensity <= 0) {
      return;
    }

    if (this.flashingReduced()) {
      finalIntensity *= REDUCED_FLASH.scale;
      if (this.flashGap > 0 || finalIntensity < REDUCED_FLASH.floor) return;
      this.flashGap = REDUCED_FLASH.gap;
    }

    this.screenFlash.color = color;
    this.screenFlash.duration = finalDuration;
    this.screenFlash.timer = finalDuration;
    this.screenFlash.intensity = finalIntensity;
  }
}
