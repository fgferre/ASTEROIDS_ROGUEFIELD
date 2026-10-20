// Batched draws for everything small and numerous (particles, sparks, trails):
// one draw call per batch, buffers allocated once and refilled every frame.
// World mapping (see Renderer3D.js): logical (x, y) → world (x − 400, h, y − 300).

import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';

export const HALF_W = GAME_WIDTH / 2;
export const HALF_H = GAME_HEIGHT / 2;

// Colors are authored in sRGB (palette, simulation); lighting and blending
// run in linear, and the composer encodes back to sRGB at the end.
export function colorOf(THREE, css) {
  return new THREE.Color(css).convertSRGBToLinear();
}

// Parsed linear colors, keyed by the CSS string the simulation stores.
const colorCache = new Map();
export function rgbOf(THREE, css) {
  let rgb = colorCache.get(css);
  if (!rgb) {
    const color = new THREE.Color();
    try {
      color.setStyle(css || '#ffffff');
    } catch {
      color.set(0xffffff);
    }
    color.convertSRGBToLinear();
    rgb = [color.r, color.g, color.b];
    colorCache.set(css, rgb);
  }
  return rgb;
}

const POINT_VERTEX = `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
uniform float uAttenuate;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = uAttenuate > 0.5 ? aSize * uScale / max(1.0, -mv.z) : aSize;
  gl_PointSize = max(1.0, size);
  vColor = aColor;
  vAlpha = aAlpha * clamp(size, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAGMENT = `
uniform float uShape;
uniform float uAdditive;
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  // 0 disc: matte chip with a soft edge; 1 glow: hot core in a falloff
  // halo; 2 puff: smoke
  float shape = uShape < 0.5
    ? 1.0 - smoothstep(0.7, 1.0, d)
    : uShape < 1.5
      ? pow(1.0 - d, 2.2) + 0.6 * pow(1.0 - d, 12.0)
      : (1.0 - d) * (1.0 - d);
  float a = shape * vAlpha;
  gl_FragColor = uAdditive > 0.5
    ? vec4(vColor * uGain * a, 1.0)
    : vec4(vColor, a);
}`;

const SHAPES = { disc: 0, glow: 1, puff: 2 };

/**
 * A Points cloud. `glow` = additive light (energy); `disc` and `puff` = matte
 * chips and smoke with normal blending. `attenuate` sizes in world units,
 * otherwise in pixels.
 */
export class PointBatch {
  constructor(
    THREE,
    capacity,
    { shape = 'glow', attenuate = true, gain = 1 } = {}
  ) {
    const additive = shape === 'glow';
    this.capacity = capacity;
    this.count = 0;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    const attr = (array, size, name) => {
      const attribute = new THREE.BufferAttribute(array, size);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      return attribute;
    };
    this.attributes = [
      attr(this.positions, 3, 'position'),
      attr(this.colors, 3, 'aColor'),
      attr(this.sizes, 1, 'aSize'),
      attr(this.alphas, 1, 'aAlpha'),
    ];
    geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uScale: { value: 1 },
        uAttenuate: { value: attenuate ? 1 : 0 },
        uShape: { value: SHAPES[shape] },
        uAdditive: { value: additive ? 1 : 0 },
        uGain: { value: gain },
      },
      vertexShader: POINT_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.geometry = geometry;
    this.object = new THREE.Points(geometry, this.material);
    this.object.frustumCulled = false;
  }

  begin() {
    this.count = 0;
  }

  /** Logical position, height `h`, rgb array, size (world units or px). */
  push(x, h, y, rgb, size, alpha, gain = 1) {
    if (this.count >= this.capacity || alpha <= 0.002 || size <= 0) return;
    const i = this.count;
    this.positions[i * 3] = x - HALF_W;
    this.positions[i * 3 + 1] = h;
    this.positions[i * 3 + 2] = y - HALF_H;
    this.colors[i * 3] = rgb[0] * gain;
    this.colors[i * 3 + 1] = rgb[1] * gain;
    this.colors[i * 3 + 2] = rgb[2] * gain;
    this.sizes[i] = size;
    this.alphas[i] = Math.min(1, alpha);
    this.count += 1;
  }

  end(pointScale) {
    this.material.uniforms.uScale.value = pointScale;
    for (let i = 0; i < this.attributes.length; i += 1) {
      const attribute = this.attributes[i];
      attribute.updateRange.offset = 0;
      attribute.updateRange.count = this.count * attribute.itemSize;
      attribute.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, this.count);
  }
}

// Ribbon vertices sit on the centre line with a tangent in the field plane and
// a signed half width; the shader pushes each one sideways, perpendicular to
// the tangent and to the eye ray, so the band always faces the camera about
// its own axis and reads as a tube from any angle. A vertex with no half width
// (a floor mark, a spark's tip) stays where it was put.
const RIBBON_VERTEX = `
attribute vec3 aColor;
attribute vec2 aAxis;
attribute float aSide;
varying vec3 vColor;
varying float vAcross;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  if (aSide != 0.0) {
    vec3 side = cross(vec3(aAxis.x, 0.0, aAxis.y), cameraPosition - world.xyz);
    float len = length(side);
    world.xyz += aSide * (len > 1e-4 ? side / len : vec3(-aAxis.y, 0.0, aAxis.x));
  }
  vColor = aColor;
  vAcross = sign(aSide);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

