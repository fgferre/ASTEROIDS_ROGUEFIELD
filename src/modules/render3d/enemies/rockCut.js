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
const NORMAL_JITTER = 1.1;

const fract = (x) => x - Math.floor(x);
// rockShader.js rockHash, per component
function siteOffset(ix, iy, iz, out) {
  out[0] = fract(Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453);
  out[1] = fract(Math.sin(ix * 269.5 + iy * 183.3 + iz * 246.1) * 43758.5453);
  out[2] = fract(Math.sin(ix * 113.5 + iy * 271.9 + iz * 124.6) * 43758.5453);
}

// What a cut needs of a rock shape that does not change between cuts (its
// triangles' summed corners, its corners welded by place, its bulk), kept
// per geometry; a piece re-posed after its cut (applyMatrix4 bumps the
// position's version) is read anew.
const prepared = new WeakMap();
function prepare(geometry) {
  const version = geometry.getAttribute('position').version;
  const known = prepared.get(geometry);
  if (known?.version === version) return known;
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute('position');
  const triangles = position.count / 3;
  const sums = new Float64Array(triangles * 3);
  for (let t = 0; t < triangles; t += 1) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k += 1) {
      x += position.getX(t * 3 + k);
      y += position.getY(t * 3 + k);
      z += position.getZ(t * 3 + k);
    }
    sums[t * 3] = x;
    sums[t * 3 + 1] = y;
    sums[t * 3 + 2] = z;
  }
  // corners at the same place (to 1e-4) share one id: an edge is open
  // where its twin went to another piece
  const ids = new Map();
  const weld = new Int32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    weld[i] = id;
  }
  const shape = {
    version,
    position,
    normal: source.getAttribute('normal'),
    color: source.getAttribute('color'),
    triangles,
    sums,
    weld,
    welded: ids.size,
    bulk: volumeOf(position.array, position.array.length),
  };
  prepared.set(geometry, shape);
  return shape;
}

