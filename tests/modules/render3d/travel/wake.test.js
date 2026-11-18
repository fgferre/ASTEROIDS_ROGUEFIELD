import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  WAKE_LENGTH,
  buildWake,
} from '../../../../src/modules/render3d/travel/wake.js';

// The vendored r128 build is UMD: evaluated with an `exports` object it
// fills that object instead of a global.
const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('the Wake', () => {
  it('is one panelled hull WAKE_LENGTH long, with its three lights apart', () => {
    const wake = buildWake(THREE);
    const [hull] = wake.group.children;
    const position = hull.geometry.getAttribute('position');
    // Every hull vertex carries baked-map coordinates (skin's `uv`).
    expect(hull.geometry.getAttribute('uv').count).toBe(position.count);
    const box = new THREE.Box3().setFromObject(wake.group);
    expect(box.max.x - box.min.x).toBeCloseTo(WAKE_LENGTH * 1.05, -2);
    ['windows', 'reactor', 'engines'].forEach((name) => {
      expect(wake.group.children).toContain(wake[name]);
      expect(
        wake[name].geometry.getAttribute('position').count
      ).toBeGreaterThan(0);
    });
  });
});
