import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FlashLights,
  VeinLights,
} from '../../../src/modules/render3d/flashLights.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('FlashLights', () => {
  it("lights a hit in the shot's colour on the dimmest light, once a frame", () => {
    const flashes = new FlashLights(THREE, new THREE.Scene());
    flashes.light(0, 0, 1, 1, 1, 3); // an explosion, still bright
    flashes.hit(100, 50, [0.5, 0, 1], 25);
    const lit = flashes.lights.filter((l) => l.intensity > 0);
    expect(lit).toHaveLength(2);
    const hit = lit.find((l) => l.intensity < 3);
    expect(hit.color.b).toBe(1);
    expect(hit.distance).toBeLessThan(flashes.lights[0].distance);
    flashes.hit(200, 50, [1, 1, 1], 25);
    expect(flashes.lights.filter((l) => l.intensity > 0)).toHaveLength(2);
    flashes.update(0);
    flashes.hit(200, 50, [1, 1, 1], 25);
    expect(flashes.lights.filter((l) => l.intensity > 0)).toHaveLength(3);
  });
});

describe('VeinLights', () => {
  const rock = (glow, radius, hex) => ({
    look: { vein: hex, veinGlow: glow },
    hidden: false,
    radius,
    object: { visible: true, position: new THREE.Vector3(radius, 0, 0) },
    rock: { glow: [glow], vein: new THREE.Color(hex) },
  });

  it('lights the veined rocks that glow most, in their veins colour', () => {
    const veins = new VeinLights(THREE, new THREE.Scene());
    const plain = { ...rock(1, 35, '#ffffff'), look: {} };
    const views = new Map([
      [1, rock(0.2, 12, '#ff3131')],
      [2, rock(0.9, 35, '#ffd700')],
      [3, plain],
      [4, rock(0.8, 22, '#bfe8ff')],
      [5, rock(0.9, 22, '#ffb347')],
    ]);
    veins.update(views);
    const colours = veins.lights.map((l) => l.color.getHexString());
    expect(colours[0]).toBe('ffd700');
    expect(colours).not.toContain('ff3131');
    expect(veins.lights.every((l) => l.intensity > 0)).toBe(true);
    veins.enabled = false;
    veins.update(views);
    expect(veins.lights.every((l) => l.intensity === 0)).toBe(true);
  });
});
