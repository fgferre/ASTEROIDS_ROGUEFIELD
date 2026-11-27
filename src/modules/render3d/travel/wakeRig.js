// src/modules/render3d/travel/wakeRig.js
//
// A light rig that shows the Wake (wake.js) at its best, for whoever stages
// it: a warm sun on one bow quarter that casts the ship's own shadows (the
// gantries on the cargo, the bridge on the deck), a cool rim from the far
// quarter and a faint fill from below, so the lower hull never goes void.
// The lights ride with the ship (children of its group, directions in the
// ship's own frame). The renderer must have its shadow map on for the
// shadows; without it the rig still lights.

// proposta 17/11: the rig's colours, strengths and directions (ship frame:
// +x the bow, y up, -z port).
const SUN = { color: '#ffe2c4', intensity: 2.0, from: [0.55, 0.8, -0.75] };
// The rim is nearly white: it is the only light on the stern seen from aft,
// and a blue one paints the dark plating blue.
const RIM = { color: '#cfd8ea', intensity: 0.85, from: [-0.7, 0.3, 0.6] };
const FILL = { color: '#aab6cf', intensity: 0.3, from: [0.2, -1, -0.3] };
// The sun's shadow box, in world units about the ship, and its map.
const SHADOW = { half: 1900, tall: 1200, near: 500, far: 11000, map: 4096 };

/**
 * Adds the rig to a built Wake ({ group }): returns { sun, rim, fill }.
 * `side` (-1 port, 1 starboard) is the flank the sun falls on.
 * Place the ship first: the shadows are drawn once, where it stands (set
 * sun.shadow.needsUpdate after moving it).
 */
export function lightWake(THREE, wake, side = -1) {
  const lamp = ({ color, intensity, from }) => {
    const light = new THREE.DirectionalLight(
      new THREE.Color(color),
      intensity * Math.PI
    );
    // Authoring units: far enough to stand outside the hull.
    light.position
      .set(from[0], from[1], -from[2] * side)
      .normalize()
      .multiplyScalar(150);
    wake.group.add(light, light.target);
    return light;
  };
  const sun = lamp(SUN);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW.map, SHADOW.map);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 1.5;
  Object.assign(sun.shadow.camera, {
    left: -SHADOW.half,
    right: SHADOW.half,
    top: SHADOW.tall,
    bottom: -SHADOW.tall,
    near: SHADOW.near,
    far: SHADOW.far,
  });
  sun.shadow.camera.updateProjectionMatrix();
  // The ship is static and the sun rides with it: its shadows are drawn
  // once, not every frame. After moving or turning the ship, ask for them
  // again (sun.shadow.needsUpdate = true).
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  return { sun, rim: lamp(RIM), fill: lamp(FILL) };
}
