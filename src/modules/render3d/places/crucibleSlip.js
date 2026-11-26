// The last image's slip (render3d/endingScene.js `twin`, on the script the
// owner approved, 24/11): on one arc of the Crucible (theCrucible.js), out
// of every other shot, a cradle of the arcs' own build holding a Wake
// identical to ours, finished and empty: its engines cold, every light of
// it off but one window. The twin is the opening's own Wake (travel/
// wake.js, built by storyScene.js), its painted hull drawn again: the same
// geometry and baked maps, in materials of its own (the sky's reflection
// cut), without its lights. Running lamps lead along the arc's outer edge
// to the cradle and onto it, numbered in the order the light reaches
// them. Built on the loading screen (theCrucible.js `slip()`, render3d/
// endingTwin.js warm), hidden until the beat shows it. Nothing here draws
// from the set's scatter (`kit.random`): the arcs keep their decks and
// lamps.

import { bakeWakeGlow } from '../travel/wakeSurface.js';

// proposta 24/11: where on its arc the slip stands (rad), the twin's
// length (world units; ours is 3200 in the opening's scene: here it is
// scaled to the arcs' modules), the gap between the arc's outer edge and
// the hull, the arc stretch (rad) its lamps lead in along, how many and
// their level (under the window's), the pane lit (the Wake's largest
// window on its camera side within `reach`, model units, of its bridge),
// that window's warm colour at a modest level and its soft
// glow (`glow`: its colour level and its size in panes; the game's bloom
// is strong: it must read as a window, not a flare); `env`: the share of
// the sky's reflection kept on the twin's paint, so the star below lights
// it and not the daylight of the field.
export const SLIP = Object.freeze({
  angle: 3.3,
  length: 640,
  gap: 26,
  lead: 0.55,
  lamps: 14,
  lampLevel: 0.55,
  reach: 8,
  window: ['#ffb866', 1.5],
  glow: [0.35, 2.5],
  env: 0.1,
});
// The arcs' deck and its lights (theCrucible.js arc()).
const DECK = { width: 110, thick: 26, lamp: 9 };

// The painted hull of `wake` (buildWake's) again, in a group of its own:
// each mesh on the same geometry, its material a copy (with the paint's
// shader patches, which a copy drops) keeping `env` of the sky's
// reflection. The opening's Wake is left as it is.
function paintedTwin(THREE, wake, env) {
  const group = new THREE.Group();
  wake.group.children.forEach((part) => {
    if (!part.isMesh) return;
    const material = part.material.clone();
    material.onBeforeCompile = part.material.onBeforeCompile;
    material.customProgramCacheKey = part.material.customProgramCacheKey;
    material.userData.rimBase = part.material.userData.rimBase;
    material.envMapIntensity *= env;
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.castShadow = part.castShadow;
    mesh.receiveShadow = part.receiveShadow;
    group.add(mesh);
  });
  return group;
}

// The Wake's extent in its model units, lights included (as drawn whole).
function extent(THREE, wake) {
  const box = new THREE.Box3();
  wake.group.traverse((part) => {
    if (!part.geometry) return;
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox);
  });
  return box;
}

/**
 * The slip on arc `spec` (theCrucible.js ARCS) with the set's `kit`, its
 * twin drawn from `wake` (the opening's, buildWake's):
 * { object (for the arc's turning group, hidden), frame (the cradle's own
 * frame: x along the arc, y up, z out from the star), lamps (meshes, in the
 * order the light reaches them), pane (the lit window), paneColor (its
 * colour fully lit), glow and glowColor (its halo, likewise) and paneAt
 * (its centre in the frame) }.
 */
