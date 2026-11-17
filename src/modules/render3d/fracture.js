// A machine's death breaks it along its own build (docs/NORTE.md: every hit
// is physical). The hull comes apart into the parts it was merged from — the
// fuselage, each wing, the pods, fins and nozzles — the small ones joined to
// their nearest neighbour and the big ones cut across their length, until
// there are `count` pieces. Every vertex carries its piece's centre and a
// random (aPiece: x, y, z, random); the burn's shader (dissolve.js) throws
// each piece out from the centre, spins it and burns it away. The body's
// other meshes in the same frame (its glowing strips and lenses) take the
// piece nearest them, so they fly with it; one as long as half the hull (an
// edge, a rail) tears with the pieces under it. Planned once per hull
// geometry.

const WELD = 1e4; // vertices this close (geometry units, about radii) are one
const TINY = 0.03; // a part under this share of the hull's area joins its nearest
const TILT = 0.45; // a cut leans off square to its length by up to this
const LONG = 0.5; // a part this share of the hull's size tears, triangle by triangle
const SPREAD = 3; // the pieces fly past the hull's bounds: culled on this × them

const plans = new WeakMap();

// Deterministic [0, 1) from a float (no Math.random: the same hull always
// breaks the same way).
function hash01(v) {
  const s = Math.sin(v * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Whether `node` and every parent up to the scene are visible. */
export function shown(node) {
  for (let n = node; n && !n.isScene; n = n.parent) {
    if (!n.visible) return false;
  }
  return true;
}

// Centroid and area of each triangle of a non-indexed geometry.
function triangles(geometry) {
  const p = geometry.getAttribute('position');
  const n = Math.floor(p.count / 3);
  const centroid = new Float32Array(n * 3);
  const area = new Float32Array(n);
  for (let t = 0; t < n; t += 1) {
    const a = t * 3;
    const ax = p.getX(a);
    const ay = p.getY(a);
    const az = p.getZ(a);
    const ux = p.getX(a + 1) - ax;
    const uy = p.getY(a + 1) - ay;
    const uz = p.getZ(a + 1) - az;
    const vx = p.getX(a + 2) - ax;
    const vy = p.getY(a + 2) - ay;
    const vz = p.getZ(a + 2) - az;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    // a sliver still weighs a little, so a part of slivers has a centre
    area[t] = 0.5 * Math.hypot(cx, cy, cz) + 1e-9;
    centroid[t * 3] = ax + (ux + vx) / 3;
    centroid[t * 3 + 1] = ay + (uy + vy) / 3;
    centroid[t * 3 + 2] = az + (uz + vz) / 3;
  }
  return { n, centroid, area };
}

function piece(list, tris) {
  let area = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i];
    const w = tris.area[t];
    area += w;
    for (let k = 0; k < 3; k += 1) {
      const c = tris.centroid[t * 3 + k];
      if (c < min[k]) min[k] = c;
      if (c > max[k]) max[k] = c;
    }
    x += tris.centroid[t * 3] * w;
    y += tris.centroid[t * 3 + 1] * w;
    z += tris.centroid[t * 3 + 2] * w;
  }
  return { list, area, c: [x / area, y / area, z / area], min, max };
}

// Triangles that share a vertex (welded: merged parts repeat theirs) are one
// part.
function parts(geometry, tris) {
  const p = geometry.getAttribute('position');
  const root = new Int32Array(tris.n);
  for (let t = 0; t < tris.n; t += 1) root[t] = t;
  const find = (t) => {
    let r = t;
    while (root[r] !== r) {
      root[r] = root[root[r]];
      r = root[r];
    }
    return r;
  };
  const seen = new Map();
  for (let v = 0; v < tris.n * 3; v += 1) {
    const key = `${Math.round(p.getX(v) * WELD)},${Math.round(p.getY(v) * WELD)},${Math.round(p.getZ(v) * WELD)}`;
    const t = Math.floor(v / 3);
    const other = seen.get(key);
    if (other === undefined) seen.set(key, t);
    else {
      const a = find(t);
      const b = find(other);
      if (a !== b) root[a] = b;
    }
  }
  const lists = new Map();
  for (let t = 0; t < tris.n; t += 1) {
    const r = find(t);
    if (!lists.has(r)) lists.set(r, []);
    lists.get(r).push(t);
  }
  return [...lists.values()].map((list) => piece(list, tris));
}

const span = (p) => Math.hypot(...[0, 1, 2].map((k) => p.max[k] - p.min[k]));

