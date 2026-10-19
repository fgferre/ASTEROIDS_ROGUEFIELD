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

  it('builds a `visual`: one matte body, its glowing parts, lights in the glow batch, an outline that follows it', () => {
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
    expect(glowing).toHaveLength(1); // the lens
    expect(mirror.glows.count).toBe(sentry.visual.lights.length);
    // the outline: the parts' top view, turning with the body, 4% past its
    // farthest reach
    const [rim] = view.rims;
    expect(rim.anchor.parent).toBe(view.body);
    expect(mirror.rimBatch.count).toBe(rim.points.length / 3);
    const reach = (xyz) => {
      let far = 0;
      for (let i = 0; i < xyz.length; i += 3) {
        far = Math.max(far, Math.hypot(xyz[i], xyz[i + 2]));
      }
      return far;
    };
    const parts = meshes.map((m) =>
      reach(m.geometry.attributes.position.array)
    );
    expect(reach(rim.points)).toBeCloseTo(Math.max(...parts) * 1.04, 3);
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

  it('draws an enemy that names neither `view` nor `visual` in the default look: a matte machine with one eye', () => {
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

  it('builds each designed shape where its params put it', () => {
    const { recipeViews, kit } = mirrorOf();
    const box = (part) => {
      const view = recipeViews.lookOf({ parts: [part] }).create('x');
      const { geometry } = view.body.children[0];
      expect(geometry.attributes.normal.array.every(Number.isFinite)).toBe(
        true
      );
      geometry.computeBoundingBox();
      return geometry.boundingBox;
    };
    const body = box({
      shape: 'body',
      stations: [
        [-0.5, 0.1, 0.1, 0.05],
        [0, 0.3, 0.2, 0.1],
        [0.6, 0.1, 0.1, 0.05],
      ],
    });
    expect(body.min.x).toBeCloseTo(-0.5, 3);
    expect(body.max.x).toBeCloseTo(0.6, 3);
    expect(body.max.z).toBeCloseTo(0.3, 2);
    expect(body.min.y).toBeCloseTo(-0.1, 2);
    const profile = [
      [0.1, 0.4],
      [0.3, 0.2],
      [0.3, -0.2],
    ];
    const turned = box({ shape: 'turned', profile });
    expect(turned.max.y).toBeCloseTo(0.4, 3);
    expect(turned.max.x).toBeCloseTo(0.3, 3);
    const along = box({ shape: 'turned', profile, axis: 'x' });
    expect(along.max.x).toBeCloseTo(0.4, 3); // the profile's top is the nose
    const wing = box({ shape: 'wing', span: 0.6, dihedral: 0 });
    expect(wing.min.z).toBeCloseTo(0, 3);
    expect(wing.max.z).toBeCloseTo(0.6, 3);
    const fin = box({ shape: 'wing', span: 0.3, dihedral: Math.PI / 2 });
    expect(fin.max.y).toBeCloseTo(0.3, 2);
    const tube = box({
      shape: 'tube',
      points: [
        [0, 0, 0],
        [0.4, 0, 0.2],
        [0.8, 0, 0],
      ],
      radius: [0.06, 0.02],
    });
    expect(tube.max.x).toBeCloseTo(0.8, 1);
    expect(tube.max.z).toBeGreaterThan(0.2);
    // the nozzle and the socket are dark unless they say otherwise
    for (const shape of ['nozzle', 'socket']) {
      const view = recipeViews.lookOf({ parts: [{ shape }] }).create('x');
      const color = view.body.children[0].geometry.attributes.color;
      expect(color.getX(0)).toBeCloseTo(kit.tones.dark.r, 5);
    }
  });

  it('builds a `mirror` part and its twin across z', () => {
    const { recipeViews } = mirrorOf();
    const count = (part) => {
      const view = recipeViews.lookOf({ parts: [part] }).create('x');
      const { geometry } = view.body.children[0];
      geometry.computeBoundingBox();
      return [geometry.attributes.position.count, geometry.boundingBox];
    };
    for (const part of [
      { shape: 'wing', at: [0, 0, 0.2] },
      { shape: 'octahedron', size: 0.2, at: [0, 0, 0.5] },
    ]) {
      const [one, single] = count(part);
      const [two, pair] = count({ ...part, mirror: true });
      expect(two).toBe(one * 2);
      expect(single.min.z).toBeGreaterThan(0);
      expect(pair.min.z).toBeCloseTo(-single.max.z, 5);
    }
  });

  it('sits each light in a dark socket open away from the centre, unless `housing: false`', () => {
    const { recipeViews, kit } = mirrorOf();
    const housed = recipeViews
      .lookOf({ lights: [{ at: [0.6, 0, 0], size: 0.1 }] })
      .create('x');
    const { geometry } = housed.body.children[0];
    expect(geometry.attributes.color.getX(0)).toBeCloseTo(kit.tones.dark.r, 5);
    geometry.computeBoundingBox();
    // its cup behind the light, toward the centre
    expect(geometry.boundingBox.min.x).toBeLessThan(0.55);
    expect(geometry.boundingBox.max.x).toBeLessThan(0.7);
    const bare = recipeViews
      .lookOf({ lights: [{ at: [0.6, 0, 0], housing: false }] })
      .create('x');
    expect(meshesOf(bare)).toHaveLength(0);
  });

  it('refuses a shape, material or colour the builder does not have', () => {
    const { recipeViews } = mirrorOf();
    const look = (part) => () => recipeViews.lookOf({ parts: [part] });
    expect(look({ shape: 'cube' })).toThrow("no shape 'cube'");
    expect(
      look({
        shape: 'turned',
        profile: [
          [1, 0],
          [1, 1],
        ],
        axis: 'z',
      })
    ).toThrow("no axis 'z'");
    expect(look({ shape: 'box', material: 'neon' })).toThrow(
      "no material 'neon'"
    );
    expect(look({ shape: 'box', color: 'pink' })).toThrow(
      "no palette colour 'pink'"
    );
  });
});
