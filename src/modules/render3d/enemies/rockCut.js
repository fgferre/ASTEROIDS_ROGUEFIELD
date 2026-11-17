// A rock cut along its own cracks (pedras, 17/11): the crack shader's cell
// field (rockShader.js rockCracks, sampled at position × CRACK_SCALE + seed)
// splits the surface into cells; whole cells go to the piece whose direction
// they face, so a rock opens exactly where its cracks were lit. Each piece is
// closed with a rough cut face (a ring pulled inward, then a fan to a point
// near the rock's heart) whose `cut` attribute (1 at the rim, less inside)
// is the heat the shader lights and lets cool.

export const CRACK_SCALE = 2.3;
// cut face: ring depth toward the heart (fraction of the way), its jitter,
// and how far the heart sits toward the piece's own centre
const RING_DEPTH = 0.22;
const RING_JITTER = 0.06;
const HEART_PULL = 0.15;
const CUT_HEAT = [1, 0.55, 0.25]; // rim, ring, heart

const fract = (x) => x - Math.floor(x);
// rockShader.js rockHash, per component
function siteOffset(ix, iy, iz, out) {
  out[0] = fract(Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453);
  out[1] = fract(Math.sin(ix * 269.5 + iy * 183.3 + iz * 246.1) * 43758.5453);
  out[2] = fract(Math.sin(ix * 113.5 + iy * 271.9 + iz * 124.6) * 43758.5453);
}

/** The crack cell (a lattice key) the point (x, y, z) of the field lies in. */
export function crackCell(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const h = [0, 0, 0];
  let best = Infinity;
  let key = '';
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        siteOffset(ix + dx, iy + dy, iz + dz, h);
        const ox = ix + dx + h[0] - x;
        const oy = iy + dy + h[1] - y;
        const oz = iz + dz + h[2] - z;
        const d = ox * ox + oy * oy + oz * oz;
        if (d < best) {
          best = d;
          key = `${ix + dx},${iy + dy},${iz + dz}`;
        }
      }
    }
  }
  return key;
}

/**
 * Cuts `geometry` (a closed rock surface with position, normal and color)
 * into one piece per direction of `dirs` (unit vectors in the rock's own
 * space). `seed` is the rock's crack seed (rocks.js view.rock.seed),
 * `random` a seeded [0, 1) source. Returns per piece `{ geometry, centre,
 * size }`: the geometry centred on the piece and scaled to the bulk of the
 * whole rock (so a fragment of radius r looks as massive as a whole rock of
 * radius r), `centre` where that centre was in the rock, `size` the scale
 * that gives the piece back its size in the rock.
 */
export function cutRock(THREE, geometry, seed, dirs, random) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  const color = source.getAttribute('color');
  const triangles = position.count / 3;

  // cell of each triangle, then each cell's mean direction
  const cells = new Map();
  for (let t = 0; t < triangles; t += 1) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k += 1) {
      x += position.getX(t * 3 + k);
      y += position.getY(t * 3 + k);
      z += position.getZ(t * 3 + k);
    }
    const key = crackCell(
      (x / 3) * CRACK_SCALE + seed.x,
      (y / 3) * CRACK_SCALE + seed.y,
      (z / 3) * CRACK_SCALE + seed.z
    );
    let cell = cells.get(key);
    if (!cell) {
      cell = { triangles: [], x: 0, y: 0, z: 0 };
      cells.set(key, cell);
    }
    cell.triangles.push(t);
    cell.x += x;
    cell.y += y;
    cell.z += z;
  }
  const groups = dirs.map(() => []);
  cells.forEach((cell) => {
    let best = 0;
    let bestDot = -Infinity;
    dirs.forEach((d, i) => {
      const dot = d.x * cell.x + d.y * cell.y + d.z * cell.z;
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    });
    groups[best].push(...cell.triangles);
  });
  const bulk = volumeOf(position.array, position.array.length);
  return groups.map((tris) =>
    closePiece(THREE, tris, position, normal, color, random, bulk)
  );
}

