// Procedural asteroid geometry shared by the menu (MenuBackgroundSystem) and
// the 3D gameplay renderer (render3d/Renderer3D.js). THREE (r128, a global
// loaded by index.html) is passed in, so this module also runs in Node tests.
// Same seed → same vertex buffer.

/** Park–Miller generator: a seed → a function returning floats in [0, 1). */
export function createSeededRandom(seed) {
  let value = Math.floor(seed * 1000) % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/**
 * Unit-radius rock: an icosahedron displaced on the CPU by fbm + ridged noise,
 * cuts and stamped craters, smoothed and welded so normals stay soft.
 */
export function createAsteroidGeometry(THREE, detailSeed, { detail = 5 } = {}) {
  const rng = createSeededRandom(detailSeed);
  let geometry = new THREE.IcosahedronGeometry(1, detail);

  // --- Macro shape in geometry (PDF: "stamping" crater hemispheres + noise) ---
  // This avoids per-vertex displacement artifacts in shaders and produces
  // smooth, eroded silhouettes even at grazing angles.
  const simplex = new SimplexNoise(createSeededRandom(detailSeed + 101));
  const craterRng = createSeededRandom(detailSeed + 202);
  const axisScale = new THREE.Vector3(
    0.78 + rng() * 0.44,
    0.78 + rng() * 0.44,
    0.78 + rng() * 0.44
  );

  const craterCount = 22 + Math.floor(craterRng() * 22);
  const craters = Array.from({ length: craterCount }, () => {
    const u = craterRng();
    const v = craterRng();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const center = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    ).normalize();
    const radius = 0.12 + craterRng() * 0.3; // angular-ish radius (unit sphere)
    const depth = 0.07 + craterRng() * 0.14;
    const rim = 0.012 + craterRng() * 0.035;
    return { center, radius, depth, rim };
  });

  const positionAttr = geometry.getAttribute('position');
  const vertexCount = positionAttr.count;
  const heights = new Float32Array(vertexCount);

  const smoothstep = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  for (let i = 0; i < vertexCount; i += 1) {
    const x = positionAttr.getX(i);
    const y = positionAttr.getY(i);
    const z = positionAttr.getZ(i);
    const pBase = new THREE.Vector3(x, y, z).normalize();
    const p = new THREE.Vector3(
      pBase.x * axisScale.x,
      pBase.y * axisScale.y,
      pBase.z * axisScale.z
    ).normalize();

    const base =
      simplex.fbm(
        p.x * 0.45 + detailSeed * 0.07,
        p.y * 0.45 + detailSeed * 0.11,
        p.z * 0.45,
        4
      ) * 0.38;
    const ridges =
      simplex.ridgedMF(
        p.x * 1.2 + 12.3,
        p.y * 1.2 + 45.6,
        p.z * 1.2 + detailSeed * 0.03,
        4,
        2.0,
        0.55
      ) * 0.3;
    const cutNoise = simplex.noise3d(
      p.x * 0.65 + 12.0,
      p.y * 0.65 + 2.0,
      p.z * 0.65 + detailSeed * 0.02
    );
    const cuts = smoothstep(0.35, 0.9, cutNoise) * 0.2;

    let craterShape = 0;
    for (let c = 0; c < craters.length; c += 1) {
      const crater = craters[c];
      const dot = p.dot(crater.center);
      const d = Math.sqrt(Math.max(0, 2 * (1 - dot))); // chord distance on unit sphere
      if (d >= crater.radius) continue;
      const t = d / crater.radius;
      const bowl = -(1 - t * t) * crater.depth;
      const rimBand =
        smoothstep(0.7, 1.0, t) * smoothstep(1.0, 0.92, t) * crater.rim;
      craterShape += bowl + rimBand;
    }

    let h = base + ridges - cuts + craterShape;
    // Erosion-like conditioning: compress peaks hard, keep valleys.
    h = Math.max(-0.75, Math.min(0.45, h));
    h = h < 0 ? h * 1.2 : h * 0.65;
    heights[i] = h;
  }

  // 1 pass of neighbor smoothing to kill any remaining spikes.
  const indexAttr = geometry.getIndex();
  if (indexAttr) {
    const idx = indexAttr.array;
    const neighbors = Array.from({ length: vertexCount }, () => []);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t];
      const b = idx[t + 1];
      const c = idx[t + 2];
      neighbors[a].push(b, c);
      neighbors[b].push(a, c);
      neighbors[c].push(a, b);
    }
    for (let pass = 0; pass < 2; pass += 1) {
      const smoothed = new Float32Array(vertexCount);
      for (let i = 0; i < vertexCount; i += 1) {
        const nb = neighbors[i];
        if (!nb.length) {
          smoothed[i] = heights[i];
          continue;
        }
        let sum = 0;
        for (let j = 0; j < nb.length; j += 1) sum += heights[nb[j]];
        const avg = sum / nb.length;
        smoothed[i] = heights[i] * 0.68 + avg * 0.32;
      }
      heights.set(smoothed);
    }
  }

  for (let i = 0; i < vertexCount; i += 1) {
    const x = positionAttr.getX(i);
    const y = positionAttr.getY(i);
    const z = positionAttr.getZ(i);
    const pBase = new THREE.Vector3(x, y, z).normalize();
    const p = new THREE.Vector3(
      pBase.x * axisScale.x,
      pBase.y * axisScale.y,
      pBase.z * axisScale.z
    ).normalize();
    const r = 1 + heights[i];
    positionAttr.setXYZ(i, p.x * r, p.y * r, p.z * r);
  }

  positionAttr.needsUpdate = true;

  // Triplanar shading does not need UVs; remove them and weld duplicated
  // vertices (UV seams) to avoid visible faceting/hard edges.
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  if (geometry.getAttribute('uv2')) geometry.deleteAttribute('uv2');
  geometry = weldGeometryPositions(THREE, geometry, 1e-4);
  geometry.computeVertexNormals();
  if (typeof geometry.normalizeNormals === 'function') {
    geometry.normalizeNormals();
  }

  return geometry;
}

