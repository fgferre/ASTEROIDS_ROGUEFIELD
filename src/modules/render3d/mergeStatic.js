// Static parts of one view merged into a single draw (PLAN.md R7.1): each
// part's geometry is placed by its own transform and, given a `color`, baked
// into a vertex colour, so the parts of a machine that never move apart draw
// as one mesh under one shared material. `flat` parts take face normals (the
// look of a flatShading material). The result is non-indexed and keeps uv/uv2
// only when every part has them (baked surface maps).

/**
 * parts: [{ geometry, color?, flat?, position?: [x, y, z],
 *           scale?: number | [x, y, z], rotationY? }]
 */
export function mergeStatic(THREE, parts) {
  const sources = parts.map((part) =>
    part.geometry.index ? part.geometry.toNonIndexed() : part.geometry
  );
  const total = sources.reduce(
    (sum, g) => sum + g.getAttribute('position').count,
    0
  );
  const every = (name) => sources.every((g) => g.getAttribute(name));
  const uvNames = ['uv', 'uv2'].filter(every);
  const colored = parts.some((part) => part.color);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = colored ? new Float32Array(total * 3) : null;
  const uvs = uvNames.map(() => new Float32Array(total * 2));

  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const white = new THREE.Color(1, 1, 1);
  let offset = 0;
  parts.forEach((part, p) => {
    const g = sources[p];
    const scale = part.scale ?? 1;
    matrix.compose(
      v.fromArray(part.position || [0, 0, 0]).clone(),
      quaternion.setFromAxisAngle(up, part.rotationY || 0),
      typeof scale === 'number'
        ? new THREE.Vector3(scale, scale, scale)
        : new THREE.Vector3().fromArray(scale)
    );
    normalMatrix.getNormalMatrix(matrix);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const tint = part.color || white;
    for (let i = 0; i < pos.count; i += 1) {
      const o = (offset + i) * 3;
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix).toArray(position, o);
      v.fromBufferAttribute(nor, i)
        .applyMatrix3(normalMatrix)
        .normalize()
        .toArray(normal, o);
      if (color) tint.toArray(color, o);
    }
    if (part.flat) {
      for (let i = 0; i < pos.count; i += 3) {
        const o = (offset + i) * 3;
        a.fromArray(position, o);
        b.fromArray(position, o + 3);
        c.fromArray(position, o + 6);
        v.subVectors(c, b).cross(a.sub(b)).normalize();
        for (let k = 0; k < 3; k += 1) v.toArray(normal, o + k * 3);
      }
    }
    uvNames.forEach((name, n) => {
      const uv = g.getAttribute(name);
      for (let i = 0; i < uv.count; i += 1) {
        uvs[n][(offset + i) * 2] = uv.getX(i);
        uvs[n][(offset + i) * 2 + 1] = uv.getY(i);
      }
    });
    offset += pos.count;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (color) merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  uvNames.forEach((name, n) =>
    merged.setAttribute(name, new THREE.BufferAttribute(uvs[n], 2))
  );
  merged.computeBoundingSphere();
  return merged;
}