function nearest(pieces, c) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pieces.length; i += 1) {
    const q = pieces[i].c;
    const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Across its longest extent, leaning a little; null when one side is empty.
function split(p, tris, serial) {
  const span = [0, 1, 2].map((k) => p.max[k] - p.min[k]);
  const axis = span.indexOf(Math.max(...span));
  const n = [0, 1, 2].map((k) => TILT * (hash01(serial * 3.1 + k) - 0.5) * 2);
  n[axis] += 1;
  const a = [];
  const b = [];
  for (let i = 0; i < p.list.length; i += 1) {
    const t = p.list[i];
    let d = 0;
    for (let k = 0; k < 3; k += 1) {
      d += (tris.centroid[t * 3 + k] - p.c[k]) * n[k];
    }
    (d >= 0 ? a : b).push(t);
  }
  return a.length && b.length ? [piece(a, tris), piece(b, tris)] : null;
}

function plan(geometry, count) {
  const tris = triangles(geometry);
  let pieces = parts(geometry, tris);
  const total = pieces.reduce((sum, p) => sum + p.area, 0);
  // the small parts (sockets, studs) go with what they sit on, and the
  // smallest of the rest join their neighbours down to `count`
  const bySize = (a, b) => a.area - b.area;
  pieces.sort(bySize);
  while (
    pieces.length > 1 &&
    (pieces[0].area < TINY * total || pieces.length > count)
  ) {
    const small = pieces.shift();
    const into = nearest(pieces, small.c);
    pieces[into] = piece(pieces[into].list.concat(small.list), tris);
    pieces.sort(bySize);
  }
  // the big ones are cut across their length up to `count`
  const whole = new Set();
  let serial = 0;
  while (pieces.length < count) {
    let big = null;
    for (let i = 0; i < pieces.length; i += 1) {
      const p = pieces[i];
      if (!whole.has(p) && (!big || p.area > big.area)) big = p;
    }
    if (!big) break;
    serial += 1;
    const halves = split(big, tris, serial);
    if (halves) pieces.splice(pieces.indexOf(big), 1, ...halves);
    else whole.add(big);
  }
  pieces = pieces.map((p, i) => ({
    ...p,
    w: hash01(i * 7.31 + tris.n * 0.013),
  }));
  const all = piece(
    pieces.flatMap((p) => p.list),
    tris
  );
  return { pieces, tris, reach: LONG * span(all), broken: new Map() };
}

function brokenCopy(THREE, geometry, pieceOf, pieces) {
  const out = geometry.clone();
  const n = out.getAttribute('position').count;
  const a = new Float32Array(n * 4);
  for (let v = 0; v < n; v += 1) {
    const p = pieces[pieceOf[Math.floor(v / 3)]];
    a[v * 4] = p.c[0];
    a[v * 4 + 1] = p.c[1];
    a[v * 4 + 2] = p.c[2];
    a[v * 4 + 3] = p.w;
  }
  out.setAttribute('aPiece', new THREE.BufferAttribute(a, 4));
  out.computeBoundingSphere();
  out.boundingSphere.radius *= SPREAD;
  return out;
}

/**
 * `geometry` (the hull's, or another drawn in the hull's frame) with every
 * vertex tagged by its piece of `hull`, broken into about `count` pieces.
 * Cached: one plan per hull, one copy per geometry.
 */
export function brokenOf(THREE, hull, geometry, count) {
  let p = plans.get(hull);
  if (!p) {
    p = plan(hull.index ? hull.toNonIndexed() : hull, count);
    plans.set(hull, p);
  }
  let out = p.broken.get(geometry);
  if (out) return out;
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  let pieceOf;
  if (geometry === hull) {
    pieceOf = new Int32Array(p.tris.n);
    p.pieces.forEach((q, i) => q.list.forEach((t) => (pieceOf[t] = i)));
  } else {
    const tris = triangles(flat);
    pieceOf = new Int32Array(tris.n);
    parts(flat, tris).forEach((q) => {
      if (span(q) <= p.reach) {
        const i = nearest(p.pieces, q.c);
        q.list.forEach((t) => (pieceOf[t] = i));
        return;
      }
      q.list.forEach((t) => {
        const c = [0, 1, 2].map((k) => tris.centroid[t * 3 + k]);
        pieceOf[t] = nearest(p.pieces, c);
      });
    });
  }
  out = brokenCopy(THREE, flat, pieceOf, p.pieces);
  p.broken.set(geometry, out);
  return out;
}
