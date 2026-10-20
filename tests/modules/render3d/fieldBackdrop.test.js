import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FieldBackdrop } from '../../../src/modules/render3d/fieldBackdrop.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const look = (overrides = {}) => ({
  structures: 0,
  debris: 0.5,
  sky0: new THREE.Color(0.01, 0.01, 0.02),
  hazeColor: new THREE.Color(0.2, 0.3, 0.9),
  hazeDensity: 1,
  ...overrides,
});

// World positions of the broken Ring's vertices, as placed in the scene.
function ringVertices(backdrop) {
  const { object } = backdrop.ring;
  object.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  return object.children.flatMap((mesh) => {
    const position = mesh.geometry.getAttribute('position');
    return Array.from({ length: position.count }, (_, i) =>
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).clone()
    );
  });
}

describe('FieldBackdrop', () => {
  it('puts the broken Ring far below the field, its break in view', () => {
    const scene = new THREE.Scene();
    const backdrop = new FieldBackdrop(THREE, scene);
    expect(scene.children).toContain(backdrop.ring.object);
    const points = ringVertices(backdrop);
    expect(Math.max(...points.map((p) => p.y))).toBeLessThan(-600);
    // The torn end sits under the 800×600 field (world x ±400, z ±300).
    expect(points.some((p) => Math.abs(p.x) < 400 && Math.abs(p.z) < 300)).toBe(
      true
    );
  });

  it('wakes in the epilogue and goes dark again on reset', () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    backdrop.setLook(look({ structures: 0 }));
    expect(backdrop.structures.group.visible).toBe(false);

    backdrop.setWake(1);
    expect(backdrop.ring.uniforms.uWake.value).toBe(1);
    expect(backdrop.structures.group.visible).toBe(true);
    expect(backdrop.structures.dark.opacity).toBe(1);

    backdrop.setWake(0);
    expect(backdrop.ring.uniforms.uWake.value).toBe(0);
    expect(backdrop.structures.group.visible).toBe(false);
  });

  it("sits in the biome's haze and shows its share of fragments and the intact Ring", () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    backdrop.setLook(look({ structures: 0.4, debris: 0.25 }));
    const haze = backdrop.ring.uniforms.uHaze.value;
    expect(haze.b).toBeGreaterThan(0.02);
    expect(haze.b).toBeGreaterThan(haze.r);
    backdrop.setLook(look({ hazeDensity: 0 }));
    expect(haze.b).toBeCloseTo(0.02);

    backdrop.setLook(look({ structures: 0.4, debris: 0.25 }));
    expect(backdrop.structures.dark.opacity).toBeCloseTo(0.4);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const scaleOf = (i) => {
      backdrop.debris.getMatrixAt(i, matrix);
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      return scale.x;
    };
    expect(scaleOf(0)).toBeGreaterThan(0);
    expect(scaleOf(47)).toBe(0);
  });
});
