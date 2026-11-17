// src/modules/menu/adaptiveQuality.js
//
// The menu's adaptive quality: it watches the frame rate and steps between
// four levels (low to ultra); the opening scene drops its bloom at low
// (openingScene.js setQuality). MenuBackgroundSystem keeps the state object.

import { debugLog } from '../../core/debugLogging.js';

/** The quality state: levels, targets, FPS samples and cooldown. */
export function createAdaptiveQualityState() {
  // Phase 3: Adaptive Quality System
  return {
    enabled: true,
    currentLevel: 2, // 0=low, 1=medium, 2=high, 3=ultra
    targetFpsMin: 50,
    targetFpsMax: 58, // Just below v-sync to avoid fluctuation
    // FPS tracking
    frameTimesMs: [],
    frameTimesMaxSamples: 60, // 1 second of samples at 60fps
    lastFps: 60,
    // Adjustment cooldown (prevent rapid changes)
    adjustmentCooldown: 0,
    adjustmentCooldownDuration: 2.0, // seconds between quality changes
    levels: [
      { name: 'low' },
      { name: 'medium' },
      { name: 'high' },
      { name: 'ultra' },
    ],
  };
}

/**
 * Updates FPS tracking and adjusts quality level dynamically.
 * Called every frame to maintain smooth performance.
 * @param {object} aq - the state from createAdaptiveQualityState()
 * @param {number} delta - frame time in seconds
 * @param {(level: number) => void} applyQualityLevel - the system's
 */
export function updateAdaptiveQuality(aq, delta, applyQualityLevel) {
  if (!aq.enabled) return;

  // Track frame time
  const frameTimeMs = delta * 1000;
  aq.frameTimesMs.push(frameTimeMs);
  if (aq.frameTimesMs.length > aq.frameTimesMaxSamples) {
    aq.frameTimesMs.shift();
  }

  // Calculate average FPS (need at least 30 samples)
  if (aq.frameTimesMs.length < 30) return;

  const avgFrameTime =
    aq.frameTimesMs.reduce((a, b) => a + b, 0) / aq.frameTimesMs.length;
  const currentFps = 1000 / avgFrameTime;
  aq.lastFps = currentFps;

  // Update cooldown
  if (aq.adjustmentCooldown > 0) {
    aq.adjustmentCooldown -= delta;
    return;
  }

  // Check if we need to adjust quality
  const maxLevel = aq.levels.length - 1;

  if (currentFps < aq.targetFpsMin && aq.currentLevel > 0) {
    // FPS too low - decrease quality
    aq.currentLevel--;
    aq.adjustmentCooldown = aq.adjustmentCooldownDuration;
    applyQualityLevel(aq.currentLevel);
    debugLog(
      `[AdaptiveQuality] FPS ${currentFps.toFixed(1)} < ${aq.targetFpsMin}, ` +
        `降级 to "${aq.levels[aq.currentLevel].name}"`
    );
  } else if (currentFps > aq.targetFpsMax && aq.currentLevel < maxLevel) {
    // FPS has headroom - try increasing quality
    aq.currentLevel++;
    aq.adjustmentCooldown = aq.adjustmentCooldownDuration;
    applyQualityLevel(aq.currentLevel);
    debugLog(
      `[AdaptiveQuality] FPS ${currentFps.toFixed(1)} > ${aq.targetFpsMax}, ` +
        `升级 to "${aq.levels[aq.currentLevel].name}"`
    );
  }
}
