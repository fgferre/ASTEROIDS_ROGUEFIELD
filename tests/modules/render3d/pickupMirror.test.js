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

const token = (age, lifetime = 18) => ({
  kind: 'pulse',
  x: 10,
  y: 20,
  radius: 12,
  age,
  lifetime,
  color: '#44ccff',
});

describe('PickupMirror', () => {
  it('shows one group per pickup and hides the rest', () => {
    const mirror = new PickupMirror(THREE, new THREE.Scene());
    mirror.update([token(1), token(2)]);
    expect(mirror.views.filter((v) => v.group.visible)).toHaveLength(2);
    mirror.update([token(1)]);
    expect(mirror.views.filter((v) => v.group.visible)).toHaveLength(1);
  });

  it('blinks the ring only in the last seconds', () => {
    const mirror = new PickupMirror(THREE, new THREE.Scene());
    mirror.update([token(5.12)]);
    expect(mirror.views[0].ring.visible).toBe(true);
    mirror.update([token(15.25)]);
    expect(mirror.views[0].ring.visible).toBe(false);
    mirror.update([token(15.13)]);
    expect(mirror.views[0].ring.visible).toBe(true);
  });
});
