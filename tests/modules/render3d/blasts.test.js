import { describe, expect, it } from 'vitest';
import {
  BLAST_CAP,
  BLAST_LOOK,
  Blasts,
} from '../../../src/modules/render3d/blasts.js';
import THREE from '../../../src/modules/render3d/three.js';

describe('Blasts', () => {
  it('burns for its look, rolls on as soot and frees its slot at the end of its life', () => {
    const blasts = new Blasts(THREE, new THREE.Scene());
    const camera = new THREE.PerspectiveCamera();
    const { fire, life } = BLAST_LOOK.seeker;
    blasts.emit(400, 300, 28, BLAST_LOOK.seeker);

    expect(blasts.update(fire / 2, camera)).toBe(1);
    expect(blasts.fire.array[0]).toBeCloseTo(fire / life, 6);
    expect(blasts.age.array[0]).toBeLessThan(blasts.fire.array[0]);
    expect(blasts.update(fire, camera)).toBe(1);
    expect(blasts.age.array[0]).toBeGreaterThan(blasts.fire.array[0]);
    expect(blasts.update(life, camera)).toBe(0);
  });

  it('gives way oldest first when every slot burns', () => {
    const blasts = new Blasts(THREE, new THREE.Scene());
    for (let i = 0; i <= BLAST_CAP; i += 1) blasts.emit(i, 0, 30);
    expect(blasts.update(0.01, new THREE.PerspectiveCamera())).toBe(BLAST_CAP);
  });
});