// Volume enclosed by triangles (flat xyz × 3 per triangle) up to `end`.
function volumeOf(p, end) {
  let v = 0;
  for (let o = 0; o < end; o += 9) {
    v +=
      p[o] * (p[o + 4] * p[o + 8] - p[o + 5] * p[o + 7]) -
      p[o + 1] * (p[o + 3] * p[o + 8] - p[o + 5] * p[o + 6]) +
      p[o + 2] * (p[o + 3] * p[o + 7] - p[o + 4] * p[o + 6]);
  }
  return v / 6;
}

const vertexKey = (a, i) =>
  `${Math.round(a.getX(i) * 1e4)},${Math.round(a.getY(i) * 1e4)},${Math.round(a.getZ(i) * 1e4)}`;

// The piece's surface triangles plus its cut face, centred and unit-sized.
function closePiece(THREE, tris, position, normal, color, random, bulk) {
  const pos = [];
  const nor = [];
  const col = [];
  const cut = [];
  const centre = new THREE.Vector3();
  tris.forEach((t) => {
    for (let k = 0; k < 3; k += 1) {
      const i = t * 3 + k;
      pos.push(position.getX(i), position.getY(i), position.getZ(i));
      nor.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      if (color) col.push(color.getX(i), color.getY(i), color.getZ(i));
      else col.push(1, 1, 1);
      cut.push(0);
      centre.x += position.getX(i);
      centre.y += position.getY(i);
      centre.z += position.getZ(i);
    }
  });
  if (tris.length) centre.multiplyScalar(1 / (tris.length * 3));

  // open edges: an edge seen once (its twin went to another piece)
  const edges = new Map();
  tris.forEach((t) => {
    for (let k = 0; k < 3; k += 1) {
      const a = t * 3 + k;
      const b = t * 3 + ((k + 1) % 3);
      const ka = vertexKey(position, a);
      const kb = vertexKey(position, b);
      if (!edges.delete(`${kb}|${ka}`)) edges.set(`${ka}|${kb}`, [a, b]);
    }
  });

  // the cut face: rim → jittered ring → heart, darker rock inside
  const heart = centre.clone().multiplyScalar(HEART_PULL);
  const ring = new Map();
  const ringOf = (i) => {
    const key = vertexKey(position, i);
    let p = ring.get(key);
    if (!p) {
      p = new THREE.Vector3(
        position.getX(i),
        position.getY(i),
        position.getZ(i)
      ).lerp(heart, RING_DEPTH + random() * RING_DEPTH * 0.5);
      p.x += (random() - 0.5) * RING_JITTER;
      p.y += (random() - 0.5) * RING_JITTER;
      p.z += (random() - 0.5) * RING_JITTER;
      ring.set(key, p);
    }
    return p;
  };
  const inside = color ? [0.32, 0.3, 0.29] : [1, 1, 1];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const face = (p, q, r, hp, hq, hr) => {
    const n = b.copy(q).sub(p).cross(a.copy(r).sub(p)).normalize();
    [p, q, r].forEach((v) => {
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
      col.push(...inside);
    });
    cut.push(hp, hq, hr);
  };
  const [rim, mid, core] = CUT_HEAT;
  edges.forEach(([i, j]) => {
    const pi = new THREE.Vector3(
      position.getX(i),
      position.getY(i),
      position.getZ(i)
    );
    const pj = new THREE.Vector3(
      position.getX(j),
      position.getY(j),
      position.getZ(j)
    );
    const ri = ringOf(i);
    const rj = ringOf(j);
    face(pj, pi, ri, rim, rim, mid);
    face(pj, ri, rj, rim, mid, mid);
    face(rj, ri, heart, mid, mid, core);
  });

  // centred on all its corners, scaled to the whole rock's bulk
  centre.set(0, 0, 0);
  for (let i = 0; i < pos.length; i += 3) {
    centre.x += pos[i];
    centre.y += pos[i + 1];
    centre.z += pos[i + 2];
  }
  centre.multiplyScalar(3 / pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= centre.x;
    pos[i + 1] -= centre.y;
    pos[i + 2] -= centre.z;
  }
  const size = Math.cbrt(Math.max(1e-6, volumeOf(pos, pos.length)) / bulk);
  for (let i = 0; i < pos.length; i += 1) pos[i] /= size;

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('cut', new THREE.Float32BufferAttribute(cut, 1));
  out.computeBoundingSphere();
  return { geometry: out, centre, size };
}
