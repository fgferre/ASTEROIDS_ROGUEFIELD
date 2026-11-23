// The player hull's surface and build (playerMirror.js): one material per
// finish with the baked panel maps, the livery, the cyan rim and the
// invulnerability blink; the hull model cached per hull and levels, its edge
// lines, the canopy and the nav lights; the quality preset's maps switch.

import { PALETTE } from '../../../data/constants/palette.js';
import { bakeHullMaps } from '../bakedMaps.js';
import { colorOf } from '../batches.js';
import {
  HULL_FINISHES,
  HULL_SPECULAR_CAP_GLSL,
  buildHullModel,
  buildSensorGlass,
  edgeLines,
  hullTones,
} from '../hullModel.js';
import * as hullLivery from '../hullLivery.js';
import { addRimLight } from '../rimLight.js';
import { seatGun } from './guns.js';

// Baked panel maps (bakedMaps.js): one texture tile per HULL_TILE hull units
// (the hull's UVs are planar, in hull units). proposta 18/10: strengths.
const HULL_TILE = 16;
const HULL_NORMAL_SCALE = 0.5;
const HULL_AO = 0.8;
const HULL_MAP_SEED = 3131.9;

// The hull's specular cap (hullModel.js), its livery (hullLivery.js; not the
// turret's), the cyan fresnel rim (a tight band on the silhouette against the
// dark field) and the white invulnerability pulse, both emissive, the pulse
// weighted to the rim so the panels stay readable while it blinks.
function patchHull(shader) {
  const { uRim, uBlink, livery } = this.userData;
  if (livery) hullLivery.patch(shader, livery);
  shader.uniforms.uRim = uRim;
  shader.uniforms.uBlink = uBlink;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform vec3 uRim;\nuniform float uBlink;'
    )
    .replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>${HULL_SPECULAR_CAP_GLSL}`
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rim = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
      totalEmissiveRadiance += uRim * pow(rim, 5.0) + vec3(uBlink * (0.25 + rim));`
    );
}

// Hull and visual-upgrade levels: what the built geometry depends on.
export function hullKeyOf(hull, levels) {
  return `${hull.id}|${levels.thruster}|${levels.rcs}|${levels.braking}`;
}

// The finishes, maps, livery, blink, canopy glass and edge materials;
// returns the rim uniform (the dash brightens it).
export function createSurface(mirror, THREE) {
  // One material per finish (HULL_FINISHES), tones in the vertex colours,
  // the paint and accents with the baked panel maps; all take the rim and
  // blink, the hull's set its livery too (not the turret's).
  const rim = { value: colorOf(THREE, PALETTE.player).multiplyScalar(0.45) };
  const blink = { value: 0 };
  const maps = bakeHullMaps(THREE, HULL_MAP_SEED);
  Object.values(maps).forEach((map) =>
    map.repeat.set(1 / HULL_TILE, 1 / HULL_TILE)
  );
  mirror.livery = hullLivery.uniforms(THREE);
  const finishes = (livery) =>
    HULL_FINISHES.map((finish) => {
      const material = new THREE.MeshStandardMaterial(finish);
      Object.assign(material.userData, { uRim: rim, uBlink: blink, livery });
      material.onBeforeCompile = patchHull;
      return addRimLight(material);
    });
  mirror.hullMaterials = finishes(mirror.livery);
  mirror.turretMaterials = finishes(null);
  // the painted finishes: the ones with the panel maps
  mirror.mappedMaterials = [
    mirror.hullMaterials,
    mirror.turretMaterials,
  ].flatMap((set) => set.slice(0, 2));
  mirror.mappedMaterials.forEach((material) =>
    Object.assign(material, maps, {
      normalScale: new THREE.Vector2(HULL_NORMAL_SCALE, HULL_NORMAL_SCALE),
      aoMapIntensity: HULL_AO,
    })
  );
  mirror.hullMaterial = mirror.hullMaterials[0];
  mirror.tones = hullTones(THREE);
  // hull key → { hull, ghost, canopy, edges, tips, deckY }, kept for the
  // session
  mirror.hullCache = new Map();
  mirror.hullMaps = maps;
  mirror.surfaceMaps = true;
  mirror.blink = blink;
  mirror.blinkHeldUntil = -Infinity;
  mirror.canopyMaterial = buildSensorGlass(THREE);
  mirror.edgeMaterial = new THREE.LineBasicMaterial({
    color: colorOf(THREE, PALETTE.player).multiplyScalar(0.7),
    toneMapped: false,
  });
  mirror.bladeEdgeMaterial = new THREE.LineBasicMaterial({ toneMapped: false });
  return rim;
}

// The hull model for these levels (built once, then cached) with its livery,
// the gun seated on it, its edge lines, the canopy and the nav lights;
// returns the built model.
export function buildHull(mirror, player, hull, levels, geometry) {
  const { THREE } = mirror;
  const key = hullKeyOf(hull, levels);
  if (!mirror.hullCache.has(key)) {
    const model = buildHullModel(THREE, geometry);
    model.hull.userData.cached = true;
    model.canopy.userData.cached = true;
    mirror.hullCache.set(key, model);
  }
  const built = mirror.hullCache.get(key);
  hullLivery.show(mirror.livery, THREE, geometry, hull.visual.livery, key);
  mirror.built = built;
  seatGun(mirror, player.noseAim, hull);

  const lines = {
    edge: mirror.edgeMaterial,
    bladeEdge: mirror.bladeEdgeMaterial,
  };
  edgeLines(THREE, built, lines).forEach((line) => mirror.ship.add(line));
  mirror.ship.add(new THREE.Mesh(built.canopy, mirror.canopyMaterial));
  mirror.strobe = hullLivery.lights(THREE, built, geometry, mirror.ship);
  return built;
}

/** Quality preset: the baked hull maps on or off (one recompile). */
export function setSurfaceMaps(mirror, enabled) {
  if (enabled === mirror.surfaceMaps) return;
  mirror.surfaceMaps = enabled;
  mirror.mappedMaterials.forEach((material) => {
    Object.keys(mirror.hullMaps).forEach((name) => {
      material[name] = enabled ? mirror.hullMaps[name] : null;
    });
    material.needsUpdate = true;
  });
}
