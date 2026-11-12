// What the Sentinel views share: the panelled hull material and its baked
// maps (made once), the modelling helpers, the tones, and the core-heat
// constants. A view file destructures what it needs from the kit.

import { bakeHullMaps } from '../../bakedMaps.js';
import { colorOf } from '../../batches.js';
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
  // Worn steel (teeth, rolls, rams), soot (inside the mouth) and old hazard
  // paint: matte tones in the vertex colours, like hull and dark.
  const steel = hull.clone().multiplyScalar(1.7);
  const soot = dark.clone().multiplyScalar(0.55);
  const paint = colorOf(THREE, '#7a5a1c');
  const maps = bakeHullMaps(THREE, kit.mapSeed + MAW_MAP_SEED);
  Object.values(maps).forEach((map) => map.repeat.set(PANEL_TILE, PANEL_TILE));
  // clone() drops the rim patch: add it again
  const panelMaterial = addRimLight(kit.plateMaterial.clone());
  Object.assign(panelMaterial, maps, {
    normalScale: new THREE.Vector2(0.8, 0.8),
    aoMapIntensity: 0.8,
    vertexColors: true,
  });
  panelMaterial.color.setRGB(1, 1, 1);

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
  function merge(parts) {
    const geometry = mergeStatic(
      THREE,
      parts.map((part) => ({ flat: true, ...part }))
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
    panelMaterial,
    slab,
    box,
    drum,
    merge,
    both,
  };
}
