// src/modules/ui/settingsPreview.js

// The live line under a Graphics setting: what its current value does on
// screen, read from the same data the renderer uses (qualityPresets.js:
// every key of the preset is listed, so new toggles show up on their own).
// UISystem renders it under the field and redraws it on every change.

import { QUALITY_PRESETS, SLOW_FRAME_MS } from '../../core/qualityPresets.js';

const title = (word) => word.charAt(0).toUpperCase() + word.slice(1);

// Names for the preset keys that read badly as words; any other key is
// its camelCase split ("surfaceMaps" → "surface maps").
const PRESET_LABELS = {
  smaa: 'SMAA',
  impactPass: 'impact flash',
  surfaceMaps: 'surface detail',
};

const words = (key) =>
  PRESET_LABELS[key] ?? key.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);

/** One preset's settings: "Bloom 85% · SMAA off · … · 1.25× resolution". */
export function qualityPresetSummary(preset) {
  return Object.entries(QUALITY_PRESETS[preset])
    .map(([key, value]) => {
      if (key === 'bloomScale') return `Bloom ${Math.round(value * 100)}%`;
      if (key === 'debrisCap') return `${value} debris`;
      if (key === 'bloomMips') return `${value} bloom levels`;
      if (key === 'pixelRatio') return `${value}× resolution`;
      return `${words(key)} ${value ? 'on' : 'off'}`;
    })
    .join(' · ');
}

/**
 * The preview for `key` at `value`, or null for fields without one.
 * `context.livePreset` is the preset Auto is running now (null before a run);
 * `context.postProcessing` gates bloom.
 */
export function settingPreview(key, value, context = {}) {
  if (key === 'quality') {
    if (value !== 'auto') {
      return { text: `${title(value)}: ${qualityPresetSummary(value)}` };
    }
    const preset = context.livePreset || 'ultra';
    const fps = Math.round(1000 / SLOW_FRAME_MS);
    const now = context.livePreset ? 'Running' : 'Starts at';
    return {
      text: `Auto: ${now} ${title(preset)}, one step down below ${fps} fps. ${qualityPresetSummary(preset)}`,
    };
  }
  if (key === 'cameraMode') {
    return {
      text:
        value === 'classic'
          ? 'Classic: the plain follow, no look-ahead or zoom.'
          : 'Dynamic: leads your aim, zooms out in crowds, frames bosses.',
    };
  }
  if (key === 'bloom') {
    const on = value !== false && context.postProcessing !== false;
    let text = 'Glow off: flat light on shots and thrusters.';
    if (on) text = 'Glow on: shots, thrusters and blasts bloom.';
    else if (value !== false) text = 'Needs Post-Processing on to glow.';
    return { text, glow: on };
  }
  return null;
}
