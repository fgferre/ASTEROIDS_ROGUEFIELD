// What the Sentinel views share: the panelled hull material and its baked
// maps (made once), the modelling helpers, the tones, and the core-heat
// constants. A view file destructures what it needs from the kit.

import { PALETTE } from '../../../../data/constants/palette.js';
import { bakeHullMaps } from '../../bakedMaps.js';
import { colorOf } from '../../batches.js';
import { SHINE, shiny } from '../../hullModel.js';
import { mergeStatic } from '../../mergeStatic.js';
import { addRimLight } from '../../rimLight.js';

export const RIM = 1.2;
// proposta 12/11: the crucible's heat, shut and open; its beat when open
// (rad/s) and how much a hit flares it.
export const CORE_COLD = 0.05;
export const CORE_HOT = 1.5;
export const CORE_BEAT = 9;
export const CORE_FLASH = 0.9;
// Panels per unit of hull (the baked maps' tiling).
const PANEL_TILE = 1.6;
const MAW_MAP_SEED = 0x51a7;
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
// proposta 13/11: an emitter's lens (× the threat red): dark glass at rest,
// a light growing as its attack warns, burning while it is live.
export const LENS = { idle: 0.12, warn: 2.2, live: 2.8 };
/** How far a timed state ({ timer, duration }) has run, 0..1. */
export const progressOf = (t) =>
  clamp01(1 - t.timer / (t.duration > 0 ? t.duration : 1));
/** A lens's gain: `warning` with `progress` 0..1, else `live` 0..1. */
export const lensGain = (warning, progress, live) =>
  warning
    ? LENS.idle + (LENS.warn - LENS.idle) * progress * progress
    : LENS.idle + (LENS.live - LENS.idle) * live;
export const range = (from, to, n) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
export const mirrorZ = (points) => points.map(([x, z]) => [x, -z]).reverse();

// Top-view outlines ([x, z], counter-clockwise seen from above with +z down
// the page), mirrored where they span the centre line.
export const half = (points) => [...points, ...mirrorZ(points)];
export const ring = (n, radius, turn = 0) =>
  Array.from({ length: n }, (_, i) => {
    const angle = turn + (i * 2 * Math.PI) / n;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, angle];
  });
export const hex = (radius, turn = 0) =>
  ring(6, radius, turn).map(([x, z]) => [x, z]);

/**
 * The shared toolkit of the Sentinel views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit).
 * @param {object} recipeViews - the recipe looks (recipes.js).
 */
export function createSentinelKit(kit, recipeViews) {
  const { THREE } = kit;
  const { hull, dark } = kit.tones;
  // Bare steel (teeth, rolls, rams), soot (inside the mouth) and old hazard
  // paint: tones in the vertex colours, like hull and dark.
  const steel = hull.clone().multiplyScalar(1.7);
  const soot = dark.clone().multiplyScalar(0.55);
  const paint = colorOf(THREE, '#7a5a1c');
  // Sovereign's: a pale lacquered shell and its inlays, gold and bronze on
  // polished metal, a dark amber lacquer inside. Next to no blue in the
  // warm ones, or the bosses' violet light turns them pink.
  const ivory = colorOf(THREE, '#c4b9a3');
  const bone = colorOf(THREE, '#a89a80');
  const gold = colorOf(THREE, '#d4a440');
  const bronze = colorOf(THREE, '#6e4a1c');
  const lacquer = colorOf(THREE, '#5e4e14');
  // The panelled hull: the plate material with baked maps of its own seed,
  // `tile` panels per unit of hull, tones in the vertex colours.
  function hullMaterial(seed, tile = PANEL_TILE) {
    const maps = bakeHullMaps(THREE, kit.mapSeed + seed);
    Object.values(maps).forEach((map) => map.repeat.set(tile, tile));
    // clone() drops the shine and rim patches: add them again
    const material = addRimLight(shiny(kit.plateMaterial.clone()));
    Object.assign(material, maps, {
      normalScale: new THREE.Vector2(0.8, 0.8),
      aoMapIntensity: 0.8,
      vertexColors: true,
    });
    material.color.setRGB(1, 1, 1);
    return material;
  }
  const panelMaterial = hullMaterial(MAW_MAP_SEED);
  // The weapon parts (projectors, muzzles, vents' lips, lenses' housings):
  // polished steel, its highlight capped like the ship's hull so it shines
  // without blowing out. Tones in the vertex colours; one per view.
  const emitterMaterial = shiny(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      ...SHINE.steel,
      flatShading: true,
    })
  );
  addRimLight(emitterMaterial);
  // A lens on `parent` at `at` ([x, y, z]), `size` across: a glow of the
  // view (drawn by the glow batch, no draw of its own), set with lensGain.
  const lens = (parent, at, size) =>
    kit.glow(
      parent,
      kit.tone(PALETTE.threat, LENS.idle),
      size,
      new THREE.Vector3(...at)
    );

  // A slab: `outline` ([x, z]) from y0 up to y1, its edges chamfered by
  // `bevel`.
  function slab(outline, y0, y1, bevel = 0.025) {
    const shape = new THREE.Shape(
      outline.map(([x, z]) => new THREE.Vector2(x, z))
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: y1 - y0 - 2 * bevel,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 1,
      curveSegments: 1,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, y1 - bevel, 0);
    return geometry;
  }
  const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
  // A drum of `sides` round +Y, or lying along x or z.
  function drum(radius, length, sides, axis = 'y', taper = 1) {
    const geometry = new THREE.CylinderGeometry(
      radius * taper,
      radius,
      length,
      sides
    );
    if (axis === 'x') geometry.rotateZ(-Math.PI / 2);
    if (axis === 'z') geometry.rotateX(Math.PI / 2);
    return geometry;
  }
  // The tones that name a metal of their own (hullModel.js SHINE): bare
  // steel gleams, soot stays dull; the rest is the material's paint.
  const shineOf = new Map([
    [steel, SHINE.steel],
    [soot, SHINE.worn],
  ]);
  function merge(parts) {
    const geometry = mergeStatic(
      THREE,
      parts.map((part) => ({
        flat: true,
        shine: shineOf.get(part.color),
        ...part,
      }))
    );
    geometry.setAttribute('uv2', geometry.getAttribute('uv'));
    return geometry;
  }
  const both = (part) => [
    part,
    {
      ...part,
      position: [part.position[0], part.position[1], -part.position[2]],
    },
  ];

  return {
    THREE,
    kit,
    recipeViews,
    hull,
    dark,
    steel,
    soot,
    paint,
    ivory,
    bone,
    gold,
    bronze,
    lacquer,
    panelMaterial,
    hullMaterial,
    emitterMaterial,
    lens,
    slab,
    box,
    drum,
    merge,
    both,
  };
}
