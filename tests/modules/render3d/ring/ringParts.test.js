import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeStatic } from '../../../../src/modules/render3d/mergeStatic.js';
import { ringParts } from '../../../../src/modules/render3d/ring/ringParts.js';
import { RING } from '../../../../src/modules/render3d/ring/ringShape.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

// Chunks worth checking: the stump and the frame by it, plain hull with
// ribs, both ends of the gap.
const RANGES = [
  [0, 8],
  [16, 24],
  [40, 48],
];

const build = (lod, [from, to]) =>
  mergeStatic(THREE, ringParts(THREE, { lod, from, to }));

const corner = (p, i) =>
  [p.getX(i), p.getY(i), p.getZ(i)]
    .map((v) => String(Math.round(v * 1000)))
    .join(',');

// Every piece is a closed solid wound to face out: each edge is crossed
// once each way, and every triangle faces where its normals say.
function solidFaults(geometry) {
  const p = geometry.getAttribute('position');
  const n = geometry.getAttribute('normal');
  const edges = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let inward = 0;
  for (let t = 0; t < p.count; t += 3) {
    const keys = [corner(p, t), corner(p, t + 1), corner(p, t + 2)];
    for (let k = 0; k < 3; k += 1) {
      const edge = `${keys[k]}|${keys[(k + 1) % 3]}`;
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
    a.fromBufferAttribute(p, t);
    b.fromBufferAttribute(p, t + 1);
    c.fromBufferAttribute(p, t + 2);
    const face = c.sub(b).cross(a.sub(b));
    if (face.lengthSq() < 1e-12) continue;
    normal.fromBufferAttribute(n, t);
    if (face.dot(normal) <= 0) inward += 1;
  }
  let open = 0;
  edges.forEach((count, edge) => {
    const [from, to] = edge.split('|');
    if (edges.get(`${to}|${from}`) !== count) open += 1;
  });
  return { open, inward, finite: Array.from(p.array).every(Number.isFinite) };
}

function vertexBag(geometry) {
  const p = geometry.getAttribute('position');
  const bag = new Map();
  for (let i = 0; i < p.count; i += 1) {
    const key = corner(p, i);
    bag.set(key, (bag.get(key) || 0) + 1);
  }
  return bag;
}

describe('ringParts', () => {
  it('builds every level of every chunk as closed solids facing out', () => {
    [0, 1, 2].forEach((lod) =>
      RANGES.forEach((range) => {
        const geometry = build(lod, range);
        expect(geometry.getAttribute('position').count % 3).toBe(0);
        expect(solidFaults(geometry)).toEqual({
          open: 0,
          inward: 0,
          finite: true,
        });
      })
    );
  });

  it('builds a module the same in any range: a chunk is its part of the whole Ring', () => {
    const whole = ringParts(THREE).filter(
      (part) => part.module >= 16 && part.module < 24
    );
    const chunk = ringParts(THREE, { from: 16, to: 24 });
    expect(chunk.length).toBe(whole.length);
    expect(mergeStatic(THREE, chunk).getAttribute('position').array).toEqual(
      mergeStatic(THREE, whole).getAttribute('position').array
    );
  });

  it('adds detail level by level, the near level keeping every part of the mid one', () => {
    RANGES.forEach((range) => {
      const counts = [0, 1, 2].map(
        (lod) => build(lod, range).getAttribute('position').count
      );
      expect(counts[1]).toBeGreaterThan(counts[0] * 2);
      expect(counts[2]).toBeGreaterThan(counts[1]);
      const near = vertexBag(build(2, range));
      vertexBag(build(1, range)).forEach((count, key) =>
        expect(near.get(key) ?? 0).toBeGreaterThanOrEqual(count)
      );
    });
  });

  it('gives the close levels a face on each side and an underside', () => {
    const { width: W, hull: H, keel: K } = RING;
    // Vertices on the outer (1) and inner (−1) faces above the belt, and
    // under the keel's ribs.
    const reach = (geometry) => {
      const p = geometry.getAttribute('position');
      const out = { outer: 0, inner: 0, under: 0, low: Infinity };
      for (let i = 0; i < p.count; i += 1) {
        const r = Math.hypot(p.getX(i), p.getZ(i)) - RING.radius;
        const y = p.getY(i);
        if (Math.abs(r) > W / 2 + 0.1 && y > -8 && y < 8) {
          out[r > 0 ? 'outer' : 'inner'] += 1;
        }
        if (y < -H - K - 3) out.under += 1;
        out.low = Math.min(out.low, y);
      }
      return out;
    };
    const far = reach(build(0, [16, 24]));
    const mid = reach(build(1, [16, 24]));
    // Level 0: the keel under the hull, its ribs a little deeper.
    expect(far.low).toBeLessThan(-H - K);
    expect(far.under).toBe(0);
    // Level 1: buttresses and windows on both faces, masts and pods under.
    expect(mid.outer).toBeGreaterThan(far.outer * 3);
    expect(mid.inner).toBeGreaterThan(far.inner * 3);
    expect(mid.under).toBeGreaterThan(100);
  });

  it('is a dead structure until the wake at every level: few faint lights, the wake on its seams', () => {
    [0, 1, 2].forEach((lod) => {
      const colors = build(lod, [0, 24]).getAttribute('color');
      let idle = 0;
      let wake = 0;
      for (let i = 0; i < colors.count; i += 1) {
        if (colors.getY(i) > 0) idle += 1;
        if (colors.getZ(i) > 0) wake += 1;
      }
      expect(idle / colors.count).toBeLessThan(0.1);
      expect(wake / colors.count).toBeGreaterThan(0.05);
      expect(wake / colors.count).toBeLessThan(0.5);
    });
  });
});
