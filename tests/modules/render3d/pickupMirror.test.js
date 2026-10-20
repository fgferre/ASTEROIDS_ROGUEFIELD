import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PickupMirror } from '../../../src/modules/render3d/pickupMirror.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const token = (age, lifetime = 18, kind = 'pulse') => ({
  kind,
  x: 10,
  y: 20,
  radius: 12,
  age,
  lifetime,
  color: '#44ccff',
});

const shown = (mirror) =>
  Object.values(mirror.kinds).reduce((n, view) => n + view.body.mesh.count, 0);

describe('PickupMirror', () => {
  it('shows one token per pickup, instanced per kind, and hides the rest', () => {
    const mirror = new PickupMirror(THREE, new THREE.Scene());
    mirror.update([token(1), token(2, 18, 'magnet')]);
    expect(shown(mirror)).toBe(2);
    expect(mirror.kinds.magnet.body.mesh.visible).toBe(true);
    mirror.update([token(1)]);
    expect(shown(mirror)).toBe(1);
    expect(mirror.kinds.magnet.body.mesh.visible).toBe(false);
  });

  it('blinks the light only in the last seconds', () => {
    const mirror = new PickupMirror(THREE, new THREE.Scene());
    const light = () => mirror.kinds.pulse.light.mesh.instanceColor.array[2];
    mirror.update([token(5.12)]);
    const lit = light();
    mirror.update([token(15.25)]);
    expect(light()).toBeLessThan(lit * 0.2);
    mirror.update([token(15.13)]);
    expect(light()).toBeGreaterThan(lit * 0.5);
  });
});
