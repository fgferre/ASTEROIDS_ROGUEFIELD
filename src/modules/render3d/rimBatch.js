// Every machine outline in one draw (PLAN.md R8.2): each frame the live
// views' rim loops are written, in world space, as segments of one
// LineSegments with a colour per vertex (threat red, Elite gold, Herald and
// Warden violet). No rim this frame: hidden, no draw.

export const RIM_SEGMENT_CAP = 4096;

/** A closed loop's points (Vector3s) as flat xyz, for `push`. */
export function rimLoop(points) {
  const loop = new Float32Array(points.length * 3);
  points.forEach((point, i) => point.toArray(loop, i * 3));
  return loop;
}

export class RimBatch {
  constructor(THREE, scene, capacity = RIM_SEGMENT_CAP) {
    this.capacity = capacity;
    this.count = 0;
    const geometry = new THREE.BufferGeometry();
    ['position', 'color'].forEach((name) => {
      const attribute = new THREE.BufferAttribute(
        new Float32Array(capacity * 6),
        3
      );
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
    });
    this.positions = geometry.attributes.position;
    this.colors = geometry.attributes.color;
    this.object = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false })
    );
    // segments spread over the whole field: no useful bounds
    this.object.frustumCulled = false;
    this.object.visible = false;
    scene.add(this.object);
  }

  begin() {
    this.count = 0;
  }

  /**
   * The closed loop `points` (flat xyz, local) under `matrix` (its world
   * matrix), in `color`. False when the batch is full.
   */
  push(points, matrix, color) {
    const n = points.length / 3;
    if (this.count + n > this.capacity) return false;
    const e = matrix.elements;
    const p = this.positions.array;
    const c = this.colors.array;
    const start = this.count * 6;
    for (let i = 0; i < n; i += 1) {
      const x = points[i * 3];
      const y = points[i * 3 + 1];
      const z = points[i * 3 + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      // point i starts segment i and ends segment i - 1
      const a = start + i * 6;
      const b = start + ((i + n - 1) % n) * 6 + 3;
      p[a] = p[b] = wx;
      p[a + 1] = p[b + 1] = wy;
      p[a + 2] = p[b + 2] = wz;
      c[a] = c[a + 3] = color.r;
      c[a + 1] = c[a + 4] = color.g;
      c[a + 2] = c[a + 5] = color.b;
    }
    this.count += n;
    return true;
  }

  /** Uploads what was pushed; hidden when empty. */
  end() {
    const n = this.count;
    this.object.geometry.setDrawRange(0, n * 2);
    this.object.visible = n > 0;
    if (!n) return;
    [this.positions, this.colors].forEach((attribute) => {
      attribute.updateRange.count = n * 6;
      attribute.needsUpdate = true;
    });
  }

  clear() {
    this.begin();
    this.end();
  }
}
