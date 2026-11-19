import { RUN_FINAL_LAYER } from '../../core/GameConstants.js';
import { MUSIC_RUN_INTENSITY } from '../../data/audio/music.js';

// The run's danger (0..1) that the recorded score follows (SectorScore reads
// runIntensity). It makes no sound: every run plays recorded scores.
// Weighted sum of run progress (wave / RUN_FINAL_LAYER), enemy density and a
// low-HP bump, smoothed with separate attack/release time constants.

const RUN_INTENSITY_EPSILON = 0.002; // smoothing stops once this close to target

const clamp01 = (value) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Raw (unsmoothed) run intensity 0..1 from run progress, enemy density and HP.
 *
 * @param {{wave?: number, enemyCount?: number, healthRatio?: number}} [state]
 * @param {number} [finalLayer=RUN_FINAL_LAYER]
 * @returns {number}
 */
export function computeRunIntensity(state = {}, finalLayer = RUN_FINAL_LAYER) {
  const config = MUSIC_RUN_INTENSITY;
  const wave = Number(state.wave) || 0;
  const progress = clamp01(wave / Math.max(1, finalLayer));
  const density = clamp01(
    (Number(state.enemyCount) || 0) / config.densityFullCount
  );
  const healthRatio = Number(state.healthRatio);
  const lowHealth =
    Number.isFinite(healthRatio) &&
    healthRatio > 0 &&
    healthRatio < config.lowHealthRatio;

  return clamp01(
    progress * config.waveWeight +
      density * config.densityWeight +
      (lowHealth ? config.lowHealthBonus : 0)
  );
}

/**
 * One-pole step of `current` toward `target` over `dtSeconds`: attack time
 * constant when rising, release when falling.
 */
export function smoothIntensity(current, target, dtSeconds) {
  const tau =
    target > current
      ? MUSIC_RUN_INTENSITY.attackSeconds
      : MUSIC_RUN_INTENSITY.releaseSeconds;
  const alpha = 1 - Math.exp(-Math.max(0, dtSeconds) / tau);
  return current + (target - current) * alpha;
}

class MusicMixer {
  constructor() {
    this.runState = { wave: 0, enemyCount: 0, healthRatio: 1 };
    this.runIntensity = 0;
    this._isPaused = false;
    this._smoothHandle = null;
  }

  /**
   * Update the run inputs (any subset of wave / enemyCount / healthRatio). The
   * smoothed intensity follows on a low-rate tick that stops once converged.
   *
   * @param {{wave?: number, enemyCount?: number, healthRatio?: number}} partial
   */
  setRunState(partial = {}) {
    Object.entries(partial).forEach(([key, value]) => {
      if (key in this.runState && Number.isFinite(value)) {
        this.runState[key] = value;
      }
    });
    this._startSmoothing();
  }

  /** Back to a fresh run: inputs and smoothed intensity cleared. */
  resetRun() {
    this._stopSmoothing();
    this.runState = { wave: 0, enemyCount: 0, healthRatio: 1 };
    this.runIntensity = 0;
  }

  /** Pause freezes the smoothing, so the danger holds still. */
  pause(isPaused) {
    this._isPaused = !!isPaused;
  }

  dispose() {
    this._stopSmoothing();
  }

  /** @private */
  _startSmoothing() {
    if (this._smoothHandle) return;
    this._smoothHandle = setInterval(
      () => this._smoothTick(),
      MUSIC_RUN_INTENSITY.tickMs
    );
  }

  /** @private */
  _stopSmoothing() {
    if (this._smoothHandle) {
      clearInterval(this._smoothHandle);
      this._smoothHandle = null;
    }
  }

  /** One smoothing step (nominal tick dt, frozen while paused). @private */
  _smoothTick() {
    if (this._isPaused) return;
    const target = computeRunIntensity(this.runState);
    this.runIntensity = smoothIntensity(
      this.runIntensity,
      target,
      MUSIC_RUN_INTENSITY.tickMs / 1000
    );
    if (Math.abs(target - this.runIntensity) < RUN_INTENSITY_EPSILON) {
      this.runIntensity = target;
      this._stopSmoothing();
    }
  }
}

export default MusicMixer;
