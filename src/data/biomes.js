// src/data/biomes.js

import { deepFreeze } from '../utils/deepFreeze.js';

// The three places the run descends through (docs/NORTE.md §7 pillar 1),
// five layers each. Every number here is a proposta 18/10 — the owner's play
// decides.
//
// sky: [zenith, horizon] of the far gradient behind the stars.
// hazeColor / hazeDensity: the cold cloud layers and their opacity scale.
// veinColor / veinDensity: the thin second cloud between them (amber veins).
// floorColor: dust albedo; floorSpecks: colour of the bright grains;
//   floorSeams: 0..1 strength of the grid of plate seams in the dust;
//   floorGlow: how much the grains and seams light themselves.
// key* / fill*: the two directional lights; bloomScale multiplies bloom.
// debris: 0..1 share of the far dark fragments drifting below the field.
// structures: 0..1 opacity of the intact Ring arcs and beams far below.
// musicTheme: id of the procedural theme MusicMixer plays in this biome.
// tint: the 2D renderer's full-canvas overlay (screen: lifts the blacks).
export const BIOMES = deepFreeze([
  {
    id: 'outer-ring',
    title: 'CHAPTER I — THE OUTER RING',
    layers: [1, 5],
    sky: ['#0b111c', '#020408'],
    hazeColor: '#5078c8',
    hazeDensity: 1,
    veinColor: '#ffb347',
    veinDensity: 0.05,
    floorColor: '#8c867c',
    floorSpecks: '#d8dce4',
    floorSeams: 0,
    floorGlow: 0,
    keyColor: '#fff1e2',
    keyIntensity: 1.6,
    fillColor: '#64748b',
    fillIntensity: 0.35,
    bloomScale: 1,
    debris: 0.35,
    structures: 0,
    musicTheme: 'outer-ring',
    tint: 'rgba(120, 150, 200, 0)',
  },
  {
    id: 'dense-core',
    title: 'CHAPTER II — THE DENSE CORE',
    layers: [6, 10],
    sky: ['#140c06', '#030202'],
    hazeColor: '#5a4a5e',
    hazeDensity: 0.45,
    veinColor: '#d9701c',
    veinDensity: 0.38,
    floorColor: '#2e2620',
    floorSpecks: '#ffb35c',
    floorSeams: 0,
    floorGlow: 0.3,
    keyColor: '#ffe2bc',
    keyIntensity: 1.45,
    fillColor: '#8a5a3a',
    fillIntensity: 0.18,
    bloomScale: 1.2,
    debris: 1,
    structures: 0,
    musicTheme: 'dense-core',
    tint: 'rgba(255, 140, 50, 0.08)',
  },
  {
    id: 'wardens-reach',
    title: "CHAPTER III — WARDEN'S REACH",
    layers: [11, 15],
    sky: ['#120a2a', '#040212'],
    hazeColor: '#7a52ff',
    hazeDensity: 1.25,
    veinColor: '#3a2aa0',
    veinDensity: 0.35,
    floorColor: '#5a5878',
    floorSpecks: '#b8b0ff',
    floorSeams: 0.45,
    floorGlow: 0.05,
    keyColor: '#e8e4ff',
    keyIntensity: 1.35,
    fillColor: '#5a6cff',
    fillIntensity: 0.45,
    bloomScale: 1.1,
    debris: 0.15,
    structures: 1,
    musicTheme: 'wardens-reach',
    tint: 'rgba(110, 80, 255, 0.09)',
  },
]);

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
