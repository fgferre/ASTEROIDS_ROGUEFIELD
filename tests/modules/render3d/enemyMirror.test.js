import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_TYPES } from '../../../src/data/constants/visual.js';
import { ASTEROID_VARIANTS } from '../../../src/data/enemies/asteroid-configs.js';
import {
  EnemyMirror,
  KNOWN_KINDS,
  SHADOW_CASTERS,
  SHADOW_RADIUS,
  VARIANT_LOOKS,
  VIEW_KINDS,
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

  it('gives every asteroid variant its own instanced look, rebound on reuse', () => {
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
    const views = new Set();
    for (const variant of Object.keys(ASTEROID_VARIANTS)) {
      expect(VARIANT_LOOKS[variant], variant).toBeDefined();
      mirror.update([rock(variant, variant)], 0);
      const view = mirror.views.get(variant);
      views.add(view);
      expect(view.family, variant).toBe(
        variant === 'crystal' ? 'crystal' : 'stone'
      );
      const mesh = mirror.rocks.meshes[view.family][view.shape];
      expect(mesh.count, variant).toBe(1);
      const { aBase, aSurface } = mesh.geometry.attributes;
      colors.add(new THREE.Color().fromArray(aBase.array).getHexString());
      expect(aSurface.getX(0), variant).toBeCloseTo(
        VARIANT_LOOKS[variant].roughness
      );
      mirror.update([], 0);
      expect(mesh.count, variant).toBe(0);
    }
    expect(colors.size).toBe(Object.keys(ASTEROID_VARIANTS).length);
    expect(views.size).toBe(1); // one pooled view, rebound each time
  });

  it('writes a rock’s crack glow and hit flash into its instance', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const rock = {
      id: 'rock',
      type: 'asteroid',
      variant: 'common',
      x: 500,
      y: 300,
      radius: 20,
      crackStage: 2,
      getHitFlash: () => 1,
    };
    mirror.update([rock], 0);
    const view = mirror.views.get('rock');
    const mesh = mirror.rocks.meshes.stone[view.shape];
    const { aGlow } = mesh.geometry.attributes;
    expect(aGlow.getX(0)).toBeCloseTo(1.15);
    expect(aGlow.getY(0)).toBeCloseTo(0.65);
    expect(aGlow.getW(0)).toBeCloseTo(0.45);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBe(100);
  });

  it('lets only the nearest machines cast, up to the caster budget', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const mote = (id, x) => ({
      id,
      type: 'drone',
      x,
      y: 300,
      radius: 12,
      getHitFlash: () => 0,
    });
    const motes = [];
    for (let i = 0; i < 30; i += 1) motes.push(mote(`m${i}`, 400 + i * 10));
    motes.push(mote('far', 400 + SHADOW_RADIUS + 50));
    mirror.update(motes, 0);
    mirror.budgetShadows(0, 0);

    const casting = (id) =>
      mirror.views.get(id).casters.filter((mesh) => mesh.castShadow).length;
    let total = 0;
    mirror.views.forEach((view) => {
      total += view.casters.filter((mesh) => mesh.castShadow).length;
    });
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(SHADOW_CASTERS);
    expect(casting('m0')).toBe(mirror.views.get('m0').casters.length);
    expect(casting('m29')).toBe(0);
    expect(casting('far')).toBe(0);
  });

  it('rebinds a rock that turns Volatile while alive (the Herald of Heat)', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const rock = {
      id: 'rock',
      type: 'asteroid',
      variant: 'common',
      x: 0,
      y: 0,
      radius: 12,
      getHitFlash: () => 0,
    };
    mirror.update([rock], 0);
    rock.variant = 'volatile';
    mirror.update([rock], 0.1);

    expect(mirror.views.get('rock').look).toBe(VARIANT_LOOKS.volatile);
  });

  it('draws each Herald kind with its own view; Silence rings its blink point', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const herald = (heraldKind, extra = {}) => ({
      id: heraldKind,
      type: 'herald',
      heraldKind,
      x: 400,
      y: 300,
      radius: 32,
      telegraphRatio: 0.5,
      blinkTarget: null,
      getHitFlash: () => 0,
      ...extra,
    });
    const silence = herald('silence', { blinkTarget: { x: 600, y: 300 } });

    expect(mirror.update([herald('dust'), herald('heat'), silence], 0)).toBe(
      null
    );

    for (const kind of ['dust', 'heat', 'silence']) {
      expect(VIEW_KINDS).toContain(`herald-${kind}`);
      expect(mirror.views.get(kind).kind).toBe(`herald-${kind}`);
    }
    const { telegraph } = mirror.views.get('silence');
    expect(telegraph.group.visible).toBe(true);
    expect(telegraph.target.position.x).toBe(200);
  });
});