// A tube of light: full on the axis, fading softly to nothing at the rim.
// Flat marks (no half width) stay even.
const RIBBON_FRAGMENT = `
varying vec3 vColor;
varying float vAcross;
void main() {
  float a = min(1.0, abs(vAcross));
  gl_FragColor = vec4(vColor * (1.0 - a * a), 1.0);
  #include <encodings_fragment>
}`;

const MAX_POLYLINE = 64;

/**
 * Additive ribbons, quads in one draw: light (trails, beams, arcs, sparks,
 * rings) as camera-facing tubes, floor marks (`segment`, `circle`) as flat
 * bands. Colors are premultiplied by alpha, so fading is just darkening.
 */
export class RibbonBatch {
  constructor(THREE, maxSegments) {
    this.maxVerts = maxSegments * 4;
    this.verts = 0;
    this.positions = new Float32Array(this.maxVerts * 3);
    this.colors = new Float32Array(this.maxVerts * 3);
    this.axes = new Float32Array(this.maxVerts * 2);
    this.sides = new Float32Array(this.maxVerts);
    const geometry = new THREE.BufferGeometry();
    const attr = (array, size, name) => {
      const attribute = new THREE.BufferAttribute(array, size);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      return attribute;
    };
    this.attributes = [
      attr(this.positions, 3, 'position'),
      attr(this.colors, 3, 'aColor'),
      attr(this.axes, 2, 'aAxis'),
      attr(this.sides, 1, 'aSide'),
    ];
    // every quad is (0 1 2) (2 1 3) of its four vertices
    const index = new Uint16Array(maxSegments * 6);
    for (let q = 0; q < maxSegments; q += 1) {
      index.set(
        [0, 1, 2, 2, 1, 3].map((k) => q * 4 + k),
        q * 6
      );
    }
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setDrawRange(0, 0);
    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.object = new THREE.Mesh(geometry, this.material);
    this.object.frustumCulled = false;
    // scratch polyline (logical points) and its segments' unit directions
    this.px = new Float32Array(MAX_POLYLINE);
    this.py = new Float32Array(MAX_POLYLINE);
    this.tx = new Float32Array(MAX_POLYLINE);
    this.ty = new Float32Array(MAX_POLYLINE);
  }

  begin() {
    this.verts = 0;
  }

  /** World point, its tangent (ax, az) and signed half width, linear rgb. */
  vertex(x, h, z, ax, az, side, r, g, b) {
    const i = this.verts;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = h;
    this.positions[i * 3 + 2] = z;
    this.axes[i * 2] = ax;
    this.axes[i * 2 + 1] = az;
    this.sides[i] = side;
    this.colors[i * 3] = r;
    this.colors[i * 3 + 1] = g;
    this.colors[i * 3 + 2] = b;
    this.verts += 1;
  }

