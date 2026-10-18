// 3D render quality presets and the automatic switch between them.
//
// AutoQuality watches the smoothed frame interval (PerformanceMonitor: the
// time between frames, GPU waits included) and steps one preset down when
// frames stay slow, back up when they stay fast. Manual mode (Settings →
// Graphics → Quality, or `?quality=<preset>`) pins a preset and stops it.

// Best first. `pixelRatio` caps render pixels per CSS pixel (the canvas
// itself stays at native size; the composer draws smaller and scales up).
// `shadows`: the key light's shadow map size in texels (rocks, machines and
// the ship shadow each other), 0 = off. The polish layers (proposta 18/10):
// `filmGrain` grain + vignette in the impact pass, `rimLight` on machine
// hulls, `decals` scorch marks on rocks. `bloomMips`: blur levels of the
// bloom (5 = the widest halo; each one is two draws).
export const QUALITY_PRESETS = {
  ultra: {
    bloomScale: 1,
    smaa: true,
    impactPass: true,
    surfaceMaps: true,
    shadows: 2048,
    debrisCap: 160,
    pixelRatio: 2,
    filmGrain: true,
    rimLight: true,
    decals: true,
    bloomMips: 5,
  },
  high: {
    bloomScale: 1,
    smaa: true,
    impactPass: true,
    surfaceMaps: true,
    shadows: 1024,
    debrisCap: 120,
    pixelRatio: 1.5,
    filmGrain: true,
    rimLight: true,
    decals: true,
    bloomMips: 3,
  },
  medium: {
    bloomScale: 0.85,
    smaa: false,
    impactPass: true,
    surfaceMaps: true,
    shadows: 0,
    debrisCap: 80,
    pixelRatio: 1.25,
    filmGrain: true,
    rimLight: true,
    decals: true,
    bloomMips: 3,
  },
  low: {
    bloomScale: 0.7,
    smaa: false,
    impactPass: false,
    surfaceMaps: false,
    shadows: 0,
    debrisCap: 48,
    pixelRatio: 1,
    filmGrain: false,
    rimLight: false,
    decals: false,
    bloomMips: 3,
  },
};
export const QUALITY_LEVELS = Object.keys(QUALITY_PRESETS);
export const QUALITY_MODES = ['auto', ...QUALITY_LEVELS];

// Slower than 50 fps for 3 s → one step down.
export const SLOW_FRAME_MS = 20;
export const SLOW_HOLD_SECONDS = 3;
// A steady 60 fps (vsync, with jitter) for 20 s → one step up. Below the
// slow line on purpose: between the two nothing moves (hysteresis).
export const FAST_FRAME_MS = 17.5;
export const FAST_HOLD_SECONDS = 20;
// Never more than one change per this long.
export const MIN_CHANGE_GAP_SECONDS = 5;
// Each time a preset proves too slow, going back up to it takes this much
// longer (×2, ×4 … up to the cap), so a borderline machine stops flipping.
export const RETRY_BACKOFF = 2;
export const MAX_RETRY_FACTOR = 8;
// A longer frame (tab in background, debugger) counts as this long.
const MAX_SAMPLE_SECONDS = 0.25;

/** `?quality=auto|ultra|high|medium|low`, or null when absent/invalid. */
export function qualityFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get('quality');
    return QUALITY_MODES.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

export class AutoQuality {
  /** `onChange({ preset, auto })` fires on every preset change. */
  constructor({ mode = 'auto', onChange = () => {} } = {}) {
    this.onChange = onChange;
    this.preset = QUALITY_LEVELS[0];
    this.auto = true;
    this.slowFor = 0;
    this.fastFor = 0;
    this.sinceChange = MIN_CHANGE_GAP_SECONDS;
    this.retryFactor = Object.fromEntries(QUALITY_LEVELS.map((l) => [l, 1]));
    this.setMode(mode);
  }

  get settings() {
    return QUALITY_PRESETS[this.preset];
  }

  /** 'auto' or a preset name; anything else means 'auto'. */
  setMode(mode) {
    const auto = !QUALITY_LEVELS.includes(mode);
    this.auto = auto;
    this.slowFor = 0;
    this.fastFor = 0;
    if (!auto) this.change(mode);
  }

  /** One rendered frame: `dt` seconds, `frameMs` the smoothed frame time. */
  update(dt, frameMs) {
    if (!this.auto || !(dt > 0) || !Number.isFinite(frameMs)) return;
    const step = Math.min(dt, MAX_SAMPLE_SECONDS);
    this.sinceChange += step;
    this.slowFor = frameMs > SLOW_FRAME_MS ? this.slowFor + step : 0;
    this.fastFor = frameMs < FAST_FRAME_MS ? this.fastFor + step : 0;
    if (this.sinceChange < MIN_CHANGE_GAP_SECONDS) return;

    const level = QUALITY_LEVELS.indexOf(this.preset);
    if (
      this.slowFor >= SLOW_HOLD_SECONDS &&
      level < QUALITY_LEVELS.length - 1
    ) {
      this.retryFactor[this.preset] = Math.min(
        MAX_RETRY_FACTOR,
        this.retryFactor[this.preset] * RETRY_BACKOFF
      );
      this.change(QUALITY_LEVELS[level + 1]);
      return;
    }
    const up = QUALITY_LEVELS[level - 1];
    if (up && this.fastFor >= FAST_HOLD_SECONDS * this.retryFactor[up]) {
      this.change(up);
    }
  }

  change(preset) {
    this.slowFor = 0;
    this.fastFor = 0;
    this.sinceChange = 0;
    if (preset === this.preset) return;
    this.preset = preset;
    this.onChange({ preset, auto: this.auto });
  }
}