export function buildSlip(THREE, kit, { radius, height, tilt }, wake) {
  const { tone } = kit;
  const steel = tone('#423d36');
  const dark = tone('#35312c');
  const frameTone = tone('#4a443b');
  const lampTone = tone('#ffd890', 1);
  const object = new THREE.Group();
  object.visible = false;
  // the arc's own lay (theCrucible.js: up `height`, turned by `tilt`)
  object.position.set(0, height, 0);
  object.rotation.set(tilt, 0, tilt * 0.6, 'YXZ');

  // far under the field: the sky's reflection mostly gone, no light on
  const twin = paintedTwin(THREE, wake, SLIP.env);
  const scale = SLIP.length / 100;
  twin.scale.setScalar(scale);
  const box = extent(THREE, wake);
  box.min.multiplyScalar(scale);
  box.max.multiplyScalar(scale);
  const half = (box.max.z - box.min.z) / 2;
  const rise = box.max.y - box.min.y;

  // The cradle's frame: past the deck's outer edge, x along the arc.
  const a = SLIP.angle;
  const out = radius + DECK.width / 2 + SLIP.gap + half;
  const frame = new THREE.Group();
  frame.position.set(Math.cos(a) * out, 0, Math.sin(a) * out);
  frame.rotation.y = -a + Math.PI / 2;
  object.add(frame);
  const keel = DECK.thick * 0.5;
  twin.position.set(
    -(box.min.x + box.max.x) / 2,
    keel - box.min.y,
    -(box.min.z + box.max.z) / 2
  );
  frame.add(twin);

  const hull = [];
  const L = SLIP.length;
  // the bed under the keel, and the two rails the cradle runs on
  kit.box(hull, dark, [0, 0, 0], [L * 1.08, DECK.thick, half * 0.7]);
  [-1, 1].forEach((side) =>
    kit.box(
      hull,
      frameTone,
      [0, -DECK.thick * 0.6, side * half * 0.75],
      [L * 1.15, 10, 10]
    )
  );
  // ribs: a crossbar under the hull and an arm up each side
  const ribs = 6;
  for (let i = 0; i < ribs; i += 1) {
    const x = (i / (ribs - 1) - 0.5) * L * 0.86;
    kit.box(hull, steel, [x, 0, 0], [16, DECK.thick * 1.2, half * 2.5]);
    [-1, 1].forEach((side) =>
      kit.box(
        hull,
        steel,
        [x, rise * 0.1, side * (half * 1.2)],
        [12, rise * 0.3, 10]
      )
    );
  }
  // two gantries back to the arc's deck
  const span = SLIP.gap + half * 0.25;
  [-0.3, 0.3].forEach((k) =>
    kit.box(
      hull,
      frameTone,
      [L * k, DECK.thick * 0.3, -half * 1.2 - span / 2],
      [22, 12, span]
    )
  );
  frame.add(kit.mesh(hull));

  // The lamps: along the arc's outer edge toward the slip, then the
  // cradle's arm tops from the far end to the near.
  const lamps = [];
  const lamp = (parent, at) => {
    const parts = [];
    kit.put(parts, kit.unit.octahedron, lampTone, at, DECK.lamp);
    const mesh = kit.mesh(parts, 'glow', 'crucible-slip');
    parent.add(mesh);
    lamps.push(mesh);
  };
  const edge = radius + DECK.width / 2;
  for (let i = 0; i < SLIP.lamps; i += 1) {
    const at = a - SLIP.lead + (SLIP.lead * i) / SLIP.lamps;
    lamp(object, [Math.cos(at) * edge, DECK.thick * 0.7, Math.sin(at) * edge]);
  }
  for (let i = 0; i < ribs; i += 1) {
    const x = (0.5 - i / (ribs - 1)) * L * 0.86;
    lamp(frame, [x, rise * 0.27, -half * 1.2]);
  }

  lamps[0].material.color.setScalar(SLIP.lampLevel);

  // The one window: a pane of the twin's own windows, lit on its own, and
  // its soft glow just off the hull.
  const [css, level] = SLIP.window;
  const paneColor = tone(css, level);
  const geometry = paneOf(
    THREE,
    wake.lights.windows,
    wake.anchors.bridge.position,
    SLIP.reach
  );
  const lit = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: paneColor.clone() })
  );
  geometry.computeBoundingBox();
  const centre = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const glowColor = tone(css, SLIP.glow[0]);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: bakeWakeGlow(THREE),
      color: glowColor.clone(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  const across = Math.max(size.x, size.y) * SLIP.glow[1];
  glow.scale.set(across, across, 1);
  glow.position.copy(centre).setZ(centre.z + 0.05);
  lit.add(glow);
  twin.add(lit);
  twin.updateMatrix();
  const paneAt = centre.clone().applyMatrix4(twin.matrix);
  return {
    object,
    frame,
    lamps,
    pane: lit,
    paneColor,
    glow,
    glowColor,
    paneAt,
  };
}

// One pane of the Wake's windows: the largest face toward +z (the
// camera's side of the slip) within `reach` (model units, across x and y)
// of `at`, the outermost among equals, and the triangle sharing its edge —
// its window's whole outer face.
function paneOf(THREE, windows, at, reach) {
  const source = windows.children[0].geometry;
  const flat = source.index ? source.toNonIndexed() : source;
  const p = flat.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const corners = (i) => {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
  };
  // facing +z near `at`, the largest (the outermost of equals): its first
  // vertex
  let seed = -1;
  let most = 0;
  let out = -Infinity;
  for (let i = 0; i < p.count; i += 3) {
    corners(i);
    const area = n.length() / 2;
    if (n.z / (area * 2) < 0.9) continue;
    a.add(b).add(c).divideScalar(3);
    // on the near side's outer skin, not a box's inner face beyond it
    if (a.z <= 0 || Math.hypot(a.x - at.x, a.y - at.y) > reach) continue;
    if (area > most * 1.01 || (area > most * 0.99 && a.z > out)) {
      most = Math.max(most, area);
      out = a.z;
      seed = i;
    }
  }
  const shared = (i) => {
    for (let k = 0; k < 3; k += 1) {
      for (let m = 0; m < 3; m += 1) {
        a.fromBufferAttribute(p, i + k);
        b.fromBufferAttribute(p, seed + m);
        if (a.distanceToSquared(b) < 1e-8) return true;
      }
    }
    return false;
  };
  const kept = [];
  for (let i = 0; i < p.count; i += 3) {
    if (i !== seed) {
      corners(i);
      if (n.z / Math.max(n.length(), 1e-9) < 0.9) continue;
      if (!shared(i)) continue;
    }
    for (let k = 0; k < 3; k += 1) {
      kept.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  return geometry;
}