  /**
   * One camera-facing quad from (x0, z0) to (x1, z1), world: each end has its
   * unit tangent, half width and gain on `rgb`.
   */
  tubeQuad(x0, z0, ax, az, w0, g0, x1, z1, bx, bz, w1, g1, h, rgb) {
    if (this.verts + 4 > this.maxVerts) return;
    const [r, g, b] = rgb;
    this.vertex(x0, h, z0, ax, az, w0, r * g0, g * g0, b * g0);
    this.vertex(x0, h, z0, ax, az, -w0, r * g0, g * g0, b * g0);
    this.vertex(x1, h, z1, bx, bz, w1, r * g1, g * g1, b * g1);
    this.vertex(x1, h, z1, bx, bz, -w1, r * g1, g * g1, b * g1);
  }

  /**
   * A tube through the first `n` points of this.px/this.py (logical, oldest
   * first). `taper`: width and brightness grow from tail (0) to head (1);
   * otherwise both stay constant. Each point's tangent is shared by the two
   * segments that meet there, so bends have no seam. Jumps longer than
   * `maxJump` (field wrap) break the tube.
   */
  strip(n, h, rgb, width, gain, maxJump, taper) {
    if (n < 2) return;
    const { px, py, tx, ty } = this;
    for (let i = 0; i < n - 1; i += 1) {
      const dx = px[i + 1] - px[i];
      const dy = py[i + 1] - py[i];
      const len = Math.hypot(dx, dy);
      const ok = len >= 0.01 && len <= maxJump;
      tx[i] = ok ? dx / len : 0;
      ty[i] = ok ? dy / len : 0;
    }
    for (let i = 0; i < n - 1; i += 1) {
      if (tx[i] === 0 && ty[i] === 0) continue;
      let ax = tx[i] + (i > 0 ? tx[i - 1] : 0);
      let ay = ty[i] + (i > 0 ? ty[i - 1] : 0);
      let bx = tx[i] + (i < n - 2 ? tx[i + 1] : 0);
      let by = ty[i] + (i < n - 2 ? ty[i + 1] : 0);
      let al = Math.hypot(ax, ay);
      let bl = Math.hypot(bx, by);
      // a hairpin (the two segments cancel): keep this segment's own line
      if (al < 1e-3) [ax, ay, al] = [tx[i], ty[i], 1];
      if (bl < 1e-3) [bx, by, bl] = [tx[i], ty[i], 1];
      const t0 = taper ? i / (n - 1) : 1;
      const t1 = taper ? (i + 1) / (n - 1) : 1;
      this.tubeQuad(
        px[i] - HALF_W,
        py[i] - HALF_H,
        ax / al,
        ay / al,
        width * t0 * 0.5,
        gain * t0 * t0,
        px[i + 1] - HALF_W,
        py[i + 1] - HALF_H,
        bx / bl,
        by / bl,
        width * t1 * 0.5,
        gain * t1 * t1,
        h,
        rgb
      );
    }
    // a trail's head ends in a tip rather than a square edge
    const ux = tx[n - 2];
    const uy = ty[n - 2];
    if (!taper || (ux === 0 && uy === 0)) return;
    const w = width * 0.5;
    const x = px[n - 1] - HALF_W;
    const z = py[n - 1] - HALF_H;
    this.tubeQuad(
      x,
      z,
      ux,
      uy,
      w,
      gain,
      x + ux * w,
      z + uy * w,
      ux,
      uy,
      0,
      gain,
      h,
      rgb
    );
  }

  /** A trail: tube through this.px/py, growing from tail to head. */
  polyline(n, h, rgb, width, gain, maxJump = 80) {
    this.strip(n, h, rgb, width, gain, maxJump, true);
  }

  /** A bolt (arcs, crackles): tube of constant width through this.px/py. */
  path(n, h, rgb, width, gain, maxJump = 80) {
    this.strip(n, h, rgb, width, gain, maxJump, false);
  }

