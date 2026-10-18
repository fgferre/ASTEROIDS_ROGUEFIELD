import { describe, expect, it } from 'vitest';
import {
  chapterThemeForLayer,
  musicThemeForLayer,
  themeDegreeHz,
} from '../../../src/modules/audio/MusicThemes.js';
import {
  MUSIC_LAYER_CONFIG,
  MUSIC_THEMES,
} from '../../../src/data/audio/music.js';

describe('music theme selection (layer → theme)', () => {
  it('follows the biome and hands boss layers to the Warden, beyond 15 too', () => {
    const themes = [1, 4, 5, 6, 9, 10, 11, 14, 15, 16, 19, 20].map(
      musicThemeForLayer
    );
    expect(themes).toEqual([
      'outer-ring',
      'outer-ring',
      'warden',
      'dense-core',
      'dense-core',
      'warden',
      'wardens-reach',
      'wardens-reach',
      'warden',
      'wardens-reach',
      'wardens-reach',
      'warden',
    ]);
  });

  it('marks only the first layer of each biome as a chapter start', () => {
    const chapters = Array.from({ length: 20 }, (_, i) => i + 1)
      .map((layer) => [layer, chapterThemeForLayer(layer)])
      .filter(([, theme]) => theme);
    expect(chapters).toEqual([
      [1, 'outer-ring'],
      [6, 'dense-core'],
      [11, 'wardens-reach'],
    ]);
  });
});

describe('MUSIC_THEMES data', () => {
  it('every theme voices all four intensity layers and has a pulse', () => {
    const layerKeys = Object.keys(MUSIC_LAYER_CONFIG.layers).sort();
    for (const theme of Object.values(MUSIC_THEMES)) {
      expect(Object.keys(theme.layers).sort()).toEqual(layerKeys);
      expect(theme.pulse.pattern.length).toBeGreaterThan(0);
      expect(theme.barSeconds).toBeGreaterThan(0);
    }
  });

  it('scale degrees wrap into the next octave', () => {
    const theme = MUSIC_THEMES['outer-ring']; // A2 = 110 Hz
    expect(themeDegreeHz(theme, 0)).toBeCloseTo(110, 6);
    expect(themeDegreeHz(theme, 7)).toBeCloseTo(220, 6);
    expect(themeDegreeHz(theme, 4, 1)).toBeCloseTo(329.63, 1); // E4
  });
});
