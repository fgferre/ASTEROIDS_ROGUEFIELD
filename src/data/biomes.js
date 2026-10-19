// src/data/biomes.js

import { listContent } from '../content/registry.js';
import { deepFreeze } from '../utils/deepFreeze.js';

// The three places the run descends through (docs/NORTE.md §7 pillar 1),
// five layers each. Every number here is a proposta 18/10 — the owner's play
// decides.
//
// sky: [centre, rim] of the nebula's dark base, far behind the stars.
// hazeColor / hazeDensity: the nebula's broad clouds and their strength.
// veinColor / veinDensity: its thin ridges (the Dense Core's amber veins).
// dustColor: the dust drifting around the play plane, lit by the ship.
// key* / fill*: the two directional lights; bloomScale multiplies bloom.
// debris: 0..1 share of the far dark fragments drifting below the field.
// structures: 0..1 opacity of the intact Ring arcs and beams far below.
// musicTheme: id of the procedural theme MusicMixer plays in this biome.
// tint: the 2D renderer's full-canvas overlay (screen: lifts the blacks).
//
// One file per biome in src/content/biomes/, listed by `order`.
export const BIOMES = deepFreeze(listContent('biomes'));

/** The biome of a layer (1-based); layers past the table stay in the last. */
export function biomeForLayer(layer) {
  const n = Math.max(1, Math.floor(Number(layer) || 1));
  return BIOMES.find((b) => n <= b.layers[1]) || BIOMES[BIOMES.length - 1];
}

/** Seconds a biome change takes to cross-fade. */
export const BIOME_FADE_SECONDS = 2;

/**
 * Which biome is showing and how far the cross-fade into it has gone, for
 * both renderers. The first layer after reset() cuts straight in (a run
 * starts in its place, it does not arrive there).
 */
export class BiomeTransition {
  constructor() {
    this.reset();
  }

  reset() {
    this.from = BIOMES[0];
    this.to = BIOMES[0];
    this.progress = 1;
    this.fresh = true;
  }

  /** Call on every layer start. */
  enterLayer(layer) {
    const biome = biomeForLayer(layer);
    if (this.fresh) {
      this.fresh = false;
      this.from = biome;
      this.to = biome;
      this.progress = 1;
    } else if (biome !== this.to) {
      this.from = this.to;
      this.to = biome;
      this.progress = 0;
    }
  }

  /** Advances the fade; returns the eased mix 0 (from) .. 1 (to). */
  update(dt) {
    this.progress = Math.min(1, this.progress + dt / BIOME_FADE_SECONDS);
    return this.mix;
  }

  get mix() {
    const t = this.progress;
    return t * t * (3 - 2 * t);
  }
}
