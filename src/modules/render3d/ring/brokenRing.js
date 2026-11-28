// The broken Ring as a scene object (docs/NORTE.md §1–2): its modules in
// chunks of RING.chunk, one draw each, every chunk at the level of detail its
// distance from the camera asks for (ringParts.js). The gameplay camera is
// always far (level 0 everywhere: the Ring the field has always shown); a
// camera that comes close (a journey scene, the dev `?scene=ring`) gets the
// faces, the underside and the torn decks. A chunk builds a finer level the
// first time a camera comes close and keeps it.
//
// `follow` of the way it moves with the point the camera aims at on the
// field, so from the gameplay camera it parallaxes like something much
// deeper than it sits; a scene that flies to it sets follow to 0. `offset`
// moves it off its place (the journey lays it along the ship's flight).

import { mergeStatic } from '../mergeStatic.js';
import { ringMaterial } from './ringMaterial.js';
import { ringParts } from './ringParts.js';
import { MODULE_COUNT, RING, moduleStart } from './ringShape.js';

// proposta 20/10: a chunk draws level 1 when the camera is within `mid` of
// its stretch of the centre line (Ring units), level 2 within `near`. The
// gameplay camera never comes within ~1300 of it.
export const RING_LOD = { mid: 520, near: 240 };
export const RING_LEVELS = 3;
// A chunk's stretch reaches this far past its end modules (torn pieces,
// the debris off the stump).
const CHUNK_PAD = 120;

/** One merged geometry: modules [from, to) at `lod` (0 far .. 2 near). */
export function ringGeometry(THREE, options) {
  return mergeStatic(THREE, ringParts(THREE, options));
}

// The chunks' module ranges and stretches of arc (angle of the middle and
// half its span, radians).
export function ringChunks() {
  const chunks = [];
  for (let from = 0; from < MODULE_COUNT; from += RING.chunk) {
    const to = Math.min(MODULE_COUNT, from + RING.chunk);
    const s0 = moduleStart(from) - CHUNK_PAD;
    const s1 = moduleStart(to - 1) + RING.module + CHUNK_PAD;
    chunks.push({
      from,
      to,
      phi: RING.stump - (s0 + s1) / 2 / RING.radius,
      half: (s1 - s0) / 2 / RING.radius,
    });
  }
  return chunks;
}

// Distance from a Ring-local point to a chunk's stretch of the centre line.
export function chunkDistance(chunk, x, y, z) {
  const turn = Math.atan2(z, x) - chunk.phi;
  const wrapped = turn - 2 * Math.PI * Math.round(turn / (2 * Math.PI));
  const at = chunk.phi + Math.max(-chunk.half, Math.min(chunk.half, wrapped));
  return Math.hypot(
    x - RING.radius * Math.cos(at),
    y,
    z - RING.radius * Math.sin(at)
  );
}

export class BrokenRing {
  constructor(THREE) {
    this.THREE = THREE;
    const { material, uniforms } = ringMaterial(THREE);
    this.material = material;
    this.uniforms = uniforms;
    this.follow = RING.follow;
    this.offset = new THREE.Vector3();
    // Null: each chunk by its distance; 0..2 forces that level everywhere.
    this.forcedLevel = null;
    // An LOD's update(camera) is the renderer's hook, every frame, before it
    // draws the children: the Ring moves, picks its levels and leaves out the
    // chunks out of view there.
    this.object = new THREE.LOD();
    this.object.update = (camera) => this.update(camera);
    this.object.position.set(...RING.centre);
    this.object.rotation.x = -RING.tilt;
    this.aim = new THREE.Vector3();
    this.local = new THREE.Vector3();
    this.view = new THREE.Frustum();
    this.screen = new THREE.Matrix4();
    this.seen = new THREE.Sphere();

    // Level 0 of every chunk from one pass over the arc.
    this.chunks = ringChunks();
    const byChunk = this.chunks.map(() => []);
    ringParts(THREE).forEach((part) =>
      byChunk[Math.floor(part.module / RING.chunk)].push(part)
    );
    this.chunks.forEach((chunk, c) => {
      chunk.meshes = [];
      chunk.spheres = [];
      chunk.level = 0;
      this.addMesh(chunk, 0, mergeStatic(THREE, byChunk[c]));
    });
  }

  // Every chunk sorts at the Ring's centre (its bounding sphere grows to
  // reach it), as the arcs of the intact Ring do (fieldBackdrop.js): the
  // chunks tie and draw in the order they were made, so at a seam the later
  // one's hull covers the earlier one's lamps, and the Ring takes its turn
  // among the places' sets as one structure while it fades out over a
  // journey's arrival. Three culls by that sphere too, which holds the whole
  // Ring: update() leaves out a chunk whose own sphere is out of view (the
  // fine chunks behind a journey's camera came to ~100k triangles).
  addMesh(chunk, level, geometry) {
    const sphere = geometry.boundingSphere;
    chunk.spheres[level] = sphere.clone();
    sphere.radius += sphere.center.length();
    sphere.center.set(0, 0, 0);
    const mesh = new this.THREE.Mesh(geometry, this.material);
    mesh.renderOrder = -10;
    mesh.visible = level === chunk.level;
    chunk.meshes[level] = mesh;
    this.object.add(mesh);
    return mesh;
  }

  /** Builds `level` of `chunk` now (a scene can, before its camera arrives). */
  build(chunk, level) {
    if (!chunk.meshes[level]) {
      this.addMesh(
        chunk,
        level,
        ringGeometry(this.THREE, { lod: level, from: chunk.from, to: chunk.to })
      );
    }
    return chunk.meshes[level];
  }

  /** The level a camera at Ring-local (x, y, z) asks of `chunk`. */
  levelFor(chunk, x, y, z) {
    if (this.forcedLevel !== null) return this.forcedLevel;
    const d = chunkDistance(chunk, x, y, z);
    if (d < RING_LOD.near) return 2;
    return d < RING_LOD.mid ? 1 : 0;
  }

  update(camera) {
    const { object, aim, local, view, seen } = this;
    camera.getWorldDirection(aim);
    const reach = -camera.position.y / Math.min(aim.y, -0.1);
    object.position.set(
      RING.centre[0] + (camera.position.x + aim.x * reach) * this.follow,
      RING.centre[1],
      RING.centre[2] + (camera.position.z + aim.z * reach) * this.follow
    );
    object.position.add(this.offset);
    object.updateMatrixWorld(true);
    object.worldToLocal(local.setFromMatrixPosition(camera.matrixWorld));
    view.setFromProjectionMatrix(
      this.screen.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      )
    );
    this.chunks.forEach((chunk) => {
      const level = this.levelFor(chunk, local.x, local.y, local.z);
      if (level !== chunk.level) this.build(chunk, level);
      chunk.level = level;
      const shown = view.intersectsSphere(
        seen.copy(chunk.spheres[level]).applyMatrix4(object.matrixWorld)
      );
      chunk.meshes.forEach((mesh, n) => {
        if (mesh) mesh.visible = shown && n === level;
      });
    });
  }
}
