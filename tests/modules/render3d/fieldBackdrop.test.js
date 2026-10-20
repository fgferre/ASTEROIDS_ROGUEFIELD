import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FieldBackdrop,
  RING,
} from '../../../src/modules/render3d/fieldBackdrop.js';

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
  backdrop.ring.updateMatrixWorld();
  const position = backdrop.ring.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  return Array.from({ length: position.count }, (_, i) =>
    v
      .fromBufferAttribute(position, i)
      .applyMatrix4(backdrop.ring.matrixWorld)
      .clone()
  );
}

describe('FieldBackdrop', () => {
  it('draws the broken Ring in one draw, far below the field, its break in view', () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    expect(backdrop.ring.isMesh).toBe(true);
    const points = ringVertices(backdrop);
    expect(Math.max(...points.map((p) => p.y))).toBeLessThan(-600);
    // The torn end sits under the 800×600 field (world x ±400, z ±300).
    expect(points.some((p) => Math.abs(p.x) < 400 && Math.abs(p.z) < 300)).toBe(
      true
    );
  });

  it('is a dead structure until the wake: few faint lights, the wake on its seams', () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    const parts = backdrop.ring.geometry.getAttribute('color');
    let idle = 0;
    let wake = 0;
    for (let i = 0; i < parts.count; i += 1) {
      if (parts.getY(i) > 0) idle += 1;
      if (parts.getZ(i) > 0) wake += 1;
    }
    expect(idle / parts.count).toBeLessThan(0.1);
    expect(wake / parts.count).toBeGreaterThan(0.05);
    expect(wake / parts.count).toBeLessThan(0.5);
  });

  it('wakes in the epilogue and goes dark again on reset', () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    backdrop.setLook(look({ structures: 0 }));
    expect(backdrop.structures.group.visible).toBe(false);

    backdrop.setWake(1);
    expect(backdrop.ringUniforms.uWake.value).toBe(1);
    expect(backdrop.structures.group.visible).toBe(true);
    expect(backdrop.structures.dark.opacity).toBe(1);

    backdrop.setWake(0);
    expect(backdrop.ringUniforms.uWake.value).toBe(0);
    expect(backdrop.structures.group.visible).toBe(false);
  });

  it("sits in the biome's haze and shows its share of fragments and the intact Ring", () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    backdrop.setLook(look({ structures: 0.4, debris: 0.25 }));
    const haze = backdrop.ringUniforms.uHaze.value;
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

  it('follows the camera aim by a share, so it parallaxes like something deeper', () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 10, 20000);
    camera.position.set(100, 600, 250);
    camera.lookAt(100, 0, 50);
    camera.updateMatrixWorld();
    backdrop.ring.onBeforeRender(null, null, camera);
    expect(backdrop.ring.position.x).toBeCloseTo(
      RING.centre[0] + 100 * RING.follow
    );
    expect(backdrop.ring.position.y).toBe(RING.centre[1]);
    expect(backdrop.ring.position.z).toBeCloseTo(
      RING.centre[2] + 50 * RING.follow
    );
  });

  it('patches the lit material: tone from the piece, haze and lights after the tone map', () => {
    const { material } = new FieldBackdrop(THREE, new THREE.Scene()).ring;
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('vRingHaze =');
    expect(shader.fragmentShader).not.toContain('#include <color_fragment>');
    const fragment = shader.fragmentShader;
    expect(fragment.indexOf('uHaze, vRingHaze')).toBeGreaterThan(
      fragment.indexOf('#include <tonemapping_fragment>')
    );
    expect(shader.uniforms.uWake).toBeDefined();
  });
});
