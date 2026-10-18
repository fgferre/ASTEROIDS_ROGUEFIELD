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

  it('refuses rocks past the cap', () => {
    const { rocks } = setup();
    rocks.begin();
    const view = rockView('crystal', 0, 0);
    for (let i = 0; i < ROCK_INSTANCE_CAP; i += 1) {
      expect(rocks.push(view)).toBe(true);
    }
    expect(rocks.push(view)).toBe(false);
    rocks.end();
    expect(rocks.meshes.crystal[0].count).toBe(ROCK_INSTANCE_CAP);
  });
});
