// The look of the current biome in 3D (docs/NORTE.md §7 pillar 1): every
// frame of a BiomeTransition's fade it mixes the two biomes' colours and
// numbers into one look and hands it to the lights, the bloom, the backdrop
// and the floor. Outside a fade it does nothing.

import { BIOMES } from '../../data/biomes.js';
import { colorOf } from './batches.js';

const COLORS = ['hazeColor', 'veinColor', 'keyColor', 'fillColor'];
const NUMBERS = [
  'hazeDensity',
  'veinDensity',
  'keyIntensity',
  'fillIntensity',
  'bloomScale',
  'debris',
  'structures',
  'floorGlow',
];

export class BiomeController {
  /**
   * `targets`: { key, fill } lights, `bloomPass` and its `bloomBase`
   * strength, `backdrop` and `floor` (each with setLook(look)).
   */
  constructor(THREE, targets) {
    this.targets = targets;
    // Linear colours per biome, parsed once.
    this.colors = new Map(
      BIOMES.map((biome) => [
        biome.id,
        {
          sky0: colorOf(THREE, biome.sky[0]),
          sky1: colorOf(THREE, biome.sky[1]),
          ...Object.fromEntries(
            COLORS.map((name) => [name, colorOf(THREE, biome[name])])
          ),
        },
      ])
    );
    this.look = {
      from: BIOMES[0],
      to: BIOMES[0],
      mix: 1,
      sky0: new THREE.Color(),
      sky1: new THREE.Color(),
      ...Object.fromEntries(COLORS.map((name) => [name, new THREE.Color()])),
      ...Object.fromEntries(NUMBERS.map((name) => [name, 0])),
    };
    this.applied = null;
  }

  /** Applies the transition's current mix, if it moved since last frame. */
  update(transition) {
    const { from, to, mix } = transition;
    const key = `${from.id}>${to.id}@${mix}`;
    if (key === this.applied) return;
    this.applied = key;

    const look = this.look;
    const a = this.colors.get(from.id);
    const b = this.colors.get(to.id);
    look.from = from;
    look.to = to;
    look.mix = mix;
    look.sky0.copy(a.sky0).lerp(b.sky0, mix);
    look.sky1.copy(a.sky1).lerp(b.sky1, mix);
    COLORS.forEach((name) => look[name].copy(a[name]).lerp(b[name], mix));
    NUMBERS.forEach((name) => {
      look[name] = from[name] + (to[name] - from[name]) * mix;
    });

    const {
      key: keyLight,
      fill,
      bloomPass,
      bloomBase,
      backdrop,
      floor,
    } = this.targets;
    keyLight.color.copy(look.keyColor);
    keyLight.intensity = look.keyIntensity;
    fill.color.copy(look.fillColor);
    fill.intensity = look.fillIntensity;
    bloomPass.strength = bloomBase * look.bloomScale;
    backdrop.setLook(look);
    floor.setLook(look);
  }
}
