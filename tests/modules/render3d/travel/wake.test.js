import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  WAKE_LENGTH,
  buildWake,
  setWakeLight,
} from '../../../../src/modules/render3d/travel/wake.js';
import { lightWake } from '../../../../src/modules/render3d/travel/wakeRig.js';

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
  const wake = buildWake(THREE);
  const mesh = (name) => wake.group.children.find((c) => c.name === name);

  it('is about WAKE_LENGTH long, its plating and containers painted', () => {
    const box = new THREE.Box3().setFromObject(wake.group);
    expect(box.max.x - box.min.x).toBeCloseTo(WAKE_LENGTH, -2.5);
    ['hull', 'cargo'].forEach((name) => {
      const { geometry, material } = mesh(name);
      const count = geometry.getAttribute('position').count;
      expect(count, name).toBeGreaterThan(0);
      // Every painted vertex carries its paint and its place on the maps.
      expect(geometry.getAttribute('uv').count, name).toBe(count);
      expect(geometry.getAttribute('color').count, name).toBe(count);
      expect(material.map.image.data.length, name).toBeGreaterThan(0);
    });
  });

  it('keeps each kind of light apart, for the scene to dim or kill', () => {
    const { windows, lamps, floods, beacons, engines } = wake.lights;
    expect(engines).toHaveLength(3);
    [windows, lamps, floods, beacons, ...engines].forEach((light) => {
      expect(wake.group.children).toContain(light);
      expect(
        light.children[0].geometry.getAttribute('position').count
      ).toBeGreaterThan(0);
    });
    setWakeLight(engines[2], 0);
    expect(engines[2].children[0].material.color.r).toBe(0);
    expect(engines[0].children[0].material.color.r).toBe(1);
  });

  it('takes a light rig that rides with it, the sun on the asked flank', () => {
    const fresh = buildWake(THREE);
    const { sun, rim, fill } = lightWake(THREE, fresh, 1);
    [sun, rim, fill].forEach((light) =>
      expect(fresh.group.children).toContain(light)
    );
    expect(sun.castShadow).toBe(true);
    // Starboard is +z.
    expect(sun.position.z).toBeGreaterThan(0);
    expect(rim.position.z).toBeLessThan(0);
  });

  it('marks the hangar, the bridge and the engines for the scene', () => {
    const { hangar, bridge, engines } = wake.anchors;
    expect(hangar.position.y).toBeLessThan(0);
    expect(bridge.position.y).toBeGreaterThan(0);
    // The engines look aft, three abreast.
    expect(engines.map((e) => Math.sign(e.position.z))).toEqual([-1, 0, 1]);
    engines.forEach((e) =>
      expect(e.position.x).toBeLessThan(hangar.position.x)
    );
  });
});