  /**
   * One spindle-shaped streak (thin tail, full middle, rounded-off head) from
   * tail to head, in logical coords — a spark stretched by its speed. Faces
   * the camera about its own line.
   */
  streak(tx, ty, hx, hy, h, rgb, width, gain) {
    if (this.verts + 4 > this.maxVerts) return;
    const dx = hx - tx;
    const dy = hy - ty;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const ux = dx / len;
    const uy = dy / len;
    const w = width * 0.5;
    const mx = tx + dx * 0.65 - HALF_W;
    const mz = ty + dy * 0.65 - HALF_H;
    const r = rgb[0] * gain;
    const g = rgb[1] * gain;
    const b = rgb[2] * gain;
    const t = 0.25;
    // (tail, middle +, middle −) (middle −, middle +, head)
    this.vertex(tx - HALF_W, h, ty - HALF_H, ux, uy, 0, r * t, g * t, b * t);
    this.vertex(mx, h, mz, ux, uy, w, r, g, b);
    this.vertex(mx, h, mz, ux, uy, -w, r, g, b);
    this.vertex(
      hx - HALF_W,
      h,
      hy - HALF_H,
      ux,
      uy,
      0,
      r * 0.6,
      g * 0.6,
      b * 0.6
    );
  }

  /** A straight tube of constant width and brightness (beams, dashes). */
  tube(ax, ay, bx, by, h, rgb, width, gain) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const ux = dx / len;
    const uy = dy / len;
    const w = width * 0.5;
    this.tubeQuad(
      ax - HALF_W,
      ay - HALF_H,
      ux,
      uy,
      w,
      gain,
      bx - HALF_W,
      by - HALF_H,
      ux,
      uy,
      w,
      gain,
      h,
      rgb
    );
  }

  /**
   * A ring of light around (cx, cy): a torus whose tube faces the camera, so
   * it keeps its thickness seen edge-on.
   */
  ring(cx, cy, radius, h, rgb, width, gain) {
    const steps = Math.max(12, Math.min(64, Math.round(radius)));
    const w = width * 0.5;
    let c0 = 1;
    let s0 = 0;
    for (let i = 1; i <= steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      const c1 = Math.cos(a);
      const s1 = Math.sin(a);
      this.tubeQuad(
        cx + c0 * radius - HALF_W,
        cy + s0 * radius - HALF_H,
        -s0,
        c0,
        w,
        gain,
        cx + c1 * radius - HALF_W,
        cy + s1 * radius - HALF_H,
        -s1,
        c1,
        w,
        gain,
        h,
        rgb
      );
      c0 = c1;
      s0 = s1;
    }
  }

  /** A flat band on the field plane (floor marks: lock lines, markers). */
  segment(ax, ay, bx, by, h, rgb, width, gain) {
    if (this.verts + 4 > this.maxVerts) return;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const nx = (-dy / len) * width * 0.5;
    const ny = (dx / len) * width * 0.5;
    const x0 = ax - HALF_W;
    const z0 = ay - HALF_H;
    const x1 = bx - HALF_W;
    const z1 = by - HALF_H;
    const r = rgb[0] * gain;
    const g = rgb[1] * gain;
    const b = rgb[2] * gain;
    this.vertex(x0 + nx, h, z0 + ny, 0, 0, 0, r, g, b);
    this.vertex(x0 - nx, h, z0 - ny, 0, 0, 0, r, g, b);
    this.vertex(x1 + nx, h, z1 + ny, 0, 0, 0, r, g, b);
    this.vertex(x1 - nx, h, z1 - ny, 0, 0, 0, r, g, b);
  }

  /** A flat circle of `dashes` dashes (fill 0..1 of each period); 0 = solid. */
  circle(cx, cy, radius, h, rgb, width, gain, dashes = 0, fill = 0.5) {
    const steps = dashes || Math.max(12, Math.min(64, Math.round(radius)));
    const span = dashes ? fill : 1;
    for (let i = 0; i < steps; i += 1) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + span) / steps) * Math.PI * 2;
      this.segment(
        cx + Math.cos(a0) * radius,
        cy + Math.sin(a0) * radius,
        cx + Math.cos(a1) * radius,
        cy + Math.sin(a1) * radius,
        h,
        rgb,
        width,
        gain
      );
    }
  }

  end() {
    for (let i = 0; i < this.attributes.length; i += 1) {
      const attribute = this.attributes[i];
      attribute.updateRange.offset = 0;
      attribute.updateRange.count = this.verts * attribute.itemSize;
      attribute.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, (this.verts / 4) * 6);
  }
}

