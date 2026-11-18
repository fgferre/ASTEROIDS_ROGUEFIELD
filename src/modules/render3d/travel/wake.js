// src/modules/render3d/travel/wake.js
//
// The Wake: the old freighter the pilot's people live on (data/story.js),
// seen in the story scene before the first journey. The owner's concept
// sheet (17/11): a faceted block of a bow in worn light grey with orange
// bands and the WAKE mark; a long open neck of coloured containers held in
// yellow gantries under a crane; a tall stern with the glazed bridge, masts
// and antennas; three big round engines with a blue core; small amber and
// blue lights all over the hull.
// Built in authoring units (about 100 long: +x the bow, y up, z across) from
// wakeParts.js parts, painted by wakeSurface.js, and scaled to WAKE_LENGTH.
// Three draws of painted hull (plating, containers) and the lights apart,
// so the scene can dim, flicker or kill each kind (setWakeLight).

import { buildBow } from './wakeBow.js';
import { buildCargoDeck } from './wakeCargo.js';
import { createKit } from './wakeParts.js';
import { buildStern } from './wakeStern.js';
import {
  bakeWakeCargo,
  bakeWakeGlow,
  bakeWakeHull,
  wakePaint,
} from './wakeSurface.js';

export const WAKE_LENGTH = 3200;
const SEED = 0x3a4e;
// The plating tile's size in authoring units.
const TILE = 8;

/**
 * Sets a light's strength (0 dark … 1 as built; above 1 hotter): `light` is
 * one of buildWake's `lights` (a group of its lamps and their pools).
 */
export function setWakeLight(light, level) {
  light.children.forEach((mesh) => mesh.material.color.setScalar(level));
}

/**
 * The Wake: { group, lights, anchors }.
 * lights: windows, lamps, floods, beacons and engines (an array: port,
 * centre, starboard), each a group for setWakeLight.
 * anchors: empty objects in the group at the places a scene needs — the
 * `hangar` mouth under the neck, the `bridge`, each of the `engines`.
 */
export function buildWake(THREE) {
  const kit = createKit(THREE, SEED, TILE);
  buildBow(kit);
  const places = { ...buildCargoDeck(kit), ...buildStern(kit) };

  const group = new THREE.Group();
  group.name = 'wake';
  const painted = (set, maps) => {
    const mesh = new THREE.Mesh(kit.merged(set), wakePaint(THREE, maps));
    mesh.name = set;
    // For a scene that lights it with a shadow-casting light.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  painted('hull', bakeWakeHull(THREE, SEED));
  // Two wearings of the container, so no two neighbours chip alike.
  painted('cargo', bakeWakeCargo(THREE, SEED + 1));
  painted('cargoB', bakeWakeCargo(THREE, SEED + 2));

  const glow = bakeWakeGlow(THREE);
  // A light kind: its hot parts and, where it has them, its pools.
  const light = (set) => {
    const kind = new THREE.Group();
    kind.name = set;
    kind.add(
      new THREE.Mesh(
        kit.merged(set),
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          toneMapped: false,
          side: THREE.DoubleSide,
        })
      )
    );
    if (kit.sets[`${set}Pools`]) {
      const pools = new THREE.Mesh(
        kit.merged(`${set}Pools`),
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          map: glow,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        })
      );
      pools.renderOrder = 1;
      kind.add(pools);
    }
    group.add(kind);
    return kind;
  };
  const lights = {
    windows: light('windows'),
    lamps: light('lamps'),
    floods: light('floods'),
    beacons: light('beacons'),
    engines: [0, 1, 2].map((i) => light(`engine${i}`)),
  };
  const anchor = (name, [x, y, z]) => {
    const object = new THREE.Object3D();
    object.name = name;
    object.position.set(x, y, z);
    group.add(object);
    return object;
  };
  const anchors = {
    hangar: anchor('hangar', places.hangar),
    bridge: anchor('bridge', places.bridge),
    engines: places.engines.map((at, i) => anchor(`engine${i}`, at)),
  };
  group.scale.setScalar(WAKE_LENGTH / 100);
  return { group, lights, anchors };
}