/**
 * Welds vertices by quantized position so normals can smooth across seams.
 * Three's polyhedra often duplicate vertices for UVs, which reads as faceting.
 */
export function weldGeometryPositions(THREE, geometry, tolerance = 1e-4) {
  if (!geometry?.getAttribute) {
    return geometry;
  }

  const position = geometry.getAttribute('position');
  if (!position) {
    return geometry;
  }

  const srcIndex = geometry.getIndex();
  const srcIndices = srcIndex ? Array.from(srcIndex.array) : null;
  const vertexCount = position.count;

  const invTol = 1 / Math.max(1e-12, tolerance);
  const keyFor = (x, y, z) =>
    `${Math.round(x * invTol)},${Math.round(y * invTol)},${Math.round(
      z * invTol
    )}`;

  const map = new Map();
  const newPositions = [];
  const remap = new Array(vertexCount);

  for (let i = 0; i < vertexCount; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const key = keyFor(x, y, z);

    let newIndex = map.get(key);
    if (newIndex === undefined) {
      newIndex = newPositions.length / 3;
      map.set(key, newIndex);
      newPositions.push(x, y, z);
    }
    remap[i] = newIndex;
  }

  const newIndices = srcIndices
    ? srcIndices.map((idx) => remap[idx])
    : remap.map((idx) => idx);

  const welded = new THREE.BufferGeometry();
  welded.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(newPositions, 3)
  );
  welded.setIndex(newIndices);
  welded.computeBoundingSphere();

  return welded;
}

// Simplex noise implementation adapted for procedural asteroid generation
export class SimplexNoise {
  constructor(randomFn) {
    this.p = new Uint8Array(256);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);

    for (let i = 0; i < 256; i += 1) {
      this.p[i] = i;
    }

