// What each place's set (places/) gives a journey to fly past and to frame
// (travelScene.js, shots.js, motion.js): `near`, the structure nearest the
// place, which the camera puts in the foreground as the ship leaves or
// comes in (a freighter's spine, the heat stacks, the crystals' tops, the
// shipyard's slips); `sign`, the place's signature shape, which the
// arrival reveals before the ship is in it (the far freighters, the star,
// the planet, the rebuilt arcs); `through`, a hole the ship leaves by
// (Prime's gate: "one hull through"). Each names a layer of the set and a
// point in its holder's frame: `share` of the layer's bounds, or `at` in its
// own units. Found when a journey starts, in the scene, as its set stands
// for the journey (placeSets.js setFlight).

// proposta 13/11: the marks, read from each set's build (its header and
// layers: places/*.js).
export const MARKS = Object.freeze({
  'debris-wake': {
    near: { layer: 3, share: [0.45, 1, 0.5] },
    sign: { layer: 1, share: [0.5, 0.5, 0.5] },
  },
  'salvage-lanes': {
    near: { layer: 2, share: [0.5, 1, 0.45] },
    sign: { layer: 1, share: [0.5, 0.6, 0.5] },
  },
  'prime-gate': {
    // GATE.at (520, 330) turned with the wall (0.14 about y).
    near: { layer: 0, at: [561, 40, 254] },
    sign: { layer: 0, at: [561, 0, 254] },
    through: { layer: 0, at: [561, 0, 254] },
  },
  'furnace-drift': {
    near: { layer: 2, share: [0.5, 1, 0.5] },
    sign: { layer: 0, share: [0.5, 0.5, 0.5] },
  },
  'crystal-choir': {
    near: { layer: 0, share: [0.5, 0.85, 0.5] },
    sign: { layer: 0, share: [0.5, 0.6, 0.45] },
  },
  'dense-core': {
    near: { layer: 0, share: [0.5, 0.95, 0.5] },
    sign: { layer: 0, share: [0.5, 0.5, 0.5] },
  },
  'assembly-graveyard': {
    near: { layer: 0, share: [0.35, 0.9, 0.3] },
    sign: { layer: 0, share: [0.6, 0.6, 0.6] },
  },
  'quarantine-grid': {
    near: { layer: 1, share: [0.5, 1, 0.5] },
    sign: { layer: 0, share: [0.5, 1, 0.5] },
  },
  'wardens-reach': {
    near: { layer: 0, share: [0.5, 1, 0.5] },
    sign: { layer: 0, share: [0.5, 0.5, 0.5] },
  },
  'the-crucible': {
    near: { layer: 0, share: [0.5, 0.95, 0.5] },
    sign: { layer: 0, at: [0, 0, 0] },
  },
});

// Each layer's bounds in its holder's frame, by set: found once.
const BOUNDS = new Map();

function layerBounds(THREE, set) {
  if (BOUNDS.has(set)) return BOUNDS.get(set);
  const m = new THREE.Matrix4();
  const bounds = set.layers.map((layer) => {
    const box = new THREE.Box3();
    layer.object.traverse((o) => {
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      m.identity();
      for (let q = o; q && q !== layer.holder; q = q.parent) {
        q.updateMatrix();
        m.premultiply(q.matrix);
      }
      box.union(o.geometry.boundingBox.clone().applyMatrix4(m));
    });
    return box;
  });
  BOUNDS.set(set, bounds);
  return bounds;
}

/**
 * Mark `spec` of `set` (placeSets.js built set) into `out`, in the scene:
 * its layers laid out for a camera aiming at field point (x, z), the set
 * posed by `pose` (Matrix4).
 */
export function markPoint(THREE, set, spec, x, z, pose, out) {
  const layer = set.layers[spec.layer];
  if (spec.at) out.fromArray(spec.at);
  else {
    const box = layerBounds(THREE, set)[spec.layer];
    const [a, b, c] = spec.share;
    out.set(
      box.min.x + (box.max.x - box.min.x) * a,
      box.min.y + (box.max.y - box.min.y) * b,
      box.min.z + (box.max.z - box.min.z) * c
    );
  }
  out.x += layer.anchor[0] + x * layer.follow;
  out.y += layer.anchor[1];
  out.z += layer.anchor[2] + z * layer.follow;
  return out.applyMatrix4(pose);
}
