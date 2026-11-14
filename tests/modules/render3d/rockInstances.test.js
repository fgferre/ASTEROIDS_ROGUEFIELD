import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ROCK_INSTANCE_CAP,
  RockInstances,
} from '../../../src/modules/render3d/rockInstances.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const rockView = (family, shape, x) => {
  const object = new THREE.Object3D();
  object.position.x = x;
  object.updateMatrixWorld();
  return {
    family,
    shape,
    object,
    rock: {
      base: new THREE.Color(0.5, 0.25, 1),
      vein: new THREE.Color(1, 0, 0),
      seed: new THREE.Vector3(1, 2, 3),
      glow: [0.8, 0.35, 0.05, 0.2],
      surface: [0.9, 0.1],
    },
  };
};

describe('RockInstances', () => {
  const setup = () => {
    const scene = new THREE.Scene();
    const geometries = [new THREE.SphereGeometry(1), new THREE.BoxGeometry()];
    const materials = {
      stone: new THREE.MeshStandardMaterial(),
      crystal: new THREE.MeshPhysicalMaterial(),
    };
    return {
      scene,
      rocks: new RockInstances(THREE, scene, geometries, materials),
    };
  };

  it('keeps one mesh per shape and family, sharing the shape buffers', () => {
    const { scene, rocks } = setup();
    expect(rocks.meshes.stone).toHaveLength(2);
    expect(rocks.meshes.crystal).toHaveLength(2);
    const [a, b] = [rocks.meshes.stone[0], rocks.meshes.crystal[0]];
    expect(a.geometry.attributes.position).toBe(b.geometry.attributes.position);
    expect(a.geometry.attributes.aGlow).not.toBe(b.geometry.attributes.aGlow);
    expect(scene.children).toHaveLength(4);
  });

  it('packs each frame’s rocks into their mesh and hides the empty ones', () => {
    const { rocks } = setup();
    rocks.begin();
    rocks.push(rockView('stone', 1, 10));
    rocks.push(rockView('stone', 1, 20));
    rocks.end();
    const mesh = rocks.meshes.stone[1];
    expect(mesh.count).toBe(2);
    expect(mesh.visible).toBe(true);
    expect(rocks.meshes.stone[0].visible).toBe(false);
    expect(rocks.meshes.crystal[1].visible).toBe(false);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(1, matrix);
    expect(matrix.elements[12]).toBe(20);
    const { aBase, aGlow, aSurface } = mesh.geometry.attributes;
    expect(aBase.getZ(1)).toBe(1);
    expect(Array.from(aGlow.array.slice(4, 8))).toEqual(
      [0.8, 0.35, 0.05, 0.2].map(Math.fround)
    );
    expect(aSurface.getX(0)).toBeCloseTo(0.9);

    // next frame without them: the mesh goes dark (no draw call)
    rocks.begin();
    rocks.end();
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
  });

  it('grows a full mesh so every live rock is drawn, in the same mesh', () => {
    const { scene, rocks } = setup();
    const mesh = rocks.meshes.crystal[0];
    const total = ROCK_INSTANCE_CAP * 2 + 1;
    rocks.begin();
    for (let i = 0; i < total; i += 1) {
      rocks.push(rockView('crystal', 0, i));
    }
    rocks.end();
    expect(rocks.meshes.crystal[0]).toBe(mesh);
    expect(scene.children).toHaveLength(4);
    expect(mesh.count).toBe(total);
    expect(mesh.instanceMatrix.count).toBeGreaterThanOrEqual(total);
    const matrix = new THREE.Matrix4();
    [0, ROCK_INSTANCE_CAP - 1, total - 1].forEach((i) => {
      mesh.getMatrixAt(i, matrix);
      expect(matrix.elements[12]).toBe(i);
    });
    const { aGlow, aSurface } = mesh.geometry.attributes;
    expect(aGlow.count).toBe(mesh.instanceMatrix.count);
    expect(aSurface.getX(0)).toBeCloseTo(0.9);
    expect(aSurface.getX(total - 1)).toBeCloseTo(0.9);
  });

  it('releases the old GPU buffers when a mesh grows', () => {
    const { rocks } = setup();
    const mesh = rocks.meshes.stone[0];
    const disposed = [];
    mesh.addEventListener('dispose', () => disposed.push('mesh'));
    mesh.geometry.addEventListener('dispose', () => disposed.push('geometry'));
    rocks.begin();
    for (let i = 0; i <= ROCK_INSTANCE_CAP; i += 1) {
      rocks.push(rockView('stone', 0, i));
    }
    expect(disposed).toEqual(['mesh', 'geometry']);
  });
});
