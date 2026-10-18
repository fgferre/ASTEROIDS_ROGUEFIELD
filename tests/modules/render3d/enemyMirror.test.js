import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_TYPES } from '../../../src/data/constants/visual.js';
import { ASTEROID_VARIANTS } from '../../../src/data/enemies/asteroid-configs.js';
import {
  EnemyMirror,
  KNOWN_KINDS,
  VARIANT_LOOKS,
} from '../../../src/modules/render3d/enemyMirror.js';

// The vendored r128 build is UMD: evaluated with an `exports` object it
// fills that object instead of a global.
const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('EnemyMirror', () => {
  it('has a dedicated 3D look for every registered enemy type', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    for (const type of [...Object.keys(ENEMY_TYPES), 'asteroid', 'boss']) {
      expect(KNOWN_KINDS.has(type), type).toBe(true);
      expect(mirror.create(type).kind, type).toBe(type);
    }
  });

  it('draws each Warden kind with its own view; a broken Choir core falls away', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const core = (alive, x) => ({ alive, x, y: 300 });
    const choir = {
      id: 'choir',
      type: 'boss',
      bossKind: 'choir',
      x: 400,
      y: 300,
      radius: 118,
      singingIndex: 1,
      cores: [core(false, 490), core(true, 310), core(true, 400)],
      getHitFlash: () => 0,
    };
    const nullBoss = { ...choir, id: 'null', bossKind: 'null', cores: null };

    expect(mirror.update([choir, nullBoss], 0)).toBeTruthy();
    expect(mirror.views.get('choir').kind).toBe('boss-choir');
    expect(mirror.views.get('null').kind).toBe('boss-null');
    const view = mirror.views.get('choir');
    expect(view.cores[0].pivot.visible).toBe(true); // breaking, still seen
    expect(view.cores[1].halo.visible).toBe(true); // the singing core
    expect(view.cores[2].halo.visible).toBe(false);

    mirror.update([choir], 2);
    expect(view.cores[0].pivot.visible).toBe(false);
    expect(view.cores[1].pivot.visible).toBe(true);
  });

  it('gives every asteroid variant its own material preset, rebound on reuse', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const rock = (id, variant) => ({
      id,
      type: 'asteroid',
      variant,
      x: 0,
      y: 0,
      radius: 30,
      getHitFlash: () => 0,
    });
    const colors = new Set();
    for (const variant of Object.keys(ASTEROID_VARIANTS)) {
      expect(VARIANT_LOOKS[variant], variant).toBeDefined();
      mirror.update([rock(variant, variant)], 0);
      const { material } = mirror.views.get(variant);
      expect(material.type === 'MeshPhysicalMaterial', variant).toBe(
        variant === 'crystal'
      );
      colors.add(material.color.getHexString());
      mirror.update([], 0);
    }
    expect(colors.size).toBe(Object.keys(ASTEROID_VARIANTS).length);
  });
});