// Each triangle's crack cell (a lattice site id) for the crack seed `seed`:
// the nearest jittered site around the point (sums / 3) × CRACK_SCALE +
// seed, the sites' jitter read once from a table over the rock's lattice.
function cellsOf(shape, seed) {
  const { triangles, sums } = shape;
  const field = new Float64Array(triangles * 3);
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  const offset = [seed.x, seed.y, seed.z];
  for (let t = 0; t < triangles; t += 1) {
    for (let a = 0; a < 3; a += 1) {
      const v = (sums[t * 3 + a] / 3) * CRACK_SCALE + offset[a];
      field[t * 3 + a] = v;
      const i = Math.floor(v);
      if (i < lo[a]) lo[a] = i;
      if (i > hi[a]) hi[a] = i;
    }
  }
  lo = lo.map((i) => i - 1);
  hi = hi.map((i) => i + 1);
  const nx = hi[0] - lo[0] + 1;
  const ny = hi[1] - lo[1] + 1;
  const nz = hi[2] - lo[2] + 1;
  const jitter = new Float64Array(nx * ny * nz * 3);
  const h = [0, 0, 0];
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        siteOffset(lo[0] + x, lo[1] + y, lo[2] + z, h);
        jitter.set(h, (x + nx * (y + ny * z)) * 3);
      }
    }
  }
  const cells = new Int32Array(triangles);
  for (let t = 0; t < triangles; t += 1) {
    const x = field[t * 3];
    const y = field[t * 3 + 1];
    const z = field[t * 3 + 2];
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    let best = Infinity;
    let site = 0;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const s =
            ix + dx - lo[0] + nx * (iy + dy - lo[1] + ny * (iz + dz - lo[2]));
          const ox = ix + dx + jitter[s * 3] - x;
          const oy = iy + dy + jitter[s * 3 + 1] - y;
          const oz = iz + dz + jitter[s * 3 + 2] - z;
          const d = ox * ox + oy * oy + oz * oz;
          if (d < best) {
            best = d;
            site = s;
          }
        }
      }
    }
    cells[t] = site;
  }
  return cells;
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
  const shape = prepare(geometry);
  const { triangles, sums } = shape;
  const sites = cellsOf(shape, seed);

  // each cell's triangles and summed corners, then its piece
  const cells = new Map();
  for (let t = 0; t < triangles; t += 1) {
    let cell = cells.get(sites[t]);
    if (!cell) {
      cell = { triangles: [], x: 0, y: 0, z: 0 };
      cells.set(sites[t], cell);
    }
    cell.triangles.push(t);
    cell.x += sums[t * 3];
    cell.y += sums[t * 3 + 1];
    cell.z += sums[t * 3 + 2];
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
  return groups.map((tris) => closePiece(THREE, tris, shape, random));
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

// The piece's surface triangles plus its cut face, centred and unit-sized.
// Corners are written straight into flat arrays (positions kept in double
// precision until the end, as the bulk and centring are reckoned on them).
function closePiece(THREE, tris, shape, random) {
  const { position, normal, color, weld, welded, bulk } = shape;
  const P = position.array;
  const N = normal.array;
  const C = color?.array;

  // open edges: an edge seen once (its twin went to another piece), kept by
  // its first corner (the second is the next corner of its triangle)
  const edges = new Map();
  for (let n = 0; n < tris.length; n += 1) {
    const t = tris[n];
    for (let k = 0; k < 3; k += 1) {
      const a = t * 3 + k;
      const b = t * 3 + ((k + 1) % 3);
      const ka = weld[a];
      const kb = weld[b];
      if (!edges.delete(kb * welded + ka)) edges.set(ka * welded + kb, a);
    }
  }

  const corners = tris.length * 3 + edges.size * 9;
  const pos = new Float64Array(corners * 3);
  const nor = new Float32Array(corners * 3);
  const col = new Float32Array(corners * 3);
  const cut = new Float32Array(corners);
  let w = 0; // corners written
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let n = 0; n < tris.length; n += 1) {
    const t = tris[n];
    for (let k = 0; k < 3; k += 1) {
      const i = (t * 3 + k) * 3;
      const o = w * 3;
      pos[o] = P[i];
      pos[o + 1] = P[i + 1];
      pos[o + 2] = P[i + 2];
      nor[o] = N[i];
      nor[o + 1] = N[i + 1];
      nor[o + 2] = N[i + 2];
      col[o] = C ? C[i] : 1;
      col[o + 1] = C ? C[i + 1] : 1;
      col[o + 2] = C ? C[i + 2] : 1;
      cx += P[i];
      cy += P[i + 1];
      cz += P[i + 2];
      w += 1;
    }
  }
  if (tris.length) {
    const s = 1 / (tris.length * 3);
    cx *= s;
    cy *= s;
    cz *= s;
  }

  // the cut face: rim → jittered ring → heart, darker rock inside
  const hx = cx * HEART_PULL;
  const hy = cy * HEART_PULL;
  const hz = cz * HEART_PULL;
  const ring = new Map();
  const ringOf = (i) => {
    const key = weld[i];
    let p = ring.get(key);
    if (!p) {
      const depth = RING_DEPTH + random() * RING_DEPTH * 0.5;
      let x = P[i * 3];
      let y = P[i * 3 + 1];
      let z = P[i * 3 + 2];
      x += (hx - x) * depth;
      y += (hy - y) * depth;
      z += (hz - z) * depth;
      x += (random() - 0.5) * RING_JITTER;
      y += (random() - 0.5) * RING_JITTER;
      z += (random() - 0.5) * RING_JITTER;
      p = [x, y, z];
      ring.set(key, p);
    }
    return p;
  };
  const inside = color ? [0.13, 0.12, 0.115] : [1, 1, 1];
  // a break is rough: each corner's normal is tipped at random, so the
  // flat cut face catches the light unevenly instead of as one sheet
  const corner = (v, nx, ny, nz, heat) => {
    const o = w * 3;
    pos[o] = v[0];
    pos[o + 1] = v[1];
    pos[o + 2] = v[2];
    const tx = nx + (random() - 0.5) * NORMAL_JITTER;
    const ty = ny + (random() - 0.5) * NORMAL_JITTER;
    const tz = nz + (random() - 0.5) * NORMAL_JITTER;
    const len = Math.hypot(tx, ty, tz) || 1;
    nor[o] = tx / len;
    nor[o + 1] = ty / len;
    nor[o + 2] = tz / len;
    col[o] = inside[0];
    col[o + 1] = inside[1];
    col[o + 2] = inside[2];
    cut[w] = heat;
    w += 1;
  };
  const face = (p, q, r, hp, hq, hr) => {
    // (q − p) × (r − p), normalised as three's Vector3 does
    const bx = q[0] - p[0];
    const by = q[1] - p[1];
    const bz = q[2] - p[2];
    const ax = r[0] - p[0];
    const ay = r[1] - p[1];
    const az = r[2] - p[2];
    let nx = by * az - bz * ay;
    let ny = bz * ax - bx * az;
    let nz = bx * ay - by * ax;
    const s = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
    nx *= s;
    ny *= s;
    nz *= s;
    corner(p, nx, ny, nz, hp);
    corner(q, nx, ny, nz, hq);
    corner(r, nx, ny, nz, hr);
  };
  const [rim, mid, core] = CUT_HEAT;
  const heart = [hx, hy, hz];
  edges.forEach((i) => {
    const j = i - (i % 3) + (((i % 3) + 1) % 3);
    const pi = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const pj = [P[j * 3], P[j * 3 + 1], P[j * 3 + 2]];
    const ri = ringOf(i);
    const rj = ringOf(j);
    face(pj, pi, ri, rim, rim, mid);
    face(pj, ri, rj, rim, mid, mid);
    face(rj, ri, heart, mid, mid, core);
  });

  // centred on all its corners, scaled to the whole rock's bulk
  const centre = new THREE.Vector3();
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
  out.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(pos), 3)
  );
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('cut', new THREE.BufferAttribute(cut, 1));
  out.computeBoundingSphere();
  return { geometry: out, centre, size };
}