// Shot bodies, one designed shape per kind in a unit box (+x = travel, x in
// [−1, 1], radius ≤ 1; `push` stretches it to the shot's length and width).
export const SHOT_SHAPES = Object.freeze({
  bolt: 0, // the lance: a teardrop of light, fat end forward
  head: 1, // an evolved lance's tip: an arrowhead with four swept barbs
  needle: 2, // an Apex's white-hot spike through the head
  flak: 3, // a scatter slug: short, blunt, faceted
  dart: 4, // an enemy shot: a three-sided shard with three barbs
});
// How white-hot each kind's core runs (0 keeps its colour).
const SHOT_HEAT = [0.6, 0.5, 1, 0.8, 0.35];

// Every shape lives in one geometry, tagged with its kind; each instance
// draws only its own kind (the others collapse outside the clip volume), so
// all the shots are still one draw. Normals go through the instance's
// stretch the inverse way, so the shading stays round when stretched.
const SHOT_VERTEX = `
attribute float aPart;
attribute vec4 aTint;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying float vHeat;
void main() {
  if (abs(aPart - aTint.w) > 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  mat3 m = mat3(instanceMatrix);
  vec3 stretch = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
  vNormal = normalMatrix * (m * (normal / stretch));
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vColor = aTint.rgb;
  vHeat = ${SHOT_HEAT.map((heat, kind) => `aTint.w < ${kind}.5 ? ${heat.toFixed(2)} :`).join(' ')} 0.0;
  gl_Position = projectionMatrix * mv;
}`;

// Unlit light: the faces turned to the eye run white-hot (the core), the
// silhouette keeps the shot's colour, from any angle.
const SHOT_FRAGMENT = `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying float vHeat;
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float hot = max(vColor.r, max(vColor.g, vColor.b));
  float core = vHeat * facing * facing * facing;
  gl_FragColor = vec4(mix(vColor * 0.7, vec3(hot), core), 1.0);
  #include <encodings_fragment>
}`;

