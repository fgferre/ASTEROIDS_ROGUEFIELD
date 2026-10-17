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

/**
 * Flat additive ribbons on the field plane (trails, stretched sparks):
 * colors are premultiplied by alpha, so fading is just darkening.
 */
export class RibbonBatch {
  constructor(THREE, maxSegments) {
    this.maxVerts = maxSegments * 6;
    this.verts = 0;
    this.positions = new Float32Array(this.maxVerts * 3);
    this.colors = new Float32Array(this.maxVerts * 3);
    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('color', this.colorAttr);
    geometry.setDrawRange(0, 0);
    this.geometry = geometry;
    this.object = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    this.object.frustumCulled = false;
    // scratch polyline
    this.px = new Float32Array(64);
    this.py = new Float32Array(64);
  }

  begin() {
    this.verts = 0;
  }

  vertex(x, h, z, r, g, b) {
    const i = this.verts * 3;
    this.positions[i] = x;
    this.positions[i + 1] = h;
    this.positions[i + 2] = z;
    this.colors[i] = r;
    this.colors[i + 1] = g;
    this.colors[i + 2] = b;
    this.verts += 1;
  }

  /**
   * Ribbon through the first `n` points of this.px/this.py (logical, oldest
   * first): width and brightness grow from tail (0) to head (1). Jumps longer
   * than `maxJump` (field wrap) break the ribbon.
   */
  polyline(n, h, rgb, width, gain, maxJump = 80) {
    if (n < 2) return;
    const { px, py } = this;
    for (let i = 0; i < n - 1; i += 1) {
      if (this.verts + 6 > this.maxVerts) return;
      const ax = px[i];
      const ay = py[i];
      const bx = px[i + 1];
      const by = py[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 0.01 || len > maxJump) continue;
      const nx = -dy / len;
      const ny = dx / len;
      const t0 = i / (n - 1);
      const t1 = (i + 1) / (n - 1);
      const w0 = width * t0 * 0.5;
      const w1 = width * t1 * 0.5;
      const g0 = gain * t0 * t0;
      const g1 = gain * t1 * t1;
      const x0 = ax - HALF_W;
      const z0 = ay - HALF_H;
      const x1 = bx - HALF_W;
      const z1 = by - HALF_H;
      const r0 = rgb[0] * g0;
      const gg0 = rgb[1] * g0;
      const b0 = rgb[2] * g0;
      const r1 = rgb[0] * g1;
      const gg1 = rgb[1] * g1;
      const b1 = rgb[2] * g1;
      this.vertex(x0 + nx * w0, h, z0 + ny * w0, r0, gg0, b0);
      this.vertex(x0 - nx * w0, h, z0 - ny * w0, r0, gg0, b0);
      this.vertex(x1 + nx * w1, h, z1 + ny * w1, r1, gg1, b1);
      this.vertex(x1 + nx * w1, h, z1 + ny * w1, r1, gg1, b1);
      this.vertex(x0 - nx * w0, h, z0 - ny * w0, r0, gg0, b0);
      this.vertex(x1 - nx * w1, h, z1 - ny * w1, r1, gg1, b1);
    }
  }

  /**
   * One spindle-shaped streak (thin tail, full middle, rounded-off head) from
   * tail to head, in logical coords — a spark stretched by its speed.
   */
  streak(tx, ty, hx, hy, h, rgb, width, gain) {
    if (this.verts + 12 > this.maxVerts) return;
    const dx = hx - tx;
    const dy = hy - ty;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const nx = (-dy / len) * width * 0.5;
    const ny = (dx / len) * width * 0.5;
    const mx = tx + dx * 0.65 - HALF_W;
    const mz = ty + dy * 0.65 - HALF_H;
    const ax = tx - HALF_W;
    const az = ty - HALF_H;
    const bx = hx - HALF_W;
    const bz = hy - HALF_H;
    const r = rgb[0] * gain;
    const g = rgb[1] * gain;
    const b = rgb[2] * gain;
    const t = 0.25;
    // tail → middle
    this.vertex(ax, h, az, r * t, g * t, b * t);
    this.vertex(mx + nx, h, mz + ny, r, g, b);
    this.vertex(mx - nx, h, mz - ny, r, g, b);
    // middle → head
    this.vertex(mx + nx, h, mz + ny, r, g, b);
    this.vertex(bx, h, bz, r * 0.6, g * 0.6, b * 0.6);
    this.vertex(mx - nx, h, mz - ny, r, g, b);
  }

  /** A straight band of constant width and brightness (lines, dashes). */
  segment(ax, ay, bx, by, h, rgb, width, gain) {
    if (this.verts + 6 > this.maxVerts) return;
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
    this.vertex(x0 + nx, h, z0 + ny, r, g, b);
    this.vertex(x0 - nx, h, z0 - ny, r, g, b);
    this.vertex(x1 + nx, h, z1 + ny, r, g, b);
    this.vertex(x1 + nx, h, z1 + ny, r, g, b);
    this.vertex(x0 - nx, h, z0 - ny, r, g, b);
    this.vertex(x1 - nx, h, z1 - ny, r, g, b);
  }

  /** A circle of `dashes` dashes (fill 0..1 of each period); 0 = solid. */
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
    this.positionAttr.updateRange.offset = 0;
    this.positionAttr.updateRange.count = this.verts * 3;
    this.colorAttr.updateRange.offset = 0;
    this.colorAttr.updateRange.count = this.verts * 3;
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, this.verts);
  }
}

/** Instanced emissive capsules (lances, enemy barbs): one draw call. */
export class CapsuleBatch {
  constructor(THREE, capacity) {
    const geometry = new THREE.SphereGeometry(1, 10, 6);
    this.mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({ toneMapped: false }),
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
    this.color = new THREE.Color();
    this.mesh.setColorAt(0, this.color);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }

  begin() {
    this.count = 0;
  }

  push(x, y, h, angle, length, width, rgb, gain) {
    if (this.count >= this.capacity) return;
    this.position.set(x - HALF_W, h, y - HALF_H);
    this.quaternion.setFromAxisAngle(this.axis, -angle);
    this.scale.set(length, width, width);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(this.count, this.matrix);
    this.color.setRGB(rgb[0] * gain, rgb[1] * gain, rgb[2] * gain);
    this.mesh.setColorAt(this.count, this.color);
    this.count += 1;
  }

  end() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
