import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ChestMirror } from '../../../src/modules/render3d/chestMirror.js';
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

const chest = (open = 0, fade = 0) => ({
  kind: 'chest',
  x: 200,
  y: 150,
  radius: 14,
  age: 1,
  lifetime: Infinity,
  color: '#ffb347',
  claimed: open > 0,
  open,
  fade,
});
const token = {
  kind: 'pulse',
  x: 10,
  y: 20,
  radius: 12,
  age: 1,
  lifetime: 18,
  color: '#44ccff',
};

describe('ChestMirror', () => {
  it('draws the chests of the pickup list, not its tokens, and hides the rest', () => {
    const scene = new THREE.Scene();
    const chests = new ChestMirror(THREE, scene);
    const tokens = new PickupMirror(THREE, scene);
    const shown = () => chests.views.filter((v) => v.group.visible).length;

    const list = [token, chest(), chest()];
    chests.update(list, null);
    tokens.update(list);
    expect(shown()).toBe(2);
    expect(tokens.kinds.pulse.body.mesh.count).toBe(1);
    expect(chests.views[0].group.position.x).toBeCloseTo(200 - 400);

    chests.update([token], null);
    expect(shown()).toBe(0);
  });

  it('swings the lid open on its hinge and lets the light die once spent', () => {
    const chests = new ChestMirror(THREE, new THREE.Scene());
    const [view] = chests.views;
    chests.update([chest()], null);
    expect(view.hinge.rotation.x).toBeCloseTo(0);
    const lit = view.beam.color.r;

    chests.update([chest(1)], null);
    expect(view.hinge.rotation.x).toBeLessThan(-1.5);
    expect(view.glow.color.r).toBeGreaterThan(0);

    chests.update([chest(1, 0.99)], null);
    expect(view.beam.color.r).toBeLessThan(lit * 0.1);
    expect(view.group.scale.x).toBeLessThan(1);
  });
});