    for (let i = 255; i > 0; i -= 1) {
      const n = Math.floor((i + 1) * randomFn());
      const temp = this.p[i];
      this.p[i] = this.p[n];
      this.p[n] = temp;
    }

    for (let i = 0; i < 512; i += 1) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise3d(xin, yin, zin) {
    const perm = this.perm;
    const permMod12 = this.permMod12;
    const grad3 = SimplexNoise.grad3;

    const F3 = 1 / 3;
    const G3 = 1 / 6;

    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;

    let i1;
    let j1;
    let k1;
    let i2;
    let j2;
    let k2;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      }
    } else if (y0 < z0) {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    const gi0 = permMod12[ii + perm[jj + perm[kk]]];
    const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
    const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
    const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * this.dot(grad3, gi0, x0, y0, z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * this.dot(grad3, gi1, x1, y1, z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * this.dot(grad3, gi2, x2, y2, z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      t3 *= t3;
      n3 = t3 * t3 * this.dot(grad3, gi3, x3, y3, z3);
    }

    return 32 * (n0 + n1 + n2 + n3);
  }

  dot(grad3, index, x, y, z) {
    const offset = index * 3;
    return grad3[offset] * x + grad3[offset + 1] * y + grad3[offset + 2] * z;
  }

  /**
   * Fractal Brownian Motion - layered noise for natural variation
   */
  fbm(x, y, z, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let amplitude = 0.5;
    let frequency = 1.0;
    let total = 0.0;
    let normalization = 0.0;

    for (let i = 0; i < octaves; i++) {
      total +=
        this.noise3d(x * frequency, y * frequency, z * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / normalization;
  }

  /**
   * Ridge function - creates sharp ridges from noise
   */
  ridge(h, offset = 1.0) {
    h = Math.abs(h);
    h = offset - h;
    h = h * h;
    return h;
  }

  /**
   * Ridged Multifractal - creates sharp mountain-like ridges
   * Based on the study's ridgedMF implementation
   */
  ridgedMF(x, y, z, octaves = 4, lacunarity = 2.2, gain = 0.5) {
    let sum = 0.0;
    let amp = 0.5;
    let freq = 1.0;
    let prev = 1.0;

    for (let i = 0; i < octaves; i++) {
      const n = this.noise3d(x * freq, y * freq, z * freq);
      const r = this.ridge(n, 1.0);
      sum += r * amp * prev;
      prev = r;
      freq *= lacunarity;
      amp *= gain;
    }

    return sum;
  }

  /**
   * 3D Voronoi/Cellular noise - returns [closestDist, cellId, secondClosestDist]
   * Used for craters and rock protrusions
   */
  voronoi3d(x, y, z) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    const pz = Math.floor(z);
    const fx = x - px;
    const fy = y - py;
    const fz = z - pz;

    let minDist = 8.0;
    let secondMinDist = 8.0;
    let cellId = 0.0;

    // Search 3x3x3 neighborhood
    for (let k = -1; k <= 1; k++) {
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const cx = px + i;
          const cy = py + j;
          const cz = pz + k;

          // Hash function for cell point position
          const hash = this.hashVoronoi(cx, cy, cz);

          // Random point within cell (0.0 to 0.7 range for variation)
          const rx = i - fx + hash * 0.7;
          const ry = j - fy + this.hashVoronoi(cx + 127, cy, cz) * 0.7;
          const rz = k - fz + this.hashVoronoi(cx, cy + 127, cz) * 0.7;

          const dist = rx * rx + ry * ry + rz * rz;

          if (dist < minDist) {
            secondMinDist = minDist;
            minDist = dist;
            cellId = hash;
          } else if (dist < secondMinDist) {
            secondMinDist = dist;
          }
        }
      }
    }

    return [Math.sqrt(minDist), cellId, Math.sqrt(secondMinDist)];
  }

  /**
   * Simple hash function for voronoi cell IDs
   */
  hashVoronoi(x, y, z) {
    const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }
}

SimplexNoise.grad3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0,
  -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);
