// A new enemy gets its 3D look from its content file, with no render code:
// the Sentry (tests/__fixtures__/enemies/sentry.js, never shipped) from its
// `visual`, the Gnat (gnat.js, which names neither `view` nor `visual`) in
// the default look. Both join the registry here as if they were
// src/content/enemies files.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import sentry from '../../__fixtures__/enemies/sentry.js';
import { PALETTE } from '../../../src/data/constants/palette.js';

vi.mock('../../../src/content/registry.js', async (importOriginal) => {
  const registry = await importOriginal();
  const fixtures = await Promise.all([
    import('../../__fixtures__/enemies/gnat.js'),
    import('../../__fixtures__/enemies/sentry.js'),
  ]);
  const enemies = [
    ...registry.listContent('enemies'),
    ...fixtures.map((module) => module.default),
  ];
  return {
    listContent: (kind) =>
      kind === 'enemies' ? enemies : registry.listContent(kind),
    getContent: (kind, id) =>
      kind === 'enemies'
        ? enemies.find((enemy) => enemy.id === id)
        : registry.getContent(kind, id),
  };
});

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

// The global setup has already loaded the mirror on the real registry: it is
// loaded again, on this one, before the tests.
let EnemyMirror;
let KNOWN_KINDS;
let DISSOLVE_SECONDS;

const enemy = (id, type, extra = {}) => ({
  id,
  type,
  x: 400,
  y: 300,
  radius: 14,
  getHitFlash: () => 0,
  ...extra,
});
const mirrorOf = () =>
  new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn(), {
    spawn: () => {},
  });
const meshesOf = (view) => {
  const meshes = [];
  view.object.traverse((o) => o.isMesh && meshes.push(o));
  return meshes;
};

describe('an enemy’s 3D look from its content file alone', () => {
  beforeAll(async () => {
    vi.resetModules();
    ({ EnemyMirror, KNOWN_KINDS } = await import(
      '../../../src/modules/render3d/enemyMirror.js'
    ));
    ({ DISSOLVE_SECONDS } = await import(
      '../../../src/modules/render3d/dissolve.js'
    ));
  });

  it('builds a `visual`: one matte body, its glowing parts, lights in the glow batch, an outline round it', () => {
    expect(KNOWN_KINDS.has('sentry')).toBe(true);
    const mirror = mirrorOf();
    mirror.update([enemy('s', 'sentry')], 0);
    const view = mirror.views.get('s');
    expect(view.kind).toBe('sentry');

    const meshes = meshesOf(view);
    const body = meshes.filter((m) => m.material === mirror.machineMaterial);
    expect(body).toHaveLength(1);
    expect(body[0].geometry.getAttribute('color')).toBeTruthy();
    expect(body[0].castShadow).toBe(true);
    const glowing = meshes.filter((m) => m.material.isMeshBasicMaterial);
    expect(glowing).toHaveLength(1); // the collar
    expect(mirror.glows.count).toBe(sentry.visual.lights.length);
    expect(mirror.rimBatch.count).toBe(48); // one circle
    // the outline rings the widest part, the dark ring (its tube 0.12 out)
    expect(view.rims[0].anchor.scale.x).toBeCloseTo(0.96 * 1.12 * 1.04, 3);
  });

  it('lights its nodes with the getter it names, turns and bobs; an Elite burns its light gold', () => {
    const mirror = mirrorOf();
    const sentryEnemy = enemy('s', 'sentry', { telegraphRatio: 0 });
    mirror.update([sentryEnemy], 0);
    const view = mirror.views.get('s');
    const [light] = view.lights;
    const dim = light.tone.userData.gain;
    const size = light.anchor.scale.x;
    const turn = view.body.rotation.y;
    const height = view.body.position.y;

    sentryEnemy.telegraphRatio = 1;
    mirror.update([sentryEnemy], 0.5);
    expect(light.tone.userData.gain).toBeGreaterThan(dim);
    expect(light.anchor.scale.x).toBeGreaterThan(size);
    expect(view.body.rotation.y).not.toBe(turn);
    expect(view.body.position.y).not.toBe(height);

    const gold = new THREE.Color(PALETTE.xp).convertSRGBToLinear();
    sentryEnemy.elite = true;
    sentryEnemy.affixes = [];
    mirror.update([sentryEnemy], 0.5);
    for (const accent of view.accents) {
      expect(accent.userData.base.getHex()).toBe(gold.getHex());
    }
    expect(view.accents.length).toBe(sentry.visual.lights.length + 1);
  });

  it('draws an enemy that names neither `view` nor `visual` in the default look: a matte pod with one eye', () => {
    expect(KNOWN_KINDS.has('gnat')).toBe(true);
    const mirror = mirrorOf();
    mirror.update([enemy('a', 'gnat'), enemy('b', 'gnat')], 0);
    const [a, b] = [mirror.views.get('a'), mirror.views.get('b')];
    expect(a.look).toBe(mirror.recipeViews.lookOf());
    expect(a.glows).toHaveLength(1);
    const [body] = meshesOf(a);
    expect(body.material).toBe(mirror.machineMaterial);
    expect(meshesOf(b)[0].geometry).toBe(body.geometry); // built once
    expect(mirror.glows.count).toBe(2);
  });

  it('burns and pools like any machine', () => {
    const mirror = mirrorOf();
    const sentryEnemy = enemy('s', 'sentry');
    mirror.update([sentryEnemy], 0);
    const view = mirror.views.get('s');
    mirror.markDead(sentryEnemy);
    mirror.update([], 0, 0);
    expect(view.dissolve.sources).toContain(mirror.machineMaterial);
    mirror.update([], 0, DISSOLVE_SECONDS);
    expect(mirror.pools.get('sentry')).toEqual([view]);
    mirror.update([enemy('t', 'sentry')], 0);
    expect(mirror.views.get('t')).toBe(view);
  });

  it('refuses a shape, material or colour the builder does not have', () => {
    const { recipeViews } = mirrorOf();
    const look = (part) => () => recipeViews.lookOf({ parts: [part] });
    expect(look({ shape: 'cube' })).toThrow("no shape 'cube'");
    expect(look({ shape: 'box', material: 'neon' })).toThrow(
      "no material 'neon'"
    );
    expect(look({ shape: 'box', color: 'pink' })).toThrow(
      "no palette colour 'pink'"
    );
  });
});
