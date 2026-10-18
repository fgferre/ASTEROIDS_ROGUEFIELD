import { MUSIC_THEMES, MUSIC_WARDEN_THEME } from '../../data/audio/music.js';
import { biomeForLayer } from '../../data/biomes.js';
import { directorFor } from '../../data/layers.js';

/** Frequency (Hz) of a MIDI note number (69 = A4 = 440 Hz). */
export function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Semitones above the root for a scale degree (degree 7 = one octave up). */
export function scaleDegreeSemitones(scale, degree) {
  const size = scale.length;
  const octave = Math.floor(degree / size);
  return scale[((degree % size) + size) % size] + 12 * octave;
}

/** Frequency of `degree` in a theme's scale, `octave` octaves above its root. */
export function themeDegreeHz(theme, degree, octave = 0) {
  return midiToHz(
    theme.root + 12 * octave + scaleDegreeSemitones(theme.scale, degree)
  );
}

/** The biome's own theme for a layer (ignores Wardens). */
export function biomeThemeForLayer(layer) {
  return biomeForLayer(layer).musicTheme;
}

/** The theme a layer starts with: the Warden's on boss layers, else the biome's. */
export function musicThemeForLayer(layer) {
  return directorFor(layer).warden
    ? MUSIC_WARDEN_THEME
    : biomeThemeForLayer(layer);
}

/** The biome theme id when `layer` is the first of its biome, else null. */
export function chapterThemeForLayer(layer) {
  const biome = biomeForLayer(layer);
  return Math.floor(Number(layer)) === biome.layers[0] &&
    MUSIC_THEMES[biome.musicTheme]
    ? biome.musicTheme
    : null;
}
