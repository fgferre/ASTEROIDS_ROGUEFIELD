import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AFFIX_IDS } from '../../../src/data/enemies/affixes.js';
import { ALL_HULLS } from '../../../src/data/shipModels.js';
import PlayerSystem from '../../../src/modules/PlayerSystem.js';
import Renderer3D from '../../../src/modules/render3d/Renderer3D.js';
import {
  CapsuleBatch,
  PointBatch,
  RibbonBatch,
} from '../../../src/modules/render3d/batches.js';
import {
  EnemyMirror,
  KNOWN_KINDS,
  VARIANT_LOOKS,
} from '../../../src/modules/render3d/enemyMirror.js';
import { PlayerMirror } from '../../../src/modules/render3d/playerMirror.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';
import {
  cleanupGlobalState,
  setupGlobalMocks,
} from '../../__helpers__/setup.js';

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

const seeded = (fn) => fn();

// Renderer3D with its WebGL side swapped for a recorder: every material a
// compile sees is remembered.
function warmable() {
  const player = new PlayerSystem({
    eventBus: createEventBusMock(),
    input: { getMovementInput: () => ({}) },
    'command-queue': null,
  });
  const renderer = new Renderer3D({
    player,
    'menu-background': { withSeededMathRandom: seeded },
  });
  const scene = new THREE.Scene();
  const compiled = new Set();
  const batches = [
    new RibbonBatch(THREE, 16).object,
    new CapsuleBatch(THREE, 16).mesh,
    new PointBatch(THREE, 16).object,
  ];
  scene.add(...batches);
  const pass = () => ({ enabled: false });
  renderer.three = {
    scene,
    overlay: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {
      setRenderTarget: vi.fn(),
      compile: (root) =>
        root.traverse(
          (object) => object.material && compiled.add(object.material)
        ),
      render: vi.fn(),
    },
    composer: { readBuffer: {}, render: vi.fn() },
    bloomPass: pass(),
    smaaPass: pass(),
    impactPass: pass(),
    bloomUrl: true,
    texts: { begin: vi.fn(), push: vi.fn(), end: vi.fn() },
    enemies: new EnemyMirror(THREE, scene, seeded, null),
    player: new PlayerMirror(THREE, scene, seeded),
  };
  return { renderer, compiled, batches };
}

describe('Renderer3D.warmUp', () => {
  beforeEach(() => {
    setupGlobalMocks();
    // the affix badges bake into canvases: a 2D context that takes any draw
    const ctx = new Proxy(
      {},
      { get: (target, key) => target[key] ?? (() => {}) }
    );
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => ctx }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanupGlobalState();
  });

  it('compiles every view kind, look, hull and burn, then pools the views', async () => {
    vi.useFakeTimers();
    const { renderer, compiled, batches } = warmable();
    const { enemies, player, scene, composer } = renderer.three;
    const create = vi.spyOn(enemies, 'create');
    const bind = vi.spyOn(enemies, 'bind');
    const rebuild = vi.spyOn(player, 'rebuild');
    const progress = [];

    const done = renderer.warmUp((value) => progress.push(value));
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();

    const kinds = create.mock.calls.map(([kind]) => kind);
    for (const kind of [...KNOWN_KINDS, 'boss-choir', 'boss-null']) {
      expect(kinds, kind).toContain(kind);
    }
    const variants = bind.mock.calls
      .filter(([view]) => view.kind === 'asteroid')
      .map(([, enemy]) => enemy.variant);
    expect(variants.sort()).toEqual(Object.keys(VARIANT_LOOKS).sort());
    expect(rebuild.mock.calls.map(([, hull]) => hull.id)).toEqual(
      ALL_HULLS.map((hull) => hull.id)
    );

    // every material the scene holds, and every dissolve twin, was compiled
    scene.traverse((object) => {
      if (object.material) expect(compiled.has(object.material)).toBe(true);
    });
    batches.forEach((batch) => expect(compiled.has(batch.material)).toBe(true));
    // the instanced rocks' shared materials, the rim and glow batches
    // the affix badges, baked before the first Elite shows them
    expect(Object.keys(enemies.badges).sort()).toEqual([...AFFIX_IDS].sort());
    Object.values(enemies.rockFamilies).forEach((material) =>
      expect(compiled.has(material)).toBe(true)
    );
    expect(compiled.has(enemies.rimBatch.object.material)).toBe(true);
    expect(compiled.has(enemies.glows.mesh.material)).toBe(true);
    let twins = 0;
    enemies.pools.forEach((pool) =>
      pool.forEach((view) => {
        expect(view.object.visible).toBe(false);
        view.dissolve?.twins.forEach((twin) => {
          twins += 1;
          expect(compiled.has(twin)).toBe(true);
        });
      })
    );
    expect(twins).toBeGreaterThan(0);
    expect(enemies.views.size).toBe(0);
    expect(enemies.dissolve.count).toBe(0);
    expect(composer.render).toHaveBeenCalledTimes(1);

    expect(progress.at(-1)).toBe(1);
    progress.forEach((value, i) =>
      expect(value).toBeGreaterThan(i ? progress[i - 1] : 0)
    );
  });
});