/** The shapes' triangles: { position, normal, part } flat arrays. */
function shotShapes() {
  const position = [];
  const normal = [];
  const part = [];
  const cross = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    return n.map((k) => k / len);
  };
  // one triangle; flat unless per-vertex normals are given
  const tri = (kind, a, b, c, na, nb, nc) => {
    const n = cross(a, b, c);
    [a, b, c].forEach((p) => position.push(...p));
    [na || n, nb || n, nc || n].forEach((k) => normal.push(...k));
    part.push(kind, kind, kind);
  };
  // (x, r, θ) about the x axis; θ 0 points up
  const at = (x, r, a) => [x, r * Math.cos(a), r * Math.sin(a)];
  // A solid of revolution: profile [[x, r]] tail → nose, r 0 at both tips.
  // `smooth` shades it round; otherwise each facet is flat (a cut stone).
  const lathe = (kind, profile, sides, roll, smooth) => {
    const slope = profile.map((p, i) => {
      const a = profile[Math.max(0, i - 1)];
      const b = profile[Math.min(profile.length - 1, i + 1)];
      return (b[1] - a[1]) / (b[0] - a[0]);
    });
    // a tip takes its ring neighbour's normal: the cone shades like its rim
    const ring = (i) => (profile[i][1] > 0 ? i : i === 0 ? 1 : i - 1);
    const n = (i, a) => {
      const k = ring(i);
      const v = [-slope[k], Math.cos(a), Math.sin(a)];
      const len = Math.hypot(v[0], v[1], v[2]);
      return v.map((c) => c / len);
    };
    for (let i = 0; i < profile.length - 1; i += 1) {
      const [x0, r0] = profile[i];
      const [x1, r1] = profile[i + 1];
      for (let j = 0; j < sides; j += 1) {
        const a0 = roll + (j / sides) * Math.PI * 2;
        const a1 = roll + ((j + 1) / sides) * Math.PI * 2;
        const p00 = at(x0, r0, a0);
        const p01 = at(x0, r0, a1);
        const p10 = at(x1, r1, a0);
        const p11 = at(x1, r1, a1);
        const s = smooth
          ? [n(i, a0), n(i, a1), n(i + 1, a0), n(i + 1, a1)]
          : [];
        if (r0 > 0) tri(kind, p00, p01, p11, s[0], s[1], s[3]);
        if (r1 > 0) tri(kind, p00, p11, p10, s[0], s[3], s[2]);
      }
    }
  };
  // A cone with `sides` points around its base, flat-shaded.
  const pyramid = (kind, tip, base) => {
    base.forEach((p, i) => tri(kind, tip, p, base[(i + 1) % base.length]));
  };
  // A barb: a three-sided spike from the body's surface (around angle `a`,
  // from x0 to x1 at radius r) out and back to its tip.
  const barb = (kind, a, x0, x1, r, tipX, tipR, spread) => {
    pyramid(kind, at(tipX, tipR, a), [
      at(x1, r * 0.8, a),
      at(x0, r, a - spread),
      at(x0, r, a + spread),
    ]);
  };

  const { bolt, head, needle, flak, dart } = SHOT_SHAPES;
  lathe(
    bolt,
    [
      [-1, 0],
      [-0.5, 0.55],
      [0.15, 1],
      [0.65, 0.8],
      [1, 0],
    ],
    6,
    0,
    true
  );
  // arrowhead: a four-sided point (an X seen from above) and four barbs
  const corners = [1, 3, 5, 7].map((k) => (k * Math.PI) / 4);
  const rim = corners.map((a) => at(-0.3, 0.62, a));
  pyramid(head, [1, 0, 0], rim);
  pyramid(head, [-0.75, 0, 0], [...rim].reverse());
  corners.forEach((a) => barb(head, a, -0.4, 0.05, 0.5, -1, 1, 0.3));
  // needle: a slim four-sided spike
  const waist = [0, 1, 2, 3].map((k) => at(0.2, 1, (k * Math.PI) / 2));
  pyramid(needle, [1, 0, 0], waist);
  pyramid(needle, [-1, 0, 0], [...waist].reverse());
  lathe(
    flak,
    [
      [-1, 0],
      [-0.8, 0.85],
      [0.3, 1],
      [0.8, 0.6],
      [1, 0],
    ],
    6,
    Math.PI / 6,
    false
  );
  // dart: a three-sided shard, one edge up, three barbs swept back
  const edges = [0, 1, 2].map((k) => (k * Math.PI * 2) / 3);
  const shard = edges.map((a) => at(-0.2, 0.5, a));
  pyramid(dart, [1, 0, 0], shard);
  pyramid(dart, [-0.7, 0, 0], [...shard].reverse());
  edges.forEach((a) => barb(dart, a, -0.35, 0.1, 0.4, -1, 1, 0.45));
  return { position, normal, part };
}

/**
 * Instanced shot bodies (lances and their heads, flak slugs, enemy darts):
 * one draw for every kind, see SHOT_SHAPES.
 */
export class CapsuleBatch {
  constructor(THREE, capacity) {
    const shapes = shotShapes();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(shapes.position, 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(shapes.normal, 3)
    );
    geometry.setAttribute(
      'aPart',
      new THREE.Float32BufferAttribute(shapes.part, 1)
    );
    this.tints = new Float32Array(capacity * 4);
    this.tint = new THREE.InstancedBufferAttribute(this.tints, 4);
    this.tint.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aTint', this.tint);
    this.mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: SHOT_VERTEX,
        fragmentShader: SHOT_FRAGMENT,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      capacity
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.capacity = capacity;
    this.count = 0;
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.axis = new THREE.Vector3(0, 1, 0);
    this.mesh.count = 0;
  }

  begin() {
    this.count = 0;
  }

  /** Half length and half width in world units; `kind` from SHOT_SHAPES. */
  push(x, y, h, angle, length, width, rgb, gain, kind = SHOT_SHAPES.bolt) {
    if (this.count >= this.capacity) return;
    this.position.set(x - HALF_W, h, y - HALF_H);
    this.quaternion.setFromAxisAngle(this.axis, -angle);
    this.scale.set(length, width, width);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(this.count, this.matrix);
    const i = this.count * 4;
    this.tints[i] = rgb[0] * gain;
    this.tints[i + 1] = rgb[1] * gain;
    this.tints[i + 2] = rgb[2] * gain;
    this.tints[i + 3] = kind;
    this.count += 1;
  }

  end() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tint.updateRange.offset = 0;
    this.tint.updateRange.count = this.count * 4;
    this.tint.needsUpdate = true;
  }
}
